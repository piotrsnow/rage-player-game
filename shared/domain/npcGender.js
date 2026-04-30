/**
 * Shared helpers for normalizing / inferring NPC gender.
 *
 * Invariant we try to hold everywhere: every NPC we persist has gender set to
 * either "male" or "female". The model is instructed to always pick one, but
 * occasionally it omits the field or writes "unknown" / free text — we
 * coerce those to a deterministic male|female so voice assignment has a pool
 * to draw from and UI doesn't display garbage.
 */

const VALID = new Set(['male', 'female']);

export function isValidGender(value) {
  return typeof value === 'string' && VALID.has(value);
}

/** Normalize any input to "male" | "female" | null (never "unknown"). */
export function normalizeGender(value) {
  if (isValidGender(value)) return value;
  return null;
}

/**
 * Deterministic-ish 50/50 pick. Seeded by the NPC name so repeated coercions
 * of the same name pick the same side — keeps voice mapping stable across
 * reloads before the DB catches up.
 */
export function pickRandomGenderForName(name) {
  const str = typeof name === 'string' ? name : '';
  if (!str) return Math.random() < 0.5 ? 'male' : 'female';
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) {
    hash = (hash * 31 + str.charCodeAt(i)) | 0;
  }
  return (hash & 1) === 0 ? 'male' : 'female';
}

/** Coerce whatever the LLM wrote into a valid male|female value. */
export function coerceGender(value, fallbackName = '') {
  const normalized = normalizeGender(value);
  if (normalized) return normalized;
  return pickRandomGenderForName(fallbackName);
}
