import { normalizeCharacter, normalizeCustomAttackPresets } from './_shared';
import { calculateMaxWounds } from '../../services/gameState';
import { SKILL_CAPS, CREATION_LIMITS } from '../../data/rpgSystem';

export const characterHandlers = {
  UPDATE_CHARACTER: (draft, action) => {
    if (!draft.character) return;
    Object.assign(draft.character, action.payload);
    draft.character.customAttackPresets = normalizeCustomAttackPresets(
      action.payload.customAttackPresets ?? draft.character.customAttackPresets
    );
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
    const lastTrainingScene = draft.character?.lastTrainingScene;
    const fallbackMaterialBag = draft.character?.materialBag;
    draft.character = merged;
    if (lastTrainingScene !== undefined) draft.character.lastTrainingScene = lastTrainingScene;
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
    const { skillName, sceneCount } = action.payload;
    const char = draft.character;
    if (!char) return;
    const skill = char.skills?.[skillName];
    if (!skill) return;
    const scenesSinceTraining = sceneCount - (char.lastTrainingScene || 0);
    if (scenesSinceTraining < 20) return;
    if (skill.cap >= SKILL_CAPS.max) return;
    char.lastTrainingScene = sceneCount;
    skill.cap = Math.min(SKILL_CAPS.max, skill.cap + 1);
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
    const newMaxWounds = calculateMaxWounds(char.attributes.wytrzymalosc);
    char.maxWounds = newMaxWounds;
    char.wounds = Math.min(char.wounds, newMaxWounds);
  },

  SET_CHARACTER_LOCAL_ID: (draft, action) => {
    if (draft.character) draft.character.localId = action.payload;
  },

  MAP_CHARACTER_VOICE: (draft, action) => {
    const { characterName, voiceId, gender, voiceName } = action.payload;
    if (!draft.characterVoiceMap) draft.characterVoiceMap = {};
    draft.characterVoiceMap[characterName] = { voiceId, gender };
    if (draft.character && draft.character.name === characterName) {
      draft.character.voiceId = voiceId || null;
      draft.character.voiceName = voiceName || draft.character.voiceName || null;
    }
  },

  SET_NARRATOR_VOICE: (draft, action) => {
    draft.narratorVoiceId = action.payload || null;
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
