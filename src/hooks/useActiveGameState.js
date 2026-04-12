import {
  useGameCampaign,
  useGameCharacter,
  useGameScenes,
  useGameChatHistory,
  useGameWorld,
  useGameQuests,
  useGameIsGeneratingScene,
  useGameIsGeneratingImage,
  useGameError,
  useGameAiCosts,
  useGameDispatch,
} from '../stores/gameSelectors';
import { useMultiplayer } from '../contexts/MultiplayerContext';

/**
 * NOTE: Currently unused — kept for potential future consolidation.
 * If still unused after the refactor stabilizes, delete.
 */
export function useActiveGameState() {
  const soloCampaign = useGameCampaign();
  const soloCharacter = useGameCharacter();
  const soloScenes = useGameScenes();
  const soloChatHistory = useGameChatHistory();
  const soloWorld = useGameWorld();
  const soloQuests = useGameQuests();
  const soloIsGeneratingScene = useGameIsGeneratingScene();
  const isGeneratingImage = useGameIsGeneratingImage();
  const soloError = useGameError();
  const aiCosts = useGameAiCosts();
  const dispatch = useGameDispatch();
  const mp = useMultiplayer();

  const isMultiplayer = mp.state.isMultiplayer && mp.state.phase === 'playing';
  const mpGameState = mp.state.gameState;

  const campaign = isMultiplayer ? mpGameState?.campaign : soloCampaign;
  const character = isMultiplayer
    ? mpGameState?.characters?.find((c) => c.odId === mp.state.myOdId) || mpGameState?.characters?.[0]
    : soloCharacter;
  const allCharacters = isMultiplayer ? (mpGameState?.characters || []) : (character ? [character] : []);
  const scenes = isMultiplayer ? (mpGameState?.scenes || []) : soloScenes;
  const chatHistory = isMultiplayer ? (mpGameState?.chatHistory || []) : soloChatHistory;
  const world = isMultiplayer ? mpGameState?.world : soloWorld;
  const quests = isMultiplayer ? mpGameState?.quests : soloQuests;
  const isGeneratingScene = isMultiplayer ? mp.state.isGenerating : soloIsGeneratingScene;
  const error = isMultiplayer ? mp.state.error : soloError;
  const currentScene = scenes[scenes.length - 1] || null;
  const attrPoints = character?.attributePoints || 0;

  return {
    isMultiplayer,
    campaign,
    character,
    allCharacters,
    scenes,
    chatHistory,
    world,
    quests,
    isGeneratingScene,
    isGeneratingImage,
    error,
    aiCosts,
    currentScene,
    attrPoints,
    dispatch,
    mp,
    mpGameState,
  };
}
