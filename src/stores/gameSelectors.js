import { useGameStore } from './gameStore';

/**
 * Granular selector hooks per domain slice.
 *
 * Prefer these over `useGame()` in new code — they subscribe only to the
 * referenced slice, so a change in an unrelated part of game state will not
 * re-render the consumer.
 *
 * Usage:
 *   const campaign = useGameCampaign();
 *   const chatHistory = useGameSlice(s => s.chatHistory);
 */

// Generic escape hatch: pick any field via selector.
export function useGameSlice(selector) {
  return useGameStore((s) => selector(s.state));
}

export const useGameCampaign = () => useGameStore((s) => s.state.campaign);
export const useGameCharacter = () => useGameStore((s) => s.state.character);
export const useGameParty = () => useGameStore((s) => s.state.party);
export const useGameWorld = () => useGameStore((s) => s.state.world);
export const useGameQuests = () => useGameStore((s) => s.state.quests);
export const useGameScenes = () => useGameStore((s) => s.state.scenes);
export const useGameChatHistory = () => useGameStore((s) => s.state.chatHistory);
export const useGameCombat = () => useGameStore((s) => s.state.combat);
export const useGameMagic = () => useGameStore((s) => s.state.magic);
export const useGameAchievements = () => useGameStore((s) => s.state.achievements);
export const useGameAiCosts = () => useGameStore((s) => s.state.aiCosts);
export const useGameIsLoading = () => useGameStore((s) => s.state.isLoading);
export const useGameIsGeneratingScene = () => useGameStore((s) => s.state.isGeneratingScene);
export const useGameIsGeneratingImage = () => useGameStore((s) => s.state.isGeneratingImage);
export const useGameError = () => useGameStore((s) => s.state.error);

// Stable action accessors (no re-render coupling).
export const useGameDispatch = () => useGameStore((s) => s.dispatch);
export const useGameAutoSave = () => useGameStore((s) => s.autoSave);
