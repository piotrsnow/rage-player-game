import { loadSubgraph } from './graphService.js';
import { EDGE_TYPES, EDGE_TYPE_NAMES, EDGE_CATEGORY_NAMES } from '../../../../shared/domain/locationGraph.js';
import { prisma } from '../../lib/prisma.js';
import { listNpcsAtLocation } from '../livingWorld/campaignSandbox.js';
import { childLogger } from '../../lib/logger.js';

const log = childLogger({ module: 'graphContextBuilder' });

/**
 * Walk `parentLocationId` upward from a Location to build a readable
 * hierarchy chain (e.g. "Karczma Pod Złotym Dzbanem (tavern) → Kamionka Stara (village)").
 * Stops after 5 hops to prevent accidental cycles.
 */
async function buildParentChain(locationId) {
  const chain = [];
  let currentId = locationId;
  for (let i = 0; i < 5 && currentId; i++) {
    const loc = await prisma.location.findUnique({
      where: { id: currentId },
      select: { id: true, canonicalName: true, locationType: true, parentLocationId: true },
    });
    if (!loc) break;
    chain.push({ id: loc.id, name: loc.canonicalName, type: loc.locationType });
    currentId = loc.parentLocationId;
  }
  return chain;
}

/**
 * Load 1-hop Road neighbors of a top-level settlement. Returns an array
 * of `{ id, name, type, distance, direction }` for nearby canonical locations.
 */
async function loadRoadNeighbors(settlementId) {
  const roads = await prisma.road.findMany({
    where: {
      OR: [{ fromLocationId: settlementId }, { toLocationId: settlementId }],
      terrainType: { not: 'dungeon_corridor' },
    },
    select: {
      fromLocationId: true, toLocationId: true,
      distance: true, direction: true,
      from: { select: { id: true, canonicalName: true, locationType: true } },
      to: { select: { id: true, canonicalName: true, locationType: true } },
    },
    take: 8,
  });
  return roads.map((r) => {
    const isFrom = r.fromLocationId === settlementId;
    const neighbor = isFrom ? r.to : r.from;
    return {
      id: neighbor.id,
      name: neighbor.canonicalName,
      type: neighbor.locationType,
      distance: r.distance,
      direction: r.direction || null,
    };
  });
}

/**
 * Given a list of Location IDs, return the subset that the player has
 * discovered (state heard_about, visited, or mapped). Merges account-level
 * `UserDiscoveredLocation` with per-campaign `DiscoveredLocation` plus
 * `knownByDefault` locations (capital).
 */
async function loadDiscoveredNeighborIds(userId, campaignId, locationIds) {
  if (!locationIds.length) return new Set();
  const [userRows, campaignRows, defaultRows] = await Promise.all([
    prisma.userDiscoveredLocation.findMany({
      where: { userId, locationId: { in: locationIds } },
      select: { locationId: true },
    }),
    campaignId
      ? prisma.discoveredLocation.findMany({
          where: {
            campaignId,
            locationId: { in: locationIds },
          },
          select: { locationId: true },
        })
      : Promise.resolve([]),
    prisma.location.findMany({
      where: {
        id: { in: locationIds },
        OR: [{ locationType: 'capital' }, { knownByDefault: true }],
      },
      select: { id: true },
    }),
  ]);
  const ids = new Set();
  for (const r of userRows) ids.add(r.locationId);
  for (const r of campaignRows) ids.add(r.locationId);
  for (const r of defaultRows) ids.add(r.id);
  return ids;
}

/**
 * Build a lean ~400 token context block for the premium narrative model.
 * Gives the LLM spatial awareness (exits, NPCs, perception hints) without
 * the burden of graph update rules or taxonomy.
 *
 * @param {object} options
 * @param {boolean} options.gmMode  If true, show all edges regardless of discovery state.
 * @param {string|null} options.userId  When provided, road neighbors are filtered
 *   through fog-of-war — only locations the player has discovered (heard_about/visited)
 *   are shown by name. Undiscovered neighbors appear as generic directional hints.
 */
export async function buildNarrativeContext(locationId, campaignId, { gmMode = false, userId = null } = {}) {
  try {
    const { nodes, edges } = await loadSubgraph(locationId, { campaignId, hops: 1 });
    const currentNode = nodes.get(`world:${locationId}`);
    if (!currentNode) return null;

    const lines = [];
    const name = currentNode.canonicalName || currentNode.displayName || currentNode.name || 'Unknown';
    lines.push(`Current: ${name} [ref: world:${locationId}]${currentNode.atmosphere ? ` — ${currentNode.atmosphere}` : ''}`);

    // Parent chain + nearby settlements
    const chain = await buildParentChain(locationId);
    if (chain.length > 1) {
      lines.push(`Location hierarchy: ${chain.map((c) => `${c.name} [ref: world:${c.id}] (${c.type})`).join(' → ')}`);
    }
    const topLocation = chain[chain.length - 1];
    if (topLocation?.id) {
      const neighbors = await loadRoadNeighbors(topLocation.id);
      if (neighbors.length > 0) {
        const discoveredIds = (!gmMode && userId)
          ? await loadDiscoveredNeighborIds(userId, campaignId, neighbors.map((n) => n.id))
          : null;

        const parts = neighbors.map((n) => {
          if (discoveredIds && !discoveredIds.has(n.id)) {
            const dir = n.direction || '';
            return dir
              ? `nieznana droga prowadzi na ${dir}`
              : 'nieznana droga';
          }
          const dist = n.distance ? `~${n.distance} km` : '';
          const dir = n.direction || '';
          const suffix = [dist, dir].filter(Boolean).join(' ');
          return `${n.name} [ref: world:${n.id}] (${n.type}${suffix ? ', ' + suffix : ''})`;
        });
        lines.push(`Nearby: ${parts.join(', ')}`);
      }
    }

    const myKey = `world:${locationId}`;

    // Filter: only show edges the character knows about (at least 'known')
    const isVisible = (e) => gmMode || !e.discoveryState || e.discoveryState !== 'unknown';

    // Movement exits with access-control annotation
    const movementEdges = edges.filter(
      (e) => e.category === 'movement' && isVisible(e)
        && (keyOf(e, 'from') === myKey || (e.bidirectional && keyOf(e, 'to') === myKey)),
    );
    if (movementEdges.length > 0) {
      lines.push('Exits:');
      for (const e of movementEdges.slice(0, 8)) {
        const targetKey = keyOf(e, 'from') === myKey ? keyOf(e, 'to') : keyOf(e, 'from');
        const target = nodes.get(targetKey);
        const targetName = target?.canonicalName || target?.displayName || target?.name || targetKey;
        const annotations = [];
        if (e.edgeType === 'blocked_path_to') annotations.push('BLOCKED');
        if (e.edgeType === 'secret_path_to') annotations.push('SECRET');
        if (e.metadata?.locked) annotations.push(`zamknięte — wymaga: ${e.metadata.keyName || 'klucz'}`);
        if (e.metadata?.requiresSkillCheck) annotations.push(`wymaga: test ${e.metadata.requiresSkillCheck.skill}`);
        if (e.metadata?.requiresItem) annotations.push(`wymaga: ${e.metadata.requiresItem}`);
        if (e.metadata?.requiresPayment) annotations.push(`wymaga: opłata ${e.metadata.requiresPayment.cost}`);
        if (e.metadata?.requiresFactionStatus) annotations.push(`wymaga: status frakcji ${e.metadata.requiresFactionStatus.factionId}`);
        const tc = typeof e.metadata?.traversalCount === 'number' ? e.metadata.traversalCount : 0;
        if (tc >= 3) annotations.push(`familiar (${tc}x)`);
        else if (tc === 0) annotations.push('first time');
        const suffix = annotations.length > 0 ? ` [${annotations.join(', ')}]` : '';
        lines.push(`  - ${e.edgeType} → ${targetName} [ref: ${targetKey}]${suffix}`);
      }
    }

    // Perception subsection — natural Polish formatting
    const perceptionEdges = edges.filter(
      (e) => e.category === 'perception' && isVisible(e)
        && (keyOf(e, 'from') === myKey || keyOf(e, 'to') === myKey),
    );
    if (perceptionEdges.length > 0) {
      const hints = [];
      for (const e of perceptionEdges.slice(0, 6)) {
        const targetKey = keyOf(e, 'from') === myKey ? keyOf(e, 'to') : keyOf(e, 'from');
        const target = nodes.get(targetKey);
        const targetName = target?.canonicalName || target?.displayName || target?.name || targetKey;
        const verb = PERCEPTION_VERBS[e.edgeType] || e.edgeType;
        const detail = e.metadata?.detail || e.metadata?.loudness || e.metadata?.clarity || '';
        hints.push(`${verb} ${targetName}${detail ? ` (${detail})` : ''}`);
      }
      if (hints.length > 0) {
        lines.push(`Perception (z tego miejsca): ${hints.join('; ')}.`);
      }
    }

    // NPCs at current location (campaign-aware — includes auto-cloned canonical NPCs)
    const npcs = await listNpcsAtLocation(locationId, { campaignId, aliveOnly: true });
    if (npcs.length > 0) {
      const npcList = npcs.slice(0, 6).map((n) => n.name).join(', ');
      lines.push(`NPCs here: ${npcList}`);
    }

    return lines.join('\n');
  } catch (err) {
    log.warn({ err: err?.message, locationId }, 'buildNarrativeContext failed');
    return null;
  }
}

const PERCEPTION_VERBS = {
  visible_from: 'widać',
  audible_from: 'słychać',
  smell_from: 'czuć zapach',
};

/**
 * Build a broad ~2-4k token context block for the graph extraction model.
 * Includes the full subgraph (3-4 hops), edge taxonomy reference, and
 * NPC positions so the extractor can identify spatial changes.
 */
export async function buildExtractionContext(locationId, campaignId) {
  try {
    const { nodes, edges } = await loadSubgraph(locationId, { campaignId, hops: 3 });

    const lines = [];
    lines.push('## CURRENT LOCATION GRAPH');
    lines.push('');

    // Nodes
    lines.push('### Nodes');
    for (const [key, node] of nodes) {
      const name = node.canonicalName || node.displayName || node.name || key;
      const type = node.locationType || 'generic';
      const tags = Array.isArray(node.tags) && node.tags.length > 0 ? ` [${node.tags.join(', ')}]` : '';
      lines.push(`- ${name} (${type}, scale:${node.scale ?? 5})${tags}`);
    }
    lines.push('');

    // Edges
    lines.push('### Edges');
    for (const e of edges) {
      const fromNode = nodes.get(keyOf(e, 'from'));
      const toNode = nodes.get(keyOf(e, 'to'));
      const fromName = fromNode?.canonicalName || fromNode?.displayName || fromNode?.name || e.fromLocationId;
      const toName = toNode?.canonicalName || toNode?.displayName || toNode?.name || e.toLocationId;
      const dir = e.bidirectional ? '↔' : '→';
      lines.push(`- ${fromName} ${dir} ${toName} [${e.edgeType}] (${e.category})`);
    }
    lines.push('');

    // Taxonomy reference (abbreviated — movement + perception + structural)
    lines.push('### Edge Type Reference');
    lines.push('Movement: path_to, road_to, door_to, stairs_to, tunnel_to, bridge_to, portal_to, secret_path_to, one_way_to, dangerous_path_to, blocked_path_to, climb_to, swim_to, ferry_to');
    lines.push('Perception: visible_from, audible_from, smell_from');
    lines.push('Structural: contains, overlaps, above, below');
    lines.push('Spatial: adjacent_to, near, across_from');
    lines.push('Social: controlled_by, patrolled_by, inhabited_by');
    lines.push('Narrative: quest_related_to, home_of, workplace_of, rumor_about');
    lines.push('Temporal: open_during, accessible_during');

    return lines.join('\n');
  } catch (err) {
    log.warn({ err: err?.message, locationId }, 'buildExtractionContext failed');
    return '';
  }
}

function keyOf(edge, side) {
  return side === 'from' ? `world:${edge.fromLocationId}` : `world:${edge.toLocationId}`;
}
