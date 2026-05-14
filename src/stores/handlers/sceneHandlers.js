import { applyTimeAndNeeds } from './applyStateChangesHandler/timeAndNeeds';
import { applyCharacterMutations } from './applyStateChangesHandler/character';

export const sceneHandlers = {
  ADD_SCENE: (draft, action) => {
    draft.scenes.push(action.payload);
    // Streak resets on every full scene — the next quick beat lands at 1/5
    // and the player gets the full memory-compression pass between beats.
    draft.quickBeatStreak = 0;
  },

  UPDATE_SCENE_IMAGE: (draft, action) => {
    const scene = draft.scenes.find((s) => s.id === action.payload.sceneId);
    if (!scene) return;
    scene.image = action.payload.image;
    scene.fullImagePrompt = action.payload.fullImagePrompt ?? null;
  },

  UPDATE_SCENE_COMMAND: (draft, action) => {
    const scene = draft.scenes.find((s) => s.id === action.payload.sceneId);
    if (scene) scene.sceneCommand = action.payload.sceneCommand;
  },

  ADD_CHAT_MESSAGE: (draft, action) => {
    draft.chatHistory.push(action.payload);
  },

  /**
   * Quick beat ("mała akcja") — appends two chat messages (player intent +
   * DM narration, both with subtype: 'quick_beat'), optionally a third NPC
   * dialogue segment, and advances world time by `timeAdvance` hours via
   * the standard reducer. Does NOT push to draft.scenes — quick beats are
   * out-of-band w.r.t. the main scene track.
   */
  ADD_QUICK_BEAT: (draft, action) => {
    const {
      id,
      playerAction,
      narration,
      npcSpeaker,
      npcSpeakerGender,
      npcReply,
      timeAdvance,
      newItems,
      timestamp,
      consecutiveCount,
    } = action.payload;
    const now = timestamp || Date.now();

    draft.chatHistory.push({
      id: `qb_${id}_player`,
      role: 'player',
      subtype: 'quick_beat',
      content: playerAction,
      timestamp: now,
    });

    draft.chatHistory.push({
      id: `qb_${id}_dm`,
      role: 'dm',
      subtype: 'quick_beat',
      content: narration,
      ...(npcSpeaker && npcReply
        ? {
          dialogueSegments: [{
            type: 'dialogue',
            character: npcSpeaker,
            text: npcReply,
            gender: npcSpeakerGender === 'female' ? 'female' : 'male',
          }],
        }
        : {}),
      timestamp: now + 1,
    });

    if (Array.isArray(newItems) && newItems.length > 0) {
      applyCharacterMutations(draft, { newItems });
      const charName = draft.character?.name || '?';
      for (const item of newItems) {
        const itemName = typeof item === 'string' ? item : item.name;
        draft.chatHistory.push({
          id: `qb_${id}_item_${itemName}`,
          role: 'system',
          subtype: 'item_gained',
          content: `${charName} +${itemName}`,
          timestamp: now + 2,
        });
      }
    }

    if (typeof timeAdvance === 'number' && timeAdvance > 0) {
      applyTimeAndNeeds(draft, { timeAdvance: { hoursElapsed: timeAdvance } });
    }

    draft.quickBeatStreak = typeof consecutiveCount === 'number'
      ? consecutiveCount
      : (draft.quickBeatStreak || 0) + 1;
  },

  ADD_NEEDS_COMMENTARY: (draft, action) => {
    const { id, commentaryText, needsSnapshot, timestamp } = action.payload;
    const now = timestamp || Date.now();
    draft.chatHistory.push({
      id: `nc_${id}`,
      role: 'system',
      subtype: 'needs_commentary',
      content: commentaryText,
      needsSnapshot,
      timestamp: now,
    });
  },

  UPDATE_SCENE_ACTIONS: (draft, action) => {
    const { sceneId, actions } = action.payload;
    const scene = draft.scenes.find((s) => s.id === sceneId);
    if (scene) scene.actions = actions;
  },

  UPDATE_SCENE_FIELD_MAP: (draft, action) => {
    const { sceneId, fieldMapTiles } = action.payload;
    const scene = draft.scenes.find((s) => s.id === sceneId);
    if (scene) scene.fieldMapTiles = fieldMapTiles;
  },

  UPDATE_SCENE_QUEST_OFFER: (draft, action) => {
    const { sceneId, offerId, status } = action.payload;
    const scene = draft.scenes.find((s) => s.id === sceneId);
    if (!scene || !scene.questOffers) return;
    const offer = scene.questOffers.find((o) => o.id === offerId);
    if (offer) offer.status = status;
  },
};
