import { apiClient } from '../apiClient';
import { normalizeCharacterAge } from '../characterAge';
import {
  CAMPAIGNS_KEY,
  LOCAL_ONLY_SETTINGS_KEYS,
  MIGRATION_PREFIX,
} from './keys.js';
import { getCharacters } from './characters.js';
import { getSettings } from './settings.js';

/**
 * One-way upload of pre-account local content to the signed-in user's
 * account. Two migrations live here:
 *
 *   - campaigns: the legacy multi-campaign blob at `CAMPAIGNS_KEY`
 *     (pre-snapshot era) gets POSTed to `/campaigns` then removed.
 *   - characters + settings: on first sign-in per-user, uploads the local
 *     library + UI settings if the account doesn't already have its own.
 *
 * Both use a per-target marker key under `MIGRATION_PREFIX` so a successful
 * run never fires again.
 */
export async function migrateLocalCampaignsToBackend() {
  const MIGRATION_CAMPAIGNS_KEY = `${MIGRATION_PREFIX}campaigns`;
  if (localStorage.getItem(MIGRATION_CAMPAIGNS_KEY)) return;

  let localCampaigns;
  try {
    const data = localStorage.getItem(CAMPAIGNS_KEY);
    if (!data) return;
    localCampaigns = JSON.parse(data);
  } catch {
    return;
  }

  if (!Array.isArray(localCampaigns) || localCampaigns.length === 0) return;

  for (const entry of localCampaigns) {
    if (!entry?.campaign?.name && !entry?.character?.name) continue;
    if (entry.campaign?.backendId) continue;
    try {
      const { scenes, isLoading, isGeneratingScene, isGeneratingImage, error, ...rest } = entry;
      const coreState = { ...rest };
      const characterState = coreState.character || {};
      delete coreState.character;
      const created = await apiClient.post('/campaigns', {
        name: entry.campaign?.name || '',
        genre: entry.campaign?.genre || '',
        tone: entry.campaign?.tone || '',
        coreState,
        characterState,
      }, { idempotent: true });
      if (scenes?.length) {
        try {
          await apiClient.post(`/ai/campaigns/${created.id}/scenes/bulk`, {
            scenes: scenes.map((s, i) => ({ ...s, sceneIndex: i })),
          }, { idempotent: true });
        } catch { /* best-effort */ }
      }
    } catch (err) {
      console.warn('[storage] Campaign migration failed for:', entry.campaign?.name, err.message);
    }
  }

  localStorage.setItem(MIGRATION_CAMPAIGNS_KEY, Date.now().toString());
  try {
    localStorage.removeItem(CAMPAIGNS_KEY);
  } catch { /* ignore */ }
}

export async function migrateLocalDataToAccount(userId) {
  const markerKey = `${MIGRATION_PREFIX}${userId}`;
  if (localStorage.getItem(markerKey)) return;

  try {
    const localChars = getCharacters();
    if (localChars.length > 0) {
      let backendChars;
      try {
        backendChars = await apiClient.get('/characters');
      } catch {
        backendChars = [];
      }
      const backendNames = new Set(
        backendChars.map((c) => (c.name || '').trim().toLowerCase()),
      );

      for (const char of localChars) {
        const nameKey = (char.name || '').trim().toLowerCase();
        if (nameKey && backendNames.has(nameKey)) continue;

        try {
          await apiClient.post('/characters', {
            name: char.name,
            age: normalizeCharacterAge(char.age),
            species: char.species,
            attributes: char.attributes,
            skills: char.skills,
            wounds: char.wounds ?? 0,
            maxWounds: char.maxWounds ?? 0,
            movement: char.movement ?? 4,
            characterLevel: char.characterLevel ?? 1,
            characterXp: char.characterXp ?? 0,
            attributePoints: char.attributePoints ?? 0,
            backstory: char.backstory || '',
            inventory: char.inventory || [],
            money: char.money || { gold: 0, silver: 0, copper: 0 },
            portraitUrl: char.portraitUrl || '',
            campaignCount: char.campaignCount ?? 0,
          });
        } catch (err) {
          console.warn(`[storage] Failed to migrate character "${char.name}":`, err.message);
        }
      }
    }

    const localSettings = getSettings();
    if (localSettings) {
      const accountData = await apiClient.get('/auth/me');
      const accountSettings = accountData.settings || {};
      // Empty-ish account settings has only the two defaults set by the
      // backend; anything past that means the user already customized and
      // we must NOT overwrite with local defaults.
      const hasAccountSettings = Object.keys(accountSettings).length > 2;

      if (!hasAccountSettings) {
        const uiSettings = { ...localSettings };
        for (const key of LOCAL_ONLY_SETTINGS_KEYS) {
          delete uiSettings[key];
        }
        await apiClient.put('/auth/settings', { settings: uiSettings });
      }
    }

    localStorage.setItem(markerKey, Date.now().toString());
  } catch (err) {
    console.warn('[storage] Migration failed:', err.message);
  }
}
