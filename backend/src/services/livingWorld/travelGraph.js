// Living World Phase 7 — travel graph.
//
// Pure graph logic (Dijkstra, detour detection) + thin DB helpers for
// WorldLocationEdge CRUD. Position math lives in positionCalculator.js;
// this module only cares about edges + paths.
//
// Distance semantics: `edge.distance` is km (matches regionX/Y units).
// Dijkstra uses distance as cost. `discoveredByCampaigns` is a JSON array of
// campaignIds — edges only enter the visible graph for campaigns that have
// traversed them (or have them marked at seed time).

import { prisma } from '../../lib/prisma.js';
import { childLogger } from '../../lib/logger.js';
import { euclidean } from './positionCalculator.js';

const log = childLogger({ module: 'travelGraph' });

export const DETOUR_DIRECT = 1.3;     // path_length / straight_line below this = direct enough
export const DETOUR_SENSIBLE = 2.0;   // 1.3-2.0 = sensible detour; > 2.0 = long detour (shortcut territory)

/**
 * Idempotent edge upsert. Keyed on (fromLocationId, toLocationId). Returns
 * the edge row. Edges are stored directionally — callers wanting bidirectional
 * traversal should call upsertEdge twice.
 */
export async function upsertEdge({
  fromLocationId,
  toLocationId,
  distance,
  difficulty = 'safe',
  terrainType = 'road',
  direction = null,
  gated = false,
  gateHint = null,
  discoveredByCampaignId = null,
}) {
  if (!fromLocationId || !toLocationId || fromLocationId === toLocationId) return null;

  const existing = await prisma.worldLocationEdge.findFirst({
    where: { fromLocationId, toLocationId },
  });

  const discovered = new Set();
  if (existing) {
    try {
      const prev = JSON.parse(existing.discoveredByCampaigns || '[]');
      for (const id of prev) discovered.add(id);
    } catch { /* ignore */ }
  }
  if (discoveredByCampaignId) discovered.add(discoveredByCampaignId);

  const data = {
    fromLocationId,
    toLocationId,
    distance,
    difficulty,
    terrainType,
    direction,
    gated,
    gateHint,
    discoveredByCampaigns: JSON.stringify([...discovered]),
  };

  if (existing) {
    return prisma.worldLocationEdge.update({
      where: { id: existing.id },
      data: {
        // Don't overwrite difficulty/terrain/distance on re-traversal —
        // first-write wins. Discovery set merged above.
        discoveredByCampaigns: data.discoveredByCampaigns,
      },
    });
  }
  return prisma.worldLocationEdge.create({ data });
}

/**
 * Mark an edge as discovered by a campaign (bidirectional — both directions
 * flip to visible when a campaign traverses).
 */
export async function markEdgeDiscovered({ fromLocationId, toLocationId, campaignId }) {
  if (!campaignId) return;
  await Promise.all([
    markDirection({ fromLocationId, toLocationId, campaignId }),
    markDirection({ fromLocationId: toLocationId, toLocationId: fromLocationId, campaignId }),
  ]);
}

async function markDirection({ fromLocationId, toLocationId, campaignId }) {
  const edge = await prisma.worldLocationEdge.findFirst({
    where: { fromLocationId, toLocationId },
  });
  if (!edge) return;
  try {
    const prev = JSON.parse(edge.discoveredByCampaigns || '[]');
    if (prev.includes(campaignId)) return;
    prev.push(campaignId);
    await prisma.worldLocationEdge.update({
      where: { id: edge.id },
      data: { discoveredByCampaigns: JSON.stringify(prev) },
    });
  } catch (err) {
    log.warn({ err: err?.message, edgeId: edge.id }, 'markDirection failed');
  }
}

/**
 * Load all edges visible to a campaign, in both directions. Returns map
 * fromId → [{ toId, distance, difficulty, terrainType, direction }].
 */
export async function loadCampaignGraph(campaignId) {
  const edges = await prisma.worldLocationEdge.findMany({
    select: {
      fromLocationId: true,
      toLocationId: true,
      distance: true,
      difficulty: true,
      terrainType: true,
      direction: true,
      discoveredByCampaigns: true,
    },
  });
  const adj = new Map();
  for (const e of edges) {
    if (!isEdgeVisibleTo(e, campaignId)) continue;
    const list = adj.get(e.fromLocationId) || [];
    list.push({
      toId: e.toLocationId,
      distance: e.distance,
      difficulty: e.difficulty,
      terrainType: e.terrainType,
      direction: e.direction,
    });
    adj.set(e.fromLocationId, list);
  }
  return adj;
}

function isEdgeVisibleTo(edge, campaignId) {
  if (!campaignId) return true;
  try {
    const list = JSON.parse(edge.discoveredByCampaigns || '[]');
    return list.includes(campaignId);
  } catch {
    return false;
  }
}

/**
 * Dijkstra shortest-path on a pre-loaded adjacency map. Returns:
 *   { path: [locationId,...], distance: sum, hops: path.length-1 }
 * or null if no path exists.
 *
 * Pure — `adj` comes from loadCampaignGraph. Node ids can be anything
 * (strings), distance costs must be non-negative numbers.
 */
export function dijkstra(adj, startId, endId) {
  if (!startId || !endId) return null;
  if (startId === endId) return { path: [startId], distance: 0, hops: 0 };

  const dist = new Map([[startId, 0]]);
  const prev = new Map();
  const visited = new Set();
  // Simple Map-scan "priority queue". N is small (<1000 locations expected),
  // so avoid heap dependency overhead.
  while (true) {
    let curId = null;
    let curDist = Infinity;
    for (const [id, d] of dist.entries()) {
      if (visited.has(id)) continue;
      if (d < curDist) { curDist = d; curId = id; }
    }
    if (curId === null) break;
    if (curId === endId) break;
    visited.add(curId);

    const neighbors = adj.get(curId) || [];
    for (const n of neighbors) {
      if (visited.has(n.toId)) continue;
      const alt = curDist + n.distance;
      const known = dist.get(n.toId);
      if (known === undefined || alt < known) {
        dist.set(n.toId, alt);
        prev.set(n.toId, curId);
      }
    }
  }

  if (!dist.has(endId)) return null;

  const path = [];
  let cur = endId;
  while (cur) {
    path.unshift(cur);
    cur = prev.get(cur);
  }
  return { path, distance: dist.get(endId), hops: path.length - 1 };
}

/**
 * Classify a path by detour ratio vs straight-line distance between endpoints.
 * Returns:
 *   'direct'   — ratio < DETOUR_DIRECT  — narrate existing waypoints, no new locations
 *   'sensible' — DETOUR_DIRECT ≤ ratio < DETOUR_SENSIBLE  — narrate existing waypoints
 *   'long'     — ratio ≥ DETOUR_SENSIBLE  — long detour, shortcut territory (Iteracja 2)
 *   'trivial'  — single-hop or zero-distance
 */
export function classifyDetour({ pathDistance, start, end }) {
  if (!start || !end) return 'trivial';
  const straight = euclidean(start, end);
  if (straight <= 0 || pathDistance <= 0) return 'trivial';
  const ratio = pathDistance / straight;
  if (ratio < DETOUR_DIRECT) return 'direct';
  if (ratio < DETOUR_SENSIBLE) return 'sensible';
  return 'long';
}

/**
 * Resolve a path into full location rows (ids → names + coords) for prompt
 * injection. Keeps order. Unknown ids are filtered out.
 */
export async function expandPath(pathIds) {
  if (!Array.isArray(pathIds) || pathIds.length === 0) return [];
  const rows = await prisma.worldLocation.findMany({
    where: { id: { in: pathIds } },
    select: {
      id: true, canonicalName: true, locationType: true,
      regionX: true, regionY: true, region: true,
    },
  });
  const byId = new Map(rows.map((r) => [r.id, r]));
  return pathIds.map((id) => byId.get(id)).filter(Boolean);
}
