import { repairDialogueSegments, ensurePlayerDialogue } from '../../services/aiResponse';
import { downgradeLowConfidenceDialogueSegments, hardRemoveNarrationDialogueRepeats } from '../../services/textSanitizer';
import { demoteAnonymousDialogueSegments, normalizeIncomingDialogueSegments, enrichDialogueSpeakers, mergeNpcHintsFromDialogue } from '../../services/dialogueProcessor';

export function processSceneDialogue(result, state, settings, dispatch, { isFirstScene, playerAction, isPassiveSceneAction }) {
  const incomingDialogueSegments = normalizeIncomingDialogueSegments(result.dialogueSegments || []);

  const activeChar = state.party?.find(c => c.id === state.activeCharacterId) || state.character;
  const playerNames = (state.party || [state.character]).map(c => c?.name).filter(Boolean);
  const factionNames = Object.keys(state.world?.factions || {});
  const locationNames = (state.world?.mapState || []).map(l => l.name).filter(Boolean);
  const excludeFromSpeakers = [
    ...playerNames,
    ...factionNames,
    ...locationNames,
    ...(state.world?.currentLocation ? [state.world.currentLocation] : []),
    ...(state.campaign?.name ? [state.campaign.name] : []),
  ];

  const repairedSegments = repairDialogueSegments(
    result.narrative,
    incomingDialogueSegments,
    [...(state.world?.npcs || []), ...(result.stateChanges?.npcs || [])],
    excludeFromSpeakers
  );
  const withPlayerDialogue = (!isFirstScene && !isPassiveSceneAction)
    ? ensurePlayerDialogue(repairedSegments, playerAction, activeChar?.name, activeChar?.gender)
    : repairedSegments;
  let finalSegments = hardRemoveNarrationDialogueRepeats(
    demoteAnonymousDialogueSegments(
      downgradeLowConfidenceDialogueSegments(withPlayerDialogue)
    )
  );

  const voiceEnriched = enrichDialogueSpeakers({
    segments: finalSegments,
    stateChanges: result.stateChanges,
    worldNpcs: state.world?.npcs || [],
    characterVoiceMap: state.characterVoiceMap || {},
    voicePools: {
      maleVoices: settings.maleVoices || [],
      femaleVoices: settings.femaleVoices || [],
      narratorVoiceId: settings.narratorVoiceId || null,
    },
    playerNames,
    currentLocation: result.stateChanges?.currentLocation || state.world?.currentLocation || '',
    dispatch,
  });
  finalSegments = voiceEnriched.segments;

  const stateChangesWithNpcHints = mergeNpcHintsFromDialogue(
    voiceEnriched.stateChanges,
    finalSegments,
    state.world?.npcs || [],
    {
      currentLocation: voiceEnriched.stateChanges?.currentLocation || state.world?.currentLocation || '',
      playerName: activeChar?.name || state.character?.name || '',
    }
  );

  return { finalSegments, stateChanges: stateChangesWithNpcHints };
}
