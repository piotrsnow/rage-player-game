// Living World Phase 7 + Round A — hybrid world discovery.
//
// Tracks two parallel sets of "fog of war" state via F3 join tables:
//   - Canonical WorldLocations live in `UserDiscoveredLocation` so the
//     player carries their memory of the canon across campaigns.
//   - F5b — `CampaignLocation` rows (per-campaign sandbox) live in
//     `CampaignDiscoveredLocation` with `locationKind='campaign'`. The
//     canonical-vs-sandbox split is now the polymorphic `kind` column on
//     the discovery row, not `WorldLocation.isCanonical` (dropped in F5b).
//
// Two states per row: `heard_about` (dashed-outline on map) and `visited`
// (full color). A `visited` row never demotes back to `heard_about`; once
// a player physically visits a location it stays known. State promotion
// `heard_about → visited` is an UPDATE on the existing row.
//
// Edges follow per-user `UserDiscoveredEdge` and per-campaign
// `CampaignEdgeDiscovery`. Edges are canonical-only (Road FK to
// WorldLocation) — there is no campaign-scoped edge table.

import { prisma } from '../../lib/prisma.js';
import { childLogger } from '../../lib/logger.js';
import { LOCATION_KIND_WORLD, LOCATION_KIND_CAMPAIGN } from '../locationRefs.js';

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

async function applyCampaignLocationState(campaignId, locationKind, locationId, newState) {
  const existing = await prisma.campaignDiscoveredLocation.findUnique({
    where: { campaignId_locationKind_locationId: { campaignId, locationKind, locationId } },
    select: { state: true },
  });
  const plan = planLocationFogMutation(existing?.state || null, newState);
  if (plan.kind === 'noop') return;
  if (plan.kind === 'insert') {
    await prisma.campaignDiscoveredLocation.create({
      data: { campaignId, locationKind, locationId, state: newState },
    });
    return;
  }
  await prisma.campaignDiscoveredLocation.update({
    where: { campaignId_locationKind_locationId: { campaignId, locationKind, locationId } },
    data: { state: newState },
  });
}

/**
 * Mark a location as discovered ("visited" fog state).
 *
 * Routes by `locationKind`:
 *  - `world` (default for back-compat): account-level UserDiscoveredLocation.
 *  - `campaign`: per-campaign CampaignDiscoveredLocation.
 *
 * Idempotent — silent on failure (discovery must never block scene flow).
 */
export async function markLocationDiscovered({
  userId,
  locationId,
  locationKind = LOCATION_KIND_WORLD,
  campaignId = null,
}) {
  if (!userId || !locationId) return;
  try {
    if (locationKind === LOCATION_KIND_WORLD) {
      await applyUserLocationState(userId, locationId, 'visited');
      return;
    }
    if (!campaignId) return;
    await applyCampaignLocationState(campaignId, locationKind, locationId, 'visited');
  } catch (err) {
    log.warn({ err: err?.message, userId, locationKind, locationId, campaignId }, 'markLocationDiscovered failed');
  }
}

/**
 * Mark a location as "heard about" (dashed-outline fog state). Skipped if
 * already visited — we never demote `visited` → `heard_about`. Polymorphic
 * via `locationKind` (same routing as `markLocationDiscovered`).
 */
export async function markLocationHeardAbout({
  userId,
  locationId,
  locationKind = LOCATION_KIND_WORLD,
  campaignId = null,
}) {
  if (!userId || !locationId) return;
  try {
    if (locationKind === LOCATION_KIND_WORLD) {
      await applyUserLocationState(userId, locationId, 'heard_about');
      return;
    }
    if (!campaignId) return;
    await applyCampaignLocationState(campaignId, locationKind, locationId, 'heard_about');
  } catch (err) {
    log.warn({ err: err?.message, userId, locationKind, locationId, campaignId }, 'markLocationHeardAbout failed');
  }
}

/**
 * Mark an edge as discovered by this user. Bidirectional — both directions
 * (forward + reverse Road rows, if present) flip to discovered when one is
 * traversed. Also flips both endpoint locations to `visited`. Roads are
 * canonical-only, so this only writes UserDiscoveredLocation (kind=world)
 * for the endpoints.
 */
export async function markEdgeDiscoveredByUser({ userId, fromLocationId, toLocationId }) {
  if (!userId || !fromLocationId || !toLocationId) return;
  try {
    const [edgeForward, edgeReverse] = await Promise.all([
      prisma.road.findFirst({
        where: { fromLocationId, toLocationId },
        select: { id: true },
      }),
      prisma.road.findFirst({
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
    await Promise.all([
      applyUserLocationState(userId, fromLocationId, 'visited').catch(() => {}),
      applyUserLocationState(userId, toLocationId, 'visited').catch(() => {}),
    ]);
  } catch (err) {
    log.warn({ err: err?.message, userId, fromLocationId, toLocationId }, 'markEdgeDiscoveredByUser failed');
  }
}

/**
 * Discovery setup at campaign start. Resolves the top-level settlement (a
 * sublocation start → its parent), marks it visited, and — for canonical
 * starts — pre-discovers outgoing Roads + flips neighbor settlements to
 * `heard_about` so the player sees the local road network from turn 0.
 *
 * Reason: the player map only renders top-level tiles whose fog state isn't
 * `unknown`, and Roads only render when both endpoints are non-`unknown`.
 * Without this seeding, a player who starts in a non-`knownByDefault` village
 * (or in a CampaignLocation sandbox settlement) sees an empty map. Roads are
 * canonical-only (FK to WorldLocation), so the road branch is a no-op for
 * CampaignLocation starts.
 *
 * Idempotent — silent on failure.
 */
export async function markStartLocationVisible({ userId, campaignId, locationKind, locationId }) {
  if (!userId || !locationKind || !locationId) return;
  try {
    await markLocationDiscovered({ userId, locationKind, locationId, campaignId });

    let topLevelId = locationId;
    if (locationKind === LOCATION_KIND_WORLD) {
      const row = await prisma.worldLocation.findUnique({
        where: { id: locationId },
        select: { parentLocationId: true },
      });
      if (row?.parentLocationId) {
        topLevelId = row.parentLocationId;
        await markLocationDiscovered({ userId, locationKind, locationId: topLevelId, campaignId });
      }
    } else if (locationKind === LOCATION_KIND_CAMPAIGN) {
      const row = await prisma.campaignLocation.findUnique({
        where: { id: locationId },
        select: { parentLocationId: true },
      });
      if (row?.parentLocationId) {
        topLevelId = row.parentLocationId;
        await markLocationDiscovered({ userId, locationKind, locationId: topLevelId, campaignId });
      }
    }

    if (locationKind !== LOCATION_KIND_WORLD) return;
    const roads = await prisma.road.findMany({
      where: {
        OR: [
          { fromLocationId: topLevelId },
          { toLocationId: topLevelId },
        ],
      },
      select: { id: true, fromLocationId: true, toLocationId: true },
    });
    if (roads.length === 0) return;

    await ensureUserKnowledgeRow(userId);
    await prisma.userDiscoveredEdge.createMany({
      data: roads.map((r) => ({ userId, edgeId: r.id })),
      skipDuplicates: true,
    });
    const neighborIds = new Set();
    for (const r of roads) {
      if (r.fromLocationId !== topLevelId) neighborIds.add(r.fromLocationId);
      if (r.toLocationId !== topLevelId) neighborIds.add(r.toLocationId);
    }
    await Promise.all(
      [...neighborIds].map((id) =>
        markLocationHeardAbout({ userId, locationKind: LOCATION_KIND_WORLD, locationId: id })
      )
    );
  } catch (err) {
    log.warn({ err: err?.message, userId, campaignId, locationKind, locationId }, 'markStartLocationVisible failed');
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
 *   - per-campaign sandbox discovery (CampaignDiscoveredLocation)
 *
 * F5b — IDs are uuids (globally unique across WorldLocation + CampaignLocation),
 * so the fog Sets stay keyed by bare id. The kind column on
 * CampaignDiscoveredLocation is used to look up sublocation parents from the
 * right table — UI doesn't need to know.
 *
 * `discoveredSubLocationIds` separates sublocations from main visited locs
 * (UI uses it to render dungeon-room gates differently from town-square spots).
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
          select: { locationKind: true, locationId: true, state: true },
        })
      : Promise.resolve([]),
  ]);

  const visited = new Set();
  const heardAbout = new Set();
  for (const r of userVisited) visited.add(r.locationId);
  for (const c of capitalsAndDefaults) visited.add(c.id);
  for (const r of userHeard) heardAbout.add(r.locationId);

  // Determine sublocation membership by joining each campaign-discovered ref
  // back to its source table (kind discriminator drives the lookup).
  const subLocs = new Set();
  const edgeIds = new Set(edgeRows.map((r) => r.edgeId));
  const worldIds = campaignRows
    .filter((r) => r.locationKind === LOCATION_KIND_WORLD)
    .map((r) => r.locationId);
  const campaignIds = campaignRows
    .filter((r) => r.locationKind === LOCATION_KIND_CAMPAIGN)
    .map((r) => r.locationId);
  const [worldParents, campaignParents] = await Promise.all([
    worldIds.length
      ? prisma.worldLocation.findMany({
          where: { id: { in: worldIds } },
          select: { id: true, parentLocationId: true },
        })
      : Promise.resolve([]),
    campaignIds.length
      ? prisma.campaignLocation.findMany({
          where: { id: { in: campaignIds } },
          select: { id: true, parentLocationId: true },
        })
      : Promise.resolve([]),
  ]);
  const parentById = new Map();
  for (const r of worldParents) parentById.set(r.id, r.parentLocationId);
  for (const r of campaignParents) parentById.set(r.id, r.parentLocationId);

  for (const row of campaignRows) {
    const isSubLocation = !!parentById.get(row.locationId);
    if (row.state === 'visited') {
      if (isSubLocation) subLocs.add(row.locationId);
      else visited.add(row.locationId);
    } else if (row.state === 'heard_about') {
      heardAbout.add(row.locationId);
    }
  }
  for (const id of visited) heardAbout.delete(id);

  return {
    visited,
    heardAbout,
    discoveredSubLocationIds: subLocs,
    discoveredEdgeIds: edgeIds,
  };
}

/** Polymorphic ref key — `${kind}:${id}` — used by callers that explicitly
 * want to disambiguate kind in a single map. Most code can rely on bare uuids
 * since WorldLocation + CampaignLocation share the global uuid namespace. */
export function refKey(kind, id) { return `${kind}:${id}`; }

/**
 * Check whether a user has visited a given canonical WorldLocation. Capital
 * short-circuits to true without a DB read. CampaignLocation discovery has to
 * use loadCampaignFog because the canonical-vs-sandbox split needs the
 * campaign context.
 */
export async function hasDiscovered({ userId, locationId }) {
  if (!userId || !locationId) return false;
  const loc = await prisma.worldLocation.findUnique({
    where: { id: locationId },
    select: { locationType: true, knownByDefault: true },
  });
  if (!loc) return false;
  if (loc.locationType === 'capital' || loc.knownByDefault) return true;
  const row = await prisma.userDiscoveredLocation.findUnique({
    where: { userId_locationId: { userId, locationId } },
    select: { state: true },
  });
  return row?.state === 'visited';
}
