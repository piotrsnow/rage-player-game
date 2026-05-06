import { prisma } from '../../lib/prisma.js';
import { LOCATION_KIND_WORLD, LOCATION_KIND_CAMPAIGN } from '../locationRefs.js';
import { childLogger } from '../../lib/logger.js';

const log = childLogger({ module: 'graphService' });

/**
 * Load outgoing edges from a location (by kind + id). Includes both
 * canonical (campaignId IS NULL) and campaign-scoped edges.
 */
export async function getOutgoingEdges(locationKind, locationId, { campaignId = null } = {}) {
  const where = {
    fromKind: locationKind,
    fromId: locationId,
    isActive: true,
  };
  if (campaignId) {
    where.OR = [{ campaignId: null }, { campaignId }];
  }
  return prisma.locationEdge.findMany({ where });
}

/**
 * Load the N-hop subgraph from a starting location.
 * Returns { nodes: Map<kindId, row>, edges: LocationEdge[] }.
 */
export async function loadSubgraph(locationKind, locationId, { campaignId = null, hops = 2 } = {}) {
  const visited = new Set();
  const frontier = [`${locationKind}:${locationId}`];
  const allEdges = [];

  for (let depth = 0; depth < hops && frontier.length > 0; depth++) {
    const nextFrontier = [];
    const edgeBatches = await Promise.all(
      frontier.map((key) => {
        visited.add(key);
        const [kind, id] = key.split(':');
        const where = {
          isActive: true,
          OR: [
            { fromKind: kind, fromId: id },
            { toKind: kind, toId: id, bidirectional: true },
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
        const fromKey = `${edge.fromKind}:${edge.fromId}`;
        const toKey = `${edge.toKind}:${edge.toId}`;
        if (!visited.has(fromKey)) nextFrontier.push(fromKey);
        if (!visited.has(toKey)) nextFrontier.push(toKey);
      }
    }
    frontier.length = 0;
    frontier.push(...[...new Set(nextFrontier)]);
  }

  const nodeKeys = new Set();
  for (const e of allEdges) {
    nodeKeys.add(`${e.fromKind}:${e.fromId}`);
    nodeKeys.add(`${e.toKind}:${e.toId}`);
  }
  nodeKeys.add(`${locationKind}:${locationId}`);

  const nodes = await resolveNodeKeys([...nodeKeys]);
  const deduped = deduplicateEdges(allEdges);
  return { nodes, edges: deduped };
}

/**
 * Resolve a list of `kind:id` strings into location rows.
 * Returns a Map<kindColonId, row>.
 */
async function resolveNodeKeys(keys) {
  const worldIds = [];
  const campaignIds = [];
  for (const k of keys) {
    const [kind, id] = k.split(':');
    if (kind === LOCATION_KIND_WORLD) worldIds.push(id);
    else if (kind === LOCATION_KIND_CAMPAIGN) campaignIds.push(id);
  }
  const [worldRows, campaignRows] = await Promise.all([
    worldIds.length > 0
      ? prisma.worldLocation.findMany({ where: { id: { in: worldIds } } })
      : [],
    campaignIds.length > 0
      ? prisma.campaignLocation.findMany({ where: { id: { in: campaignIds } } })
      : [],
  ]);
  const map = new Map();
  for (const r of worldRows) map.set(`world:${r.id}`, { ...r, _kind: 'world' });
  for (const r of campaignRows) map.set(`campaign:${r.id}`, { ...r, _kind: 'campaign' });
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
export async function lookupEdgeFamiliarity(fromKind, fromId, toKind, toId, { campaignId = null } = {}) {
  if (!fromKind || !fromId || !toKind || !toId) return null;
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

/**
 * Find NPCs at a specific location (CampaignNPC).
 */
export async function getNpcsAtLocation(locationKind, locationId, campaignId) {
  return prisma.campaignNPC.findMany({
    where: {
      campaignId,
      lastLocationKind: locationKind,
      lastLocationId: locationId,
    },
    select: {
      id: true,
      name: true,
      role: true,
      category: true,
      lastLocationKind: true,
      lastLocationId: true,
    },
  });
}

/**
 * Load full graph view for a campaign (used by the API endpoint).
 */
export async function loadCampaignGraph(campaignId, { focusKind, focusId, hops = 2 } = {}) {
  if (focusKind && focusId) {
    return loadSubgraph(focusKind, focusId, { campaignId, hops });
  }
  const edges = await prisma.locationEdge.findMany({
    where: {
      isActive: true,
      OR: [{ campaignId: null }, { campaignId }],
    },
  });
  const nodeKeys = new Set();
  for (const e of edges) {
    nodeKeys.add(`${e.fromKind}:${e.fromId}`);
    nodeKeys.add(`${e.toKind}:${e.toId}`);
  }
  const nodes = await resolveNodeKeys([...nodeKeys]);
  return { nodes, edges };
}
