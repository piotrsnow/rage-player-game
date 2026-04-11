import {
  initialState,
  createDefaultCharacter,
  normalizeCharacter,
  normalizeCustomAttackPresets,
  createDefaultNeeds,
  createDefaultAchievementState,
} from './_shared';

export const campaignHandlers = {
  START_CAMPAIGN: (draft, action) => {
    const rawChar = action.payload.character || createDefaultCharacter();
    const char = normalizeCharacter(rawChar);
    const campaignData = {
      ...action.payload.campaign,
      status: 'active',
    };
    const voiceMap = {};
    if (char.voiceId && char.name) {
      voiceMap[char.name] = { voiceId: char.voiceId, gender: char.gender || null };
    }
    return {
      ...initialState,
      campaign: campaignData,
      character: {
        ...char,
        needs: char.needs || createDefaultNeeds(),
        customAttackPresets: normalizeCustomAttackPresets(char.customAttackPresets),
      },
      characterVoiceMap: voiceMap,
      world: action.payload.world || initialState.world,
      scenes: action.payload.scenes || [],
      chatHistory: action.payload.chatHistory || [],
      aiCosts: { total: 0, breakdown: { ai: 0, image: 0, tts: 0, sfx: 0, music: 0 }, history: [] },
    };
  },

  LOAD_CAMPAIGN: (draft, action) => {
    const defaultCosts = { total: 0, breakdown: { ai: 0, image: 0, tts: 0, sfx: 0, music: 0 }, history: [] };
    const loaded = { ...initialState, ...action.payload };
    loaded.isLoading = false;
    loaded.isGeneratingScene = false;
    loaded.isGeneratingImage = false;
    loaded.error = null;
    loaded.aiCosts = { ...defaultCosts, ...loaded.aiCosts };
    if (loaded.character && !loaded.character.needs) {
      loaded.character = { ...loaded.character, needs: createDefaultNeeds() };
    }
    if (loaded.character) {
      loaded.character = normalizeCharacter({
        ...loaded.character,
        backendId: loaded.character.backendId || loaded.character.id,
        customAttackPresets: normalizeCustomAttackPresets(loaded.character.customAttackPresets),
      });
    }
    if (!loaded.achievements) loaded.achievements = createDefaultAchievementState();
    if (!loaded.magic) loaded.magic = { activeSpells: [] };
    if (loaded.narrationTime == null) loaded.narrationTime = 0;
    if (loaded.totalPlayTime == null) loaded.totalPlayTime = 0;
    delete loaded.dialogue;
    delete loaded.dialogueCooldown;
    if (!loaded.party) loaded.party = [];
    if (loaded.world && !loaded.world.exploredLocations) loaded.world.exploredLocations = [];
    if (loaded.world && !loaded.world.knowledgeBase) {
      loaded.world.knowledgeBase = { characters: {}, locations: {}, events: [], decisions: [], plotThreads: [] };
    }
    if (loaded.world && !loaded.world.codex) {
      loaded.world.codex = {};
    }
    if (loaded.world && loaded.world.fieldMap) {
      loaded.world.fieldMap = {
        seed: 0,
        chunkSize: 64,
        chunks: {},
        playerPos: { x: 32, y: 32 },
        activeBiome: 'plains',
        mapMode: 'pola',
        roadVariant: null,
        stepCounter: 0,
        stepBuffer: [],
        discoveredPoi: [],
        interior: null,
        ...loaded.world.fieldMap,
      };
    }
    if (loaded.campaign && !loaded.campaign.status) loaded.campaign.status = 'active';
    if (loaded.character?.voiceId && loaded.character.name) {
      if (!loaded.characterVoiceMap) loaded.characterVoiceMap = {};
      if (!loaded.characterVoiceMap[loaded.character.name]) {
        loaded.characterVoiceMap[loaded.character.name] = {
          voiceId: loaded.character.voiceId,
          gender: loaded.character.gender || null,
        };
      }
    }

    // Cleanup of legacy persisted duplicates in chat history:
    // 1) Strict dedupe by message id (old sessions emitted colliding dice_roll ids)
    // 2) Dedupe DM messages by content (legacy id mismatch caused reload dupes)
    if (loaded.chatHistory?.length) {
      const seenIds = new Set();
      const seenDmContent = new Set();
      loaded.chatHistory = loaded.chatHistory.filter((m) => {
        if (m.id) {
          if (seenIds.has(m.id)) return false;
          seenIds.add(m.id);
        }
        if (m.role === 'dm') {
          const key = (m.content || '').trim();
          if (key) {
            if (seenDmContent.has(key)) return false;
            seenDmContent.add(key);
          }
        }
        return true;
      });
    }

    if (loaded.scenes?.length) {
      // Count-based scene↔DM matching: scene.id switched from frontend to backend
      // so legacy chat entries carry stale ids. Only reconstruct trailing scenes
      // missing a DM message. Timestamps must be strictly monotonic so the sort
      // below doesn't interleave player/dice/dm rows from different scenes.
      const existingDmCount = (loaded.chatHistory || [])
        .filter((m) => m.role === 'dm').length;
      const reconstructed = [];
      const reloadBaseTs = Date.now() - loaded.scenes.length * 1000;
      loaded.scenes.forEach((scene, idx) => {
        if (!scene.id || idx < existingDmCount) return;
        const createdMs = scene.createdAt ? new Date(scene.createdAt).getTime() : NaN;
        const ts = Number.isFinite(createdMs)
          ? createdMs
          : (scene.timestamp || (reloadBaseTs + idx * 1000));
        if (idx > 0 && scene.chosenAction) {
          reconstructed.push({
            id: `msg_reconstructed_${scene.id}_player`,
            role: 'player',
            content: scene.chosenAction,
            timestamp: ts - 2,
          });
        }
        const rollList = Array.isArray(scene.diceRolls) && scene.diceRolls.length > 0
          ? scene.diceRolls
          : (scene.diceRoll ? [scene.diceRoll] : []);
        rollList.forEach((dr, rollIdx) => {
          if (!dr || typeof dr !== 'object') return;
          const label = dr.margin !== undefined
            ? `${dr.skill || '?'}: ${dr.total ?? dr.roll} vs ${dr.threshold ?? dr.target ?? dr.dc} (margines ${dr.margin ?? 0})`
            : `${dr.skill || '?'}: ${dr.roll} / ${dr.target || dr.dc} (SL ${dr.sl ?? 0})`;
          reconstructed.push({
            id: `msg_reconstructed_${scene.id}_roll_${rollIdx}`,
            role: 'system',
            subtype: 'dice_roll',
            content: label,
            diceData: dr,
            timestamp: ts - 1 + rollIdx * 0.001,
          });
        });
        reconstructed.push({
          id: `msg_reconstructed_${scene.id}_dm`,
          role: 'dm',
          sceneId: scene.id,
          content: scene.narrative || '',
          scenePacing: scene.scenePacing || 'exploration',
          dialogueSegments: scene.dialogueSegments || [],
          soundEffect: scene.soundEffect || null,
          timestamp: ts,
        });
      });
      if (reconstructed.length > 0) {
        loaded.chatHistory = [...(loaded.chatHistory || []), ...reconstructed]
          .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
      }
    }

    return loaded;
  },

  RESET: () => initialState,

  SET_FREEROAM: (draft) => {
    if (draft.campaign) draft.campaign.freeroam = true;
    draft.mainQuestJustCompleted = false;
  },

  DISMISS_MAIN_QUEST_MODAL: (draft) => {
    draft.mainQuestJustCompleted = false;
  },
};
