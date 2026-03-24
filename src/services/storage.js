import { apiClient } from './apiClient';

const CAMPAIGNS_KEY = 'nikczemny_krzemuch_campaigns';
const SETTINGS_KEY = 'nikczemny_krzemuch_settings';
const ACTIVE_CAMPAIGN_KEY = 'nikczemny_krzemuch_active';
const MUSIC_LIBRARY_KEY = 'nikczemny_krzemuch_music';
const LAST_CHARACTER_NAME_KEY = 'nikczemny_krzemuch_last_character_name';
const CHARACTERS_KEY = 'nikczemny_krzemuch_characters';
const MIGRATION_PREFIX = 'nikczemny_krzemuch_migrated_';

const LOCAL_ONLY_SETTINGS_KEYS = [
  'backendUrl', 'useBackend',
  'openaiApiKey', 'anthropicApiKey', 'stabilityApiKey', 'elevenlabsApiKey', 'sunoApiKey',
];

const TRACK_TTL_MS = 14 * 24 * 60 * 60 * 1000;

export const storage = {
  getCampaigns() {
    try {
      const data = localStorage.getItem(CAMPAIGNS_KEY);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  },

  async getCampaignsAsync() {
    if (apiClient.isConnected()) {
      try {
        return await apiClient.get('/campaigns');
      } catch (err) {
        console.warn('[storage] Backend getCampaigns failed, falling back to local:', err.message);
      }
    }
    return this.getCampaigns();
  },

  saveCampaign(gameState) {
    if (apiClient.isConnected()) {
      this._saveCampaignToBackend(gameState);
    }

    const campaigns = this.getCampaigns();
    const idx = campaigns.findIndex((c) => c.campaign.id === gameState.campaign.id);
    const { isLoading, isGeneratingScene, isGeneratingImage, isGeneratingMusic, error, ...persistable } = gameState;
    const entry = {
      ...persistable,
      lastSaved: Date.now(),
    };
    if (idx >= 0) {
      campaigns[idx] = entry;
    } else {
      campaigns.unshift(entry);
    }

    if (!this._trySave(campaigns, gameState.campaign.id)) {
      console.warn('[storage] Quota exceeded – pruning old scene images');
      const pruned = this._pruneForQuota(campaigns, gameState.campaign.id);
      if (!this._trySave(pruned, gameState.campaign.id)) {
        console.warn('[storage] Still over quota – stripping all images');
        const stripped = this._stripAllImages(pruned);
        if (!this._trySave(stripped, gameState.campaign.id)) {
          console.error('[storage] Save failed even after full prune');
          return { saved: false, pruned: true };
        }
      }
      return { saved: true, pruned: true };
    }
    return { saved: true, pruned: false };
  },

  async _saveCampaignToBackend(gameState) {
    try {
      const payload = {
        name: gameState.campaign?.name || '',
        genre: gameState.campaign?.genre || '',
        tone: gameState.campaign?.tone || '',
        data: gameState,
      };

      const backendId = gameState.campaign?.backendId;
      if (backendId) {
        await apiClient.put(`/campaigns/${backendId}`, payload);
      } else {
        const created = await apiClient.post('/campaigns', payload);
        if (gameState.campaign) {
          gameState.campaign.backendId = created.id;
          this._persistBackendId(gameState.campaign.id, created.id);
        }
      }
    } catch (err) {
      console.warn('[storage] Backend save failed:', err.message);
    }
  },

  _persistBackendId(campaignId, backendId) {
    try {
      const campaigns = this.getCampaigns();
      const idx = campaigns.findIndex((c) => c.campaign?.id === campaignId);
      if (idx >= 0) {
        campaigns[idx] = {
          ...campaigns[idx],
          campaign: { ...campaigns[idx].campaign, backendId },
        };
        localStorage.setItem(CAMPAIGNS_KEY, JSON.stringify(campaigns));
      }
    } catch (err) {
      console.warn('[storage] Failed to persist backendId:', err.message);
    }
  },

  _trySave(campaigns, activeCampaignId) {
    try {
      localStorage.setItem(CAMPAIGNS_KEY, JSON.stringify(campaigns));
      localStorage.setItem(ACTIVE_CAMPAIGN_KEY, activeCampaignId);
      return true;
    } catch (e) {
      if (e?.name === 'QuotaExceededError' || e?.code === 22 || e?.code === 1014) {
        return false;
      }
      throw e;
    }
  },

  _pruneForQuota(campaigns, activeCampaignId) {
    const KEEP_IMAGES = 3;
    const MAX_CHAT = 200;
    const MAX_COMPRESSED_HISTORY = 3000;
    return campaigns.map((c) => {
      const isActive = c.campaign.id === activeCampaignId;
      const scenes = (c.scenes || []).map((s, i, arr) => {
        if (i < arr.length - KEEP_IMAGES) {
          const { image, ...rest } = s;
          return rest;
        }
        return s;
      });
      const chatHistory = isActive
        ? (c.chatHistory || []).slice(-MAX_CHAT)
        : (c.chatHistory || []).slice(-50);

      let world = c.world;
      if (world?.compressedHistory && world.compressedHistory.length > MAX_COMPRESSED_HISTORY) {
        world = { ...world, compressedHistory: world.compressedHistory.substring(0, MAX_COMPRESSED_HISTORY) };
      }

      return { ...c, scenes, chatHistory, world };
    });
  },

  _stripAllImages(campaigns) {
    return campaigns.map((c) => ({
      ...c,
      scenes: (c.scenes || []).map(({ image, ...rest }) => rest),
    }));
  },

  loadCampaign(id) {
    const campaigns = this.getCampaigns();
    return campaigns.find((c) => c.campaign.id === id) || null;
  },

  async deleteCampaign(id) {
    const removed = this.getCampaigns().find((c) => c.campaign.id === id);
    const campaigns = this.getCampaigns().filter((c) => c.campaign.id !== id);
    localStorage.setItem(CAMPAIGNS_KEY, JSON.stringify(campaigns));
    const activeId = localStorage.getItem(ACTIVE_CAMPAIGN_KEY);
    if (activeId === id) {
      localStorage.removeItem(ACTIVE_CAMPAIGN_KEY);
    }

    const backendId = removed?.campaign?.backendId;
    if (backendId && apiClient.isConnected()) {
      try {
        await apiClient.del(`/campaigns/${backendId}`);
      } catch (err) {
        console.warn('[storage] Backend delete failed:', err.message);
      }
    }
  },

  async syncCampaigns() {
    if (!apiClient.isConnected()) return this.getCampaigns();

    try {
      const local = this.getCampaigns();
      const backendList = await apiClient.get('/campaigns');

      const merged = [];
      const localByBackendId = new Map();
      const localByCampaignId = new Map();

      for (const lc of local) {
        if (lc.campaign?.backendId) {
          localByBackendId.set(lc.campaign.backendId, lc);
        }
        if (lc.campaign?.id) {
          localByCampaignId.set(lc.campaign.id, lc);
        }
      }

      const matchedLocalCampaignIds = new Set();
      const seenBackendCampaignIds = new Map();
      const duplicateBackendIds = [];

      for (const bc of backendList) {
        const full = await apiClient.get(`/campaigns/${bc.id}`);
        const data = full.data || full;
        const frontendId = data.campaign?.id;
        const backendTime = new Date(bc.lastSaved).getTime();

        if (frontendId && seenBackendCampaignIds.has(frontendId)) {
          const prev = seenBackendCampaignIds.get(frontendId);
          if (backendTime > prev.time) {
            duplicateBackendIds.push(prev.backendId);
            seenBackendCampaignIds.set(frontendId, { backendId: bc.id, time: backendTime, data });
          } else {
            duplicateBackendIds.push(bc.id);
            continue;
          }
        } else if (frontendId) {
          seenBackendCampaignIds.set(frontendId, { backendId: bc.id, time: backendTime, data });
        }

        let localMatch = localByBackendId.get(bc.id)
          || (frontendId ? localByCampaignId.get(frontendId) : null);

        if (localMatch) {
          matchedLocalCampaignIds.add(localMatch.campaign?.id);
          const localTime = localMatch.lastSaved || 0;
          if (backendTime > localTime) {
            merged.push({
              ...data,
              campaign: { ...data.campaign, backendId: bc.id },
              lastSaved: backendTime,
            });
          } else {
            const linked = {
              ...localMatch,
              campaign: { ...localMatch.campaign, backendId: bc.id },
            };
            merged.push(linked);
            this._saveCampaignToBackend(linked);
          }
        } else {
          merged.push({
            ...data,
            campaign: { ...data.campaign, backendId: bc.id },
            lastSaved: backendTime,
          });
        }
      }

      for (const dupId of duplicateBackendIds) {
        apiClient.del(`/campaigns/${dupId}`).catch(() => {});
      }

      for (const lc of local) {
        if (!matchedLocalCampaignIds.has(lc.campaign?.id)) {
          merged.push(lc);
          if (!lc.campaign?.backendId) {
            this._saveCampaignToBackend(lc);
          }
        }
      }

      const deduped = [];
      const seenCampaignIds = new Set();
      for (const entry of merged) {
        const cid = entry.campaign?.id;
        if (!cid || !seenCampaignIds.has(cid)) {
          if (cid) seenCampaignIds.add(cid);
          deduped.push(entry);
        }
      }

      this._trySave(deduped, localStorage.getItem(ACTIVE_CAMPAIGN_KEY) || '');
      return deduped;
    } catch (err) {
      console.warn('[storage] Campaign sync failed:', err.message);
      return this.getCampaigns();
    }
  },

  getActiveCampaignId() {
    return localStorage.getItem(ACTIVE_CAMPAIGN_KEY);
  },

  getSettings() {
    try {
      const data = localStorage.getItem(SETTINGS_KEY);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  },

  saveSettings(settings) {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  },

  getMusicLibrary() {
    try {
      const data = localStorage.getItem(MUSIC_LIBRARY_KEY);
      const lib = data ? JSON.parse(data) : [];
      const now = Date.now();
      return lib.filter((t) => now - t.savedAt < TRACK_TTL_MS);
    } catch {
      return [];
    }
  },

  findMusicTrack(genre, tone, mood) {
    const lib = this.getMusicLibrary();
    return lib.find(
      (t) => t.genre === genre && t.tone === tone && t.mood === mood
    ) || null;
  },

  saveMusicTrack({ genre, tone, mood, audioUrl, title, duration, imageUrl, style }) {
    const lib = this.getMusicLibrary();
    const idx = lib.findIndex(
      (t) => t.genre === genre && t.tone === tone && t.mood === mood
    );
    const entry = { genre, tone, mood, audioUrl, title, duration, imageUrl, style, savedAt: Date.now() };
    if (idx >= 0) {
      lib[idx] = entry;
    } else {
      lib.push(entry);
    }
    localStorage.setItem(MUSIC_LIBRARY_KEY, JSON.stringify(lib));
    return entry;
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
      return data ? JSON.parse(data) : [];
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
    const entry = { ...character, updatedAt: Date.now() };
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
      for (const key of LOCAL_ONLY_SETTINGS_KEYS) {
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

  exportConfig() {
    const payload = {
      _meta: {
        app: 'nikczemny_krzemuch',
        version: 1,
        exportedAt: new Date().toISOString(),
      },
      settings: this.getSettings(),
      campaigns: this.getCampaigns(),
      activeCampaignId: this.getActiveCampaignId(),
      musicLibrary: this.getMusicLibrary(),
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

  importConfig(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target.result);
          if (!data._meta || data._meta.app !== 'nikczemny_krzemuch') {
            reject(new Error('Invalid config file'));
            return;
          }

          if (data.settings) {
            localStorage.setItem(SETTINGS_KEY, JSON.stringify(data.settings));
          }
          if (data.campaigns) {
            localStorage.setItem(CAMPAIGNS_KEY, JSON.stringify(data.campaigns));
          }
          if (data.activeCampaignId) {
            localStorage.setItem(ACTIVE_CAMPAIGN_KEY, data.activeCampaignId);
          }
          if (data.musicLibrary) {
            localStorage.setItem(MUSIC_LIBRARY_KEY, JSON.stringify(data.musicLibrary));
          }

          resolve(data.settings);
        } catch {
          reject(new Error('Failed to parse config file'));
        }
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });
  },
};
