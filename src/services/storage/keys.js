// Shared localStorage keys + small helpers used by every storage sub-module.
//
// Keys live here (not inline in each module) so renaming one doesn't force
// you to grep the whole storage surface — one edit, one round of testing.

export const CAMPAIGNS_KEY = 'nikczemny_krzemuch_campaigns';
export const CURRENT_CAMPAIGN_KEY = 'nikczemny_krzemuch_current_campaign';
export const SETTINGS_KEY = 'nikczemny_krzemuch_settings';
export const ACTIVE_CAMPAIGN_KEY = 'nikczemny_krzemuch_active';
export const LAST_CHARACTER_NAME_KEY = 'nikczemny_krzemuch_last_character_name';
export const CHARACTERS_KEY = 'nikczemny_krzemuch_characters';
export const MIGRATION_PREFIX = 'nikczemny_krzemuch_migrated_';
export const SCENE_INDEX_CACHE_KEY = 'nikczemny_krzemuch_scene_idx';

// User-provided API keys + backend URL never sync to the account profile —
// they're per-device bearer credentials. Strip them before POST /auth/settings
// so we don't round-trip secret material to the account document.
export const LOCAL_ONLY_SETTINGS_KEYS = [
  'backendUrl', 'useBackend',
  'openaiApiKey', 'anthropicApiKey', 'stabilityApiKey',
];

/**
 * Strip keys that must never leave the device from a settings snapshot.
 * Non-objects pass through unchanged so callers don't need to type-check.
 */
export function sanitizeSettings(settings) {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    return settings;
  }
  const next = { ...settings };
  delete next.elevenlabsApiKey;
  return next;
}
