/**
 * Allowed Material Symbols Outlined names for AI-picked spell icons (invent spell + UI).
 * Keep in sync with prompts in backend/src/services/spellInventionAnalyzer.js.
 */
export const SPELL_MATERIAL_ICON_OPTIONS = Object.freeze([
  'local_fire_department',
  'water_drop',
  'bolt',
  'shield',
  'visibility_off',
  'ac_unit',
  'healing',
  'psychology',
  'air',
  'explore',
  'nightlight',
  'flare',
  'thunderstorm',
  'cloud',
  'cyclone',
  'skull',
  'forest',
  'castle',
  'auto_fix_high',
  'auto_awesome',
  'star',
  'dark_mode',
  'brightness_7',
  'blur_on',
  'bubble_chart',
  'pets',
  'eco',
  'grass',
  'rocket_launch',
  'hourglass_empty',
  'lock',
  'verified_user',
  'favorite',
  'sentiment_very_dissatisfied',
  'military_tech',
  'sports_martial_arts',
  'monitor_heart',
  'science',
  'biotech',
  'hive',
  'emoji_events',
  'workspace_premium',
  'diamond',
  'invert_colors',
  'opacity',
  'texture',
  'gradient',
  'blur_circular',
  'lens_blur',
  'spark',
]);

const ALLOWED = new Set(SPELL_MATERIAL_ICON_OPTIONS);

/** @param {unknown} value */
export function normalizeSpellMaterialIcon(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().toLowerCase().replace(/\s+/g, '_');
  if (!trimmed || !ALLOWED.has(trimmed)) return null;
  return trimmed;
}

/** Deterministic fallback when the model omits or breaks icon (still from the allowed set). */
export function spellMaterialIconFallbackFromName(spellName) {
  const s = String(spellName || '');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h + s.charCodeAt(i) * (i + 1)) % 2147483647;
  const idx = Math.abs(h) % SPELL_MATERIAL_ICON_OPTIONS.length;
  return SPELL_MATERIAL_ICON_OPTIONS[idx];
}
