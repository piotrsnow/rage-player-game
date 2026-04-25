// Living World Phase 7 + Round A — hybrid world discovery.
//
// Tracks two parallel sets of "fog of war" state via F3 join tables:
//   - Canonical locations (seedWorld.js, `WorldLocation.isCanonical=true`)
//     live in `UserDiscoveredLocation` so the player carries their memory
//     of the canon across campaigns.
//   - Non-canonical locations (AI-generated mid-play, `isCanonical=false`)
//     live in `CampaignDiscoveredLocation` — they only exist in one
//     playthrough and must not leak to parallel campaigns.
//
// Two states per row: `heard_about` (dashed-outline on map) and `visited`
// (full color). A `visited` row never demotes back to `heard_about`; once
// a player physically visits a location it stays known. State promotion
// `heard_about → visited` is an UPDATE on the existing row.
//
// Edges follow the same per-user / per-campaign split via `UserDiscoveredEdge`
// and `CampaignEdgeDiscovery`. Edges have no canonicality split — both
// trackers can hold any edge.

import { prisma } from '../../lib/prisma.js';
import { childLogger } from '../../lib/logger.js';

const log = childLogger({ module: 'userDiscoveryService' });

/**
 * Pure — given the currently-stored discovery state (or null) and the new
 * state we want to record, decide whether to insert, update, or no-op.
 * Encodes the "never demote visited → heard_about" rule.
 */
export function planLocationFogMutation(currentState, newState) {
  if (newState !== 'heard_about' && newState !== 'visited') return { kind: 'noop' };
  if (!currentState) return { kind: 'insert' };
  if (currentState === newState) return { kind: 'noop' };
  if (currentState === 'visited' && newState === 'heard_about') return { kind: 'noop' };
  return { kind: 'update' };
}

async function ensureUserKnowledgeRow(userId) {
  if (!userId) return null;
  try {
    return await prisma.userWorldKnowledge.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });
  } catch (err) {
    log.warn({ err: err?.message, userId }, 'ensureUserKnowledgeRow failed');
    return null;
  }
}

async function fetchLocationCanonicality(locationId) {
  if (!locationId) return { isCanonical: true };
  try {
    const loc = await prisma.worldLocation.findUnique({
      where: { id: locationId },
      select: { isCanonical: true },
    });
    return { isCanonical: loc?.isCanonical !== false };
  } catch {
    return { isCanonical: true };
  }
}

async function applyUserLocationState(userId, locationId, newState) {
  const existing = await prisma.userDiscoveredLocation.findUnique({
    where: { userId_locationId: { userId, locationId } },
    select: { state: true },
  });
  const plan = planLocationFogMutation(existing?.state || null, newState);
  if (plan.kind === 'noop') return;
  if (plan.kind === 'insert') {
    await ensureUserKnowledgeRow(userId);
    await prisma.userDiscoveredLocation.create({
      data: { userId, locationId, state: newState },
    });
    return;
  }
  await prisma.userDiscoveredLocation.update({
    where: { userId_locationId: { userId, locationId } },
    data: { state: newState },
  });
}

async function applyCampaignLocationState(campaignId, locationId, newState) {
  const existing = await prisma.campaignDiscoveredLocation.findUnique({
    where: { campaignId_locationId: { campaignId, locationId } },
    select: { state: true },
  });
  const plan = planLocationFogMutation(existing?.state || null, newState);
  if (plan.kind === 'noop') return;
  if (plan.kind === 'insert') {
    await prisma.campaignDiscoveredLocation.create({
      data: { campaignId, locationId, state: newState },
    });
    return;
  }
  await prisma.campaignDiscoveredLocation.update({
    where: { campaignId_locationId: { campaignId, locationId } },
    data: { state: newState },
  });
}

/**
 * Mark a location as discovered ("visited" fog state). Routes by canonicality:
 * canonical → user-account-level, non-canonical → campaign-level. Idempotent —
 * silent on failure (discovery must never block scene flow).
 */
export async function markLocationDiscovered({ userId, locationId, campaignId = null }) {
  if (!userId || !locationId) return;
  try {
    const { isCanonical } = await fetchLocationCanonicality(locationId);
    if (isCanonical) {
      await applyUserLocationState(userId, locationId, 'visited');
      return;
    }
    if (!campaignId) return;
    await applyCampaignLocationState(campaignId, locationId, 'visited');
  } catch (err) {
    log.warn({ err: err?.message, userId, locationId, campaignId }, 'markLocationDiscovered failed');
  }
}

/**
 * Mark a location as "heard about" (dashed-outline fog state). Skipped if
 * already visited — we never demote `visited` → `heard_about`.
 */
export async function markLocationHeardAbout({ userId, locationId, campaignId = null }) {
  if (!userId || !locationId) return;
  try {
    const { isCanonical } = await fetchLocationCanonicality(locationId);
    if (isCanonical) {
      await applyUserLocationState(userId, locationId, 'heard_about');
      return;
    }
    if (!campaignId) return;
    await applyCampaignLocationState(campaignId, locationId, 'heard_about');
  } catch (err) {
    log.warn({ err: err?.message, userId, locationId, campaignId }, 'markLocationHeardAbout failed');
  }
}

/**
 * Mark an edge as discovered by this user. Bidirectional — both directions
 * (forward + reverse edge rows, if present) flip to discovered when one is
 * traversed. Also flips both endpoint locations to `visited`.
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

    await ensureUserKnowledgeRow(userId);
    await prisma.userDiscoveredEdge.createMany({
      data: edgeIds.map((edgeId) => ({ userId, edgeId })),
      skipDuplicates: true,
    });
    // Endpoint locations become visited (both sides of a traversed edge).
    await Promise.all([
      applyUserLocationState(userId, fromLocationId, 'visited').catch(() => {}),
      applyUserLocationState(userId, toLocationId, 'visited').catch(() => {}),
    ]);
  } catch (err) {
    log.warn({ err: err?.message, userId, fromLocationId, toLocationId }, 'markEdgeDiscoveredByUser failed');
  }
}

/**
 * Load the user's full account-level discovery set. Always includes the capital
 * and any `knownByDefault=true` canonical locations (they're seeded "known"
 * from boot — no DB write needed for them to show up on the map).
 */
export async function loadDiscovery(userId) {
  if (!userId) return { locationIds: new Set(), edgeIds: new Set() };
  const [locRows, edgeRows, knownByDefault] = await Promise.all([
    prisma.userDiscoveredLocation.findMany({
      where: { userId, state: 'visited' },
      select: { locationId: true },
    }),
    prisma.userDiscoveredEdge.findMany({
      where: { userId },
      select: { edgeId: true },
    }),
    prisma.worldLocation.findMany({
      where: { OR: [{ locationType: 'capital' }, { knownByDefault: true }] },
      select: { id: true },
    }),
  ]);
  const locationIds = new Set(locRows.map((r) => r.locationId));
  for (const c of knownByDefault) locationIds.add(c.id);
  const edgeIds = new Set(edgeRows.map((r) => r.edgeId));
  return { locationIds, edgeIds };
}

/**
 * Load the full three-state fog-of-war view for a campaign. Merges:
 *   - account-level canonical discovery (UserDiscoveredLocation/Edge)
 *   - campaign-level non-canonical discovery (CampaignDiscoveredLocation)
 *
 * Returns sets keyed by location id. `discoveredSubLocationIds` separates
 * sublocations from main visited locs (UI uses it to render dungeon-room
 * gates differently from town-square spots).
 */
export async function loadCampaignFog({ userId, campaignId }) {
  const empty = {
    visited: new Set(),
    heardAbout: new Set(),
    discoveredSubLocationIds: new Set(),
    discoveredEdgeIds: new Set(),
  };
  if (!userId) return empty;

  const [userVisited, userHeard, edgeRows, capitalsAndDefaults, campaignRows] = await Promise.all([
    prisma.userDiscoveredLocation.findMany({
      where: { userId, state: 'visited' },
      select: { locationId: true },
    }),
    prisma.userDiscoveredLocation.findMany({
      where: { userId, state: 'heard_about' },
      select: { locationId: true },
    }),
    prisma.userDiscoveredEdge.findMany({
      where: { userId },
      select: { edgeId: true },
    }),
    prisma.worldLocation.findMany({
      where: { OR: [{ locationType: 'capital' }, { knownByDefault: true }] },
      select: { id: true },
    }),
    campaignId
      ? prisma.campaignDiscoveredLocation.findMany({
          where: { campaignId },
          select: {
            locationId: true,
            state: true,
            location: { select: { parentLocationId: true } },
          },
        })
      : Promise.resolve([]),
  ]);

  const visited = new Set(userVisited.map((r) => r.locationId));
  for (const c of capitalsAndDefaults) visited.add(c.id);
  const heardAbout = new Set(userHeard.map((r) => r.locationId));
  const subLocs = new Set();
  const edgeIds = new Set(edgeRows.map((r) => r.edgeId));

  for (const row of campaignRows) {
    const isSubLocation = !!row.location?.parentLocationId;
    if (row.state === 'visited') {
      if (isSubLocation) subLocs.add(row.locationId);
      else visited.add(row.locationId);
    } else if (row.state === 'heard_about') {
      heardAbout.add(row.locationId);
    }
  }
  // Never show heard-about for something already visited.
  for (const id of visited) heardAbout.delete(id);

  return {
    visited,
    heardAbout,
    discoveredSubLocationIds: subLocs,
    discoveredEdgeIds: edgeIds,
  };
}

/**
 * Check whether a user has visited a given location. Capital short-circuits
 * to true without a DB read (always-known from world boot).
 */
export async function hasDiscovered({ userId, locationId }) {
  if (!userId || !locationId) return false;
  const loc = await prisma.worldLocation.findUnique({
    where: { id: locationId },
    select: { locationType: true, isCanonical: true, knownByDefault: true },
  });
  if (!loc) return false;
  if (loc.locationType === 'capital' || loc.knownByDefault) return true;

  if (loc.isCanonical !== false) {
    const row = await prisma.userDiscoveredLocation.findUnique({
      where: { userId_locationId: { userId, locationId } },
      select: { state: true },
    });
    return row?.state === 'visited';
  }
  // Non-canonical needs a campaign context — caller should use loadCampaignFog
  // for that path. Without campaignId we can't tell, so assume not discovered.
  return false;
}
