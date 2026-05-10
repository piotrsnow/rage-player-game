/**
 * Shared helpers for location graph directional layout (FE + BE).
 * directionDeg: bearing in **canvas space** — 0° = east (right), 90° = south (down), counter-clockwise from +X.
 * lengthKm: edge length in kilometers (world scale).
 */

/** km for step between adjacent scale levels: scale 1↔2 … 6↔7 */
export const SCALE_STEP_KM = [150, 60, 20, 6, 1.5, 0.3];

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
