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
// Used by:
//   - admin map view (restrict graph to visible nodes)
//   - travel intent (limit Dijkstra to known edges; unknown → exploration)
//   - player map UI (Round C) to colour nodes by fog state
//
// Shape of UserWorldKnowledge:
//   discoveredLocationIds: JSON array of canonical WorldLocation.id
//   discoveredEdgeIds:     JSON array of WorldLocationEdge.id
//   heardAboutLocationIds: JSON array of canonical WorldLocation.id

import { prisma } from '../../lib/prisma.js';
import { childLogger } from '../../lib/logger.js';

const log = childLogger({ module: 'userDiscoveryService' });

async function loadOrCreate(userId) {
  if (!userId) return null;
  let row = await prisma.userWorldKnowledge.findUnique({ where: { userId } });
  if (!row) {
    row = await prisma.userWorldKnowledge.create({
      data: { userId, discoveredLocationIds: '[]', discoveredEdgeIds: '[]' },
    });
  }
  return row;
}

function parseJsonArray(str) {
  try {
    const arr = JSON.parse(str || '[]');
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
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
      discoveredLocationIds: new Set(parseJsonArray(c.discoveredLocationIds)),
      discoveredSubLocationIds: new Set(parseJsonArray(c.discoveredSubLocationIds)),
      heardAboutLocationIds: new Set(parseJsonArray(c.heardAboutLocationIds)),
    };
  } catch {
    return null;
  }
}

/**
 * Mark a location as discovered ("visited" fog state). Routes by canonicality:
 *   - `isCanonical=true`  → `UserWorldKnowledge.discoveredLocationIds`
 *   - `isCanonical=false` → `Campaign.discoveredLocationIds`
 *     (or `Campaign.discoveredSubLocationIds` when the location has a parent)
 *
 * Promotes heard→visited by removing the id from the matching heard-about
 * list. `campaignId` is optional for backward compatibility with existing
 * canonical-only callers (postSceneWork.js passes only user+location).
 *
 * Idempotent — silent on failure (discovery must never block scene flow).
 */
export async function markLocationDiscovered({ userId, locationId, campaignId = null }) {
  if (!userId || !locationId) return;
  try {
    const { isCanonical, parentLocationId } = await fetchLocationCanonicality(locationId);

    if (isCanonical) {
      const row = await loadOrCreate(userId);
      const ids = new Set(parseJsonArray(row.discoveredLocationIds));
      const heard = new Set(parseJsonArray(row.heardAboutLocationIds));
      const changed = !ids.has(locationId) || heard.has(locationId);
      if (!changed) return;
      ids.add(locationId);
      heard.delete(locationId);
      await prisma.userWorldKnowledge.update({
        where: { userId },
        data: {
          discoveredLocationIds: JSON.stringify([...ids]),
          heardAboutLocationIds: JSON.stringify([...heard]),
        },
      });
      return;
    }

    // Non-canonical → per-campaign. Sublocations go to the sub list so the
    // map UI can distinguish them from top-level discoveries.
    if (!campaignId) return; // can't route non-canonical without a campaign
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
      [targetKey]: JSON.stringify([...targetSet]),
      heardAboutLocationIds: JSON.stringify([...heard]),
    });
  } catch (err) {
    log.warn({ err: err?.message, userId, locationId, campaignId }, 'markLocationDiscovered failed');
  }
}

/**
 * Mark a location as "heard about" (dashed-outline fog state). Skipped if
 * already discovered — we never demote visited → heard. Canonical goes to
 * `UserWorldKnowledge.heardAboutLocationIds`, non-canonical to the campaign.
 *
 * Called from processStateChanges when an NPC reveals a location in dialog
 * (Phase 4b bucket `locationMentioned: [{locationId, byNpcId}]`).
 */
export async function markLocationHeardAbout({ userId, locationId, campaignId = null }) {
  if (!userId || !locationId) return;
  try {
    const { isCanonical } = await fetchLocationCanonicality(locationId);
    if (isCanonical) {
      const row = await loadOrCreate(userId);
      const visited = new Set(parseJsonArray(row.discoveredLocationIds));
      if (visited.has(locationId)) return; // already visited, don't demote
      const heard = new Set(parseJsonArray(row.heardAboutLocationIds));
      if (heard.has(locationId)) return;
      heard.add(locationId);
      await prisma.userWorldKnowledge.update({
        where: { userId },
        data: { heardAboutLocationIds: JSON.stringify([...heard]) },
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
      heardAboutLocationIds: JSON.stringify([...fog.heardAboutLocationIds]),
    });
  } catch (err) {
    log.warn({ err: err?.message, userId, locationId, campaignId }, 'markLocationHeardAbout failed');
  }
}

/**
 * Mark an edge as discovered. Bidirectional — if A→B is discovered, B→A is
 * also discovered (we find the matching reverse edge and include it).
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
    const knownEdges = new Set(parseJsonArray(row.discoveredEdgeIds));
    const knownLocs = new Set(parseJsonArray(row.discoveredLocationIds));
    let changed = false;
    for (const id of edgeIds) {
      if (!knownEdges.has(id)) { knownEdges.add(id); changed = true; }
    }
    // Walking an edge also reveals both endpoints.
    for (const loc of [fromLocationId, toLocationId]) {
      if (!knownLocs.has(loc)) { knownLocs.add(loc); changed = true; }
    }
    if (!changed) return;
    await prisma.userWorldKnowledge.update({
      where: { userId },
      data: {
        discoveredEdgeIds: JSON.stringify([...knownEdges]),
        discoveredLocationIds: JSON.stringify([...knownLocs]),
      },
    });
  } catch (err) {
    log.warn({ err: err?.message, userId, fromLocationId, toLocationId }, 'markEdgeDiscoveredByUser failed');
  }
}

/**
 * Load a user's full discovery set. Always includes the capital and any
 * `knownByDefault=true` canonical locations (looked up once on read).
 * Returns a minimal shape for back-compat with existing callers that only
 * care about the canonical visited set + edge set.
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
  const locationIds = new Set(parseJsonArray(row?.discoveredLocationIds));
  const edgeIds = new Set(parseJsonArray(row?.discoveredEdgeIds));
  for (const c of knownByDefault) locationIds.add(c.id);
  return { locationIds, edgeIds };
}

/**
 * Load the full three-state fog-of-war view for a campaign. Merges the
 * per-user canonical set with the per-campaign non-canonical set. Caller
 * uses this for the player-facing map in Round C.
 *
 * Returns:
 *   {
 *     visited: Set<locationId>,         // fully explored; sublocations unlocked
 *     heardAbout: Set<locationId>,      // name visible, drill-down locked
 *     discoveredSubLocationIds: Set,    // non-canonical sublocations visited
 *     discoveredEdgeIds: Set,           // traversed edges (canonical only)
 *   }
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
        discoveredLocationIds: parseJsonArray(c.discoveredLocationIds),
        discoveredSubLocationIds: parseJsonArray(c.discoveredSubLocationIds),
        heardAboutLocationIds: parseJsonArray(c.heardAboutLocationIds),
      };
    })(),
  ]);
  // Canonical heard-about lives on UserWorldKnowledge.heardAboutLocationIds;
  // fetch separately so `loadDiscovery` stays backward compatible.
  const heardRow = await prisma.userWorldKnowledge.findUnique({
    where: { userId },
    select: { heardAboutLocationIds: true },
  }).catch(() => null);

  const visited = new Set(canon.locationIds);
  const heardAbout = new Set(parseJsonArray(heardRow?.heardAboutLocationIds));
  const subLocs = new Set();

  if (campaignFog) {
    for (const id of campaignFog.discoveredLocationIds) visited.add(id);
    for (const id of campaignFog.discoveredSubLocationIds) subLocs.add(id);
    for (const id of campaignFog.heardAboutLocationIds) heardAbout.add(id);
  }
  // A visited entry outranks a heard-about entry (cross-source as well).
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
