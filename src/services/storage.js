import { apiClient } from './apiClient';
import { normalizeCharacterAge } from './characterAge';

const CAMPAIGNS_KEY = 'nikczemny_krzemuch_campaigns';
const CURRENT_CAMPAIGN_KEY = 'nikczemny_krzemuch_current_campaign';
const SETTINGS_KEY = 'nikczemny_krzemuch_settings';
const ACTIVE_CAMPAIGN_KEY = 'nikczemny_krzemuch_active';
const LAST_CHARACTER_NAME_KEY = 'nikczemny_krzemuch_last_character_name';
const CHARACTERS_KEY = 'nikczemny_krzemuch_characters';
const MIGRATION_PREFIX = 'nikczemny_krzemuch_migrated_';

const LOCAL_ONLY_SETTINGS_KEYS = [
  'backendUrl', 'useBackend',
  'openaiApiKey', 'anthropicApiKey', 'stabilityApiKey',
];
const GLOBAL_VOICE_SETTINGS_KEYS = ['elevenlabsVoiceId', 'elevenlabsVoiceName', 'characterVoices'];

const _pendingBackendSaves = new Map();
const _sceneIndexCache = new Map();

function sanitizeSettings(settings) {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    return settings;
  }
  const next = { ...settings };
  delete next.elevenlabsApiKey;
  return next;
}

function _parseBackendCampaign(full) {
  let state = typeof full.coreState === 'string'
    ? JSON.parse(full.coreState) : (full.coreState || {});

  if (full.scenes?.length) {
    state.scenes = full.scenes.map((s) => ({
      ...s,
      suggestedActions: typeof s.suggestedActions === 'string'
        ? JSON.parse(s.suggestedActions) : s.suggestedActions || [],
      dialogueSegments: typeof s.dialogueSegments === 'string'
        ? JSON.parse(s.dialogueSegments) : s.dialogueSegments || [],
      diceRoll: typeof s.diceRoll === 'string'
        ? JSON.parse(s.diceRoll) : s.diceRoll,
      stateChanges: typeof s.stateChanges === 'string'
        ? JSON.parse(s.stateChanges) : s.stateChanges,
    }));
  }

  if (!state.campaign) state.campaign = {};
  state.campaign.backendId = full.id;
  state.lastSaved = new Date(full.lastSaved || full.updatedAt || full.createdAt).getTime();

  return state;
}

export const storage = {
  async getCampaigns() {
    let campaigns = [];

    if (apiClient.isConnected()) {
      try {
        const list = await apiClient.get('/campaigns');
        campaigns = list.map((c) => ({ ...c, source: 'remote' }));
      } catch { /* offline or error — continue with local only */ }
    }

    const local = this.loadLocalSnapshot();
    if (local?.campaign) {
      const localId = local.campaign.backendId || local.campaign.id;
      const alreadyInRemote = campaigns.some((c) => c.id === localId);
      if (!alreadyInRemote) {
        campaigns.unshift({
          id: localId,
          name: local.campaign.name || '',
          genre: local.campaign.genre || '',
          tone: local.campaign.tone || '',
          lastSaved: local.lastSaved || Date.now(),
          characterName: local.character?.name || '',
          characterCareer: local.character?.career?.name || '',
          characterTier: local.character?.career?.tier || 1,
          sceneCount: local.scenes?.length || 0,
          totalCost: local.aiCosts?.total || 0,
          source: 'local',
        });
      }
    }

    return campaigns;
  },

  async saveCampaign(gameState) {
    const campaignId = gameState.campaign?.id;
    if (!campaignId) return { saved: false };

    this.saveLocalSnapshot(gameState);

    const existing = _pendingBackendSaves.get(campaignId);
    if (existing) {
      try { await existing; } catch { /* ignore */ }
    }

    const promise = this._doSave(gameState);
    _pendingBackendSaves.set(campaignId, promise);
    try {
      await promise;
      return { saved: true };
    } catch (err) {
      console.warn('[storage] Save failed:', err.message);
      return { saved: false };
    } finally {
      if (_pendingBackendSaves.get(campaignId) === promise) {
        _pendingBackendSaves.delete(campaignId);
      }
    }
  },

  async _doSave(gameState) {
    const { scenes, isLoading, isGeneratingScene, isGeneratingImage, error, ...rest } = gameState;
    const coreState = { ...rest };

    const payload = {
      name: gameState.campaign?.name || '',
      genre: gameState.campaign?.genre || '',
      tone: gameState.campaign?.tone || '',
      coreState,
    };

    const backendId = gameState.campaign?.backendId;
    if (backendId) {
      await apiClient.put(`/campaigns/${backendId}`, payload);
      await this._saveNewScenes(backendId, scenes);
    } else {
      const created = await apiClient.post('/campaigns', payload);
      if (gameState.campaign) {
        gameState.campaign.backendId = created.id;
      }
      if (scenes?.length) {
        for (let i = 0; i < scenes.length; i++) {
          try {
            await apiClient.post(`/ai/campaigns/${created.id}/scenes`, {
              ...scenes[i],
              sceneIndex: i,
            });
          } catch (err) {
            console.warn('[storage] Scene save failed:', err.message);
          }
        }
        _sceneIndexCache.set(created.id, scenes.length - 1);
      }
    }

    this.setActiveCampaignId(gameState.campaign.backendId || gameState.campaign.id);
  },

  async _saveNewScenes(backendId, scenes) {
    if (!scenes?.length) return;
    const lastSaved = _sceneIndexCache.get(backendId) ?? -1;
    const newScenes = scenes
      .map((scene, i) => ({ scene, i }))
      .filter(({ i }) => i > lastSaved);
    for (const { scene, i } of newScenes) {
      try {
        await apiClient.post(`/ai/campaigns/${backendId}/scenes`, {
          ...scene,
          sceneIndex: i,
        });
      } catch (err) {
        console.warn('[storage] Scene save failed:', err.message);
      }
    }
    _sceneIndexCache.set(backendId, scenes.length - 1);
  },

  async loadCampaign(backendId) {
    if (apiClient.isConnected()) {
      try {
        const full = await apiClient.get(`/campaigns/${backendId}`);
        const state = _parseBackendCampaign(full);
        if (state.scenes?.length) {
          _sceneIndexCache.set(backendId, state.scenes.length - 1);
        }
        return state;
      } catch { /* fall through to local snapshot */ }
    }

    const local = this.loadLocalSnapshot();
    if (local?.campaign) {
      const localId = local.campaign.backendId || local.campaign.id;
      if (localId === backendId) return local;
    }
    return null;
  },

  async deleteCampaign(backendId) {
    await apiClient.del(`/campaigns/${backendId}`);
    const activeId = this.getActiveCampaignId();
    if (activeId === backendId) {
      localStorage.removeItem(ACTIVE_CAMPAIGN_KEY);
    }
    const local = this.loadLocalSnapshot();
    if (local?.campaign) {
      const localId = local.campaign.backendId || local.campaign.id;
      if (localId === backendId) this.clearLocalSnapshot();
    }
    _sceneIndexCache.delete(backendId);
  },

  async migrateLocalCampaignsToBackend() {
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
        const created = await apiClient.post('/campaigns', {
          name: entry.campaign?.name || '',
          genre: entry.campaign?.genre || '',
          tone: entry.campaign?.tone || '',
          coreState,
        });
        if (scenes?.length) {
          for (let i = 0; i < scenes.length; i++) {
            try {
              await apiClient.post(`/ai/campaigns/${created.id}/scenes`, {
                ...scenes[i],
                sceneIndex: i,
              });
            } catch { /* best-effort */ }
          }
        }
      } catch (err) {
        console.warn('[storage] Campaign migration failed for:', entry.campaign?.name, err.message);
      }
    }

    localStorage.setItem(MIGRATION_CAMPAIGNS_KEY, Date.now().toString());
    try {
      localStorage.removeItem(CAMPAIGNS_KEY);
    } catch { /* ignore */ }
  },

  getActiveCampaignId() {
    return localStorage.getItem(ACTIVE_CAMPAIGN_KEY);
  },

  setActiveCampaignId(id) {
    if (id) {
      localStorage.setItem(ACTIVE_CAMPAIGN_KEY, id);
    } else {
      localStorage.removeItem(ACTIVE_CAMPAIGN_KEY);
    }
  },

  saveLocalSnapshot(gameState) {
    try {
      const { isLoading, isGeneratingScene, isGeneratingImage, error, ...clean } = gameState;
      const snapshot = { ...clean };
      if (snapshot.scenes?.length > 10) {
        snapshot.scenes = snapshot.scenes.slice(-10);
      }
      snapshot._snapshotTime = Date.now();
      localStorage.setItem(CURRENT_CAMPAIGN_KEY, JSON.stringify(snapshot));
      localStorage.removeItem(CAMPAIGNS_KEY);
    } catch (e) {
      console.warn('[storage] Failed to save local snapshot:', e.message);
    }
  },

  loadLocalSnapshot() {
    try {
      const data = localStorage.getItem(CURRENT_CAMPAIGN_KEY);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  },

  clearLocalSnapshot() {
    localStorage.removeItem(CURRENT_CAMPAIGN_KEY);
  },

  getSettings() {
    try {
      const data = localStorage.getItem(SETTINGS_KEY);
      return data ? sanitizeSettings(JSON.parse(data)) : null;
    } catch {
      return null;
    }
  },

  saveSettings(settings) {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(sanitizeSettings(settings)));
  },

  getLastCharacterName() {
    return localStorage.getItem(LAST_CHARACTER_NAME_KEY) || '';
  },

  saveLastCharacterName(name) {
    if (name) {
      localStorage.setItem(LAST_CHARACTER_NAME_KEY, name);
    }
  },

  getCharacters() {
    try {
      const data = localStorage.getItem(CHARACTERS_KEY);
      const parsed = data ? JSON.parse(data) : [];
      return Array.isArray(parsed)
        ? parsed.map((character) => ({
            ...character,
            age: normalizeCharacterAge(character?.age),
          }))
        : [];
    } catch {
      return [];
    }
  },

  async _findBackendCharacterByName(name) {
    if (!name || !apiClient.isConnected()) return null;
    try {
      const all = await apiClient.get('/characters');
      return all.find((c) => c.name === name) || null;
    } catch {
      return null;
    }
  },

  _deduplicateCharacters(chars) {
    if (!Array.isArray(chars) || chars.length === 0) return chars;
    const seen = new Map();
    for (const ch of chars) {
      const key = (ch.name || '').trim().toLowerCase();
      if (!key) { seen.set(`__unnamed_${seen.size}`, ch); continue; }
      const existing = seen.get(key);
      if (!existing) {
        seen.set(key, ch);
      } else {
        const existingTime = existing.updatedAt ? new Date(existing.updatedAt).getTime() : 0;
        const currentTime = ch.updatedAt ? new Date(ch.updatedAt).getTime() : 0;
        if (currentTime > existingTime) {
          seen.set(key, ch);
        }
      }
    }
    return Array.from(seen.values());
  },

  findMatchingLibraryCharacter(campaignChar, libraryChars) {
    if (!campaignChar || !Array.isArray(libraryChars) || libraryChars.length === 0) return null;
    if (campaignChar.backendId) {
      const byBackend = libraryChars.find((c) => c.backendId === campaignChar.backendId || c.id === campaignChar.backendId);
      if (byBackend) return byBackend;
    }
    if (campaignChar.localId) {
      const byLocal = libraryChars.find((c) => c.localId === campaignChar.localId);
      if (byLocal) return byLocal;
    }
    const name = (campaignChar.name || '').trim().toLowerCase();
    if (name) {
      const byName = libraryChars.find((c) => (c.name || '').trim().toLowerCase() === name);
      if (byName) return byName;
    }
    return null;
  },

  async getCharactersAsync() {
    let chars;
    if (apiClient.isConnected()) {
      try {
        chars = await apiClient.get('/characters');
      } catch (err) {
        console.warn('[storage] Backend getCharacters failed, falling back to local:', err.message);
        chars = this.getCharacters();
      }
    } else {
      chars = this.getCharacters();
    }
    return this._deduplicateCharacters(chars);
  },

  async saveCharacter(character) {
    if (apiClient.isConnected()) {
      try {
        const payload = {
          name: character.name,
          age: normalizeCharacterAge(character.age),
          species: character.species,
          careerData: character.career || character.careerData,
          characteristics: character.characteristics,
          advances: character.advances,
          skills: character.skills,
          talents: character.talents,
          wounds: character.wounds,
          maxWounds: character.maxWounds,
          movement: character.movement,
          fate: character.fate,
          resilience: character.resilience,
          xp: character.xp,
          xpSpent: character.xpSpent,
          backstory: character.backstory,
          inventory: character.inventory,
          customAttackPresets: character.customAttackPresets || [],
          money: character.money || { gold: 0, silver: 0, copper: 0 },
          portraitUrl: character.portraitUrl || '',
          campaignCount: character.campaignCount || 0,
          voiceId: character.voiceId || null,
          voiceName: character.voiceName || null,
        };

        let saved;
        if (character.backendId) {
          saved = await apiClient.put(`/characters/${character.backendId}`, payload);
        } else {
          const existing = await this._findBackendCharacterByName(character.name);
          if (existing) {
            saved = await apiClient.put(`/characters/${existing.id}`, payload);
          } else {
            saved = await apiClient.post('/characters', payload);
          }
        }

        return {
          ...character,
          age: normalizeCharacterAge(saved.age ?? character.age),
          backendId: saved.id,
          career: saved.careerData || character.career,
          updatedAt: saved.updatedAt ? new Date(saved.updatedAt).getTime() : Date.now(),
        };
      } catch (err) {
        console.warn('[storage] Backend saveCharacter failed, falling back to local:', err.message);
      }
    }

    const characters = this.getCharacters();
    const localId = character.localId || character.backendId || `char_${Date.now()}`;
    character.localId = localId;
    const idx = characters.findIndex(
      (c) => c.localId === localId || (c.backendId && c.backendId === character.backendId)
    );
    const entry = { ...character, age: normalizeCharacterAge(character.age), updatedAt: Date.now() };
    if (idx >= 0) {
      characters[idx] = entry;
    } else {
      characters.unshift(entry);
    }
    try {
      localStorage.setItem(CHARACTERS_KEY, JSON.stringify(characters));
    } catch (e) {
      console.warn('[storage] Failed to save characters to localStorage:', e.message);
    }
    return entry;
  },

  async deleteCharacter(id) {
    if (apiClient.isConnected()) {
      try {
        await apiClient.del(`/characters/${id}`);
        return;
      } catch (err) {
        console.warn('[storage] Backend deleteCharacter failed, falling back to local:', err.message);
      }
    }

    const characters = this.getCharacters().filter(
      (c) => c.localId !== id && c.backendId !== id
    );
    localStorage.setItem(CHARACTERS_KEY, JSON.stringify(characters));
  },

  async loadCharacter(id) {
    if (apiClient.isConnected()) {
      try {
        const char = await apiClient.get(`/characters/${id}`);
        return {
          ...char,
          age: normalizeCharacterAge(char.age),
          career: char.careerData,
          backendId: char.id,
        };
      } catch (err) {
        console.warn('[storage] Backend loadCharacter failed, falling back to local:', err.message);
      }
    }
    const characters = this.getCharacters();
    return characters.find((c) => c.localId === id || c.backendId === id) || null;
  },

  async syncCharacterFromGame(character) {
    if (!character?.backendId || !apiClient.isConnected()) return;
    try {
      await apiClient.put(`/characters/${character.backendId}`, {
        age: normalizeCharacterAge(character.age),
        careerData: character.career,
        characteristics: character.characteristics,
        advances: character.advances,
        skills: character.skills,
        talents: character.talents,
        wounds: character.wounds,
        maxWounds: character.maxWounds,
        fate: character.fate,
        resilience: character.resilience,
        xp: character.xp,
        xpSpent: character.xpSpent,
        inventory: character.inventory,
        customAttackPresets: character.customAttackPresets || [],
        money: character.money || { gold: 0, silver: 0, copper: 0 },
        backstory: character.backstory,
        voiceId: character.voiceId || null,
        voiceName: character.voiceName || null,
      });
    } catch (err) {
      console.warn('[storage] Character sync failed:', err.message);
    }
  },

  async getSettingsFromAccount() {
    if (!apiClient.isConnected()) return null;
    try {
      const data = await apiClient.get('/auth/me');
      return data.settings || null;
    } catch (err) {
      console.warn('[storage] Failed to load settings from account:', err.message);
      return null;
    }
  },

  async saveSettingsToAccount(settings) {
    if (!apiClient.isConnected()) return false;
    try {
      const uiSettings = { ...settings };
      for (const key of [...LOCAL_ONLY_SETTINGS_KEYS, ...GLOBAL_VOICE_SETTINGS_KEYS]) {
        delete uiSettings[key];
      }
      await apiClient.put('/auth/settings', { settings: uiSettings });
      return true;
    } catch (err) {
      console.warn('[storage] Failed to save settings to account:', err.message);
      return false;
    }
  },

  async migrateLocalDataToAccount(userId) {
    const markerKey = `${MIGRATION_PREFIX}${userId}`;
    if (localStorage.getItem(markerKey)) return;

    try {
      const localChars = this.getCharacters();
      if (localChars.length > 0) {
        let backendChars;
        try {
          backendChars = await apiClient.get('/characters');
        } catch {
          backendChars = [];
        }
        const backendNames = new Set(
          backendChars.map((c) => (c.name || '').trim().toLowerCase())
        );

        for (const char of localChars) {
          const nameKey = (char.name || '').trim().toLowerCase();
          if (nameKey && backendNames.has(nameKey)) continue;

          try {
            await apiClient.post('/characters', {
              name: char.name,
              age: normalizeCharacterAge(char.age),
              species: char.species,
              careerData: char.career || char.careerData,
              characteristics: char.characteristics,
              advances: char.advances,
              skills: char.skills,
              talents: char.talents,
              wounds: char.wounds ?? 0,
              maxWounds: char.maxWounds ?? 0,
              movement: char.movement ?? 4,
              fate: char.fate ?? 0,
              resilience: char.resilience ?? 0,
              xp: char.xp ?? 0,
              xpSpent: char.xpSpent ?? 0,
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

      const localSettings = this.getSettings();
      if (localSettings) {
        const accountData = await apiClient.get('/auth/me');
        const accountSettings = accountData.settings || {};
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
  },

  async exportConfig() {
    let campaigns = [];
    try {
      const list = await apiClient.get('/campaigns');
      const full = await Promise.all(
        list.map((c) => apiClient.get(`/campaigns/${c.id}`).then(_parseBackendCampaign).catch(() => null)),
      );
      campaigns = full.filter(Boolean);
    } catch { /* offline — export settings only */ }

    const payload = {
      _meta: {
        app: 'nikczemny_krzemuch',
        version: 2,
        exportedAt: new Date().toISOString(),
      },
      settings: sanitizeSettings(this.getSettings()),
      campaigns,
      activeCampaignId: this.getActiveCampaignId(),
    };
    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nikczemny-krzemuch-config-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  async importConfig(file) {
    const text = await file.text();
    const data = JSON.parse(text);
    if (!data._meta || data._meta.app !== 'nikczemny_krzemuch') {
      throw new Error('Invalid config file');
    }

    if (data.settings) {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(sanitizeSettings(data.settings)));
    }

    if (data.campaigns && Array.isArray(data.campaigns)) {
      for (const entry of data.campaigns) {
        if (!entry?.campaign) continue;
        try {
          await this.saveCampaign(entry);
        } catch (err) {
          console.warn('[storage] Import: failed to save campaign:', entry.campaign?.name, err.message);
        }
      }
    }

    return sanitizeSettings(data.settings);
  },
};
