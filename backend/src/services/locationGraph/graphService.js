import { prisma } from '../../lib/prisma.js';
import { childLogger } from '../../lib/logger.js';

const log = childLogger({ module: 'graphService' });

/**
 * Load outgoing edges from a location. Includes both
 * canonical (campaignId IS NULL) and campaign-scoped edges.
 */
export async function getOutgoingEdges(locationId, { campaignId = null } = {}) {
  const where = {
    fromLocationId: locationId,
    isActive: true,
  };
  if (campaignId) {
    where.OR = [{ campaignId: null }, { campaignId }];
  }
  return prisma.locationEdge.findMany({ where });
}

/**
 * Load the N-hop subgraph from a starting location.
 * Returns { nodes: Map<"world:<id>", row>, edges: LocationEdge[] }.
 */
export async function loadSubgraph(locationId, { campaignId = null, hops = 2 } = {}) {
  const visited = new Set();
  const frontier = [locationId];
  const allEdges = [];

  for (let depth = 0; depth < hops && frontier.length > 0; depth++) {
    const nextFrontier = [];
    const edgeBatches = await Promise.all(
      frontier.map((id) => {
        visited.add(id);
        const where = {
          isActive: true,
          OR: [
            { fromLocationId: id },
            { toLocationId: id, bidirectional: true },
          ],
        };
        if (campaignId) {
          where.AND = [{ OR: [{ campaignId: null }, { campaignId }] }];
        }
        return prisma.locationEdge.findMany({ where });
      }),
    );
    for (const batch of edgeBatches) {
      for (const edge of batch) {
        allEdges.push(edge);
        if (!visited.has(edge.fromLocationId)) nextFrontier.push(edge.fromLocationId);
        if (!visited.has(edge.toLocationId)) nextFrontier.push(edge.toLocationId);
      }
    }
    frontier.length = 0;
    frontier.push(...[...new Set(nextFrontier)]);
  }

  const nodeIds = new Set();
  for (const e of allEdges) {
    nodeIds.add(e.fromLocationId);
    nodeIds.add(e.toLocationId);
  }
  nodeIds.add(locationId);

  const nodes = await resolveNodeIds([...nodeIds]);
  const deduped = deduplicateEdges(allEdges);
  return { nodes, edges: deduped };
}

/**
 * Resolve a list of location UUIDs into location rows.
 * Returns a Map<"world:<id>", row> for backward compat with consumers.
 */
async function resolveNodeIds(ids) {
  if (ids.length === 0) return new Map();
  const rows = await prisma.location.findMany({
    where: { id: { in: ids } },
  });
  const map = new Map();
  for (const r of rows) map.set(`world:${r.id}`, { ...r, _kind: 'world' });
  return map;
}

function deduplicateEdges(edges) {
  const seen = new Set();
  return edges.filter((e) => {
    if (seen.has(e.id)) return false;
    seen.add(e.id);
    return true;
  });
}

/**
 * Create a new edge.
 */
export async function createEdge(data) {
  return prisma.locationEdge.create({ data });
}

/**
 * Create many edges in a single transaction.
 */
export async function createEdges(rows) {
  if (rows.length === 0) return;
  return prisma.locationEdge.createMany({ data: rows, skipDuplicates: true });
}

/**
 * Soft-deactivate an edge.
 */
export async function deactivateEdge(edgeId) {
  return prisma.locationEdge.update({
    where: { id: edgeId },
    data: { isActive: false },
  });
}

/**
 * Update edge metadata / fields.
 */
export async function updateEdge(edgeId, data) {
  return prisma.locationEdge.update({ where: { id: edgeId }, data });
}

/**
 * Look up the traversalCount from the movement edge between two locations.
 * Returns `{ traversalCount, lastTraversedSceneIndex }` or null.
 */
export async function lookupEdgeFamiliarity(fromLocationId, toLocationId, { campaignId = null } = {}) {
  if (!fromLocationId || !toLocationId) return null;
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
    orderBy: { updatedAt: 'desc' },
    select: { campaignId: true, metadata: true },
  });
  const edge = campaignId
    ? edges.find((candidate) => candidate.campaignId === campaignId) || edges[0]
    : edges[0];
  if (!edge?.metadata) return null;
  const m = typeof edge.metadata === 'object' ? edge.metadata : {};
  return {
    traversalCount: typeof m.traversalCount === 'number' ? m.traversalCount : 0,
    lastTraversedSceneIndex: typeof m.lastTraversedSceneIndex === 'number' ? m.lastTraversedSceneIndex : null,
  };
}

// ── Node metadata helpers ───────────────────────────────────────────────

/**
 * Resolve node by ID. Returns row + _kind:'world' discriminator or null.
 * Signature kept for backward compat (kind param ignored).
 */
export async function getNodeByRef(kind, id) {
  const row = await prisma.location.findUnique({ where: { id } });
  return row ? { ...row, _kind: 'world' } : null;
}

/**
 * Bump visitCount on a location.
 */
export async function bumpVisitCount(kind, id) {
  return prisma.location.update({
    where: { id },
    data: { visitCount: { increment: 1 } },
  });
}

/**
 * Append a modification log entry on a location.
 * @param {string} kind — ignored (kept for backward compat)
 * @param {string} id location UUID
 * @param {object} entry { timestamp, sceneId?, type, summary }
 */
export async function appendModificationLog(kind, id, entry) {
  const node = await prisma.location.findUnique({ where: { id } });
  if (!node) return null;
  const entries = Array.isArray(node.modificationsLog) ? [...node.modificationsLog] : [];
  entries.push({
    timestamp: entry.timestamp || new Date().toISOString(),
    sceneId: entry.sceneId,
    type: entry.type,
    summary: entry.summary,
  });
  while (entries.length > 50) entries.shift();
  return prisma.location.update({ where: { id }, data: { modificationsLog: entries } });
}

/**
 * Add NPC ID to npcsEncountered on a location (dedup).
 */
export async function recordNpcEncounter(kind, id, npcId) {
  const node = await prisma.location.findUnique({ where: { id } });
  if (!node) return null;
  const list = Array.isArray(node.npcsEncountered) ? node.npcsEncountered : [];
  if (list.includes(npcId)) return node;
  const next = [...list, npcId];
  return prisma.location.update({ where: { id }, data: { npcsEncountered: next } });
}

/**
 * Mark location as liberated (sets liberatedAt timestamp).
 */
export async function markLiberated(kind, id, when = new Date()) {
  return prisma.location.update({ where: { id }, data: { liberatedAt: when } });
}

/**
 * Set/clear dungeonState on a location.
 */
export async function setDungeonState(kind, id, state) {
  return prisma.location.update({ where: { id }, data: { dungeonState: state } });
}

/**
 * Find NPCs at a specific location.
 */
export async function getNpcsAtLocation(locationId, campaignId) {
  return prisma.npc.findMany({
    where: {
      campaignId,
      currentLocationId: locationId,
    },
    select: {
      id: true,
      name: true,
      role: true,
      category: true,
      currentLocationId: true,
    },
  });
}

/**
 * Full LocationEdge subgraph for admin world view — all active edges, no campaign scope.
 */
export async function loadWorldGraph() {
  const edges = await prisma.locationEdge.findMany({
    where: { isActive: true },
  });
  const nodeIds = new Set();
  for (const e of edges) {
    nodeIds.add(e.fromLocationId);
    nodeIds.add(e.toLocationId);
  }
  const nodes = await resolveNodeIds([...nodeIds]);
  return { nodes, edges };
}

/**
 * Load full graph view for a campaign (used by the API endpoint).
 */
export async function loadCampaignGraph(campaignId, { focusId, hops = 2 } = {}) {
  if (focusId) {
    return loadSubgraph(focusId, { campaignId, hops });
  }
  const edges = await prisma.locationEdge.findMany({
    where: {
      isActive: true,
      OR: [{ campaignId: null }, { campaignId }],
    },
  });
  const nodeIds = new Set();
  for (const e of edges) {
    nodeIds.add(e.fromLocationId);
    nodeIds.add(e.toLocationId);
  }
  const nodes = await resolveNodeIds([...nodeIds]);
  return { nodes, edges };
}
