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
 * Ordered discovery progression. State can only advance (never demote).
 * Graph system: added `rumored` (before heard_about) and `mapped` (after visited).
 */
const DISCOVERY_ORDER = ['rumored', 'heard_about', 'visited', 'mapped'];

/**
 * Pure — given the currently-stored discovery state (or null) and the new
 * state we want to record, decide whether to insert, update, or no-op.
 * Encodes the "never demote" rule: rumored < heard_about < visited < mapped.
 */
export function planLocationFogMutation(currentState, newState) {
  const validStates = new Set(DISCOVERY_ORDER);
  if (!validStates.has(newState)) return { kind: 'noop' };
  if (!currentState) return { kind: 'insert' };
  if (currentState === newState) return { kind: 'noop' };

  const currentIdx = DISCOVERY_ORDER.indexOf(currentState);
  const newIdx = DISCOVERY_ORDER.indexOf(newState);

  // Never demote — only advance
  if (currentIdx >= 0 && newIdx <= currentIdx) return { kind: 'noop' };
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
 * Also promotes discoveryState of outgoing edges FROM this location to 'known'
 * (if they were 'unknown'), so the player learns about potential exits.
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
    } else {
      if (!campaignId) return;
      await applyCampaignLocationState(campaignId, locationKind, locationId, 'visited');
    }

    // Promote outgoing edges from this location: unknown → known
    await prisma.locationEdge.updateMany({
      where: {
        fromKind: locationKind,
        fromId: locationId,
        discoveryState: 'unknown',
        isActive: true,
      },
      data: { discoveryState: 'known' },
    }).catch(() => {});
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
 * Mark LocationEdge rows between two locations as 'visited' when the player
 * traverses them. Bidirectional edges get both directions marked.
 * Also increments `metadata.traversalCount` and sets `metadata.lastTraversedSceneIndex`
 * for edge familiarity tracking (travel narration compression).
 */
export async function markLocationEdgeTraversed({ fromKind, fromId, toKind, toId, sceneIndex = null, campaignId = null }) {
  if (!fromKind || !fromId || !toKind || !toId) return;
  try {
    const where = {
      isActive: true,
      category: 'movement',
      OR: [
        { fromKind, fromId, toKind, toId },
        { fromKind: toKind, fromId: toId, toKind: fromKind, toId: fromId, bidirectional: true },
      ],
    };
    if (campaignId) {
      where.AND = [{ OR: [{ campaignId: null }, { campaignId }] }];
    }

    const edges = await prisma.locationEdge.findMany({
      where,
      select: { id: true, metadata: true },
    });
    if (edges.length === 0) return;

    await Promise.all(edges.map((edge) => {
      const prev = (edge.metadata && typeof edge.metadata === 'object') ? edge.metadata : {};
      const count = (typeof prev.traversalCount === 'number' ? prev.traversalCount : 0) + 1;
      return prisma.locationEdge.update({
        where: { id: edge.id },
        data: {
          discoveryState: 'visited',
          metadata: {
            ...prev,
            traversalCount: count,
            ...(typeof sceneIndex === 'number' ? { lastTraversedSceneIndex: sceneIndex } : {}),
          },
        },
      });
    }));
  } catch (err) {
    log.warn({ err: err?.message, fromKind, fromId, toKind, toId, campaignId }, 'markLocationEdgeTraversed failed');
  }
}

/**
 * Graph system — mark a location as "rumored" (weakest discovery state).
 * Player has only vaguely heard about this place (legends, drunk sailors).
 * Never demotes a stronger state (heard_about/visited/mapped).
 */
export async function markLocationRumored({
  userId,
  locationId,
  locationKind = LOCATION_KIND_WORLD,
  campaignId = null,
}) {
  if (!userId || !locationId) return;
  try {
    if (locationKind === LOCATION_KIND_WORLD) {
      await applyUserLocationState(userId, locationId, 'rumored');
      return;
    }
    if (!campaignId) return;
    await applyCampaignLocationState(campaignId, locationKind, locationId, 'rumored');
  } catch (err) {
    log.warn({ err: err?.message, userId, locationKind, locationId, campaignId }, 'markLocationRumored failed');
  }
}

/**
 * Graph system — mark a location as "mapped" (strongest discovery state).
 * Player has fully explored this location and discovered all edges from it.
 * Never demotes — but always upgrades from rumored/heard_about/visited.
 */
export async function markLocationMapped({
  userId,
  locationId,
  locationKind = LOCATION_KIND_WORLD,
  campaignId = null,
}) {
  if (!userId || !locationId) return;
  try {
    if (locationKind === LOCATION_KIND_WORLD) {
      await applyUserLocationState(userId, locationId, 'mapped');
      return;
    }
    if (!campaignId) return;
    await applyCampaignLocationState(campaignId, locationKind, locationId, 'mapped');
  } catch (err) {
    log.warn({ err: err?.message, userId, locationKind, locationId, campaignId }, 'markLocationMapped failed');
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
 * sublocation start → its parent) and marks both visited so the player sees
 * the starting tile on the map from turn 0.
 *
 * Edges = stricte zbudowana droga (bezpieczne przejście). Edges are NOT a
 * source of player or NPC knowledge — entering a settlement does not auto-
 * reveal its road neighbours. Heard-about reveals come from NPC dialog
 * (`processLocationMentions`) only.
 *
 * Idempotent — silent on failure.
 */
export async function markStartLocationVisible({ userId, campaignId, locationKind, locationId }) {
  if (!userId || !locationKind || !locationId) return;
  try {
    await markLocationDiscovered({ userId, locationKind, locationId, campaignId });

    if (locationKind === LOCATION_KIND_WORLD) {
      const row = await prisma.worldLocation.findUnique({
        where: { id: locationId },
        select: { parentLocationId: true },
      });
      if (row?.parentLocationId) {
        await markLocationDiscovered({ userId, locationKind, locationId: row.parentLocationId, campaignId });
      }
    } else if (locationKind === LOCATION_KIND_CAMPAIGN) {
      const row = await prisma.campaignLocation.findUnique({
        where: { id: locationId },
        select: { parentLocationId: true },
      });
      if (row?.parentLocationId) {
        await markLocationDiscovered({ userId, locationKind, locationId: row.parentLocationId, campaignId });
      }
    }
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

  // Graph system: `rumored` locations go into heardAbout (same dashed-outline
  // rendering for now — UI can differentiate later). `mapped` locations go into
  // visited (full color). This keeps backward compat with the existing MapTab
  // rendering which only knows visited vs heardAbout.
  for (const row of campaignRows) {
    const isSubLocation = !!parentById.get(row.locationId);
    if (row.state === 'visited' || row.state === 'mapped') {
      if (isSubLocation) subLocs.add(row.locationId);
      else visited.add(row.locationId);
    } else if (row.state === 'heard_about' || row.state === 'rumored') {
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
