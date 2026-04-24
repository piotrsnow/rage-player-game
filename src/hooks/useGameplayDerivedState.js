import { calculateTensionScore } from '../services/tensionTracker';

/**
 * Resolves "which source of truth am I reading from" for every slice the
 * gameplay page cares about. Multiplayer rooms route through `mp.state`
 * + `mpGameState`; solo campaigns read Zustand slices directly. Centralising
 * that branching here lets the page itself stay declarative.
 *
 * This is a plain function (not a real hook) — it has no state of its own
 * and returns a fresh object every render. Callers can destructure whatever
 * they need; unused fields cost nothing.
 */
export function useGameplayDerivedState({
  sCampaign,
  sCharacter,
  sParty,
  sScenes,
  sChatHistory,
  sCombat,
  sAiCosts,
  sIsGeneratingScene,
  sIsGeneratingImage,
  sError,
  sActiveCharacterId,
  mp,
}) {
  const isMultiplayer = mp.state.isMultiplayer && mp.state.phase === 'playing';
  const mpGameState = mp.state.gameState;

  const chatHistory = isMultiplayer ? (mpGameState?.chatHistory || []) : sChatHistory;
  const campaign = isMultiplayer ? mpGameState?.campaign : sCampaign;
  const character = isMultiplayer
    ? (mpGameState?.characters?.find((c) => c.odId === mp.state.myOdId) || mpGameState?.characters?.[0])
    : sCharacter;

  const party = sParty || [];
  const hasParty = party.length > 0;
  const activeCharacterId = sActiveCharacterId;
  const isViewingCompanion = !isMultiplayer
    && hasParty
    && activeCharacterId
    && party.some((m) => (m.id || m.name) === activeCharacterId);
  const viewedMember = isViewingCompanion
    ? party.find((m) => (m.id || m.name) === activeCharacterId)
    : null;
  const displayCharacter = viewedMember || character;

  const hasMagic = (character?.magic?.knownSpells?.length || 0) > 0;
  const attrPoints = character?.attributePoints || 0;
  const allCharacters = isMultiplayer
    ? (mpGameState?.characters || [])
    : (character ? [character] : []);

  const scenes = isMultiplayer ? (mpGameState?.scenes || []) : sScenes;
  const isGeneratingScene = isMultiplayer ? mp.state.isGenerating : sIsGeneratingScene;
  const isGeneratingImage = sIsGeneratingImage;
  const combat = isMultiplayer ? mpGameState?.combat : sCombat;

  const error = isMultiplayer ? mp.sError : sError;
  const mpErrorCode = isMultiplayer ? mp.sErrorCode : null;
  const reconnectState = mp.state.reconnectState || { status: 'disconnected', attempt: 0, maxAttempts: 10 };
  const isMpReconnecting = isMultiplayer && reconnectState.status === 'reconnecting';
  const showMpConnectionBanner = isMultiplayer && (!mp.state.connected || isMpReconnecting);

  const aiCosts = sAiCosts;
  const currentScene = scenes[scenes.length - 1] || null;
  const tensionScore = scenes.length > 0 ? calculateTensionScore(scenes, sCombat) : 0;

  return {
    isMultiplayer,
    mpGameState,
    chatHistory,
    campaign,
    character,
    party,
    hasParty,
    activeCharacterId,
    isViewingCompanion,
    viewedMember,
    displayCharacter,
    hasMagic,
    attrPoints,
    allCharacters,
    scenes,
    isGeneratingScene,
    isGeneratingImage,
    combat,
    error,
    mpErrorCode,
    reconnectState,
    isMpReconnecting,
    showMpConnectionBanner,
    aiCosts,
    currentScene,
    tensionScore,
  };
}
