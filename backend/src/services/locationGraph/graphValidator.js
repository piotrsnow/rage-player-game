import { prisma } from '../../lib/prisma.js';
import {
  EDGE_TYPES,
  EDGE_CATEGORY_NAMES,
  isValidDiscoveryPromotion,
  safeValidateTacticalGrid,
} from '../../../../shared/domain/locationGraph.js';
import { LOCATION_KIND_WORLD, LOCATION_KIND_CAMPAIGN } from '../locationRefs.js';
import { createEdge, updateEdge } from './graphService.js';
import { childLogger } from '../../lib/logger.js';

const log = childLogger({ module: 'graphValidator' });

/**
 * Validate a GraphUpdate against the current graph state.
 * Returns { valid: boolean, warnings: string[] }.
 */
export function validateGraphUpdate(update) {
  const warnings = [];
  if (!update) return { valid: false, warnings: ['null update'] };

  for (const node of update.newNodes || []) {
    if (!node.name || node.name.length < 2) {
      warnings.push(`Node "${node.name}" has an invalid name`);
    }
    // Faza 0 — walidacja opcjonalnych metadane na nodzie.
    if (node.tacticalGrid !== undefined && node.tacticalGrid !== null) {
      const r = safeValidateTacticalGrid(node.tacticalGrid);
      if (!r.success) {
        warnings.push(`Node "${node.name}" tacticalGrid invalid: ${r.error?.errors?.[0]?.message || 'unknown'}`);
      }
    }
    if (node.biome !== undefined && node.biome !== null && typeof node.biome !== 'string') {
      warnings.push(`Node "${node.name}" biome must be a string`);
    }
    if (node.anchorType !== undefined && node.anchorType !== null && typeof node.anchorType !== 'string') {
      warnings.push(`Node "${node.name}" anchorType must be a string`);
    }
  }

  for (const edge of update.newEdges || []) {
    if (!EDGE_TYPES[edge.edgeType]) {
      warnings.push(`Unknown edge type: ${edge.edgeType}`);
    }
    if (!EDGE_CATEGORY_NAMES.includes(edge.category)) {
      warnings.push(`Unknown category: ${edge.category}`);
    }
  }

  for (const change of update.discoveryChanges || []) {
    if (!change.locationName || !change.newState) {
      warnings.push(`Invalid discovery change: missing name or state`);
    }
  }

  return { valid: warnings.length === 0, warnings };
}

/**
 * Apply a validated GraphUpdate to the database.
 * Resolves names to IDs, creates nodes/edges, updates discovery states.
 */
export async function applyGraphUpdate(update, { campaignId }) {
  if (!update) return;
  const applied = { nodes: 0, edges: 0, discoveries: 0, npcMoves: 0 };

  // Resolve location names → (kind, id) for the campaign
  const nameIndex = await buildNameIndex(campaignId);

  // 1. Create new nodes (as CampaignLocation)
  for (const node of update.newNodes || []) {
    if (nameIndex.has(normalize(node.name))) continue;
    try {
      const parentRef = node.parentName ? nameIndex.get(normalize(node.parentName)) : null;
      const slug = normalize(node.name);
      // Faza 0 — propagujemy nowe metadane (biome, anchorType, tacticalGrid)
      // gdy AI je podpowiedziało.
      const data = {
        campaignId,
        name: node.name,
        canonicalSlug: slug,
        description: node.description || '',
        locationType: mapNodeType(node.type),
        tags: node.tags || [],
        scale: node.scale ?? 5,
        parentLocationKind: parentRef?.kind || null,
        parentLocationId: parentRef?.id || null,
      };
      if (node.biome) data.biome = node.biome;
      if (node.anchorType) data.anchorType = node.anchorType;
      if (node.tacticalGrid) {
        const r = safeValidateTacticalGrid(node.tacticalGrid);
        if (r.success) data.tacticalGrid = node.tacticalGrid;
      }
      const row = await prisma.campaignLocation.create({ data });
      nameIndex.set(slug, { kind: LOCATION_KIND_CAMPAIGN, id: row.id });
      applied.nodes++;
    } catch (err) {
      log.warn({ err: err?.message, node: node.name }, 'Failed to create graph node');
    }
  }

  // 2. Create new edges
  for (const edge of update.newEdges || []) {
    const from = nameIndex.get(normalize(edge.fromName));
    const to = nameIndex.get(normalize(edge.toName));
    if (!from || !to) {
      log.debug({ from: edge.fromName, to: edge.toName }, 'Edge endpoint not resolved — skipping');
      continue;
    }
    if (!EDGE_TYPES[edge.edgeType]) continue;
    try {
      await createEdge({
        fromKind: from.kind,
        fromId: from.id,
        toKind: to.kind,
        toId: to.id,
        edgeType: edge.edgeType,
        category: edge.category || EDGE_TYPES[edge.edgeType]?.category || 'movement',
        bidirectional: edge.bidirectional ?? true,
        metadata: edge.metadata || {},
        campaignId,
        createdBy: 'ai',
      });
      applied.edges++;
    } catch (err) {
      log.warn({ err: err?.message, edge: `${edge.fromName}→${edge.toName}` }, 'Failed to create edge');
    }
  }

  // 3. Update existing edges
  for (const entry of update.updatedEdges || []) {
    const from = nameIndex.get(normalize(entry.fromName));
    const to = nameIndex.get(normalize(entry.toName));
    if (!from || !to) continue;
    try {
      const existing = await prisma.locationEdge.findFirst({
        where: {
          fromKind: from.kind, fromId: from.id,
          toKind: to.kind, toId: to.id,
          edgeType: entry.edgeType,
          isActive: true,
        },
      });
      if (existing && entry.changes) {
        const data = {};
        if (entry.changes.metadata) data.metadata = { ...existing.metadata, ...entry.changes.metadata };
        if (entry.changes.isActive !== undefined) data.isActive = entry.changes.isActive;
        if (Object.keys(data).length > 0) {
          await updateEdge(existing.id, data);
        }
      }
    } catch (err) {
      log.warn({ err: err?.message }, 'Failed to update edge');
    }
  }

  // 4. NPC moves — update CampaignNPC.lastLocation*
  for (const move of update.npcMoves || []) {
    const target = nameIndex.get(normalize(move.toLocationName));
    if (!target) continue;
    try {
      await prisma.campaignNPC.updateMany({
        where: { campaignId, name: move.npcName },
        data: { lastLocationKind: target.kind, lastLocationId: target.id },
      });
      applied.npcMoves++;
    } catch (err) {
      log.warn({ err: err?.message, npc: move.npcName }, 'Failed to move NPC');
    }
  }

  log.info({ campaignId, ...applied }, 'Graph update applied');
  return applied;
}

/**
 * Build a name → {kind, id} index for all locations visible to a campaign.
 */
async function buildNameIndex(campaignId) {
  const [worldLocs, campaignLocs] = await Promise.all([
    prisma.worldLocation.findMany({ select: { id: true, canonicalName: true, displayName: true } }),
    prisma.campaignLocation.findMany({ where: { campaignId }, select: { id: true, name: true, canonicalSlug: true } }),
  ]);
  const index = new Map();
  for (const r of worldLocs) {
    const key = normalize(r.canonicalName);
    index.set(key, { kind: LOCATION_KIND_WORLD, id: r.id });
    if (r.displayName) index.set(normalize(r.displayName), { kind: LOCATION_KIND_WORLD, id: r.id });
  }
  for (const r of campaignLocs) {
    index.set(normalize(r.name), { kind: LOCATION_KIND_CAMPAIGN, id: r.id });
    if (r.canonicalSlug) index.set(r.canonicalSlug, { kind: LOCATION_KIND_CAMPAIGN, id: r.id });
  }
  return index;
}

function normalize(name) {
  return (name || '').toLowerCase().trim().replace(/\s+/g, '_');
}

const VALID_LOCATION_TYPES = new Set([
  'generic', 'hamlet', 'village', 'town', 'city', 'capital', 'dungeon',
  'forest', 'wilderness', 'mountain', 'ruin', 'camp', 'cave', 'interior',
  'dungeon_room', 'campaignPlace',
]);

function mapNodeType(type) {
  if (!type) return 'generic';
  const lower = type.toLowerCase();
  if (VALID_LOCATION_TYPES.has(lower)) return lower;
  if (lower === 'room' || lower === 'point') return 'interior';
  if (lower === 'site') return 'generic';
  if (lower === 'settlement') return 'village';
  if (lower === 'district') return 'generic';
  if (lower === 'area' || lower === 'region') return 'wilderness';
  return 'generic';
}

// ── Campaign graph consistency report ────────────────────────────────
//
// Returns { errors: [], warnings: [], info: [] } with structured entries.

/**
 * Run a full consistency check for a campaign's location graph.
 * Returns { errors: [{msg, type, data}], warnings: [...], info: [...] }.
 */
export async function runGraphConsistencyCheck(campaignId) {
  const report = { errors: [], warnings: [], info: [] };

  const [edges, npcs, worldLocs, campaignLocs] = await Promise.all([
    prisma.locationEdge.findMany({
      where: { isActive: true, OR: [{ campaignId: null }, { campaignId }] },
      select: { id: true, fromKind: true, fromId: true, toKind: true, toId: true, edgeType: true, category: true, bidirectional: true },
    }),
    prisma.campaignNPC.findMany({
      where: { campaignId },
      select: { id: true, name: true, lastLocationKind: true, lastLocationId: true },
    }),
    prisma.worldLocation.findMany({ select: { id: true } }),
    prisma.campaignLocation.findMany({ where: { campaignId }, select: { id: true } }),
  ]);

  const validNodes = new Set();
  for (const r of worldLocs) validNodes.add(`${LOCATION_KIND_WORLD}:${r.id}`);
  for (const r of campaignLocs) validNodes.add(`${LOCATION_KIND_CAMPAIGN}:${r.id}`);

  // Check: NPCs at non-existent/deactivated locations
  for (const npc of npcs) {
    if (!npc.lastLocationKind || !npc.lastLocationId) continue;
    const key = `${npc.lastLocationKind}:${npc.lastLocationId}`;
    if (!validNodes.has(key)) {
      report.errors.push({
        type: 'npc_orphan_location',
        msg: `NPC "${npc.name}" points to non-existent location ${key}`,
        data: { npcId: npc.id, npcName: npc.name, locationKey: key },
      });
    }
  }

  // Check: orphan nodes (no edges at all)
  const connectedNodes = new Set();
  for (const e of edges) {
    connectedNodes.add(`${e.fromKind}:${e.fromId}`);
    connectedNodes.add(`${e.toKind}:${e.toId}`);
  }
  for (const key of validNodes) {
    if (!connectedNodes.has(key)) {
      report.info.push({
        type: 'orphan_node',
        msg: `Location ${key} has no edges`,
        data: { locationKey: key },
      });
    }
  }

  // Check: one-directional movement edges that should likely be bidirectional
  const movementEdgeKeys = new Map();
  for (const e of edges) {
    if (e.category !== 'movement') continue;
    const fwd = `${e.fromKind}:${e.fromId}→${e.toKind}:${e.toId}`;
    const rev = `${e.toKind}:${e.toId}→${e.fromKind}:${e.fromId}`;
    movementEdgeKeys.set(fwd, e);
    if (!e.bidirectional) {
      const reverseExists = edges.some(
        (o) => o.category === 'movement' && o.fromKind === e.toKind && o.fromId === e.toId
          && o.toKind === e.fromKind && o.toId === e.fromId,
      );
      const shouldBeBidi = ['path_to', 'road_to', 'door_to', 'stairs_to', 'tunnel_to', 'bridge_to', 'ferry_to', 'dangerous_path_to'];
      if (!reverseExists && shouldBeBidi.includes(e.edgeType)) {
        report.warnings.push({
          type: 'unidirectional_movement',
          msg: `Movement edge ${e.edgeType} (${fwd}) is one-way but type suggests bidirectional`,
          data: { edgeId: e.id, edgeType: e.edgeType, from: `${e.fromKind}:${e.fromId}`, to: `${e.toKind}:${e.toId}` },
        });
      }
    }
  }

  // Check: containment hierarchy loops (A contains B contains A)
  const containsEdges = edges.filter((e) => e.edgeType === 'contains');
  const parentMap = new Map();
  for (const e of containsEdges) {
    const childKey = `${e.toKind}:${e.toId}`;
    parentMap.set(childKey, `${e.fromKind}:${e.fromId}`);
  }
  for (const [child, parent] of parentMap) {
    const visited = new Set([child]);
    let cur = parent;
    let loopDetected = false;
    while (cur) {
      if (visited.has(cur)) { loopDetected = true; break; }
      visited.add(cur);
      cur = parentMap.get(cur) || null;
    }
    if (loopDetected) {
      report.errors.push({
        type: 'containment_loop',
        msg: `Containment loop detected involving ${child}`,
        data: { startNode: child },
      });
    }
  }

  // Check: edges pointing to non-existent nodes
  for (const e of edges) {
    const fromKey = `${e.fromKind}:${e.fromId}`;
    const toKey = `${e.toKind}:${e.toId}`;
    if (!validNodes.has(fromKey)) {
      report.warnings.push({
        type: 'edge_dangling_from',
        msg: `Edge ${e.id} from-node ${fromKey} does not exist`,
        data: { edgeId: e.id, nodeKey: fromKey },
      });
    }
    if (!validNodes.has(toKey)) {
      report.warnings.push({
        type: 'edge_dangling_to',
        msg: `Edge ${e.id} to-node ${toKey} does not exist`,
        data: { edgeId: e.id, nodeKey: toKey },
      });
    }
  }

  return report;
}
