// Living World Phase 7 — travel graph.
//
// Pure graph logic (Dijkstra, detour detection) + thin DB helpers for
// Road CRUD (renamed from WorldLocationEdge in F5b). Roads are
// canonical-only — connect two WorldLocation rows. Campaign-scoped
// CampaignLocations are off-graph; distance to/from them is Euclidean.
// Position math lives in positionCalculator.js; this module only cares
// about edges + paths.
//
// Distance semantics: `edge.distance` is km (matches regionX/Y units).
// Dijkstra uses distance as cost. Edge visibility for a campaign is tracked
// in the `CampaignEdgeDiscovery` join table — edges only enter the visible
// graph once a campaign traverses them (or they were marked at seed time).

import { prisma } from '../../lib/prisma.js';
import { childLogger } from '../../lib/logger.js';
import { euclidean } from './positionCalculator.js';

const log = childLogger({ module: 'travelGraph' });

/** Movement-only relation types for Dijkstra filtering. */
const MOVEMENT_TYPES = [
  'road', 'path', 'trail', 'door', 'stairs',
  'tunnel', 'bridge', 'portal', 'secret_path',
  'river', 'ferry', 'gate',
];

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
  // Graph system — new fields
  relationType = 'road',
  bidirectional = true,
  metadata = {},
  visibility = 'visible',
  risk = null,
  travelTime = null,
  weight = null,
  edgeDescription = null,
  confidence = null,
}) {
  if (!fromLocationId || !toLocationId || fromLocationId === toLocationId) return null;

  // Unique constraint is now (fromLocationId, toLocationId, relationType)
  const existing = await prisma.road.findFirst({
    where: { fromLocationId, toLocationId, relationType },
    select: { id: true },
  });

  const edge = existing
    ? existing
    : await prisma.road.create({
        data: {
          fromLocationId,
          toLocationId,
          distance,
          difficulty,
          terrainType,
          direction,
          gated,
          gateHint,
          relationType,
          bidirectional,
          metadata,
          visibility,
          risk,
          travelTime,
          weight,
          edgeDescription,
          confidence,
        },
      });

  if (discoveredByCampaignId) {
    await prisma.campaignEdgeDiscovery.upsert({
      where: { edgeId_campaignId: { edgeId: edge.id, campaignId: discoveredByCampaignId } },
      create: { edgeId: edge.id, campaignId: discoveredByCampaignId },
      update: {},
    }).catch((err) => log.warn({ err: err?.message, edgeId: edge.id, campaignId: discoveredByCampaignId },
      'upsertEdge: discovery row failed'));
  }
  return edge;
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
  const edge = await prisma.road.findFirst({
    where: { fromLocationId, toLocationId },
    select: { id: true },
  });
  if (!edge) return;
  await prisma.campaignEdgeDiscovery.upsert({
    where: { edgeId_campaignId: { edgeId: edge.id, campaignId } },
    create: { edgeId: edge.id, campaignId },
    update: {},
  }).catch((err) => log.warn({ err: err?.message, edgeId: edge.id }, 'markDirection failed'));
}

/**
 * Load all edges visible to a campaign, in both directions. Returns map
 * fromId → [{ toId, distance, difficulty, terrainType, direction }].
 *
 * Also merges LocationEdge rows with category='movement' so Dijkstra sees
 * both canonical Roads AND semantic movement edges from the location graph.
 */
export async function loadCampaignGraph(campaignId) {
  // Graph system: Dijkstra only walks movement edges. Non-movement relation
  // types (perception, social, narrative, temporal) are excluded.
  let roadEdges;
  if (!campaignId) {
    roadEdges = await prisma.road.findMany({
      where: { relationType: { in: MOVEMENT_TYPES } },
      select: {
        fromLocationId: true, toLocationId: true,
        distance: true, difficulty: true, terrainType: true, direction: true,
        relationType: true, bidirectional: true, weight: true,
      },
    });
  } else {
    // Visible edges = those with a CampaignEdgeDiscovery row for this campaign,
    // filtered to movement relation types only.
    const discoveries = await prisma.campaignEdgeDiscovery.findMany({
      where: { campaignId },
      select: {
        edge: {
          select: {
            fromLocationId: true, toLocationId: true,
            distance: true, difficulty: true, terrainType: true, direction: true,
            relationType: true, bidirectional: true, weight: true,
          },
        },
      },
    });
    roadEdges = discoveries.map((d) => d.edge).filter((e) => e && MOVEMENT_TYPES.includes(e.relationType));
  }

  // Merge LocationEdge movement edges into the adjacency map.
  const locationEdges = await prisma.locationEdge.findMany({
    where: {
      isActive: true,
      category: 'movement',
      ...(campaignId ? { OR: [{ campaignId: null }, { campaignId }] } : {}),
    },
    select: {
      fromLocationId: true, toLocationId: true,
      weight: true, bidirectional: true, edgeType: true,
    },
  });

  const adj = buildAdjacency(roadEdges);
  mergeLocationEdgesIntoAdjacency(adj, locationEdges);
  return adj;
}

function mergeLocationEdgesIntoAdjacency(adj, locationEdges) {
  for (const e of locationEdges) {
    const entry = {
      toId: e.toLocationId,
      distance: e.weight || 1.0,
      difficulty: 'safe',
      terrainType: e.edgeType === 'road_to' ? 'road' : 'path',
      direction: null,
    };
    const list = adj.get(e.fromLocationId) || [];
    list.push(entry);
    adj.set(e.fromLocationId, list);

    if (e.bidirectional) {
      const revEntry = { ...entry, toId: e.fromLocationId };
      const revList = adj.get(e.toLocationId) || [];
      revList.push(revEntry);
      adj.set(e.toLocationId, revList);
    }
  }
}

function buildAdjacency(edges) {
  const adj = new Map();
  for (const e of edges) {
    const cost = e.weight ?? e.distance;
    const entry = {
      toId: e.toLocationId,
      distance: e.distance,
      difficulty: e.difficulty,
      terrainType: e.terrainType,
      direction: e.direction,
      relationType: e.relationType ?? 'road',
      cost,
    };
    // Forward direction: from → to
    const fList = adj.get(e.fromLocationId) || [];
    fList.push(entry);
    adj.set(e.fromLocationId, fList);

    // Reverse direction: to → from (only for bidirectional edges)
    if (e.bidirectional !== false) {
      const rList = adj.get(e.toLocationId) || [];
      rList.push({
        ...entry,
        toId: e.fromLocationId,
        direction: e.direction ? reverseDirection(e.direction) : null,
      });
      adj.set(e.toLocationId, rList);
    }
  }
  return adj;
}

/** Reverse a cardinal direction string (e.g. 'north' → 'south'). */
function reverseDirection(dir) {
  const map = { north: 'south', south: 'north', east: 'west', west: 'east',
    northeast: 'southwest', southwest: 'northeast', northwest: 'southeast', southeast: 'northwest',
    up: 'down', down: 'up' };
  return map[dir?.toLowerCase()] ?? dir;
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
      const alt = curDist + (n.cost ?? n.distance);
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
  const rows = await prisma.location.findMany({
    where: { id: { in: pathIds } },
    select: {
      id: true, canonicalName: true, locationType: true,
      regionX: true, regionY: true, region: true,
    },
  });
  const byId = new Map(rows.map((r) => [r.id, r]));
  return pathIds.map((id) => byId.get(id)).filter(Boolean);
}
