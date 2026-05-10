import { applyTimeAndNeeds } from './applyStateChangesHandler/timeAndNeeds';

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

  UPDATE_SCENE_GRID: (draft, action) => {
    const scene = draft.scenes.find((s) => s.id === action.payload.sceneId);
    if (scene) scene.sceneGrid = action.payload.sceneGrid || scene.sceneGrid || null;
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

    if (typeof timeAdvance === 'number' && timeAdvance > 0) {
      applyTimeAndNeeds(draft, { timeAdvance: { hoursElapsed: timeAdvance } });
    }

    draft.quickBeatStreak = typeof consecutiveCount === 'number'
      ? consecutiveCount
      : (draft.quickBeatStreak || 0) + 1;
  },

  UPDATE_SCENE_QUEST_OFFER: (draft, action) => {
    const { sceneId, offerId, status } = action.payload;
    const scene = draft.scenes.find((s) => s.id === sceneId);
    if (!scene || !scene.questOffers) return;
    const offer = scene.questOffers.find((o) => o.id === offerId);
    if (offer) offer.status = status;
  },
};
