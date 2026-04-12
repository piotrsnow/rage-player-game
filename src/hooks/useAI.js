import { useImageGeneration } from './useImageGeneration';
import { useSceneGeneration } from './sceneGeneration';
import { useGameContent } from './useGameContent';

export function useAI() {
  const {
    generateImageForScene,
    generateItemImageForInventoryItem,
    ensureMissingInventoryImages,
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
    generateRecap,
    generateCombatCommentary,
    verifyQuestObjective,
  } = useGameContent();

  return {
    generateScene,
    generateCampaign,
    generateStoryPrompt,
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
