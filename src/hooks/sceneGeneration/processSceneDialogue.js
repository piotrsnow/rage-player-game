import { enrichDialogueSpeakers } from '../../services/dialogueProcessor';

/**
 * FE-side dialogue post-processing. Dialogue repair (normalize, quote parse,
 * speaker attribution, dedup, NPC introduce) is now done server-side in
 * dialogueRepairPipeline.js. This function only handles voice assignment
 * which requires FE-only state (voicePools, characterVoiceMap, dispatch).
 */
export function processSceneDialogue(result, state, settings, dispatch, { voicePools: voicePoolsArg }) {
  const playerNames = (state.party || [state.character]).map(c => c?.name).filter(Boolean);

  const voiceEnriched = enrichDialogueSpeakers({
    segments: result.dialogueSegments || [],
    stateChanges: result.stateChanges,
    worldNpcs: state.world?.npcs || [],
    characterVoiceMap: state.characterVoiceMap || {},
    voicePools: {
      maleVoices: voicePoolsArg?.maleVoices || [],
      femaleVoices: voicePoolsArg?.femaleVoices || [],
      narratorVoiceId: voicePoolsArg?.narratorVoiceId || null,
      ttsProvider: ['elevenlabs', 'xtts'].includes(settings.sceneTtsTier) ? settings.sceneTtsTier : (settings.ttsProvider || 'elevenlabs'),
    },
    playerNames,
    currentLocation: result.stateChanges?.currentLocation || state.world?.currentLocation || '',
    dispatch,
  });

  return { finalSegments: voiceEnriched.segments, stateChanges: voiceEnriched.stateChanges };
}
