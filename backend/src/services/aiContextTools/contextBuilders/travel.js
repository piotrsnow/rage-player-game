import { resolveWorldLocation } from '../../livingWorld/worldStateService.js';
import { loadCampaignGraph, dijkstra, classifyDetour, expandPath } from '../../livingWorld/travelGraph.js';
import { generateTravelEvents } from '../../livingWorld/travelEventGenerator.js';
import { loadDiscovery } from '../../livingWorld/userDiscoveryService.js';

const DIFFICULTY_RANK = { safe: 0, moderate: 1, dangerous: 2, deadly: 3 };

/**
 * Build the Phase 7 TRAVEL CONTEXT block. Resolves target by fuzzy name,
 * runs Dijkstra on the campaign-visible graph, classifies detour, and
 * (for sensible multi-hop paths) asks nano for 3-5 candidate narrative
 * beats. Null on: missing target, same-location, or no known path — in
 * which case premium narrates travel as "no known path, you wander".
 */
export async function buildTravelBlock({ campaignId, userId, startLocation, targetName, provider, timeoutMs }) {
  if (!startLocation?.id || !targetName) return null;

  const target = await resolveWorldLocation(targetName).catch(() => null);
  if (!target?.id || target.id === startLocation.id) return null;

  // Only consider the user's discovered graph. Capital is always in the set;
  // everything else must have been visited. Unknown targets → no path, scene
  // falls back to exploration narration (Iteracja 2 will handle this path).
  const { locationIds } = await loadDiscovery(userId);
  if (!locationIds.has(target.id)) {
    return {
      kind: 'unknown_target',
      targetName: target.canonicalName,
      startName: startLocation.canonicalName,
    };
  }

  const adj = await loadCampaignGraph(campaignId);
  const route = dijkstra(adj, startLocation.id, target.id);
  if (!route) {
    return {
      kind: 'no_path',
      targetName: target.canonicalName,
      startName: startLocation.canonicalName,
    };
  }
  if (route.hops === 0) return null;

  const pathLocations = await expandPath(route.path);
  if (pathLocations.length < 2) return null;

  const detour = classifyDetour({
    pathDistance: route.distance,
    start: pathLocations[0],
    end: pathLocations[pathLocations.length - 1],
  });

  // Worst-edge difficulty on the chosen path — used as difficulty hint for
  // the candidate event generator. Cheap re-read: pull edges by (from,to)
  // pairs so we can read stored difficulty / terrain.
  let worstDifficulty = 'safe';
  let totalTerrain = new Set();
  for (let i = 0; i < route.path.length - 1; i++) {
    const neighbors = adj.get(route.path[i]) || [];
    const next = neighbors.find((n) => n.toId === route.path[i + 1]);
    if (!next) continue;
    if (DIFFICULTY_RANK[next.difficulty] > DIFFICULTY_RANK[worstDifficulty]) {
      worstDifficulty = next.difficulty;
    }
    if (next.terrainType) totalTerrain.add(next.terrainType);
  }

  // Multi-hop direct/sensible paths get candidate events. Trivial (1 hop) or
  // long (>2.0 ratio, Iteracja 2) skip the nano call.
  let candidateEvents = null;
  if (route.hops >= 2 && (detour === 'direct' || detour === 'sensible')) {
    candidateEvents = await generateTravelEvents({
      pathLocations,
      totalDifficulty: worstDifficulty,
      provider,
      timeoutMs,
    }).catch(() => null);
  }

  // Phase F — montage mode: when the known-path trip is > 5 km AND sensible/
  // direct, force ONE compressed scene instead of multi-scene wandering.
  // Pre-rolls are suppressed by the caller when this flag is set.
  const montage = (detour === 'direct' || detour === 'sensible') && route.distance > 5;

  return {
    kind: 'path',
    startName: startLocation.canonicalName,
    targetName: target.canonicalName,
    waypoints: pathLocations.map((l) => ({
      name: l.canonicalName,
      locationType: l.locationType || 'generic',
    })),
    totalDistance: Number(route.distance.toFixed(2)),
    hops: route.hops,
    detour,
    difficulty: worstDifficulty,
    terrains: [...totalTerrain],
    candidateEvents,
    montage,
  };
}
