import { repairDialogueSegments, ensurePlayerDialogue } from '../../../../shared/domain/dialogueRepair.js';
import { normalizeIncomingDialogueSegments, demoteAnonymousDialogueSegments, mergeNpcHintsFromDialogue, introduceUnknownSpeakers } from '../../../../shared/domain/dialogueProcessor.js';
import { downgradeLowConfidenceDialogueSegments, hardRemoveNarrationDialogueRepeats } from '../../../../shared/domain/dialogueSanitizer.js';

/**
 * Full dialogue repair pipeline for solo scene generation.
 * Runs the same steps as the FE's processSceneDialogue minus voice
 * assignment (enrichDialogueSpeakers stays on the client).
 *
 * Mutates sceneResult.dialogueSegments and sceneResult.stateChanges in place.
 */
export function repairSceneDialogue(sceneResult, {
  worldNpcs = [],
  playerName = '',
  playerGender = null,
  playerAction = '',
  isFirstScene = false,
  isPassiveSceneAction = false,
  currentLocation = '',
  campaignName = '',
  factionNames = [],
  locationNames = [],
}) {
  if (!sceneResult) return;

  const playerNames = playerName ? [playerName] : [];
  const excludeFromSpeakers = [
    ...playerNames,
    ...factionNames,
    ...locationNames,
    ...(currentLocation ? [currentLocation] : []),
    ...(campaignName ? [campaignName] : []),
  ];

  // 1. Normalize speaker → character
  const normalized = normalizeIncomingDialogueSegments(sceneResult.dialogueSegments || []);

  // 2. Repair: quote parser + speaker attribution
  const stateNpcs = Array.isArray(sceneResult.stateChanges?.npcs) ? sceneResult.stateChanges.npcs : [];
  const repairedSegments = repairDialogueSegments(
    sceneResult.narrative || '',
    normalized,
    [...worldNpcs, ...stateNpcs],
    excludeFromSpeakers,
  );

  // 3. Ensure player dialogue
  const withPlayerDialogue = (!isFirstScene && !isPassiveSceneAction)
    ? ensurePlayerDialogue(repairedSegments, playerAction, playerName, playerGender)
    : repairedSegments;

  // 4–6. Sanitize
  let finalSegments = hardRemoveNarrationDialogueRepeats(
    demoteAnonymousDialogueSegments(
      downgradeLowConfidenceDialogueSegments(withPlayerDialogue)
    )
  );

  // 7. Merge NPC hints from dialogue (location updates for known speakers)
  let mergedStateChanges = mergeNpcHintsFromDialogue(
    sceneResult.stateChanges || {},
    finalSegments,
    worldNpcs,
    { currentLocation, playerName },
  );

  // 8. Introduce unknown speakers as NPCs
  mergedStateChanges = introduceUnknownSpeakers(
    finalSegments,
    mergedStateChanges,
    worldNpcs,
    { playerNames, currentLocation },
  );

  sceneResult.dialogueSegments = finalSegments;
  sceneResult.stateChanges = mergedStateChanges;
}
