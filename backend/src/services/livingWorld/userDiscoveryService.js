// Living World Phase 7 — per-user world discovery.
//
// Tracks which top-level WorldLocations + WorldLocationEdges a user has
// physically reached. Capital is always implicit (every user knows where
// the capital is). Used by:
//   - admin map view (restrict graph to visible nodes)
//   - travel intent (limit Dijkstra to known edges; unknown → exploration)
//
// Per-user (not per-campaign) because the player "remembers" where places
// are across campaigns. Campaigns share the discovery set by owner userId.
//
// Shape of UserWorldKnowledge:
//   discoveredLocationIds: JSON array of WorldLocation.id (top-level only)
//   discoveredEdgeIds:     JSON array of WorldLocationEdge.id

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

/**
 * Mark a location as discovered by a user. Idempotent — re-calling with a
 * location already in the set is a no-op. Silent on failure (discovery is
 * observational, must never block scene flow).
 */
export async function markLocationDiscovered({ userId, locationId }) {
  if (!userId || !locationId) return;
  try {
    const row = await loadOrCreate(userId);
    const ids = new Set(parseJsonArray(row.discoveredLocationIds));
    if (ids.has(locationId)) return;
    ids.add(locationId);
    await prisma.userWorldKnowledge.update({
      where: { userId },
      data: { discoveredLocationIds: JSON.stringify([...ids]) },
    });
  } catch (err) {
    log.warn({ err: err?.message, userId, locationId }, 'markLocationDiscovered failed');
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
 * Load a user's full discovery set. Always includes the capital if seeded
 * (looked up by locationType='capital'). Returns null when the user hasn't
 * been seeded yet AND no capital is seeded — caller can treat as empty.
 */
export async function loadDiscovery(userId) {
  if (!userId) return { locationIds: new Set(), edgeIds: new Set() };
  const [row, capitals] = await Promise.all([
    prisma.userWorldKnowledge.findUnique({ where: { userId } }),
    prisma.worldLocation.findMany({
      where: { locationType: 'capital' },
      select: { id: true },
    }),
  ]);
  const locationIds = new Set(parseJsonArray(row?.discoveredLocationIds));
  const edgeIds = new Set(parseJsonArray(row?.discoveredEdgeIds));
  for (const c of capitals) locationIds.add(c.id);
  return { locationIds, edgeIds };
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
