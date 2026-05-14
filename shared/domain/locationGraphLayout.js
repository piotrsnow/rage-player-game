/**
 * Shared helpers for location graph directional layout (FE + BE).
 * directionDeg: bearing in **canvas space** — 0° = east (right), 90° = south (down), counter-clockwise from +X.
 * lengthKm: edge length in kilometers (world scale).
 */

/** km for step between adjacent scale levels: scale 1↔2 … 6↔7. Index = lower scale - 1. */
export const SCALE_STEP_KM = [0.3, 1.5, 6, 20, 60, 150];

const GOLDEN_ANGLE_DEG = 137.508;

/**
 * @param {number} s
 * @returns {number} clamped 1..7
 */
export function clampLocationScale(s) {
  const n = Number(s);
  if (!Number.isFinite(n)) return 5;
  return Math.max(1, Math.min(7, Math.round(n)));
}

/**
 * Default graph edge length (km) between two scale levels (sum of intermediate steps).
 * @param {number} fromScale
 * @param {number} toScale
 */
export function defaultLengthKmBetweenScales(fromScale, toScale) {
  const a = clampLocationScale(fromScale);
  const b = clampLocationScale(toScale);
  if (a === b) return 0.5;

  let low = Math.min(a, b);
  const high = Math.max(a, b);
  let sum = 0;
  while (low < high) {
    sum += SCALE_STEP_KM[low - 1] ?? 1;
    low += 1;
  }
  return Math.max(sum, 0.05);
}

/**
 * Deterministic angle (deg) for the Nth child under a parent (0-based index).
 * Golden-angle spacing avoids updating sibling edges when adding a new node.
 * @param {number} siblingIndex
 */
export function directionDegForChildIndex(siblingIndex) {
  const i = Math.max(0, Math.floor(siblingIndex));
  return ((i * GOLDEN_ANGLE_DEG) % 360 + 360) % 360;
}

/**
 * @param {number} deg
 */
export function normalizeDirectionDeg(deg) {
  const n = Number(deg);
  if (!Number.isFinite(n)) return 0;
  return ((n % 360) + 360) % 360;
}

const TYPE_SCALE_MAP = {
  room: 1, chamber: 1, cell: 1,
  site: 2, house: 2, building: 2, shop: 2, tavern: 2, tower: 2, chapel: 2,
  dungeon: 3, complex: 3, castle: 3, fort: 3, monastery: 3, compound: 3, market: 3,
  district: 4, neighborhood: 4, quarter: 4, area: 4,
  settlement: 6, town: 6, village: 6, city: 6,
  region: 7, country: 7,
};

/**
 * Deterministic scale fallback from node type string.
 * Returns a sensible scale or null if the type is unknown.
 * @param {string} type
 * @param {number|null} [parentScale]
 * @returns {number|null}
 */
export function inferScaleFromType(type, parentScale) {
  if (!type) return null;
  const key = type.toLowerCase().trim();
  const base = TYPE_SCALE_MAP[key] ?? null;
  if (base == null) return null;
  if (typeof parentScale === 'number' && Number.isFinite(parentScale) && base >= parentScale) {
    return Math.max(1, parentScale - 1);
  }
  return base;
}
