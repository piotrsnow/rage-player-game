// Living World — fog-of-war discovery service (unified table version).
//
// With the unified Location table:
//   - Canonical locations: campaignId IS NULL → account-level UserDiscoveredLocation
//   - Campaign-scoped locations: campaignId = X → per-campaign DiscoveredLocation
//   - No more locationKind branching — we check location.campaignId to decide route.
//
// Two parallel fog-of-war layers:
//   1. Account-level (UserDiscoveredLocation) — canonical locations persist across campaigns
//   2. Per-campaign (DiscoveredLocation) — campaign-scoped sandbox locations

import { prisma } from '../../lib/prisma.js';
import { childLogger } from '../../lib/logger.js';

const log = childLogger({ module: 'userDiscoveryService' });

const DISCOVERY_ORDER = ['rumored', 'heard_about', 'visited', 'mapped'];

export function planLocationFogMutation(currentState, newState) {
  const validStates = new Set(DISCOVERY_ORDER);
  if (!validStates.has(newState)) return { kind: 'noop' };
  if (!currentState) return { kind: 'insert' };
  if (currentState === newState) return { kind: 'noop' };
  const currentIdx = DISCOVERY_ORDER.indexOf(currentState);
  const newIdx = DISCOVERY_ORDER.indexOf(newState);
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

async function applyCampaignLocationState(campaignId, locationId, newState) {
  const existing = await prisma.discoveredLocation.findUnique({
    where: { campaignId_locationId: { campaignId, locationId } },
    select: { state: true },
  });
  const plan = planLocationFogMutation(existing?.state || null, newState);
  if (plan.kind === 'noop') return;
  if (plan.kind === 'insert') {
    await prisma.discoveredLocation.create({
      data: { campaignId, locationId, state: newState },
    });
    return;
  }
  await prisma.discoveredLocation.update({
    where: { campaignId_locationId: { campaignId, locationId } },
    data: { state: newState },
  });
}

/**
 * Determine routing: is this location canonical (account-level) or campaign-scoped?
 */
async function isCanonicalLocation(locationId) {
  const loc = await prisma.location.findUnique({
    where: { id: locationId },
    select: { campaignId: true },
  });
  return loc ? loc.campaignId === null : true;
}

/**
 * Mark a location as discovered ("visited" fog state).
 * Routes to account-level or campaign-level based on whether the location is canonical.
 */
export async function markLocationDiscovered({ userId, locationId, campaignId = null }) {
  if (!userId || !locationId) return;
  try {
    const isCanonical = await isCanonicalLocation(locationId);
    if (isCanonical) {
      await applyUserLocationState(userId, locationId, 'visited');
    } else {
      if (!campaignId) return;
      await applyCampaignLocationState(campaignId, locationId, 'visited');
    }

    // Promote outgoing edges from this location: unknown → known
    await prisma.locationEdge.updateMany({
      where: {
        fromLocationId: locationId,
        discoveryState: 'unknown',
        isActive: true,
      },
      data: { discoveryState: 'known' },
    }).catch(() => {});
  } catch (err) {
    log.warn({ err: err?.message, userId, locationId, campaignId }, 'markLocationDiscovered failed');
  }
}

export async function markLocationHeardAbout({ userId, locationId, campaignId = null }) {
  if (!userId || !locationId) return;
  try {
    const isCanonical = await isCanonicalLocation(locationId);
    if (isCanonical) {
      await applyUserLocationState(userId, locationId, 'heard_about');
    } else {
      if (!campaignId) return;
      await applyCampaignLocationState(campaignId, locationId, 'heard_about');
    }
  } catch (err) {
    log.warn({ err: err?.message, userId, locationId, campaignId }, 'markLocationHeardAbout failed');
  }
}

export async function markLocationRumored({ userId, locationId, campaignId = null }) {
  if (!userId || !locationId) return;
  try {
    const isCanonical = await isCanonicalLocation(locationId);
    if (isCanonical) {
      await applyUserLocationState(userId, locationId, 'rumored');
    } else {
      if (!campaignId) return;
      await applyCampaignLocationState(campaignId, locationId, 'rumored');
    }
  } catch (err) {
    log.warn({ err: err?.message, userId, locationId, campaignId }, 'markLocationRumored failed');
  }
}

export async function markLocationMapped({ userId, locationId, campaignId = null }) {
  if (!userId || !locationId) return;
  try {
    const isCanonical = await isCanonicalLocation(locationId);
    if (isCanonical) {
      await applyUserLocationState(userId, locationId, 'mapped');
    } else {
      if (!campaignId) return;
      await applyCampaignLocationState(campaignId, locationId, 'mapped');
    }
  } catch (err) {
    log.warn({ err: err?.message, userId, locationId, campaignId }, 'markLocationMapped failed');
  }
}

/**
 * Mark a LocationEdge as traversed. Updates discoveryState + traversal count.
 */
export async function markLocationEdgeTraversed({ fromLocationId, toLocationId, sceneIndex = null, campaignId = null }) {
  if (!fromLocationId || !toLocationId) return;
  try {
    const where = {
      isActive: true,
      category: 'movement',
      OR: [
        { fromLocationId, toLocationId },
        { fromLocationId: toLocationId, toLocationId: fromLocationId, bidirectional: true },
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
    log.warn({ err: err?.message, fromLocationId, toLocationId, campaignId }, 'markLocationEdgeTraversed failed');
  }
}

/**
 * Mark a location's parent as visible when the player enters a sublocation.
 */
export async function markStartLocationVisible({ userId, locationId, campaignId = null }) {
  if (!userId || !locationId) return;
  try {
    await markLocationDiscovered({ userId, locationId, campaignId });

    const loc = await prisma.location.findUnique({
      where: { id: locationId },
      select: { parentLocationId: true },
    });
    if (loc?.parentLocationId) {
      await markLocationDiscovered({ userId, locationId: loc.parentLocationId, campaignId });
    }
  } catch (err) {
    log.warn({ err: err?.message, userId, locationId }, 'markStartLocationVisible failed');
  }
}

// ── Edge discovery ───────────────────────────────────────────────────

export async function markEdgeDiscovered({ edgeId, campaignId }) {
  if (!edgeId || !campaignId) return;
  try {
    await prisma.campaignEdgeDiscovery.upsert({
      where: { edgeId_campaignId: { edgeId, campaignId } },
      create: { edgeId, campaignId },
      update: {},
    });
  } catch (err) {
    log.warn({ err: err?.message, edgeId, campaignId }, 'markEdgeDiscovered failed');
  }
}

export async function markEdgeDiscoveredByUser({ edgeId, userId }) {
  if (!edgeId || !userId) return;
  try {
    await ensureUserKnowledgeRow(userId);
    await prisma.userDiscoveredEdge.upsert({
      where: { userId_edgeId: { userId, edgeId } },
      create: { userId, edgeId },
      update: {},
    });
  } catch (err) {
    log.warn({ err: err?.message, edgeId, userId }, 'markEdgeDiscoveredByUser failed');
  }
}

// ── Fog-of-war queries ───────────────────────────────────────────────

/**
 * Load full campaign fog — merges account-level canonical discoveries
 * with per-campaign sandbox discoveries.
 */
export async function loadCampaignFog(userId, campaignId) {
  const visited = new Set();
  const heardAbout = new Set();

  // Account-level canonical discoveries
  if (userId) {
    const userRows = await prisma.userDiscoveredLocation.findMany({
      where: { userId },
      select: { locationId: true, state: true },
    });
    for (const r of userRows) {
      if (r.state === 'visited' || r.state === 'mapped') visited.add(r.locationId);
      else if (r.state === 'heard_about' || r.state === 'rumored') heardAbout.add(r.locationId);
    }
  }

  // Always-visible canonical locations (capitals, knownByDefault)
  const alwaysVisible = await prisma.location.findMany({
    where: { campaignId: null, knownByDefault: true },
    select: { id: true },
  });
  for (const loc of alwaysVisible) visited.add(loc.id);

  // Per-campaign discoveries (both canonical and sandbox locations)
  if (campaignId) {
    const campaignRows = await prisma.discoveredLocation.findMany({
      where: { campaignId },
      select: { locationId: true, state: true },
    });
    for (const r of campaignRows) {
      if (r.state === 'visited' || r.state === 'mapped') {
        visited.add(r.locationId);
        heardAbout.delete(r.locationId);
      } else if (r.state === 'heard_about' || r.state === 'rumored') {
        if (!visited.has(r.locationId)) heardAbout.add(r.locationId);
      }
    }
  }

  // Remove heard_about entries that are also visited
  for (const id of visited) heardAbout.delete(id);

  return { visited, heardAbout };
}

/**
 * Account-level discovery only (no campaign context).
 */
export async function loadDiscovery(userId) {
  if (!userId) return { visited: new Set(), edges: new Set() };
  const visited = new Set();
  const edges = new Set();

  const userRows = await prisma.userDiscoveredLocation.findMany({
    where: { userId, state: 'visited' },
    select: { locationId: true },
  });
  for (const r of userRows) visited.add(r.locationId);

  const alwaysVisible = await prisma.location.findMany({
    where: { campaignId: null, knownByDefault: true },
    select: { id: true },
  });
  for (const loc of alwaysVisible) visited.add(loc.id);

  const edgeRows = await prisma.userDiscoveredEdge.findMany({
    where: { userId },
    select: { edgeId: true },
  });
  for (const r of edgeRows) edges.add(r.edgeId);

  return { visited, edges };
}

export async function hasDiscovered(userId, locationId) {
  if (!userId || !locationId) return false;
  const row = await prisma.userDiscoveredLocation.findUnique({
    where: { userId_locationId: { userId, locationId } },
    select: { state: true },
  });
  if (row && (row.state === 'visited' || row.state === 'mapped')) return true;
  const loc = await prisma.location.findUnique({
    where: { id: locationId },
    select: { knownByDefault: true, locationType: true },
  });
  return loc?.knownByDefault === true || loc?.locationType === 'capital';
}
