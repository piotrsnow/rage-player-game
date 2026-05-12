/**
 * Objective type taxonomy for quest objectives (visual badge + prompt hint).
 * Shared between frontend (UI badges) and backend (Zod validation + AI prompt).
 */

export const OBJECTIVE_TYPES = [
  'kill',
  'escort',
  'fetch',
  'deliver',
  'craft',
  'explore',
  'interact',
  'survive',
  'gather',
];

export const OBJECTIVE_TYPE_ENUM = /** @type {const} */ (OBJECTIVE_TYPES);

export const OBJECTIVE_TYPE_WEIGHTS = {
  kill: 3,
  escort: 2,
  fetch: 5,
  deliver: 6,
  craft: 4,
  explore: 4,
  interact: 10,
  survive: 2,
  gather: 3,
};

/**
 * Weighted random pick of `count` objective types.
 * Each slot is independent (types CAN repeat).
 */
export function rollObjectiveTypes(count) {
  const entries = Object.entries(OBJECTIVE_TYPE_WEIGHTS);
  const totalWeight = entries.reduce((s, [, w]) => s + w, 0);
  const result = [];
  for (let i = 0; i < count; i++) {
    let r = Math.random() * totalWeight;
    for (const [type, weight] of entries) {
      r -= weight;
      if (r <= 0) { result.push(type); break; }
    }
  }
  return result;
}
