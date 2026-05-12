import { useImageGeneration } from './useImageGeneration';
import { useSceneGeneration } from './sceneGeneration';
import { useGameContent } from './useGameContent';

export function useAI() {
  const {
    generateImageForScene,
    generateItemImageForInventoryItem,
    ensureMissingInventoryImages,
    generateSpellImageForSpell,
    ensureMissingSpellImages,
    ensureMissingNpcPortraits,
    imageGenEnabled,
    imageApiKey,
    imageProvider,
    imageStyle,
    darkPalette,
    imageSeriousness,
    imgKeyProvider,
  } = useImageGeneration();

  const {
    generateScene,
    acceptQuestOffer,
    declineQuestOffer,
    sceneGenStartTime,
    lastSceneGenMs,
    earlyDiceRoll,
    clearEarlyDiceRoll,
    streamingNarrative,
    streamingSegments,
    streamComplete,
    streamError,
    retryAfterStreamError,
    dismissStreamError,
    streamedBytes,
    avgSceneSizeBytes,
  } = useSceneGeneration({
    ensureMissingInventoryImages,
    ensureMissingSpellImages,
    ensureMissingNpcPortraits,
    imageGenEnabled,
    imageApiKey,
    imageProvider,
    imageStyle,
    darkPalette,
    imageSeriousness,
    imgKeyProvider,
  });

  const {
    generateCampaign,
    generateStoryPrompt,
    generateCharacterLegend,
    generateRecap,
    generateCombatCommentary,
    verifyQuestObjective,
  } = useGameContent();

  return {
    generateScene,
    generateCampaign,
    generateStoryPrompt,
    generateCharacterLegend,
    generateRecap,
    generateCombatCommentary,
    generateImageForScene,
    generateItemImageForInventoryItem,
    ensureMissingInventoryImages,
    generateSpellImageForSpell,
    ensureMissingSpellImages,
    verifyQuestObjective,
    acceptQuestOffer,
    declineQuestOffer,
    sceneGenStartTime,
    lastSceneGenMs,
    earlyDiceRoll,
    clearEarlyDiceRoll,
    streamingNarrative,
    streamingSegments,
    streamComplete,
    streamError,
    retryAfterStreamError,
    dismissStreamError,
    streamedBytes,
    avgSceneSizeBytes,
  };
}
