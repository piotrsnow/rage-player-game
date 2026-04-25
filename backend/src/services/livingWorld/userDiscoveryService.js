// Living World Phase 7 + Round A — hybrid world discovery.
//
// Tracks two parallel sets of "fog of war" state:
//   - Canonical locations (seedWorld.js, `WorldLocation.isCanonical=true`)
//     live in `UserWorldKnowledge` so the player carries their memory of
//     the canon across campaigns.
//   - Non-canonical locations (AI-generated mid-play, isCanonical=false)
//     live in `Campaign.discoveredLocationIds` — they only exist in one
//     playthrough and must not leak to parallel campaigns.
//
// A third "heard-about" state ("widzisz na mapie dashed, nie możesz wejść
// w sublokacje") is tracked alongside:
//   canonical → UserWorldKnowledge.heardAboutLocationIds
//   non-canonical → Campaign.heardAboutLocationIds
// Physical visit promotes heard → visited automatically (we remove from
// the heard-about list on discovery).
//
// F3 will replace these JSON arrays with join tables (UserDiscoveredLocation
// / UserDiscoveredEdge / CampaignDiscoveredLocation). For F1 we keep them as
// JSONB arrays so the call surface stays identical.

import { prisma } from '../../lib/prisma.js';
import { childLogger } from '../../lib/logger.js';

const log = childLogger({ module: 'userDiscoveryService' });

async function loadOrCreate(userId) {
  if (!userId) return null;
  let row = await prisma.userWorldKnowledge.findUnique({ where: { userId } });
  if (!row) {
    row = await prisma.userWorldKnowledge.create({
      data: { userId, discoveredLocationIds: [], discoveredEdgeIds: [], heardAboutLocationIds: [] },
    });
  }
  return row;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

async function fetchLocationCanonicality(locationId) {
  if (!locationId) return { isCanonical: true, parentLocationId: null };
  try {
    const loc = await prisma.worldLocation.findUnique({
      where: { id: locationId },
      select: { isCanonical: true, parentLocationId: true },
    });
    if (!loc) return { isCanonical: true, parentLocationId: null };
    return { isCanonical: loc.isCanonical !== false, parentLocationId: loc.parentLocationId };
  } catch {
    return { isCanonical: true, parentLocationId: null };
  }
}

async function campaignFogPatch(campaignId, patch) {
  if (!campaignId) return;
  try {
    await prisma.campaign.update({ where: { id: campaignId }, data: patch });
  } catch (err) {
    log.warn({ err: err?.message, campaignId, keys: Object.keys(patch) }, 'campaignFogPatch failed');
  }
}

async function readCampaignFogSets(campaignId) {
  if (!campaignId) return null;
  try {
    const c = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { discoveredLocationIds: true, discoveredSubLocationIds: true, heardAboutLocationIds: true },
    });
    if (!c) return null;
    return {
      discoveredLocationIds: new Set(asArray(c.discoveredLocationIds)),
      discoveredSubLocationIds: new Set(asArray(c.discoveredSubLocationIds)),
      heardAboutLocationIds: new Set(asArray(c.heardAboutLocationIds)),
    };
  } catch {
    return null;
  }
}

/**
 * Mark a location as discovered ("visited" fog state). Routes by canonicality.
 * Idempotent — silent on failure (discovery must never block scene flow).
 */
export async function markLocationDiscovered({ userId, locationId, campaignId = null }) {
  if (!userId || !locationId) return;
  try {
    const { isCanonical, parentLocationId } = await fetchLocationCanonicality(locationId);

    if (isCanonical) {
      const row = await loadOrCreate(userId);
      const ids = new Set(asArray(row.discoveredLocationIds));
      const heard = new Set(asArray(row.heardAboutLocationIds));
      const changed = !ids.has(locationId) || heard.has(locationId);
      if (!changed) return;
      ids.add(locationId);
      heard.delete(locationId);
      await prisma.userWorldKnowledge.update({
        where: { userId },
        data: {
          discoveredLocationIds: [...ids],
          heardAboutLocationIds: [...heard],
        },
      });
      return;
    }

    // Non-canonical → per-campaign.
    if (!campaignId) return;
    const fog = await readCampaignFogSets(campaignId);
    if (!fog) return;
    const targetSet = parentLocationId ? fog.discoveredSubLocationIds : fog.discoveredLocationIds;
    const targetKey = parentLocationId ? 'discoveredSubLocationIds' : 'discoveredLocationIds';
    const heard = fog.heardAboutLocationIds;
    const changed = !targetSet.has(locationId) || heard.has(locationId);
    if (!changed) return;
    targetSet.add(locationId);
    heard.delete(locationId);
    await campaignFogPatch(campaignId, {
      [targetKey]: [...targetSet],
      heardAboutLocationIds: [...heard],
    });
  } catch (err) {
    log.warn({ err: err?.message, userId, locationId, campaignId }, 'markLocationDiscovered failed');
  }
}

/**
 * Mark a location as "heard about" (dashed-outline fog state). Skipped if
 * already discovered — we never demote visited → heard.
 */
export async function markLocationHeardAbout({ userId, locationId, campaignId = null }) {
  if (!userId || !locationId) return;
  try {
    const { isCanonical } = await fetchLocationCanonicality(locationId);
    if (isCanonical) {
      const row = await loadOrCreate(userId);
      const visited = new Set(asArray(row.discoveredLocationIds));
      if (visited.has(locationId)) return;
      const heard = new Set(asArray(row.heardAboutLocationIds));
      if (heard.has(locationId)) return;
      heard.add(locationId);
      await prisma.userWorldKnowledge.update({
        where: { userId },
        data: { heardAboutLocationIds: [...heard] },
      });
      return;
    }
    if (!campaignId) return;
    const fog = await readCampaignFogSets(campaignId);
    if (!fog) return;
    if (fog.discoveredLocationIds.has(locationId) || fog.discoveredSubLocationIds.has(locationId)) return;
    if (fog.heardAboutLocationIds.has(locationId)) return;
    fog.heardAboutLocationIds.add(locationId);
    await campaignFogPatch(campaignId, {
      heardAboutLocationIds: [...fog.heardAboutLocationIds],
    });
  } catch (err) {
    log.warn({ err: err?.message, userId, locationId, campaignId }, 'markLocationHeardAbout failed');
  }
}

/**
 * Mark an edge as discovered. Bidirectional.
 */
export async function markEdgeDiscoveredByUser({ userId, fromLocationId, toLocationId }) {
  if (!userId || !fromLocationId || !toLocationId) return;
  try {
    const [edgeForward, edgeReverse] = await Promise.all([
      prisma.worldLocationEdge.findFirst({
        where: { fromLocationId, toLocationId },
        select: { id: true },
      }),
      prisma.worldLocationEdge.findFirst({
        where: { fromLocationId: toLocationId, toLocationId: fromLocationId },
        select: { id: true },
      }),
    ]);
    const edgeIds = [edgeForward?.id, edgeReverse?.id].filter(Boolean);
    if (edgeIds.length === 0) return;

    const row = await loadOrCreate(userId);
    const knownEdges = new Set(asArray(row.discoveredEdgeIds));
    const knownLocs = new Set(asArray(row.discoveredLocationIds));
    let changed = false;
    for (const id of edgeIds) {
      if (!knownEdges.has(id)) { knownEdges.add(id); changed = true; }
    }
    for (const loc of [fromLocationId, toLocationId]) {
      if (!knownLocs.has(loc)) { knownLocs.add(loc); changed = true; }
    }
    if (!changed) return;
    await prisma.userWorldKnowledge.update({
      where: { userId },
      data: {
        discoveredEdgeIds: [...knownEdges],
        discoveredLocationIds: [...knownLocs],
      },
    });
  } catch (err) {
    log.warn({ err: err?.message, userId, fromLocationId, toLocationId }, 'markEdgeDiscoveredByUser failed');
  }
}

/**
 * Load a user's full discovery set. Always includes the capital and any
 * `knownByDefault=true` canonical locations.
 */
export async function loadDiscovery(userId) {
  if (!userId) return { locationIds: new Set(), edgeIds: new Set() };
  const [row, knownByDefault] = await Promise.all([
    prisma.userWorldKnowledge.findUnique({ where: { userId } }),
    prisma.worldLocation.findMany({
      where: { OR: [{ locationType: 'capital' }, { knownByDefault: true }] },
      select: { id: true },
    }),
  ]);
  const locationIds = new Set(asArray(row?.discoveredLocationIds));
  const edgeIds = new Set(asArray(row?.discoveredEdgeIds));
  for (const c of knownByDefault) locationIds.add(c.id);
  return { locationIds, edgeIds };
}

/**
 * Load the full three-state fog-of-war view for a campaign.
 */
export async function loadCampaignFog({ userId, campaignId }) {
  const empty = {
    visited: new Set(),
    heardAbout: new Set(),
    discoveredSubLocationIds: new Set(),
    discoveredEdgeIds: new Set(),
  };
  if (!userId) return empty;
  const [canon, campaignFog] = await Promise.all([
    loadDiscovery(userId),
    (async () => {
      if (!campaignId) return null;
      const c = await prisma.campaign.findUnique({
        where: { id: campaignId },
        select: { discoveredLocationIds: true, discoveredSubLocationIds: true, heardAboutLocationIds: true },
      });
      if (!c) return null;
      return {
        discoveredLocationIds: asArray(c.discoveredLocationIds),
        discoveredSubLocationIds: asArray(c.discoveredSubLocationIds),
        heardAboutLocationIds: asArray(c.heardAboutLocationIds),
      };
    })(),
  ]);
  const heardRow = await prisma.userWorldKnowledge.findUnique({
    where: { userId },
    select: { heardAboutLocationIds: true },
  }).catch(() => null);

  const visited = new Set(canon.locationIds);
  const heardAbout = new Set(asArray(heardRow?.heardAboutLocationIds));
  const subLocs = new Set();

  if (campaignFog) {
    for (const id of campaignFog.discoveredLocationIds) visited.add(id);
    for (const id of campaignFog.discoveredSubLocationIds) subLocs.add(id);
    for (const id of campaignFog.heardAboutLocationIds) heardAbout.add(id);
  }
  for (const id of visited) heardAbout.delete(id);

  return {
    visited,
    heardAbout,
    discoveredSubLocationIds: subLocs,
    discoveredEdgeIds: canon.edgeIds,
  };
}

/**
 * Check whether a user has seen a given location. Capital short-circuits
 * to true without a DB write (seeded at world boot).
 */
export async function hasDiscovered({ userId, locationId }) {
  if (!userId || !locationId) return false;
  const loc = await prisma.worldLocation.findUnique({
    where: { id: locationId },
    select: { locationType: true },
  });
  if (loc?.locationType === 'capital') return true;
  const { locationIds } = await loadDiscovery(userId);
  return locationIds.has(locationId);
}
