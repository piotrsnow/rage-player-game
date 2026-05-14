import { sanitizeMana } from '../../../shared/domain/mana.js';
import { normalizeCharacter, normalizeCustomAttackPresets } from './_shared';
import { calculateMaxWounds } from '../../services/gameState';
import { SKILL_CAPS, CREATION_LIMITS, cumulativeCharXpThreshold } from '../../data/rpgSystem';

export const characterHandlers = {
  UPDATE_CHARACTER: (draft, action) => {
    if (!draft.character) return;
    Object.assign(draft.character, action.payload);
    draft.character.customAttackPresets = normalizeCustomAttackPresets(
      action.payload.customAttackPresets ?? draft.character.customAttackPresets
    );
    if (draft.character.mana) draft.character.mana = sanitizeMana(draft.character.mana);
  },

  /**
   * Replaces the local character snapshot with an authoritative backend copy.
   * Used instead of recomputing deltas locally via APPLY_STATE_CHANGES (race risk).
   */
  RECONCILE_CHARACTER_FROM_BACKEND: (draft, action) => {
    if (!action.payload) return;
    const merged = normalizeCharacter({
      ...action.payload,
      backendId: action.payload.backendId || action.payload.id || draft.character?.backendId,
      customAttackPresets: normalizeCustomAttackPresets(
        action.payload.customAttackPresets ?? draft.character?.customAttackPresets
      ),
    });
    // Preserve FE-only session fields the backend doesn't track.
    const fallbackMaterialBag = draft.character?.materialBag;
    draft.character = merged;
    if (action.payload.materialBag === undefined && fallbackMaterialBag !== undefined) {
      draft.character.materialBag = fallbackMaterialBag;
    }
  },

  SAVE_CUSTOM_ATTACK: (draft, action) => {
    const description = typeof action.payload === 'string' ? action.payload.trim() : '';
    if (!description || !draft.character) return;
    const current = normalizeCustomAttackPresets(draft.character.customAttackPresets);
    draft.character.customAttackPresets = [
      description,
      ...current.filter((preset) => preset !== description),
    ].slice(0, 12);
  },

  DELETE_CUSTOM_ATTACK: (draft, action) => {
    const description = typeof action.payload === 'string' ? action.payload.trim() : '';
    if (!description || !draft.character) return;
    draft.character.customAttackPresets = normalizeCustomAttackPresets(
      (draft.character.customAttackPresets || []).filter((preset) => preset !== description)
    );
  },

  UPSERT_3D_MODEL_ASSIGNMENTS: (draft, action) => {
    const { playerModel, partyModels = [], npcModels = [] } = action.payload || {};

    if (playerModel && draft.character) {
      draft.character.model3d = playerModel;
    }

    if (draft.party?.length && partyModels.length) {
      for (const member of draft.party) {
        const match = partyModels.find((item) => (item.id && (member.id || member.name) === item.id) || item.name === member.name);
        if (match?.model3d) member.model3d = match.model3d;
      }
    }

    if (draft.world?.npcs?.length && npcModels.length) {
      for (const npc of draft.world.npcs) {
        const match = npcModels.find((item) => item.name?.toLowerCase() === npc.name?.toLowerCase());
        if (match?.model3d) npc.model3d = match.model3d;
      }
    }
  },

  TRAIN_SKILL: (draft, action) => {
    const { skillName, npcId } = action.payload || {};
    const char = draft.character;
    if (!char || !skillName) return;
    if (!char.skills) char.skills = {};
    if (!char.skills[skillName]) {
      char.skills[skillName] = { level: 0, xp: 0, cap: SKILL_CAPS.basic };
    }
    const skill = char.skills[skillName];
    if (skill.cap < SKILL_CAPS.basic) skill.cap = SKILL_CAPS.basic;
    if (skill.cap >= SKILL_CAPS.max) return;
    skill.cap = Math.min(SKILL_CAPS.max, skill.cap + 1);

    if (npcId && Array.isArray(draft.world?.npcs)) {
      const npc = draft.world.npcs.find((n) => n.id === npcId);
      if (npc && Array.isArray(npc.canTrain)) {
        npc.canTrain = npc.canTrain.filter((s) => s !== skillName);
      }
    }
  },

  SPEND_ATTRIBUTE_POINT: (draft, action) => {
    const { attribute } = action.payload;
    const char = draft.character;
    const cost = attribute === 'szczescie' ? CREATION_LIMITS.szczesciePointCost : 1;
    if (!char || (char.attributePoints || 0) < cost) return;
    const currentVal = char.attributes?.[attribute] ?? 1;
    if (currentVal >= 25) return;
    char.attributes[attribute] = currentVal + 1;
    char.attributePoints = (char.attributePoints || 0) - cost;
    const newMaxWounds = calculateMaxWounds(char.attributes.wytrzymalosc) + (char.bonusMaxWounds || 0);
    char.maxWounds = newMaxWounds;
    char.wounds = Math.min(char.wounds, newMaxWounds);
  },

  ADD_BADGE_XP: (draft, action) => {
    const { xpValue, badge } = action.payload || {};
    const char = draft.character;
    if (!char) return;
    if (badge) {
      if (!Array.isArray(char.skillBadges)) char.skillBadges = [];
      char.skillBadges.push(badge);
    }
    if (xpValue > 0) {
      char.characterXp = (char.characterXp || 0) + xpValue;
      let level = char.characterLevel || 1;
      let attrPoints = char.attributePoints || 0;
      while (char.characterXp >= cumulativeCharXpThreshold(level + 1)) {
        level++;
        attrPoints++;
      }
      char.characterLevel = level;
      char.attributePoints = attrPoints;
    }
  },

  SET_CHARACTER_LOCAL_ID: (draft, action) => {
    if (draft.character) draft.character.localId = action.payload;
  },

  MAP_CHARACTER_VOICE: (draft, action) => {
    const { characterName, voiceId, gender, voiceName, ttsProvider } = action.payload;
    if (!draft.characterVoiceMap) draft.characterVoiceMap = {};
    const prev = draft.characterVoiceMap[characterName];
    const byProvider = { ...(prev?.byProvider || {}) };
    if (ttsProvider && voiceId) {
      byProvider[ttsProvider] = { voiceId, voiceName: voiceName || null };
    }
    draft.characterVoiceMap[characterName] = { voiceId, gender, byProvider };
    if (draft.character && draft.character.name === characterName) {
      draft.character.voiceId = voiceId || null;
      draft.character.voiceName = voiceName || draft.character.voiceName || null;
      if (ttsProvider && voiceId) {
        if (!draft.character.voicesByProvider) draft.character.voicesByProvider = {};
        draft.character.voicesByProvider[ttsProvider] = { voiceId, voiceName: voiceName || null };
      }
    }
  },

  SWITCH_CHARACTER_VOICE_PROVIDER: (draft, action) => {
    const { oldProvider, newProvider, maleVoices = [], femaleVoices = [], narratorVoiceId = null } = action.payload;
    draft.narratorVoiceId = narratorVoiceId || null;
    if (!draft.characterVoiceMap) draft.characterVoiceMap = {};
    const pool = [...maleVoices.map((v) => ({ ...v, gender: 'male' })), ...femaleVoices.map((v) => ({ ...v, gender: 'female' }))];
    const usedNewIds = new Set();

    for (const [name, entry] of Object.entries(draft.characterVoiceMap)) {
      if (!entry.byProvider) entry.byProvider = {};
      if (entry.voiceId && oldProvider) {
        entry.byProvider[oldProvider] = {
          voiceId: entry.voiceId,
          voiceName: entry.byProvider[oldProvider]?.voiceName || null,
        };
      }
      const restored = entry.byProvider[newProvider];
      if (restored?.voiceId) {
        entry.voiceId = restored.voiceId;
        usedNewIds.add(restored.voiceId);
      } else if (pool.length) {
        const genderPool = entry.gender === 'female' ? femaleVoices
          : entry.gender === 'male' ? maleVoices
          : pool;
        const candidates = genderPool.filter((v) => !usedNewIds.has(v.voiceId));
        const pick = candidates.length ? candidates : (genderPool.length ? genderPool : pool);
        const chosen = pick[Math.floor(Math.random() * pick.length)];
        if (chosen) {
          entry.voiceId = chosen.voiceId;
          entry.byProvider[newProvider] = { voiceId: chosen.voiceId, voiceName: chosen.voiceName || null };
          usedNewIds.add(chosen.voiceId);
        }
      } else {
        entry.voiceId = null;
      }
    }

    if (draft.character?.name && draft.characterVoiceMap[draft.character.name]) {
      const entry = draft.characterVoiceMap[draft.character.name];
      draft.character.voiceId = entry.voiceId || null;
      const providerData = entry.byProvider?.[newProvider];
      draft.character.voiceName = providerData?.voiceName || null;
      if (!draft.character.voicesByProvider) draft.character.voicesByProvider = {};
      if (oldProvider && draft.character.voiceId) {
        draft.character.voicesByProvider[oldProvider] = entry.byProvider[oldProvider] || {};
      }
      if (providerData) {
        draft.character.voicesByProvider[newProvider] = providerData;
      }
    }
  },

  SET_NARRATOR_VOICE: (draft, action) => {
    draft.narratorVoiceId = action.payload || null;
  },

  CLEAR_CHARACTER_VOICE_MAP: (draft) => {
    draft.characterVoiceMap = {};
  },

  ADD_TITLE: (draft, action) => {
    if (!draft.character || !action.payload?.id) return;
    const existing = Array.isArray(draft.character.titles) ? draft.character.titles : [];
    if (existing.some((t) => t.id === action.payload.id)) return;
    const newTitle = {
      id: action.payload.id,
      label: action.payload.label,
      rarity: action.payload.rarity || 'common',
      unlockedAt: Date.now(),
      sourceAchievementId: action.payload.sourceAchievementId || null,
    };
    if (!Array.isArray(draft.character.titles)) draft.character.titles = [];
    draft.character.titles.push(newTitle);
    if (!draft.character.activeTitleId) {
      draft.character.activeTitleId = newTitle.id;
    }
  },

  SET_ACTIVE_TITLE: (draft, action) => {
    if (!draft.character) return;
    draft.character.activeTitleId = action.payload || null;
  },
};
