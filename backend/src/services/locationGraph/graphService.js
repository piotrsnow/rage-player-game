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

// ── Faza 0 — node metadata helpers ────────────────────────────────────
//
// Operacje typu "incrementuj visitCount" / "dopisz wpis do modificationsLog"
// realizujemy w osobnych helperach by callsite (FE state changes, AI pipeline,
// dungeonEntry) nie pisał ręcznie struktur Prisma.

/**
 * Resolve node by composite ref. Returns row + _kind discriminator or null.
 */
export async function getNodeByRef(kind, id) {
  if (kind === LOCATION_KIND_WORLD) {
    const row = await prisma.worldLocation.findUnique({ where: { id } });
    return row ? { ...row, _kind: 'world' } : null;
  }
  if (kind === LOCATION_KIND_CAMPAIGN) {
    const row = await prisma.campaignLocation.findUnique({ where: { id } });
    return row ? { ...row, _kind: 'campaign' } : null;
  }
  return null;
}

/**
 * Bump visitCount on a node (idempotent if scene already counted).
 * Use from scene apply when world.currentLocationRef changes.
 */
export async function bumpVisitCount(kind, id) {
  if (kind === LOCATION_KIND_WORLD) {
    return prisma.worldLocation.update({
      where: { id },
      data: { visitCount: { increment: 1 } },
    });
  }
  if (kind === LOCATION_KIND_CAMPAIGN) {
    return prisma.campaignLocation.update({
      where: { id },
      data: { visitCount: { increment: 1 } },
    });
  }
  throw new Error(`bumpVisitCount: unknown kind ${kind}`);
}

/**
 * Append a modification log entry on a node.
 * @param {string} kind 'world' | 'campaign'
 * @param {string} id node UUID
 * @param {object} entry { timestamp, sceneId?, type, summary }
 */
export async function appendModificationLog(kind, id, entry) {
  const node = await getNodeByRef(kind, id);
  if (!node) return null;
  const entries = Array.isArray(node.modificationsLog) ? [...node.modificationsLog] : [];
  entries.push({
    timestamp: entry.timestamp || new Date().toISOString(),
    sceneId: entry.sceneId,
    type: entry.type,
    summary: entry.summary,
  });
  // Cap at 50 entries per node (FIFO).
  while (entries.length > 50) entries.shift();
  if (kind === LOCATION_KIND_WORLD) {
    return prisma.worldLocation.update({ where: { id }, data: { modificationsLog: entries } });
  }
  return prisma.campaignLocation.update({ where: { id }, data: { modificationsLog: entries } });
}

/**
 * Add NPC ID to npcsEncountered on a node (dedup).
 */
export async function recordNpcEncounter(kind, id, npcId) {
  const node = await getNodeByRef(kind, id);
  if (!node) return null;
  const list = Array.isArray(node.npcsEncountered) ? node.npcsEncountered : [];
  if (list.includes(npcId)) return node;
  const next = [...list, npcId];
  if (kind === LOCATION_KIND_WORLD) {
    return prisma.worldLocation.update({ where: { id }, data: { npcsEncountered: next } });
  }
  return prisma.campaignLocation.update({ where: { id }, data: { npcsEncountered: next } });
}

/**
 * Mark node as liberated (sets liberatedAt timestamp). Triggered by
 * `locationLiberated: true` from AI scene apply.
 */
export async function markLiberated(kind, id, when = new Date()) {
  if (kind === LOCATION_KIND_WORLD) {
    return prisma.worldLocation.update({ where: { id }, data: { liberatedAt: when } });
  }
  if (kind === LOCATION_KIND_CAMPAIGN) {
    return prisma.campaignLocation.update({ where: { id }, data: { liberatedAt: when } });
  }
  throw new Error(`markLiberated: unknown kind ${kind}`);
}

/**
 * Set/clear dungeonState (entryCleared/trapSprung/lootTaken flags) on a node.
 */
export async function setDungeonState(kind, id, state) {
  if (kind === LOCATION_KIND_WORLD) {
    return prisma.worldLocation.update({ where: { id }, data: { dungeonState: state } });
  }
  if (kind === LOCATION_KIND_CAMPAIGN) {
    return prisma.campaignLocation.update({ where: { id }, data: { dungeonState: state } });
  }
  throw new Error(`setDungeonState: unknown kind ${kind}`);
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
