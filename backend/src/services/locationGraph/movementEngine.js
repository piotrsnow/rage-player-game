import { prisma } from '../../lib/prisma.js';
import { loadSubgraph, getOutgoingEdges } from './graphService.js';
import { EDGE_TYPES } from '../../../../shared/domain/locationGraph.js';
import { childLogger } from '../../lib/logger.js';

const log = childLogger({ module: 'movementEngine' });

const MOVEMENT_CATEGORIES = new Set(['movement', 'structural']);
const ACCESS_EDGE_TYPES = new Set([
  'requires_key', 'requires_skill_check', 'requires_item',
  'requires_faction_status', 'requires_payment', 'requires_time',
]);

/**
 * Get all available exits from a character's current location.
 * Filters by knowledge state (if provided) and edge discovery state.
 */
export async function getMovementOptions(characterId, campaignId) {
  const npc = await prisma.npc.findFirst({
    where: { id: characterId, campaignId },
    select: { lastLocationKind: true, lastLocationId: true },
  });

  let locationKind, locationId;
  if (npc) {
    locationKind = npc.lastLocationKind;
    locationId = npc.lastLocationId;
  } else {
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { currentLocationKind: true, currentLocationId: true },
    });
    if (!campaign) return [];
    locationKind = campaign.currentLocationKind;
    locationId = campaign.currentLocationId;
  }

  if (!locationKind || !locationId) return [];

  const edges = await getOutgoingEdges(locationKind, locationId, { campaignId });
  const myKey = `${locationKind}:${locationId}`;

  const options = [];
  for (const edge of edges) {
    if (!MOVEMENT_CATEGORIES.has(edge.category)) continue;
    if (edge.discoveryState === 'unknown' || edge.discoveryState === 'hidden') continue;

    const targetKey = `${edge.fromKind}:${edge.fromId}` === myKey
      ? `${edge.toKind}:${edge.toId}`
      : (edge.bidirectional ? `${edge.fromKind}:${edge.fromId}` : null);
    if (!targetKey) continue;

    const [targetKind, targetId] = targetKey.split(':');
    const blockers = getBlockersForEdge(edge);

    options.push({
      edgeId: edge.id,
      edgeType: edge.edgeType,
      targetKind,
      targetId,
      accessible: blockers.length === 0,
      blockers,
      travelTime: edge.metadata?.travelTime ?? edge.weight ?? 1,
      distance: edge.metadata?.distance ?? edge.weight ?? 0,
    });
  }

  return options;
}

/**
 * Find a path between two locations using Dijkstra with preference-based cost.
 */
export async function findPath(fromId, fromKind, toId, toKind, campaignId, preference = 'shortest') {
  const { nodes, edges } = await loadSubgraph(fromKind, fromId, { campaignId, hops: 6 });
  const targetKey = `${toKind}:${toId}`;
  const startKey = `${fromKind}:${fromId}`;

  if (startKey === targetKey) {
    return { allowed: true, path: [], totalDistance: 0, totalTravelTime: 0, blockers: [], scaleHint: 'instant' };
  }

  const adj = buildAdjacency(edges);
  const costFn = buildCostFunction(preference);
  const result = dijkstra(adj, startKey, targetKey, costFn);

  if (!result) {
    return { allowed: false, path: [], totalDistance: 0, totalTravelTime: 0, blockers: [], scaleHint: 'instant', reason: 'no_known_path' };
  }

  const blockers = result.path.flatMap((seg) => getBlockersForEdge(seg.edge));
  const totalDistance = result.path.reduce((sum, s) => sum + (s.edge.metadata?.distance ?? s.edge.weight ?? 0), 0);
  const totalTravelTime = estimateTravelTime(result.path);
  const scaleHint = determineScale(totalDistance, result.path);

  return {
    allowed: blockers.length === 0,
    path: result.path.map((s) => ({
      fromKey: s.from,
      toKey: s.to,
      edgeId: s.edge.id,
      edgeType: s.edge.edgeType,
      distance: s.edge.metadata?.distance ?? s.edge.weight ?? 0,
      travelTime: s.edge.metadata?.travelTime ?? s.edge.weight ?? 1,
    })),
    totalDistance,
    totalTravelTime,
    blockers,
    scaleHint,
  };
}

/**
 * Check if a character can move to a target location.
 * Returns { allowed, blockers }.
 */
export async function canMove(characterId, targetLocationId, targetKind, campaignId) {
  const npc = await prisma.npc.findFirst({
    where: { id: characterId, campaignId },
    select: { lastLocationKind: true, lastLocationId: true },
  });

  let fromKind, fromId;
  if (npc) {
    fromKind = npc.lastLocationKind;
    fromId = npc.lastLocationId;
  } else {
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { currentLocationKind: true, currentLocationId: true },
    });
    if (!campaign) return { allowed: false, blockers: [{ requirement: 'no_campaign', detail: 'Campaign not found' }] };
    fromKind = campaign.currentLocationKind;
    fromId = campaign.currentLocationId;
  }

  if (!fromKind || !fromId) {
    return { allowed: false, blockers: [{ requirement: 'no_position', detail: 'No current position' }] };
  }

  const result = await findPath(fromId, fromKind, targetLocationId, targetKind, campaignId);
  return { allowed: result.allowed, blockers: result.blockers };
}

/**
 * Get unmet requirements for traversing a specific edge.
 */
export function getBlockers(edge) {
  return getBlockersForEdge(edge);
}

/**
 * Sum travel time from a list of path segments (edge objects).
 */
export function estimateTravelTime(path) {
  return path.reduce((sum, seg) => {
    const edge = seg.edge || seg;
    return sum + (edge.metadata?.travelTime ?? edge.weight ?? 1);
  }, 0);
}

/**
 * Determine the narrative scale of a movement.
 */
export function determineScale(distance, path) {
  if (!path || path.length === 0) return 'instant';
  const allDoors = path.every((s) => {
    const e = s.edge || s;
    return e.edgeType === 'door_to' || e.edgeType === 'stairs_to';
  });
  if (allDoors) return 'instant';
  if (distance < 0.1) return 'turn';
  if (distance < 1) return 'scene';
  if (distance < 10) return 'hours';
  return 'days';
}

// ── Internal helpers ─────────────────────────────────────────────────

function getBlockersForEdge(edge) {
  const blockers = [];
  if (edge.edgeType === 'blocked_path_to') {
    blockers.push({
      edgeId: edge.id,
      requirement: 'blocked',
      detail: edge.metadata?.blockedBy || 'Droga zablokowana',
      bypassable: !!edge.metadata?.clearMethod,
      bypassMethod: edge.metadata?.clearMethod || null,
    });
  }
  if (edge.metadata?.locked) {
    blockers.push({
      edgeId: edge.id,
      requirement: 'requires_key',
      detail: edge.metadata?.keyName || 'Zamknięte na klucz',
      bypassable: true,
      bypassMethod: `Klucz: ${edge.metadata?.keyName || '?'}`,
    });
  }
  if (edge.metadata?.gated && edge.metadata?.gateHint) {
    blockers.push({
      edgeId: edge.id,
      requirement: 'gated',
      detail: edge.metadata.gateHint,
      bypassable: true,
      bypassMethod: edge.metadata.gateHint,
    });
  }

  // Check access edges linked via shared from/to pair
  if (edge.metadata?.requiresSkillCheck) {
    blockers.push({
      edgeId: edge.id,
      requirement: 'requires_skill_check',
      detail: `${edge.metadata.requiresSkillCheck.skill} DC ${edge.metadata.requiresSkillCheck.difficulty}`,
      bypassable: true,
      bypassMethod: `Test: ${edge.metadata.requiresSkillCheck.skill}`,
    });
  }
  if (edge.metadata?.requiresItem) {
    blockers.push({
      edgeId: edge.id,
      requirement: 'requires_item',
      detail: edge.metadata.requiresItem,
      bypassable: true,
      bypassMethod: `Przedmiot: ${edge.metadata.requiresItem}`,
    });
  }
  if (edge.metadata?.requiresPayment) {
    blockers.push({
      edgeId: edge.id,
      requirement: 'requires_payment',
      detail: `${edge.metadata.requiresPayment.cost} ${edge.metadata.requiresPayment.currency || 'MK'}`,
      bypassable: true,
      bypassMethod: 'Zapłata',
    });
  }
  if (edge.metadata?.requiresFactionStatus) {
    blockers.push({
      edgeId: edge.id,
      requirement: 'requires_faction_status',
      detail: `Frakcja: ${edge.metadata.requiresFactionStatus.factionId}, min: ${edge.metadata.requiresFactionStatus.minStanding}`,
      bypassable: false,
      bypassMethod: null,
    });
  }
  if (edge.metadata?.validPeriods) {
    blockers.push({
      edgeId: edge.id,
      requirement: 'requires_time',
      detail: `Dostępne w: ${edge.metadata.validPeriods.join(', ')}`,
      bypassable: false,
      bypassMethod: null,
    });
  }
  return blockers;
}

function buildAdjacency(edges) {
  const adj = new Map();
  for (const edge of edges) {
    if (!MOVEMENT_CATEGORIES.has(edge.category)) continue;
    if (edge.discoveryState === 'unknown' || edge.discoveryState === 'hidden') continue;

    const fromKey = `${edge.fromKind}:${edge.fromId}`;
    const toKey = `${edge.toKind}:${edge.toId}`;

    if (!adj.has(fromKey)) adj.set(fromKey, []);
    adj.get(fromKey).push({ to: toKey, edge });

    if (edge.bidirectional) {
      if (!adj.has(toKey)) adj.set(toKey, []);
      adj.get(toKey).push({ to: fromKey, edge });
    }
  }
  return adj;
}

function buildCostFunction(preference) {
  switch (preference) {
    case 'safest':
      return (edge) => (edge.weight || 1) * (1 + (edge.metadata?.dangerLevel || 0) * 5);
    case 'fastest':
      return (edge) => edge.metadata?.travelTime || edge.weight || 1;
    default: // shortest
      return (edge) => edge.metadata?.distance || edge.weight || 1;
  }
}

function dijkstra(adj, startKey, targetKey, costFn) {
  const dist = new Map();
  const prev = new Map();
  const visited = new Set();
  dist.set(startKey, 0);

  const queue = [{ key: startKey, cost: 0 }];

  while (queue.length > 0) {
    queue.sort((a, b) => a.cost - b.cost);
    const { key: current } = queue.shift();

    if (current === targetKey) {
      const path = [];
      let cur = targetKey;
      while (prev.has(cur)) {
        const { from, edge } = prev.get(cur);
        path.unshift({ from, to: cur, edge });
        cur = from;
      }
      return { path, totalCost: dist.get(targetKey) };
    }

    if (visited.has(current)) continue;
    visited.add(current);

    const neighbors = adj.get(current) || [];
    for (const { to, edge } of neighbors) {
      if (visited.has(to)) continue;
      const cost = dist.get(current) + costFn(edge);
      if (!dist.has(to) || cost < dist.get(to)) {
        dist.set(to, cost);
        prev.set(to, { from: current, edge });
        queue.push({ key: to, cost });
      }
    }
  }

  return null;
}
