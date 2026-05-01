import { useImageGeneration } from './useImageGeneration';
import { useSceneGeneration } from './sceneGeneration';
import { useGameContent } from './useGameContent';

export function useAI() {
  const {
    generateImageForScene,
    generateItemImageForInventoryItem,
    ensureMissingInventoryImages,
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
  } = useSceneGeneration({
    ensureMissingInventoryImages,
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
    verifyQuestObjective,
    acceptQuestOffer,
    declineQuestOffer,
    sceneGenStartTime,
    lastSceneGenMs,
    earlyDiceRoll,
    clearEarlyDiceRoll,
    streamingNarrative,
    streamingSegments,
  };
}
