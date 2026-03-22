import { apiClient } from './apiClient';

const CAMPAIGNS_KEY = 'obsidian_grimoire_campaigns';
const SETTINGS_KEY = 'obsidian_grimoire_settings';
const ACTIVE_CAMPAIGN_KEY = 'obsidian_grimoire_active';
const MUSIC_LIBRARY_KEY = 'obsidian_grimoire_music';
const LAST_CHARACTER_NAME_KEY = 'obsidian_grimoire_last_character_name';
const CHARACTERS_KEY = 'obsidian_grimoire_characters';

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
    const entry = {
      ...gameState,
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

      const campaigns = await apiClient.get('/campaigns');
      const existing = campaigns.find((c) => {
        try {
          return c.name === gameState.campaign?.id || c.id === gameState.campaign?.backendId;
        } catch { return false; }
      });

      if (existing) {
        await apiClient.put(`/campaigns/${existing.id}`, payload);
      } else {
        const created = await apiClient.post('/campaigns', payload);
        if (gameState.campaign) {
          gameState.campaign.backendId = created.id;
        }
      }
    } catch (err) {
      console.warn('[storage] Backend save failed:', err.message);
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

  deleteCampaign(id) {
    const campaigns = this.getCampaigns().filter((c) => c.campaign.id !== id);
    localStorage.setItem(CAMPAIGNS_KEY, JSON.stringify(campaigns));
    const activeId = localStorage.getItem(ACTIVE_CAMPAIGN_KEY);
    if (activeId === id) {
      localStorage.removeItem(ACTIVE_CAMPAIGN_KEY);
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

  async getCharactersAsync() {
    if (apiClient.isConnected()) {
      try {
        return await apiClient.get('/characters');
      } catch (err) {
        console.warn('[storage] Backend getCharacters failed, falling back to local:', err.message);
      }
    }
    return this.getCharacters();
  },

  async saveCharacter(character) {
    if (apiClient.isConnected()) {
      try {
        const payload = {
          name: character.name,
          species: character.species,
          careerData: character.career,
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
          portraitUrl: character.portraitUrl || '',
          campaignCount: character.campaignCount || 0,
        };

        let saved;
        if (character.backendId) {
          saved = await apiClient.put(`/characters/${character.backendId}`, payload);
        } else {
          saved = await apiClient.post('/characters', payload);
        }

        character.backendId = saved.id;
      } catch (err) {
        console.warn('[storage] Backend saveCharacter failed:', err.message);
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
      } catch (err) {
        console.warn('[storage] Backend deleteCharacter failed:', err.message);
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
        backstory: character.backstory,
      });
    } catch (err) {
      console.warn('[storage] Character sync failed:', err.message);
    }
  },

  exportConfig() {
    const payload = {
      _meta: {
        app: 'obsidian_grimoire',
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
    a.download = `obsidian-grimoire-config-${new Date().toISOString().slice(0, 10)}.json`;
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
          if (!data._meta || data._meta.app !== 'obsidian_grimoire') {
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
