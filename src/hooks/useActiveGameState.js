import { useGame } from '../contexts/GameContext';
import { useMultiplayer } from '../contexts/MultiplayerContext';

export function useActiveGameState() {
  const { state, dispatch } = useGame();
  const mp = useMultiplayer();

  const isMultiplayer = mp.state.isMultiplayer && mp.state.phase === 'playing';
  const mpGameState = mp.state.gameState;

  const campaign = isMultiplayer ? mpGameState?.campaign : state.campaign;
  const character = isMultiplayer
    ? mpGameState?.characters?.find((c) => c.odId === mp.state.myOdId) || mpGameState?.characters?.[0]
    : state.character;
  const allCharacters = isMultiplayer ? (mpGameState?.characters || []) : (character ? [character] : []);
  const scenes = isMultiplayer ? (mpGameState?.scenes || []) : state.scenes;
  const chatHistory = isMultiplayer ? (mpGameState?.chatHistory || []) : state.chatHistory;
  const world = isMultiplayer ? mpGameState?.world : state.world;
  const quests = isMultiplayer ? mpGameState?.quests : state.quests;
  const isGeneratingScene = isMultiplayer ? mp.state.isGenerating : state.isGeneratingScene;
  const isGeneratingImage = state.isGeneratingImage;
  const error = isMultiplayer ? mp.state.error : state.error;
  const aiCosts = state.aiCosts;
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
    state,
    dispatch,
    mp,
    mpGameState,
  };
}
