import { sceneIndexCache } from './sceneIndexCache.js';

/**
 * Deserialize a /campaigns/:id GET response into the FE's flat gameState
 * shape. Backend stores the lean `coreState` + scenes + characters in
 * separate collections — this knits them back together.
 *
 * Exported directly (not wrapped by the storage facade) because the
 * export/import flow in `importExport.js` maps over raw campaign responses.
 */
export function parseBackendCampaign(full) {
  let state = typeof full.coreState === 'string'
    ? JSON.parse(full.coreState) : (full.coreState || {});

  // Character data lives in its own collection now and is populated on the
  // campaign GET response under `full.characters`. Single-player uses the
  // first entry; multiplayer reads the array (slice handled by MP code).
  if (Array.isArray(full.characters) && full.characters.length > 0) {
    state.character = full.characters[0];
    state.characters = full.characters;
  } else {
    state.character = null;
  }

  if (Array.isArray(full.characterIds)) {
    if (!state.campaign) state.campaign = {};
    state.campaign.characterIds = full.characterIds;
  }

  if (full.scenes?.length) {
    state.scenes = full.scenes.map((s) => {
      const parsedDice = typeof s.diceRoll === 'string'
        ? JSON.parse(s.diceRoll) : s.diceRoll;
      // Backend writes the diceRolls array into the legacy `diceRoll` column.
      // Normalize on read: array → diceRolls + diceRoll (first), object → diceRoll.
      const diceRolls = Array.isArray(parsedDice) ? parsedDice : undefined;
      const diceRoll = Array.isArray(parsedDice) ? (parsedDice[0] || null) : parsedDice;
      return {
        ...s,
        image: s.imageUrl || s.image || null,
        suggestedActions: typeof s.suggestedActions === 'string'
          ? JSON.parse(s.suggestedActions) : s.suggestedActions || [],
        dialogueSegments: typeof s.dialogueSegments === 'string'
          ? JSON.parse(s.dialogueSegments) : s.dialogueSegments || [],
        diceRoll,
        diceRolls,
        stateChanges: typeof s.stateChanges === 'string'
          ? JSON.parse(s.stateChanges) : s.stateChanges,
      };
    });
  }

  // Quick beats — chronologically interleaved into chatHistory using the
  // server-side createdAt timestamps. The LOAD_CAMPAIGN reducer does a final
  // sort by timestamp so beats land between their parent scene and the next.
  // Streak is the count of trailing beats anchored to the last full scene —
  // mirrors what FE would have computed live, so the lock UI is correct after
  // a refresh in the middle of a beat run.
  if (Array.isArray(full.quickBeats) && full.quickBeats.length > 0) {
    const npcGenderByName = new Map();
    for (const npc of state.world?.npcs || []) {
      if (npc?.name) npcGenderByName.set(npc.name, npc.gender);
    }
    const beatChat = [];
    full.quickBeats.forEach((qb) => {
      const ts = new Date(qb.createdAt).getTime();
      beatChat.push({
        id: `qb_${qb.id}_player`,
        role: 'player',
        subtype: 'quick_beat',
        content: qb.playerAction,
        timestamp: ts,
      });
      const dmEntry = {
        id: `qb_${qb.id}_dm`,
        role: 'dm',
        subtype: 'quick_beat',
        content: qb.narrationText,
        timestamp: ts + 1,
      };
      if (qb.npcSpeaker && qb.npcReply) {
        const gender = npcGenderByName.get(qb.npcSpeaker) === 'female' ? 'female' : 'male';
        dmEntry.dialogueSegments = [{
          type: 'dialogue',
          character: qb.npcSpeaker,
          text: qb.npcReply,
          gender,
        }];
      }
      beatChat.push(dmEntry);
    });
    state.chatHistory = [...(state.chatHistory || []), ...beatChat];

    const lastSceneIndex = Math.max(0, (state.scenes?.length || 0) - 1);
    state.quickBeatStreak = full.quickBeats.filter(
      (qb) => qb.parentSceneIndex === lastSceneIndex,
    ).length;
  }

  if (!state.campaign) state.campaign = {};
  state.campaign.backendId = full.id;
  if (full.userId) state.campaign.userId = full.userId;
  // Living World (Phase 1/2) — hydrate flag + knobs so FE can gate features.
  if (typeof full.livingWorldEnabled === 'boolean') {
    state.campaign.livingWorldEnabled = full.livingWorldEnabled;
  }
  if (typeof full.worldTimeRatio === 'number') {
    state.campaign.worldTimeRatio = full.worldTimeRatio;
  }
  if (Number.isInteger(full.worldTimeMaxGapDays)) {
    state.campaign.worldTimeMaxGapDays = full.worldTimeMaxGapDays;
  }
  state.lastSaved = new Date(full.lastSaved || full.updatedAt || full.createdAt).getTime();

  return state;
}

/**
 * Mark a scene index as already persisted server-side. Called by
 * useSceneGeneration after the backend's `complete` event, since the
 * backend already creates the scene row inside its SSE handler — there's
 * no need for the bulk save to re-upload it (which used to create
 * duplicate rows when sceneIndex alignment drifted).
 */
export function markSceneSavedRemotely(backendId, sceneIndex) {
  if (!backendId) return;
  sceneIndexCache.bump(backendId, sceneIndex);
}
