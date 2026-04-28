/**
 * Path scan — given a movement segment AB in the canonical world, surface
 * (a) all top-level POIs within `radiusKm` perpendicular of the path,
 * (b) all top-level POIs within `radiusKm` Euclidean distance of the
 *     destination point B (treated as "you've arrived at" rather than
 *     "you walked past"), and
 * (c) biome composition along the path — start biome, end biome, and any
 *     mid-path biome transitions sampled via getBiomeForCoords.
 *
 * Brute-force at this scale (heartland has ≤ 100 top-level locations); a
 * spatial index would be premature. Sublocations (parentLocationId set) are
 * deliberately excluded — they're never surface targets along an open-world
 * walk; the player has to enter the parent first.
 *
 * Pure math (`pointToSegment`, `sampleBiomeAlong`, `computePathScan`) is
 * exported for unit testing without a DB. `scanPath` is the DB wrapper.
 */

import { prisma } from '../../lib/prisma.js';
import { getBiomeForCoords } from '../../../../shared/domain/biomeMap.js';

const DEFAULT_RADIUS_KM = 0.25;
const BIOME_SAMPLE_STEP_KM = 0.25;

function round(n, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round(n * factor) / factor;
}

/**
 * Closest-point math from P to segment AB. Returns perpendicular distance
 * (clamped to segment endpoints) plus the along-segment km from A and which
 * side of A→B the point lies on.
 */
export function pointToSegment(ax, ay, bx, by, px, py) {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) {
    const ex = px - ax;
    const ey = py - ay;
    return { perpKm: Math.sqrt(ex * ex + ey * ey), alongKm: 0, side: 'right' };
  }
  const t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  const tClamped = Math.max(0, Math.min(1, t));
  const closestX = ax + tClamped * dx;
  const closestY = ay + tClamped * dy;
  const ex = px - closestX;
  const ey = py - closestY;
  const perpKm = Math.sqrt(ex * ex + ey * ey);
  const alongKm = tClamped * Math.sqrt(lenSq);
  // Sign of 2D cross product determines which side of A→B the point is on.
  const cross = dx * (py - ay) - dy * (px - ax);
  const side = cross >= 0 ? 'left' : 'right';
  return { perpKm, alongKm, side };
}

/**
 * Sample the biome map along AB at fixed steps. Returns the start/end biome
 * objects and a list of mid-path transitions {atKm, fromBiome, toBiome} where
 * the biome enum or named region changes between consecutive samples.
 */
export function sampleBiomeAlong(fromX, fromY, toX, toY, stepKm = BIOME_SAMPLE_STEP_KM) {
  const dx = toX - fromX;
  const dy = toY - fromY;
  const distance = Math.sqrt(dx * dx + dy * dy);
  if (distance === 0) {
    const r = getBiomeForCoords(fromX, fromY);
    return { fromBiome: r, toBiome: r, distanceKm: 0, transitions: [] };
  }
  const steps = Math.max(2, Math.ceil(distance / stepKm) + 1);
  const fromBiome = getBiomeForCoords(fromX, fromY);
  const toBiome = getBiomeForCoords(toX, toY);
  const transitions = [];
  let prev = fromBiome;
  for (let i = 1; i < steps; i++) {
    const t = i / (steps - 1);
    const x = fromX + dx * t;
    const y = fromY + dy * t;
    const r = getBiomeForCoords(x, y);
    if (r.biome !== prev.biome || (r.name || null) !== (prev.name || null)) {
      transitions.push({ atKm: round(t * distance), fromBiome: prev, toBiome: r });
      prev = r;
    }
  }
  return { fromBiome, toBiome, distanceKm: round(distance), transitions };
}

/**
 * Pure: given a list of pre-fetched candidate locations, compute the path
 * scan output. Used by `scanPath` after DB load and by tests directly.
 */
export function computePathScan(fromX, fromY, toX, toY, locations, { radiusKm = DEFAULT_RADIUS_KM } = {}) {
  const poisAlongPath = [];
  const poisAtDestination = [];
  for (const loc of locations) {
    const seg = pointToSegment(fromX, fromY, toX, toY, loc.regionX, loc.regionY);
    const distFromEnd = Math.sqrt((loc.regionX - toX) ** 2 + (loc.regionY - toY) ** 2);
    if (distFromEnd <= radiusKm) {
      poisAtDestination.push({ location: loc, distKm: round(distFromEnd) });
    } else if (seg.perpKm <= radiusKm) {
      poisAlongPath.push({
        location: loc,
        perpKm: round(seg.perpKm),
        alongKm: round(seg.alongKm),
        side: seg.side,
      });
    }
  }
  poisAlongPath.sort((a, b) => a.alongKm - b.alongKm);
  poisAtDestination.sort((a, b) => a.distKm - b.distKm);
  const path = sampleBiomeAlong(fromX, fromY, toX, toY);
  return { path, poisAlongPath, poisAtDestination };
}

/**
 * DB wrapper. Loads top-level locations (canonical + this-campaign sandbox)
 * and runs computePathScan. Sublocations are excluded.
 */
export async function scanPath(campaignId, fromX, fromY, toX, toY, options = {}) {
  const [worldLocs, campaignLocs] = await Promise.all([
    prisma.worldLocation.findMany({
      where: { parentLocationId: null },
      select: {
        id: true,
        canonicalName: true,
        displayName: true,
        locationType: true,
        regionX: true,
        regionY: true,
        dangerLevel: true,
      },
    }),
    campaignId
      ? prisma.campaignLocation.findMany({
          where: { campaignId, parentLocationId: null },
          select: {
            id: true,
            name: true,
            locationType: true,
            regionX: true,
            regionY: true,
            dangerLevel: true,
          },
        })
      : Promise.resolve([]),
  ]);

  const locations = [
    ...worldLocs.map((l) => ({
      kind: 'world',
      id: l.id,
      name: l.displayName || l.canonicalName,
      locationType: l.locationType,
      regionX: l.regionX,
      regionY: l.regionY,
      dangerLevel: l.dangerLevel,
    })),
    ...campaignLocs.map((l) => ({
      kind: 'campaign',
      id: l.id,
      name: l.name,
      locationType: l.locationType,
      regionX: l.regionX,
      regionY: l.regionY,
      dangerLevel: l.dangerLevel,
    })),
  ];

  return computePathScan(fromX, fromY, toX, toY, locations, options);
}
