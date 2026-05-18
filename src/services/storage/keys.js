// Shared localStorage keys + small helpers used by every storage sub-module.
//
// Keys live here (not inline in each module) so renaming one doesn't force
// you to grep the whole storage surface — one edit, one round of testing.

export const CAMPAIGNS_KEY = 'nikczemny_krzemuch_campaigns';
export const CURRENT_CAMPAIGN_KEY = 'nikczemny_krzemuch_current_campaign';
// Legacy full-settings blob — only read during one-shot account migration
// (see migrations.js) and during legacy config-import; never written anymore.
export const SETTINGS_KEY = 'nikczemny_krzemuch_settings';
// Tiny on-device blob holding ONLY the server-coordinates the FE needs to
// even start: where to talk to the backend and whether to talk at all.
// Everything else lives on the user account (PUT /auth/settings).
export const LOCAL_ONLY_KEY = 'nikczemny_krzemuch_local_only';
export const ACTIVE_CAMPAIGN_KEY = 'nikczemny_krzemuch_active';
export const LAST_CHARACTER_NAME_KEY = 'nikczemny_krzemuch_last_character_name';
export const CHARACTERS_KEY = 'nikczemny_krzemuch_characters';
export const MIGRATION_PREFIX = 'nikczemny_krzemuch_migrated_';
export const SCENE_INDEX_CACHE_KEY = 'nikczemny_krzemuch_scene_idx';

// Per-device local-only settings that never sync to the account profile.
// Kept because `backendUrl`/`useBackend` are literally the account
// coordinates — syncing them via /auth/settings would create a loop.
export const LOCAL_ONLY_SETTINGS_KEYS = [
  'backendUrl', 'useBackend', 'appZoom', 'narrationPlaybackBoost',
];

/**
 * Strip legacy per-user API key fields from a settings snapshot before
 * sending it to the server or reading it back. API keys are now env-only
 * on the backend, so these entries must never leave (or reach) the FE state.
 */
export function sanitizeSettings(settings) {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    return settings;
  }
  const next = { ...settings };
  delete next.elevenlabsApiKey;
  delete next.openaiApiKey;
  delete next.anthropicApiKey;
  delete next.stabilityApiKey;
  delete next.geminiApiKey;
  delete next.meshyApiKey;
  return next;
}
