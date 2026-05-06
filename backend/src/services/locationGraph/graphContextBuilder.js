import { loadSubgraph, getNpcsAtLocation } from './graphService.js';
import { EDGE_TYPES, EDGE_TYPE_NAMES, EDGE_CATEGORY_NAMES } from '../../../../shared/domain/locationGraph.js';
import { childLogger } from '../../lib/logger.js';

const log = childLogger({ module: 'graphContextBuilder' });

/**
 * Build a lean ~400 token context block for the premium narrative model.
 * Gives the LLM spatial awareness (exits, NPCs, perception hints) without
 * the burden of graph update rules or taxonomy.
 */
export async function buildNarrativeContext(locationId, locationKind, campaignId) {
  try {
    const { nodes, edges } = await loadSubgraph(locationKind, locationId, { campaignId, hops: 1 });
    const currentNode = nodes.get(`${locationKind}:${locationId}`);
    if (!currentNode) return null;

    const lines = [];
    const name = currentNode.canonicalName || currentNode.displayName || currentNode.name || 'Unknown';
    lines.push(`Current: ${name}${currentNode.atmosphere ? ` — ${currentNode.atmosphere}` : ''}`);

    const myKey = `${locationKind}:${locationId}`;

    // Movement exits
    const movementEdges = edges.filter(
      (e) => e.category === 'movement' && (keyOf(e, 'from') === myKey || (e.bidirectional && keyOf(e, 'to') === myKey)),
    );
    if (movementEdges.length > 0) {
      lines.push('Exits:');
      for (const e of movementEdges.slice(0, 8)) {
        const targetKey = keyOf(e, 'from') === myKey ? keyOf(e, 'to') : keyOf(e, 'from');
        const target = nodes.get(targetKey);
        const targetName = target?.canonicalName || target?.displayName || target?.name || targetKey;
        const blocked = e.edgeType === 'blocked_path_to' ? ' [BLOCKED]' : '';
        const secret = e.edgeType === 'secret_path_to' ? ' [SECRET]' : '';
        lines.push(`  - ${e.edgeType} → ${targetName}${blocked}${secret}`);
      }
    }

    // Perception hints
    const perceptionEdges = edges.filter(
      (e) => e.category === 'perception' && keyOf(e, 'from') === myKey,
    );
    if (perceptionEdges.length > 0) {
      lines.push('Perception:');
      for (const e of perceptionEdges.slice(0, 4)) {
        const targetKey = keyOf(e, 'to');
        const target = nodes.get(targetKey);
        const targetName = target?.canonicalName || target?.displayName || target?.name || targetKey;
        const detail = e.metadata?.loudness || e.metadata?.clarity || '';
        lines.push(`  - ${e.edgeType}: ${targetName}${detail ? ` (${detail})` : ''}`);
      }
    }

    // NPCs at current location
    const npcs = await getNpcsAtLocation(locationKind, locationId, campaignId);
    if (npcs.length > 0) {
      const npcList = npcs.slice(0, 6).map((n) => n.name).join(', ');
      lines.push(`NPCs here: ${npcList}`);
    }

    return lines.join('\n');
  } catch (err) {
    log.warn({ err: err?.message, locationId, locationKind }, 'buildNarrativeContext failed');
    return null;
  }
}

/**
 * Build a broad ~2-4k token context block for the graph extraction model.
 * Includes the full subgraph (3-4 hops), edge taxonomy reference, and
 * NPC positions so the extractor can identify spatial changes.
 */
export async function buildExtractionContext(locationId, locationKind, campaignId) {
  try {
    const { nodes, edges } = await loadSubgraph(locationKind, locationId, { campaignId, hops: 3 });

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
      const fromName = fromNode?.canonicalName || fromNode?.displayName || fromNode?.name || e.fromId;
      const toName = toNode?.canonicalName || toNode?.displayName || toNode?.name || e.toId;
      const dir = e.bidirectional ? '↔' : '→';
      lines.push(`- ${fromName} ${dir} ${toName} [${e.edgeType}] (${e.category})`);
    }
    lines.push('');

    // Taxonomy reference (abbreviated — movement + perception + structural)
    lines.push('### Edge Type Reference');
    lines.push('Movement: path_to, road_to, door_to, stairs_to, tunnel_to, bridge_to, portal_to, secret_path_to, one_way_to, dangerous_path_to, blocked_path_to, climb_to, swim_to, ferry_to');
    lines.push('Perception: visible_from, audible_from, smell_from');
    lines.push('Structural: contains, part_of, above, below');
    lines.push('Spatial: adjacent_to, near, across_from');
    lines.push('Social: controlled_by, patrolled_by, inhabited_by');
    lines.push('Narrative: quest_related_to, home_of, workplace_of, rumor_about');
    lines.push('Temporal: open_during, accessible_during');

    return lines.join('\n');
  } catch (err) {
    log.warn({ err: err?.message, locationId, locationKind }, 'buildExtractionContext failed');
    return '';
  }
}

function keyOf(edge, side) {
  return side === 'from' ? `${edge.fromKind}:${edge.fromId}` : `${edge.toKind}:${edge.toId}`;
}
