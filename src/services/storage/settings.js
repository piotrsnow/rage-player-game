import { apiClient } from '../apiClient';
import {
  LAST_CHARACTER_NAME_KEY,
  LOCAL_ONLY_KEY,
  LOCAL_ONLY_SETTINGS_KEYS,
  SETTINGS_KEY,
  sanitizeSettings,
} from './keys.js';

// Legacy full-blob reader. Settings now live on the user account; this only
// runs during the one-shot upload-then-clear migration in migrations.js and
// when importing an old config file.
export function getSettings() {
  try {
    const data = localStorage.getItem(SETTINGS_KEY);
    return data ? sanitizeSettings(JSON.parse(data)) : null;
  } catch {
    return null;
  }
}

// Legacy writer — kept only because importExport's `importConfig` historically
// dumped the imported blob straight into localStorage. New callers must go
// through `importSettings` in SettingsContext instead so the value flows to
// React state and then to the account via the existing server-sync effect.
export function saveSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(sanitizeSettings(settings)));
}

export function clearLegacySettings() {
  localStorage.removeItem(SETTINGS_KEY);
}

// Tiny on-device blob with just the server-coordinates the FE needs to even
// boot. Holds `backendUrl` + `useBackend`; everything else lives on the
// account. Read at app start, written when the user toggles backend in UI.
//
// Backfill path: if the new key is missing but the legacy full-settings blob
// still exists, lift just the two coordinates out of it so existing users
// keep their backend wiring after the localStorage→account migration.
export function readLocalOnlySettings() {
  try {
    const raw = localStorage.getItem(LOCAL_ONLY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        const out = {};
        for (const key of LOCAL_ONLY_SETTINGS_KEYS) {
          if (parsed[key] !== undefined) out[key] = parsed[key];
        }
        return out;
      }
    }
  } catch { /* fall through to legacy lookup */ }

  try {
    const legacy = localStorage.getItem(SETTINGS_KEY);
    if (!legacy) return {};
    const parsed = JSON.parse(legacy);
    if (!parsed || typeof parsed !== 'object') return {};
    const out = {};
    for (const key of LOCAL_ONLY_SETTINGS_KEYS) {
      if (parsed[key] !== undefined) out[key] = parsed[key];
    }
    return out;
  } catch {
    return {};
  }
}

export function writeLocalOnlySettings(values) {
  const out = {};
  for (const key of LOCAL_ONLY_SETTINGS_KEYS) {
    if (values && values[key] !== undefined) out[key] = values[key];
  }
  localStorage.setItem(LOCAL_ONLY_KEY, JSON.stringify(out));
}

export function getLastCharacterName() {
  return localStorage.getItem(LAST_CHARACTER_NAME_KEY) || '';
}

export function saveLastCharacterName(name) {
  if (name) {
    localStorage.setItem(LAST_CHARACTER_NAME_KEY, name);
  }
}

/**
 * Account-synced settings — the `/auth/me` GET + `/auth/settings` PUT pair.
 * Used when a user signs in so DM presets follow them across devices.
 * API keys + backendUrl are local-only; `saveSettingsToAccount` strips them
 * before the PUT (LOCAL_ONLY_SETTINGS_KEYS in keys.js is the allow-list).
 */
export async function getSettingsFromAccount() {
  if (!apiClient.isConnected()) return null;
  try {
    const data = await apiClient.get('/auth/me');
    return data.settings || null;
  } catch (err) {
    console.warn('[storage] Failed to load settings from account:', err.message);
    return null;
  }
}

export async function saveSettingsToAccount(settings) {
  if (!apiClient.isConnected()) return false;
  try {
    const uiSettings = sanitizeSettings({ ...settings });
    for (const key of LOCAL_ONLY_SETTINGS_KEYS) {
      delete uiSettings[key];
    }
    await apiClient.put('/auth/settings', { settings: uiSettings });
    return true;
  } catch (err) {
    console.warn('[storage] Failed to save settings to account:', err.message);
    return false;
  }
}
