// Living World Phase 7 — content localizer.
//
// Resolves `{ pl, en }` i18n maps (used by dungeon templates and eventually
// other static content tables) into a plain string in the user's preferred
// content language.
//
// Content language is distinct from UI language:
//   - UI language (i18next) — runtime FE label translations
//   - Content language (User.contentLanguage) — locked at signup, controls
//     the language in which the AI generates narrative and in which static
//     content strings are fed into the AI prompt
//
// Fallback chain: requested → 'pl' → first available value → null.
// Passing a plain string returns it unchanged (backward compat with tables
// that haven't been i18n-split yet).

export const SUPPORTED_CONTENT_LANGUAGES = ['pl', 'en'];
export const DEFAULT_CONTENT_LANGUAGE = 'pl';

export function normalizeLanguage(lang) {
  if (typeof lang !== 'string') return DEFAULT_CONTENT_LANGUAGE;
  const lc = lang.toLowerCase();
  return SUPPORTED_CONTENT_LANGUAGES.includes(lc) ? lc : DEFAULT_CONTENT_LANGUAGE;
}

/**
 * Resolve an i18n map to a string. Accepts:
 *   - { pl, en }       → pick by language with pl fallback
 *   - string           → return as-is
 *   - null / undefined → return null
 *
 * Missing target language silently falls back to `pl`, then to the first
 * non-empty value in the map. Never throws.
 */
export function localize(value, lang = DEFAULT_CONTENT_LANGUAGE) {
  if (value == null) return null;
  if (typeof value === 'string') return value;
  if (typeof value !== 'object') return String(value);
  const target = normalizeLanguage(lang);
  if (typeof value[target] === 'string' && value[target]) return value[target];
  if (typeof value.pl === 'string' && value.pl) return value.pl;
  for (const key of Object.keys(value)) {
    if (typeof value[key] === 'string' && value[key]) return value[key];
  }
  return null;
}

/**
 * Convenience: resolve a trap/loot/puzzle entry's user-facing fields to
 * language-specific strings. Non-text fields (dc, stat, damage, rarity,
 * quantity, category, weight) pass through unchanged.
 */
export function localizeContentEntry(entry, lang = DEFAULT_CONTENT_LANGUAGE) {
  if (!entry || typeof entry !== 'object') return entry;
  const out = { ...entry };
  if (entry.label) out.label = localize(entry.label, lang);
  if (entry.name) out.name = localize(entry.name, lang);
  if (entry.effect) out.effect = localize(entry.effect, lang);
  if (entry.solutionHint) out.solutionHint = localize(entry.solutionHint, lang);
  return out;
}

/**
 * Resolve a dungeon room's stored metadata to localized text for prompt
 * injection. Trap/loot/puzzle entries persisted in roomMetadata carry i18n
 * maps (spread straight from the static tables); this function localizes
 * all user-facing fields + the flavor seed.
 */
export function localizeRoomMetadata(meta, lang = DEFAULT_CONTENT_LANGUAGE) {
  if (!meta || typeof meta !== 'object') return meta;
  const out = { ...meta };
  if (meta.trap) out.trap = localizeContentEntry(meta.trap, lang);
  if (meta.puzzle) out.puzzle = localizeContentEntry(meta.puzzle, lang);
  if (Array.isArray(meta.loot)) {
    out.loot = meta.loot.map((l) => localizeContentEntry(l, lang));
  }
  if (meta.flavorSeed) out.flavorSeed = localize(meta.flavorSeed, lang);
  return out;
}
