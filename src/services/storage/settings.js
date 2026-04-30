import { apiClient } from '../apiClient';
import {
  LAST_CHARACTER_NAME_KEY,
  LOCAL_ONLY_SETTINGS_KEYS,
  SETTINGS_KEY,
  sanitizeSettings,
} from './keys.js';

export function getSettings() {
  try {
    const data = localStorage.getItem(SETTINGS_KEY);
    return data ? sanitizeSettings(JSON.parse(data)) : null;
  } catch {
    return null;
  }
}

export function saveSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(sanitizeSettings(settings)));
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
