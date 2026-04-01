import { apiClient } from './apiClient';
import { normalizeCharacterAge } from './characterAge';

const CAMPAIGNS_KEY = 'nikczemny_krzemuch_campaigns';
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

function sanitizeSettings(settings) {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    return settings;
  }
  const next = { ...settings };
  delete next.elevenlabsApiKey;
  return next;
}

export const storage = {
  getCampaigns() {
    try {
      const data = localStorage.getItem(CAMPAIGNS_KEY);
      if (!data) return [];
      const all = JSON.parse(data);
      return all.filter((c) => !this._isEmptyCampaign(c));
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
    const backendConnected = apiClient.isConnected();
    if (backendConnected) {
      this._saveCampaignToBackend(gameState);
    }

    const campaigns = this.getCampaigns();
    const idx = campaigns.findIndex((c) => c.campaign.id === gameState.campaign.id);
    const { isLoading, isGeneratingScene, isGeneratingImage, error, ...persistable } = gameState;
    const entry = {
      ...persistable,
      lastSaved: Date.now(),
    };
    if (idx >= 0) {
      campaigns[idx] = entry;
    } else {
      campaigns.unshift(entry);
    }

    if (this._trySave(campaigns, gameState.campaign.id)) {
      return { saved: true, pruned: false };
    }

    console.warn('[storage] Quota exceeded – pruning old scene images');
    let pruned = this._pruneForQuota(campaigns, gameState.campaign.id);
    if (this._trySave(pruned, gameState.campaign.id)) {
      return { saved: true, pruned: true };
    }

    console.warn('[storage] Still over quota – stripping all images');
    let stripped = this._stripAllImages(pruned);
    if (this._trySave(stripped, gameState.campaign.id)) {
      return { saved: true, pruned: true };
    }

    if (backendConnected) {
      console.warn('[storage] Still over quota – dropping non-active campaigns from localStorage (backend has them)');
      const activeOnly = stripped.filter((c) => c.campaign.id === gameState.campaign.id);
      if (this._trySave(activeOnly, gameState.campaign.id)) {
        return { saved: true, pruned: true };
      }

      console.warn('[storage] Still over quota – deep-pruning active campaign');
      const deepPruned = this._deepPruneForQuota(activeOnly, gameState.campaign.id);
      if (this._trySave(deepPruned, gameState.campaign.id)) {
        return { saved: true, pruned: true };
      }
    }

    console.warn('[storage] Still over quota – deep-pruning all campaigns');
    const deepPruned = this._deepPruneForQuota(
      this._stripAllImages(this._pruneForQuota(campaigns, gameState.campaign.id)),
      gameState.campaign.id,
    );
    if (this._trySave(deepPruned, gameState.campaign.id)) {
      return { saved: true, pruned: true };
    }

    console.error('[storage] Save failed even after full prune');
    return { saved: false, pruned: true };
  },

  async _saveCampaignToBackend(gameState) {
    const campaignId = gameState.campaign?.id;
    if (!campaignId) return;

    const existing = _pendingBackendSaves.get(campaignId);
    if (existing) {
      try { await existing; } catch { /* ignore */ }
    }

    const promise = this._doSaveCampaignToBackend(gameState);
    _pendingBackendSaves.set(campaignId, promise);
    try {
      await promise;
    } finally {
      if (_pendingBackendSaves.get(campaignId) === promise) {
        _pendingBackendSaves.delete(campaignId);
      }
    }
  },

  async _doSaveCampaignToBackend(gameState) {
    try {
      // Build lean coreState (everything except scenes, which are saved separately)
      const { scenes, isLoading, isGeneratingScene, isGeneratingImage, error, ...rest } = gameState;
      const coreState = { ...rest };
      // Keep only last 10 chat messages in coreState
      if (coreState.chatHistory?.length > 10) {
        coreState.chatHistory = coreState.chatHistory.slice(-10);
      }

      const payload = {
        name: gameState.campaign?.name || '',
        genre: gameState.campaign?.genre || '',
        tone: gameState.campaign?.tone || '',
        coreState,
      };

      const backendId = gameState.campaign?.backendId
        || this._getLocalBackendId(gameState.campaign.id);
      if (backendId) {
        await apiClient.put(`/campaigns/${backendId}`, payload);
        if (!gameState.campaign.backendId) {
          gameState.campaign.backendId = backendId;
        }

        // Save new scenes incrementally
        if (scenes?.length) {
          const lastSavedIndex = this._getLastSavedSceneIndex(backendId);
          const newScenes = scenes.filter((_, i) => i > lastSavedIndex);
          for (const scene of newScenes) {
            try {
              await apiClient.post(`/ai/campaigns/${backendId}/scenes`, {
                ...scene,
                sceneIndex: scenes.indexOf(scene),
              });
            } catch (err) {
              console.warn('[storage] Scene save failed:', err.message);
            }
          }
          this._setLastSavedSceneIndex(backendId, scenes.length - 1);
        }
      } else {
        const created = await apiClient.post('/campaigns', payload);
        if (gameState.campaign) {
          gameState.campaign.backendId = created.id;
          this._persistBackendId(gameState.campaign.id, created.id);

          // Save all scenes for new campaign
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
            this._setLastSavedSceneIndex(created.id, scenes.length - 1);
          }
        }
      }
    } catch (err) {
      console.warn('[storage] Backend save failed:', err.message);
    }
  },

  _getLastSavedSceneIndex(backendId) {
    try {
      return parseInt(localStorage.getItem(`_scene_idx_${backendId}`) || '-1', 10);
    } catch {
      return -1;
    }
  },

  _setLastSavedSceneIndex(backendId, index) {
    try {
      localStorage.setItem(`_scene_idx_${backendId}`, String(index));
    } catch { /* ignore */ }
  },

  _getLocalBackendId(campaignId) {
    try {
      const campaigns = this.getCampaigns();
      const match = campaigns.find((c) => c.campaign?.id === campaignId);
      return match?.campaign?.backendId || null;
    } catch {
      return null;
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

  _deepPruneForQuota(campaigns, activeCampaignId) {
    const MAX_SCENES = 30;
    const MAX_CHAT = 50;
    const MAX_COMPRESSED_HISTORY = 1500;
    const MAX_NPCS = 30;
    const MAX_KNOWLEDGE_EVENTS = 20;

    return campaigns.map((c) => {
      const isActive = c.campaign.id === activeCampaignId;
      const keepScenes = isActive ? MAX_SCENES : 10;
      const keepChat = isActive ? MAX_CHAT : 20;

      const scenes = (c.scenes || []).slice(-keepScenes).map(({ image, ...rest }) => rest);
      const chatHistory = (c.chatHistory || []).slice(-keepChat);

      let world = c.world ? { ...c.world } : c.world;
      if (world) {
        if (world.compressedHistory && world.compressedHistory.length > MAX_COMPRESSED_HISTORY) {
          world.compressedHistory = world.compressedHistory.substring(0, MAX_COMPRESSED_HISTORY);
        }
        if (Array.isArray(world.npcs) && world.npcs.length > MAX_NPCS) {
          world.npcs = world.npcs.slice(-MAX_NPCS);
        }
        if (world.knowledgeBase) {
          const kb = { ...world.knowledgeBase };
          if (Array.isArray(kb.events) && kb.events.length > MAX_KNOWLEDGE_EVENTS) {
            kb.events = kb.events.slice(-MAX_KNOWLEDGE_EVENTS);
          }
          if (Array.isArray(kb.decisions) && kb.decisions.length > MAX_KNOWLEDGE_EVENTS) {
            kb.decisions = kb.decisions.slice(-MAX_KNOWLEDGE_EVENTS);
          }
          world.knowledgeBase = kb;
        }
      }

      return { ...c, scenes, chatHistory, world };
    });
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

  _isEmptyCampaign(entry) {
    if (!entry?.campaign) return true;
    const { campaign, character, scenes } = entry;
    const hasName = !!campaign.name;
    const hasCharacter = !!character?.name;
    const hasScenes = Array.isArray(scenes) && scenes.length > 0;
    return !hasName && !hasCharacter && !hasScenes;
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
      const emptyBackendIds = [];
      const backendPayloadById = new Map();

      await Promise.all(
        backendList.map(async (bc) => {
          const directLocalMatch = localByBackendId.get(bc.id);
          const backendTime = new Date(bc.lastSaved).getTime();
          const localTime = directLocalMatch?.lastSaved || 0;

          // Skip downloading large payloads when local copy is current/newer.
          if (directLocalMatch && localTime >= backendTime) {
            backendPayloadById.set(bc.id, {
              data: directLocalMatch,
              backendTime,
              usedLocalSnapshot: true,
            });
            return;
          }

          try {
            const full = await apiClient.get(`/campaigns/${bc.id}`);
            // Handle new normalized format (coreState + scenes) or legacy (data)
            let campaignData;
            if (full.coreState) {
              // New format: reconstruct full state from coreState + scenes
              campaignData = typeof full.coreState === 'string'
                ? JSON.parse(full.coreState) : full.coreState;
              if (full.scenes?.length) {
                campaignData.scenes = full.scenes.map((s) => ({
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
              if (!campaignData.campaign) campaignData.campaign = {};
              campaignData.campaign.backendId = full.id;
            } else {
              campaignData = full.data || full;
            }
            backendPayloadById.set(bc.id, {
              data: campaignData,
              backendTime,
              usedLocalSnapshot: false,
            });
          } catch (err) {
            console.warn(`[storage] Failed to fetch campaign ${bc.id}:`, err.message);
            if (directLocalMatch) {
              backendPayloadById.set(bc.id, {
                data: directLocalMatch,
                backendTime,
                usedLocalSnapshot: true,
              });
            }
          }
        }),
      );

      for (const bc of backendList) {
        const payload = backendPayloadById.get(bc.id);
        if (!payload?.data) continue;

        const data = payload.data;
        const frontendId = data.campaign?.id;
        const backendTime = payload.backendTime;

        if (this._isEmptyCampaign(data)) {
          emptyBackendIds.push(bc.id);
          continue;
        }

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
          if (!payload.usedLocalSnapshot && backendTime > localTime) {
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
      for (const emptyId of emptyBackendIds) {
        console.warn('[storage] Deleting empty backend campaign:', emptyId);
        apiClient.del(`/campaigns/${emptyId}`).catch(() => {});
      }

      for (const lc of local) {
        if (!matchedLocalCampaignIds.has(lc.campaign?.id)) {
          if (this._isEmptyCampaign(lc)) continue;
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

  exportConfig() {
    const payload = {
      _meta: {
        app: 'nikczemny_krzemuch',
        version: 1,
        exportedAt: new Date().toISOString(),
      },
      settings: sanitizeSettings(this.getSettings()),
      campaigns: this.getCampaigns(),
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
            localStorage.setItem(SETTINGS_KEY, JSON.stringify(sanitizeSettings(data.settings)));
          }
          if (data.campaigns) {
            localStorage.setItem(CAMPAIGNS_KEY, JSON.stringify(data.campaigns));
          }
          if (data.activeCampaignId) {
            localStorage.setItem(ACTIVE_CAMPAIGN_KEY, data.activeCampaignId);
          }

          resolve(sanitizeSettings(data.settings));
        } catch {
          reject(new Error('Failed to parse config file'));
        }
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });
  },
};
