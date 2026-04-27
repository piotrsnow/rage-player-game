// Living World Phase 7 — position calculator.
//
// Pure functions that turn AI-emitted directional hints into concrete 2D
// coordinates on the world map, respecting spacing rules (per user spec):
//   - 1 unit = 1 km
//   - New location must be ≥ 3 km from the farthest existing location in the
//     same 8-cardinal sector relative to the emitting current location.
//   - Max single-jump = 5 km from current. Longer travelDistance gets clamped
//     (Iteracja 2 will splittuj na wirtualne intermediate for true shortcut
//     generation — out of scope for MVP positionCalculator).
//   - Conflict radius = 1 km. Inside that, treat as merge candidate.
//
// Input from scene-gen: { directionFromCurrent, travelDistance } where
//   directionFromCurrent ∈ N|NE|E|SE|S|SW|W|NW
//   travelDistance ∈ short|half_day|day|two_days|multi_day
//
// Capital is anchored at (0,0) in world seed. First-ever location when
// current is null falls back to a tiny offset from capital so the spacing
// rule doesn't divide by zero.

export const UNIT_PER_DIRECTION = {
  N:  { dx:  0, dy:  1 },
  NE: { dx:  0.707, dy:  0.707 },
  E:  { dx:  1, dy:  0 },
  SE: { dx:  0.707, dy: -0.707 },
  S:  { dx:  0, dy: -1 },
  SW: { dx: -0.707, dy: -0.707 },
  W:  { dx: -1, dy:  0 },
  NW: { dx: -0.707, dy:  0.707 },
};

// km per `travelDistance` enum value. Clamped to MAX_SINGLE_JUMP.
export const DISTANCE_UNITS = {
  short:      1,
  half_day:   2,
  day:        3,
  two_days:   4,
  multi_day:  5,
};

// Round B (Phase 4c+) — simpler `distanceHint` vocabulary. Each maps to a
// random km range; actual placement picks uniformly inside. AI may emit
// either `travelDistance` (old) OR `distanceHint` (new) OR neither — neither
// defaults to the implicit "close" bucket so narration that just mentions
// "you find a cave" still materializes within walking distance.
export const DISTANCE_HINT_RANGE = {
  very_close: [0.1, 0.7],
  close:      [0.1, 2.0],
  near:       [0.1, 2.0],
  nearby:     [0.1, 2.0],
  medium:     [3.0, 5.0],
  far:        [2.1, 4.0],
  distant:    [2.1, 4.0],
  very_far:   [5.0, 10.0],
};

export const MIN_SECTOR_SPACING = 3; // km — min distance from farthest existing in same sector
export const MAX_SINGLE_JUMP = 5;    // km — cap from current
export const MERGE_RADIUS = 1;        // km — anything within this radius is a merge candidate
export const COLLISION_RADIUS = 0.5;  // km — any existing tile closer than this is a hard collision (different from MERGE_RADIUS which is a soft merge hint)
export const DEFAULT_HINT_RANGE = [0.1, 2.0]; // fallback when AI gives neither travelDistance nor distanceHint
export const MAX_PLACEMENT_ATTEMPTS = 20;     // retries for random-angle collision avoidance

export function euclidean(a, b) {
  const dx = (a.regionX ?? 0) - (b.regionX ?? 0);
  const dy = (a.regionY ?? 0) - (b.regionY ?? 0);
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Classify a point's 8-cardinal sector relative to an anchor.
 * Returns one of: N|NE|E|SE|S|SW|W|NW, or null if points coincide.
 */
export function sectorFromAnchor(anchor, point) {
  const dx = point.regionX - anchor.regionX;
  const dy = point.regionY - anchor.regionY;
  if (dx === 0 && dy === 0) return null;
  const angle = Math.atan2(dy, dx) * (180 / Math.PI); // -180..180
  // 8 sectors of 45° each, centered on cardinal/intercardinal directions.
  // E = 0°, N = 90°, W = 180°/-180°, S = -90°.
  if (angle >= -22.5 && angle < 22.5)   return 'E';
  if (angle >= 22.5  && angle < 67.5)   return 'NE';
  if (angle >= 67.5  && angle < 112.5)  return 'N';
  if (angle >= 112.5 && angle < 157.5)  return 'NW';
  if (angle >= 157.5 || angle < -157.5) return 'W';
  if (angle >= -157.5 && angle < -112.5) return 'SW';
  if (angle >= -112.5 && angle < -67.5)  return 'S';
  return 'SE'; // -67.5 .. -22.5
}

/**
 * Raw position = current + unit_vector * distance (clamped to MAX_SINGLE_JUMP).
 * Does NOT apply spacing rules yet.
 */
export function rawPosition({ current, directionFromCurrent, travelDistance }) {
  const vec = UNIT_PER_DIRECTION[directionFromCurrent];
  if (!vec) return null;
  const rawKm = DISTANCE_UNITS[travelDistance];
  if (!Number.isFinite(rawKm)) return null;
  const km = Math.min(rawKm, MAX_SINGLE_JUMP);
  return {
    regionX: current.regionX + vec.dx * km,
    regionY: current.regionY + vec.dy * km,
  };
}

/**
 * Apply spacing rule — per user spec: "new location must be ≥3 km from the
 * farthest existing chain node in the emit direction".
 *
 * Algorithm:
 *   1. Project every existing location onto the emit direction axis (relative
 *      to `current`). Locations with non-negative projection + small perpendicular
 *      offset are "ahead" of current along the axis and count as chain nodes.
 *   2. Current itself counts as the near-end of the chain (dot=0).
 *   3. Pick the pivot = node with the largest forward projection.
 *   4. If distance(raw, pivot) < MIN_SECTOR_SPACING, push raw to pivot + vec * MIN_SECTOR_SPACING.
 *
 * This matches the user example: current (4,1) emitting E with an existing town
 * already at (4,1) → pivot = (4,1) itself, raw (5,1) is only 1 km away → push
 * to (7,1).
 */
export function enforceSectorSpacing({ current, raw, direction, existing }) {
  const vec = UNIT_PER_DIRECTION[direction];
  if (!vec) return { ...raw };

  let pivot = current;
  let maxForward = 0;
  const PERPENDICULAR_TOLERANCE = MIN_SECTOR_SPACING;

  for (const loc of existing || []) {
    const dx = loc.regionX - current.regionX;
    const dy = loc.regionY - current.regionY;
    const forward = dx * vec.dx + dy * vec.dy; // signed projection onto axis
    if (forward < 0) continue; // behind current — skip
    // perpendicular distance = |cross product|
    const perp = Math.abs(dx * vec.dy - dy * vec.dx);
    if (perp > PERPENDICULAR_TOLERANCE) continue; // off-axis, different chain
    if (forward >= maxForward) {
      maxForward = forward;
      pivot = loc;
    }
  }

  const dist = euclidean(raw, pivot);
  if (dist >= MIN_SECTOR_SPACING) return { ...raw };

  return {
    regionX: pivot.regionX + vec.dx * MIN_SECTOR_SPACING,
    regionY: pivot.regionY + vec.dy * MIN_SECTOR_SPACING,
  };
}

/**
 * Find nearest existing location within MERGE_RADIUS. Caller decides whether
 * to merge (fuzzy-name match) or adjust position.
 */
export function findMergeCandidate({ raw, existing }) {
  if (!existing || existing.length === 0) return null;
  let closest = null;
  let minDist = Infinity;
  for (const loc of existing) {
    const d = euclidean(raw, loc);
    if (d < minDist) {
      minDist = d;
      closest = loc;
    }
  }
  if (minDist <= MERGE_RADIUS) return { location: closest, distance: minDist };
  return null;
}

/**
 * High-level pipeline: raw → merge-check → spacing. Returns:
 *   { position, mergeCandidate? }
 *
 * Merge check runs FIRST on the unspaced raw: if the AI-intended point is
 * already next to an existing location, flag it as a merge candidate so the
 * caller can decide fuzzy-name match (merge into existing) vs. push out
 * (create new, apply spacing). Current location is excluded from merge
 * candidates because emitting FROM a point naturally lands near it.
 */
export function computeNewPosition({ current, directionFromCurrent, travelDistance, existing }) {
  const raw = rawPosition({ current, directionFromCurrent, travelDistance });
  if (!raw) return null;

  const existingList = existing || [];
  const othersForMerge = existingList.filter(
    (loc) => loc.regionX !== current.regionX || loc.regionY !== current.regionY,
  );
  const mergeCandidate = findMergeCandidate({ raw, existing: othersForMerge });

  const spaced = enforceSectorSpacing({
    current,
    raw,
    direction: directionFromCurrent,
    existing: existingList,
  });

  return {
    position: spaced,
    mergeCandidate: mergeCandidate || null,
  };
}

// ────────────────────────────────────────────────────────────────────
// Round B — smart placer (relaxed contract).
//
// The strict `computeNewPosition` above requires BOTH `directionFromCurrent`
// and `travelDistance` and rejects entries that omit either. The smart
// placer below accepts partial hints (or none at all) and falls back to a
// random angle + random-in-range radius, retrying a bounded number of
// times to avoid collisions. Used by `processTopLevelEntry` so AI narration
// like "you find a hunter's hut nearby" materializes even without explicit
// bearings.
//
// Hint resolution:
//   - Explicit `travelDistance` enum → exact km (matches old behaviour)
//   - Explicit `distanceHint` string ("close"|"far"|"near"|…) → random in range
//   - Neither → default `close` range [0.1, 2.0]
//   - Explicit `directionFromCurrent` → anchor angle, ±22.5° jitter on retry
//   - No direction → full 360° random angle
//
// Returns `{ position, mergeCandidate, reason }` where `reason` explains
// which hint path was taken (useful for logs + tests). `null` only when
// the placement truly couldn't find an unoccupied tile inside the bounds.
// ────────────────────────────────────────────────────────────────────

function hintedRadiusRange({ travelDistance, distanceHint }) {
  if (typeof travelDistance === 'string') {
    const km = DISTANCE_UNITS[travelDistance];
    if (Number.isFinite(km)) return { range: [km, km], reason: `travelDistance:${travelDistance}` };
  }
  if (typeof travelDistance === 'number' && Number.isFinite(travelDistance) && travelDistance > 0) {
    return { range: [travelDistance, travelDistance], reason: 'travelDistance:number' };
  }
  if (typeof distanceHint === 'string') {
    const range = DISTANCE_HINT_RANGE[distanceHint.toLowerCase()];
    if (range) return { range, reason: `distanceHint:${distanceHint}` };
  }
  return { range: DEFAULT_HINT_RANGE, reason: 'default_close' };
}

// Inverse of UNIT_PER_DIRECTION — 8-cardinal → radians.
const DIRECTION_TO_RADIANS = {
  E:  0,
  NE: Math.PI / 4,
  N:  Math.PI / 2,
  NW: 3 * Math.PI / 4,
  W:  Math.PI,
  SW: -3 * Math.PI / 4,
  S:  -Math.PI / 2,
  SE: -Math.PI / 4,
};

function randomInRange([lo, hi]) {
  return lo + Math.random() * Math.max(0, hi - lo);
}

function pickAngle(directionFromCurrent, attempt) {
  const base = DIRECTION_TO_RADIANS[directionFromCurrent];
  if (base !== undefined) {
    // First attempt hits dead-centre on the cardinal; retries fan out
    // within the ±22.5° sector so the direction is still respected.
    const jitterMax = Math.PI / 8; // 22.5°
    const jitter = attempt === 0 ? 0 : (Math.random() * 2 - 1) * jitterMax;
    return base + jitter;
  }
  return Math.random() * 2 * Math.PI;
}

function clampToBounds(point, bounds) {
  if (!bounds) return point;
  const { minX, maxX, minY, maxY } = bounds;
  if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minY) || !Number.isFinite(maxY)) return point;
  return {
    regionX: Math.max(minX, Math.min(maxX, point.regionX)),
    regionY: Math.max(minY, Math.min(maxY, point.regionY)),
  };
}

function tooCloseToExisting(point, existing) {
  for (const loc of existing || []) {
    const dx = (loc.regionX ?? 0) - point.regionX;
    const dy = (loc.regionY ?? 0) - point.regionY;
    if (dx * dx + dy * dy < COLLISION_RADIUS * COLLISION_RADIUS) return true;
  }
  return false;
}

/**
 * Smart placement for non-canonical runtime locations. Relaxed contract —
 * any subset of `{directionFromCurrent, travelDistance, distanceHint}` is
 * accepted; missing values default to a random angle and the `close` range.
 *
 * Returns `{ position: {regionX, regionY}, reason }` or `null` if after
 * MAX_PLACEMENT_ATTEMPTS retries no unoccupied tile inside `bounds` was
 * found.
 */
export function computeSmartPosition({
  current,
  directionFromCurrent = null,
  travelDistance = null,
  distanceHint = null,
  existing = [],
  bounds = null,
}) {
  if (!current || !Number.isFinite(current.regionX) || !Number.isFinite(current.regionY)) {
    return null;
  }
  const { range, reason: hintReason } = hintedRadiusRange({ travelDistance, distanceHint });
  const existingList = Array.isArray(existing) ? existing : [];

  let last = null;
  for (let attempt = 0; attempt < MAX_PLACEMENT_ATTEMPTS; attempt += 1) {
    const angle = pickAngle(directionFromCurrent, attempt);
    const km = randomInRange(range);
    const candidate = {
      regionX: current.regionX + Math.cos(angle) * km,
      regionY: current.regionY + Math.sin(angle) * km,
    };
    const clamped = clampToBounds(candidate, bounds);
    if (!tooCloseToExisting(clamped, existingList)) {
      return {
        position: clamped,
        reason: `${hintReason};dir:${directionFromCurrent || 'random'};attempt:${attempt}`,
      };
    }
    last = clamped;
  }
  // Couldn't find an unoccupied spot — caller picks: use last attempt or
  // bail. We return the last clamped point with a note so caller can decide.
  return last
    ? { position: last, reason: `${hintReason};dir:${directionFromCurrent || 'random'};overflow` }
    : null;
}
