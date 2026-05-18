import { resolveLocationByName } from '../../livingWorld/worldStateService.js';
import { loadCampaignFog, markLocationHeardAbout } from '../../livingWorld/userDiscoveryService.js';
import { unpackWorldBounds } from '../../locationRefs.js';
import { scanPath } from '../../livingWorld/pathScan.js';
import { lookupEdgeFamiliarity } from '../../locationGraph/graphService.js';
import { applyMovementVector } from '../../../../../shared/domain/movementIntent.js';
import { WORLD_BARRIERS } from '../../../../../shared/domain/worldBarriers.js';

/**
 * Movement intent context block. Built when the intent classifier flagged
 * `_intent='travel'` + EITHER a named POI target (`targetName`) OR a free
 * vector (`directionalMove: {azimuth, distanceKm}`).
 *
 * F5d Phase 2 — both modes resolve to a destination (toX, toY) and run
 * pathScan to surface:
 *   - POIs within 250m perpendicular of the path (passed-by, side, alongKm)
 *   - POIs within 250m of the destination (arrival candidates)
 *   - biome transitions sampled along the path
 *
 * Pass-by canonical POIs are flipped to `heard_about` in UserDiscoveredLocation
 * so the player's map fills in as they walk past things.
 *
 * Barrier check: if the destination falls outside the campaign's worldBounds,
 * `barrierHit` carries the direction + named obstacle (smok / kopiący robak /
 * ocean) so the AI can narrate the block. We clamp toX/toY to the boundary
 * before pathScan so we don't surface POIs past the edge.
 *
 * Returns null on no-op (no target, no vector, target equals start).
 * `unresolved: true` flag = named target name didn't resolve to any
 * fog-visible location → AI should refuse with disorientation.
 */
const PATH_SCAN_RADIUS_KM = 0.25;

export async function buildTravelBlock({
  campaignId,
  userId,
  campaign,
  startLocation,
  targetName,
  directionalMove,
}) {
  if (!startLocation?.id) return null;
  if (!targetName && !directionalMove) return null;

  const fromX = startLocation.regionX ?? 0;
  const fromY = startLocation.regionY ?? 0;
  const fromName = startLocation.displayName || startLocation.canonicalName || '';

  let toX = null;
  let toY = null;
  let resolvedTargetName = null;
  let targetInFog = false;
  let kind = 'travel';

  let resolvedTargetRef = null;

  if (targetName) {
    const targetRef = await resolveLocationByName(targetName, { campaignId }).catch(() => null);
    const targetLoc = targetRef?.location;
    if (!targetLoc?.id) {
      return {
        kind: 'travel',
        fromName,
        fromRef: startLocation.id ? { id: startLocation.id } : null,
        targetName,
        targetInFog: false,
        unresolved: true,
      };
    }
    if (targetLoc.id === startLocation.id) return null;
    toX = targetLoc.regionX;
    toY = targetLoc.regionY;
    resolvedTargetName = targetLoc.displayName || targetLoc.canonicalName || targetName;
    resolvedTargetRef = { id: targetLoc.id };
    const fog = await loadCampaignFog({ userId, campaignId }).catch(() => ({
      visited: new Set(),
      heardAbout: new Set(),
    }));
    targetInFog = fog.visited.has(targetLoc.id) || fog.heardAbout.has(targetLoc.id);
  } else {
    const { azimuth, distanceKm } = directionalMove;
    const t = applyMovementVector(fromX, fromY, azimuth, distanceKm);
    toX = t.x;
    toY = t.y;
    kind = 'vectorMove';
  }

  // World-bounds barrier check. If destination pushes past an edge, name the
  // obstacle and clamp the path to the boundary so pathScan doesn't reach
  // past the wall.
  let barrierHit = null;
  const bounds = campaign ? unpackWorldBounds(campaign) : null;
  if (bounds) {
    if (toY > bounds.maxY) barrierHit = { direction: 'N', barrier: WORLD_BARRIERS.north };
    else if (toY < bounds.minY) barrierHit = { direction: 'S', barrier: WORLD_BARRIERS.south };
    else if (toX > bounds.maxX) barrierHit = { direction: 'E', barrier: WORLD_BARRIERS.east };
    else if (toX < bounds.minX) barrierHit = { direction: 'W', barrier: WORLD_BARRIERS.west };
    if (barrierHit) {
      if (barrierHit.direction === 'N') toY = bounds.maxY;
      if (barrierHit.direction === 'S') toY = bounds.minY;
      if (barrierHit.direction === 'E') toX = bounds.maxX;
      if (barrierHit.direction === 'W') toX = bounds.minX;
    }
  }

  const scan = await scanPath(campaignId, fromX, fromY, toX, toY, {
    radiusKm: PATH_SCAN_RADIUS_KM,
  }).catch(() => null);

  // Pass-by discovery: canonical POIs within scan radius become heard_about
  // for this user. Campaign-scoped locations are already in scan output for
  // the prompt; the canonical fog set is what fills in the cross-campaign
  // player map.
  if (scan && userId) {
    for (const p of scan.poisAlongPath) {
      if (!p.location.campaignId) {
        markLocationHeardAbout({ userId, locationId: p.location.id }).catch(() => {});
      }
    }
  }

  let routeFamiliarity = null;
  if (targetName && startLocation.id) {
    const targetRef2 = await resolveLocationByName(resolvedTargetName || targetName, { campaignId }).catch(() => null);
    if (targetRef2?.location?.id) {
      routeFamiliarity = await lookupEdgeFamiliarity(
        startLocation.id,
        targetRef2.location.id,
        { campaignId },
      ).catch(() => null);
    }
  }

  return {
    kind,
    fromName,
    fromRef: startLocation.id ? { id: startLocation.id } : null,
    fromX,
    fromY,
    toX,
    toY,
    targetName: resolvedTargetName,
    targetRef: resolvedTargetRef,
    targetInFog,
    distanceKm: scan?.path.distanceKm ?? null,
    fromBiome: scan?.path.fromBiome || null,
    toBiome: scan?.path.toBiome || null,
    biomeTransitions: scan?.path.transitions || [],
    poisAlongPath: scan?.poisAlongPath || [],
    poisAtDestination: scan?.poisAtDestination || [],
    barrierHit,
    routeFamiliarity,
  };
}
