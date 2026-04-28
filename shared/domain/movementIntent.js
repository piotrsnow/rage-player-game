/**
 * Free-vector movement intent parser. Picks up phrases like "1 km na północ",
 * "500m na zachód", "idę na NE 2km", "ruszam 800 metrów na południe".
 *
 * Returns `{ azimuth, distanceKm }` on a hit, null otherwise.
 *  - azimuth: 0=N, 90=E, 180=S, 270=W (with 45/135/225/315 for diagonals)
 *  - distanceKm: explicit km/m number REQUIRED. Direction-only phrases
 *    ("idę na północ") are deliberately rejected here — they collide with
 *    `detectDungeonNavigateIntent` and are intentionally left for that path
 *    (sceneGenerator gates dungeon nav on locationType later anyway). Free
 *    vector requires the player to commit to a distance.
 *
 * Coexists with `detectTravelIntent` (named POI target, e.g. "idę do Kamionki"):
 * the named-target path is checked first by the intent classifier, then this
 * vector path, then dungeon nav. The order means an explicit distance always
 * wins over generic dungeon navigation.
 *
 * Why heuristic-first: directional + numeric phrases are regular in Polish,
 * saving a nano-call for the common case. Edge cases ("trochę na lewo",
 * "głębiej w las") legitimately need the AI to interpret and are left to
 * the standard freeform path.
 */

// Diagonals MUST come before cardinal directions so "północny wschód" doesn't
// match "północ" alone.
const AZIMUTHS = [
  { re: /(p[oó][lł]nocn[yo]?\s*[-\s]?wsch[oó]d|p[oó][lł]nocno[\s-]?wsch[oó]d|north[\s-]?east|\bne\b)/iu, az: 45 },
  { re: /(p[oó][lł]nocn[yo]?\s*[-\s]?zach[oó]d|p[oó][lł]nocno[\s-]?zach[oó]d|north[\s-]?west|\bnw\b)/iu, az: 315 },
  { re: /(po[lł]udniow[yo]?\s*[-\s]?wsch[oó]d|po[lł]udniowo[\s-]?wsch[oó]d|south[\s-]?east|\bse\b)/iu, az: 135 },
  { re: /(po[lł]udniow[yo]?\s*[-\s]?zach[oó]d|po[lł]udniowo[\s-]?zach[oó]d|south[\s-]?west|\bsw\b)/iu, az: 225 },
  { re: /(p[oó][lł]noc(?:y|ą|ą)?|north(?:wards?)?|\bn\b|\bpn\.?\b)/iu, az: 0 },
  { re: /(po[lł]udni[aęeio]?|south(?:wards?)?|\bs\b|\bpd\.?\b)/iu, az: 180 },
  { re: /(wsch[oó]d(?:u|em|zie)?|east(?:wards?)?|\be\b|\bwsch\.?\b)/iu, az: 90 },
  { re: /(zach[oó]d(?:u|em|zie)?|west(?:wards?)?|\bw\b|\bzach\.?\b)/iu, az: 270 },
];

// Movement verbs (PL + EN) — required so descriptions ("patrzę na północ")
// don't trigger movement. Trailing `\b` is deliberately omitted: PL verbs end
// in `ę`/`ą`/`ł` which are non-word characters in JS ASCII regex mode, so a
// trailing `\b` rejects perfectly valid matches ("idę " has no word→non-word
// boundary at the position after "ę"). Leading `\b` is enough to reject
// embedded matches inside larger words.
const MOVE_VERB = /\b(?:id[eę]|p[oó]jd[eę]|ruszam|wyruszam|jad[eę]|kieruj[eę]\s+si[eę]|udaj[eę]\s+si[eę]|przemieszczam\s+si[eę]|chc[eę]\s+i[sść]|chodz[eę]|biegn[eę]|maszeruj[eę]|go(?:ing)?|head(?:ing)?|walk(?:ing)?|run(?:ning)?|march(?:ing)?|mov(?:e|ing))/iu;

const DISTANCE_RE = /(\d+(?:[.,]\d+)?)\s*([a-zżźćśłąęóń]+)?/iu;

function parseDistanceMatch(distMatch) {
  if (!distMatch) return null;
  const value = parseFloat(distMatch[1].replace(',', '.'));
  if (!Number.isFinite(value) || value <= 0) return null;
  const unit = (distMatch[2] || '').toLowerCase();
  if (!unit) return value;
  if (/^(km|kilometr|kilometra|kilometr[oó]w)$/.test(unit)) return value;
  if (/^(m|metr|metra|metr[oó]w|metrow)$/.test(unit)) return value / 1000;
  // Unrecognized trailing word (e.g. number was a count, not a distance).
  // Reject so callers fall through to other intent paths.
  return null;
}

/**
 * Returns { azimuth, distanceKm } on a confident hit, null otherwise.
 * Distance defaults to 1 km when only a direction + movement verb are present.
 */
export function parseMovementIntent(action) {
  if (!action || typeof action !== 'string') return null;
  if (!MOVE_VERB.test(action)) return null;

  let azimuth = null;
  let earliestIndex = Infinity;
  for (const { re, az } of AZIMUTHS) {
    const m = action.match(re);
    if (m && m.index < earliestIndex) {
      azimuth = az;
      earliestIndex = m.index;
    }
  }
  if (azimuth === null) return null;

  const distMatch = action.match(DISTANCE_RE);
  const distanceKm = parseDistanceMatch(distMatch);
  if (distanceKm === null) return null;
  if (distanceKm <= 0 || distanceKm > 100) return null;
  return { azimuth, distanceKm };
}

/**
 * Apply a movement vector to a starting (x, y) position. Output is the new
 * position; callers clamp / validate against worldBounds separately.
 */
export function applyMovementVector(fromX, fromY, azimuth, distanceKm) {
  // Azimuth: 0 = north (positive Y), 90 = east (positive X). Convert to
  // standard math angle (0 = +X axis, CCW positive) by `theta = 90° - azimuth`,
  // i.e. theta_rad = (90 - azimuth) * π/180. Then x' = x + d cos(theta),
  // y' = y + d sin(theta).
  const theta = (90 - azimuth) * (Math.PI / 180);
  return {
    x: fromX + distanceKm * Math.cos(theta),
    y: fromY + distanceKm * Math.sin(theta),
  };
}
