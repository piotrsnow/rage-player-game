import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { storage } from '../../services/storage';
import {
  useGameCampaign,
  useGameCharacter,
  useGameParty,
  useGameWorld,
  useGameQuests,
  useGameScenes,
  useGameChatHistory,
  useGameCombat,
  useGameMagic,
  useGameAchievements,
  useGameAiCosts,
  useGameIsLoading,
  useGameIsGeneratingScene,
  useGameIsGeneratingImage,
  useGameError,
  useGameSlice,
  useGameDispatch,
  useGameAutoSave,
} from '../../stores/gameSelectors';
import { useSettings } from '../../contexts/SettingsContext';
import { useMultiplayer } from '../../contexts/MultiplayerContext';
import { useAI } from '../../hooks/useAI';
import { useNarrator } from '../../hooks/useNarrator';
import { useGlobalMusic } from '../../contexts/MusicContext';
import { exportAsMarkdown } from '../../services/exportLog';
import { apiClient } from '../../services/apiClient';
import ScenePanel from './ScenePanel';
import ActionPanel from './ActionPanel';
import ChatPanel from './ChatPanel';
import StatusBar from '../ui/StatusBar';
import LoadingSpinner from '../ui/LoadingSpinner';
import SceneGenerationProgress from './SceneGenerationProgress';
import CostBadge from '../ui/CostBadge';
import CombatPanel from './CombatPanel';
import MagicPanel from './MagicPanel';
import TradePanel from './TradePanel';
import CraftingPanel from './CraftingPanel';
import AlchemyPanel from './AlchemyPanel';
import PartyPanel from './PartyPanel';
import QuestOffersPanel from './QuestOffersPanel';
import GameplayModals from './GameplayModals';
import GameplayHeader from './GameplayHeader';
import { useModals } from '../../contexts/ModalContext';
import { translateAttribute } from '../../utils/rpgTranslate';
import { useAutoPlayer } from '../../hooks/useAutoPlayer';
import { useIdleTimer } from '../../hooks/useIdleTimer';
import TypewriterActionOverlay from './TypewriterActionOverlay';
import DiceRollAnimationOverlay from './DiceRollAnimationOverlay';
import IdleTimer from './IdleTimer';
import CutscenePanel from './CutscenePanel';
import { calculateTensionScore } from '../../services/tensionTracker';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { usePlayTimeTracker } from '../../hooks/usePlayTimeTracker';
import { useStreamingNarrator } from '../../hooks/useStreamingNarrator';
import { useMultiplayerSceneGenTimer } from '../../hooks/useMultiplayerSceneGenTimer';
import { useSceneScrollSync } from '../../hooks/useSceneScrollSync';
import { useImageRepairQueue } from '../../hooks/useImageRepairQueue';
import { useSummary } from '../../hooks/useSummary';
import { useCampaignLoader } from '../../hooks/useCampaignLoader';
import { useViewerMode } from '../../hooks/useViewerMode';
import { useMultiplayerVoiceSync } from '../../hooks/useMultiplayerVoiceSync';
import { useMultiplayerCombatSceneDetect } from '../../hooks/useMultiplayerCombatSceneDetect';
import { useCombatResolution } from '../../hooks/useCombatResolution';
import { canLeaveCampaign, getLeaveBlockedMessage } from '../../services/campaignGuard';
import MainQuestCompleteModal from './MainQuestCompleteModal';

function hashCode(str) {
  let h = 0;
  for (let i = 0; i < (str || '').length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export default function GameplayPage({ readOnly = false, shareToken = null, onRefresh = null }) {
  // Temporary kill switch for timer-driven idle world events.
  const IDLE_WORLD_EVENTS_ENABLED = false;

  const navigate = useNavigate();
  const location = useLocation();
  const { campaignId: urlCampaignId } = useParams();
  const { t } = useTranslation();
  const dispatch = useGameDispatch();
  const autoSave = useGameAutoSave();
  // Granular per-slice subscriptions — each field only triggers a re-render when
  // that specific slice changes. The `state` memo keeps the rest of this file
  // + all state-receiving children stable when unrelated slices change.
  const sCampaign = useGameCampaign();
  const sCharacter = useGameCharacter();
  const sParty = useGameParty();
  const sWorld = useGameWorld();
  const sQuests = useGameQuests();
  const sScenes = useGameScenes();
  const sChatHistory = useGameChatHistory();
  const sCombat = useGameCombat();
  const sMagic = useGameMagic();
  const sAchievements = useGameAchievements();
  const sAiCosts = useGameAiCosts();
  const sIsLoading = useGameIsLoading();
  const sIsGeneratingScene = useGameIsGeneratingScene();
  const sIsGeneratingImage = useGameIsGeneratingImage();
  const sError = useGameError();
  const sActiveCharacterId = useGameSlice((s) => s.activeCharacterId);
  const sCharacterVoiceMap = useGameSlice((s) => s.characterVoiceMap);
  const sMainQuestJustCompleted = useGameSlice((s) => s.mainQuestJustCompleted);
  const sTrade = useGameSlice((s) => s.trade);
  const sCrafting = useGameSlice((s) => s.crafting);
  const sAlchemy = useGameSlice((s) => s.alchemy);
  const sMomentumBonus = useGameSlice((s) => s.momentumBonus);
  const sNarrationTime = useGameSlice((s) => s.narrationTime);
  const state = useMemo(() => ({
    campaign: sCampaign,
    character: sCharacter,
    party: sParty,
    world: sWorld,
    quests: sQuests,
    scenes: sScenes,
    chatHistory: sChatHistory,
    combat: sCombat,
    magic: sMagic,
    achievements: sAchievements,
    aiCosts: sAiCosts,
    isLoading: sIsLoading,
    isGeneratingScene: sIsGeneratingScene,
    isGeneratingImage: sIsGeneratingImage,
    error: sError,
    activeCharacterId: sActiveCharacterId,
    characterVoiceMap: sCharacterVoiceMap,
    mainQuestJustCompleted: sMainQuestJustCompleted,
    trade: sTrade,
    crafting: sCrafting,
    alchemy: sAlchemy,
    momentumBonus: sMomentumBonus,
    narrationTime: sNarrationTime,
  }), [
    sCampaign, sCharacter, sParty, sWorld, sQuests, sScenes, sChatHistory,
    sCombat, sMagic, sAchievements, sAiCosts, sIsLoading, sIsGeneratingScene,
    sIsGeneratingImage, sError, sActiveCharacterId, sCharacterVoiceMap,
    sMainQuestJustCompleted, sTrade, sCrafting, sAlchemy, sMomentumBonus,
    sNarrationTime,
  ]);
  const { settings, updateSettings, updateDMSettings } = useSettings();
  const { openSettings } = useModals();
  const mp = useMultiplayer();
  const { generateScene, generateImageForScene, generateRecap, acceptQuestOffer, declineQuestOffer, sceneGenStartTime, lastSceneGenMs, earlyDiceRoll, clearEarlyDiceRoll, streamingNarrative, streamingSegments } = useAI();
  const viewerBackendUrl = readOnly ? (apiClient.getBaseUrl() || settings.backendUrl || '') : null;
  const narrator = useNarrator(
    readOnly && shareToken
      ? { viewerMode: true, shareToken, backendUrl: viewerBackendUrl }
      : undefined
  );
  const { setNarratorState } = useGlobalMusic();

  const isMultiplayer = mp.state.isMultiplayer && mp.state.phase === 'playing';
  const mpGameState = mp.state.gameState;
  const chatHistory = isMultiplayer ? (mpGameState?.chatHistory || []) : state.chatHistory;

  useEffect(() => {
    setNarratorState(narrator.playbackState);
  }, [narrator.playbackState, setNarratorState]);

  const { streamingNarrationActiveRef } = useStreamingNarrator({
    narrator,
    streamingSegments,
    streamingNarrative,
    chatHistory,
    enabled: settings.narratorEnabled,
    autoPlay: settings.narratorAutoPlay,
    readOnly,
  });

  const { sessionStartTime, sessionSeconds, totalPlayTime } = usePlayTimeTracker();

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [worldModalOpen, setWorldModalOpen] = useState(false);
  const [gmModalOpen, setGmModalOpen] = useState(false);
  const [mpPanelOpen, setMpPanelOpen] = useState(false);
  const [advancementOpen, setAdvancementOpen] = useState(false);
  const [achievementsOpen, setAchievementsOpen] = useState(false);
  const [videoPanelOpen, setVideoPanelOpen] = useState(false);
  const [autoPlayerSettingsOpen, setAutoPlayerSettingsOpen] = useState(false);
  const [viewingSceneIndex, setViewingSceneIndex] = useState(null);
  const [autoPlayScenes, setAutoPlayScenes] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [shareLoading, setShareLoading] = useState(false);
  const autoPlayRef = useRef(false);
  const displayedSceneIndexRef = useRef(0);
  const handleSceneNavRef = useRef(null);
  const consecutiveIdleEventsRef = useRef(0);

  const campaign = isMultiplayer ? mpGameState?.campaign : state.campaign;
  useDocumentTitle(campaign?.name);
  const character = isMultiplayer
    ? mpGameState?.characters?.find((c) => c.odId === mp.state.myOdId) || mpGameState?.characters?.[0]
    : state.character;

  const party = state.party || [];
  const hasParty = party.length > 0;

  const activeCharacterId = state.activeCharacterId;
  const isViewingCompanion = !isMultiplayer && hasParty && activeCharacterId
    && party.some((m) => (m.id || m.name) === activeCharacterId);
  const viewedMember = isViewingCompanion
    ? party.find((m) => (m.id || m.name) === activeCharacterId)
    : null;
  const displayCharacter = viewedMember || character;

  const hasMagic = (character?.magic?.knownSpells?.length || 0) > 0;
  const attrPoints = character?.attributePoints || 0;
  const allCharacters = isMultiplayer ? (mpGameState?.characters || []) : (character ? [character] : []);
  const scenes = isMultiplayer ? (mpGameState?.scenes || []) : state.scenes;
  const isGeneratingScene = isMultiplayer ? mp.state.isGenerating : state.isGeneratingScene;
  const isGeneratingImage = state.isGeneratingImage;
  const error = isMultiplayer ? mp.state.error : state.error;
  const mpErrorCode = isMultiplayer ? mp.state.errorCode : null;
  const reconnectState = mp.state.reconnectState || { status: 'disconnected', attempt: 0, maxAttempts: 10 };
  const isMpReconnecting = isMultiplayer && reconnectState.status === 'reconnecting';
  const showMpConnectionBanner = isMultiplayer && (!mp.state.connected || isMpReconnecting);
  const aiCosts = state.aiCosts;
  const currentScene = scenes[scenes.length - 1] || null;

  const mpSceneGenStartTime = useMultiplayerSceneGenTimer({
    isMultiplayer,
    isGenerating: mp.state.isGenerating,
  });

  const { scrollTargetMessageId, requestChatScrollToMessage, clearScrollTargetIfMatches } = useSceneScrollSync({
    scenes,
    chatHistory,
    isGeneratingScene,
    setViewingSceneIndex,
  });

  const lastChosenAction = (() => {
    if (!currentScene) return null;
    if (currentScene.chosenAction != null && currentScene.chosenAction !== '') return currentScene.chosenAction;
    const pa = currentScene.playerActions;
    if (isMultiplayer && Array.isArray(pa) && character?.name) {
      const mine = pa.find((p) => p.name === character.name);
      return mine?.action ?? null;
    }
    return null;
  })();

  const isReviewingPastScene = viewingSceneIndex !== null && viewingSceneIndex < scenes.length - 1;
  const displayedSceneIndex = viewingSceneIndex ?? (scenes.length - 1);
  const viewedScene = scenes[displayedSceneIndex] || currentScene;
  const tensionScore = scenes.length > 0 ? calculateTensionScore(scenes, state.combat) : 0;

  const buildRecapStateForDisplayedScene = useCallback(() => {
    const lastIncludedIndex = Math.max(0, Math.min(displayedSceneIndex, scenes.length - 1));
    const includedScenes = scenes.slice(0, lastIncludedIndex + 1);
    const includedSceneIds = new Set(includedScenes.map((scene) => scene?.id).filter(Boolean));
    const filteredChatHistory = chatHistory.filter((msg) => {
      if (!msg?.sceneId) return true;
      return includedSceneIds.has(msg.sceneId);
    });

    if (isMultiplayer) {
      return {
        ...state,
        ...(mpGameState || {}),
        campaign: mpGameState?.campaign || state.campaign,
        character,
        scenes: includedScenes,
        chatHistory: filteredChatHistory,
      };
    }

    return {
      ...state,
      scenes: includedScenes,
      chatHistory: filteredChatHistory,
    };
  }, [displayedSceneIndex, scenes, chatHistory, isMultiplayer, state, mpGameState, character]);

  const recap = useSummary({
    settings,
    state,
    narrator,
    openSettings,
    t,
    generateRecap,
    buildRecapStateForDisplayedScene,
    displayedSceneIndex,
  });

  const { repairSceneImage, resetImageAttempts } = useImageRepairQueue({
    scenes,
    currentScene,
    viewedScene,
    campaign,
    isGeneratingImage,
    isGeneratingScene,
    isMultiplayer,
    isHost: mp.state.isHost,
    readOnly,
    sceneVisualization: settings.sceneVisualization,
    generateImageForScene,
    updateSceneImage: mp.updateSceneImage,
  });

  const [typewriterAction, setTypewriterAction] = useState(null);
  const [playerActionOverlayText, setPlayerActionOverlayText] = useState(null);
  const [pendingOverlayText, setPendingOverlayText] = useState(null);
  const typewriterNextIndexRef = useRef(null);
  const sceneGenSucceededRef = useRef(false);

  autoPlayRef.current = autoPlayScenes;
  displayedSceneIndexRef.current = displayedSceneIndex;

  const getSceneActionText = useCallback((scene) => {
    if (!scene) return null;
    return scene.chosenAction
      || (scene.playerActions && Object.values(scene.playerActions).filter(Boolean).join(' \u2022 '))
      || null;
  }, []);

  const playSceneNarration = useCallback((scene, fallbackIndex = null) => {
    if (!scene?.narrative) return;

    // Preferred: ElevenLabs narrator (requires backend auth + voice configured)
    if (narrator.isNarratorReady) {
      const msg = chatHistory.find((m) => m.sceneId === scene.id);
      const fallbackMsg = fallbackIndex != null
        ? chatHistory.filter((m) => m.role === 'dm')[fallbackIndex]
        : null;
      const narratorMsgId = msg?.id || fallbackMsg?.id || `play_${scene.id}`;
      narrator.speakSingle({
        content: scene.narrative,
        dialogueSegments: scene.dialogueSegments || [],
        soundEffect: scene.soundEffect || null,
      }, narratorMsgId);
      return;
    }

    // Fallback: browser TTS (works in viewer without backend auth)
    try {
      const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
      if (synth && typeof window.SpeechSynthesisUtterance !== 'undefined') {
        synth.cancel();
        const utter = new window.SpeechSynthesisUtterance(scene.narrative);
        utter.lang = settings.language || 'pl';
        utter.rate = Math.max(0.7, Math.min(1.2, (settings.dialogueSpeed || 100) / 100));
        synth.speak(utter);
        return;
      }
    } catch {
      // fall through to settings
    }
    openSettings();
  }, [narrator, chatHistory, openSettings, settings.language, settings.dialogueSpeed]);

  const navigateWithTypewriter = useCallback((nextIdx) => {
    if (typewriterAction) return;
    const nextScene = scenes[nextIdx];
    const actionText = getSceneActionText(nextScene);
    if (actionText) {
      typewriterNextIndexRef.current = nextIdx;
      setTypewriterAction(actionText);
    } else {
      const targetIdx = nextIdx >= scenes.length - 1 ? null : nextIdx;
      setViewingSceneIndex(targetIdx);
      handleSceneNavRef.current?.(nextIdx);
    }
  }, [typewriterAction, scenes, getSceneActionText]);

  useEffect(() => {
    if (
      narrator.playbackState === 'idle' &&
      autoPlayRef.current &&
      scenes.length > 0 &&
      !typewriterAction
    ) {
      const currentIdx = displayedSceneIndexRef.current;
      if (currentIdx < scenes.length - 1) {
        const timer = setTimeout(() => {
          if (!autoPlayRef.current) return;
          navigateWithTypewriter(currentIdx + 1);
        }, 1500);
        return () => clearTimeout(timer);
      } else {
        setAutoPlayScenes(false);
      }
    }
  }, [narrator.playbackState, scenes.length, typewriterAction, navigateWithTypewriter]);

  const handleTypewriterComplete = useCallback(() => {
    const nextIdx = typewriterNextIndexRef.current;
    typewriterNextIndexRef.current = null;
    setTypewriterAction(null);
    if (nextIdx != null) {
      const targetIdx = nextIdx >= scenes.length - 1 ? null : nextIdx;
      setViewingSceneIndex(targetIdx);
      handleSceneNavRef.current?.(nextIdx);
    }
  }, [scenes.length]);

  const handlePlayerActionOverlayComplete = useCallback(() => {
    clearEarlyDiceRoll();
    setPlayerActionOverlayText(null);
    if (!sceneGenSucceededRef.current) return;
    // Skip if streaming narration already started reading this scene
    if (streamingNarrationActiveRef.current || narrator.playbackState !== narrator.STATES.IDLE) return;
    if (settings.narratorEnabled && settings.narratorAutoPlay && narrator.isNarratorReady) {
      const latestDm = [...chatHistory].reverse().find((m) => m.role === 'dm');
      if (latestDm) {
        narrator.speakSingle(latestDm, latestDm.id);
      }
    }
  }, [settings.narratorEnabled, settings.narratorAutoPlay, narrator, chatHistory, clearEarlyDiceRoll]);

  const OVERLAY_LEAD_TIME_SECONDS = 12;

  useEffect(() => {
    if (!pendingOverlayText) return;
    const narratorIdle = narrator.playbackState === 'idle';
    const nearEnd = narrator.narrationSecondsRemaining <= OVERLAY_LEAD_TIME_SECONDS;
    if (narratorIdle || nearEnd) {
      setPlayerActionOverlayText(pendingOverlayText);
      setPendingOverlayText(null);
    }
  }, [pendingOverlayText, narrator.playbackState, narrator.narrationSecondsRemaining]);

  useCampaignLoader({ campaign, isMultiplayer, readOnly, urlCampaignId, dispatch, navigate });

  const handleRefresh = useCallback(async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      if (readOnly && onRefresh) {
        await onRefresh();
      } else if (isMultiplayer) {
        await mp.rejoinRoom();
      } else {
        const id = campaign?.backendId || urlCampaignId;
        if (id) {
          const data = await storage.loadCampaign(id);
          if (data) dispatch({ type: 'LOAD_CAMPAIGN', payload: data });
        }
      }
    } catch (err) {
      console.warn('[GameplayPage] Refresh failed:', err.message);
    } finally {
      setIsRefreshing(false);
    }
  }, [isRefreshing, readOnly, onRefresh, isMultiplayer, mp, campaign?.backendId, urlCampaignId, dispatch]);

  useEffect(() => {
    if (readOnly) return;
    if (settings.autoPlayer?.enabled) {
      updateSettings({ autoPlayer: { ...settings.autoPlayer, enabled: false } });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useViewerMode({
    readOnly,
    scenes,
    chatHistory,
    viewingSceneIndex,
    settings,
    updateSettings,
    location,
    navigate,
    setViewingSceneIndex,
    handleSceneNavigation: (idx) => handleSceneNavRef.current?.(idx),
    requestChatScrollToMessage,
  });

  useMultiplayerVoiceSync({
    isMultiplayer,
    players: mp.state.players,
    characterVoiceMap: state.characterVoiceMap,
    dispatch,
  });

  const handleSceneNavigation = (sceneIndex) => {
    const scene = scenes[sceneIndex];
    if (!scene) return;

    const targetMsg = chatHistory.find((m) => m.sceneId === scene.id);
    const fallbackMsg = !targetMsg
      ? chatHistory.filter((m) => m.role === 'dm')[sceneIndex]
      : null;
    const narratorMsgId = targetMsg?.id || fallbackMsg?.id || `nav_${scene.id}`;

    if (targetMsg) {
      requestChatScrollToMessage(targetMsg.id);
    } else if (fallbackMsg) {
      requestChatScrollToMessage(fallbackMsg.id);
    }

    if ((settings.narratorEnabled || readOnly) && narrator.isNarratorReady) {
      narrator.speakSingle({
        content: scene.narrative,
        dialogueSegments: scene.dialogueSegments || [],
        soundEffect: scene.soundEffect || null,
      }, narratorMsgId);
    }
  };
  handleSceneNavRef.current = handleSceneNavigation;

  const handleAction = async (action, isCustomAction = false, fromAutoPlayer = false) => {
    consecutiveIdleEventsRef.current = 0;
    idleTimer.resetTimer();
    sceneGenSucceededRef.current = false;
    if (!fromAutoPlayer && action) {
      const narratorIsActive = narrator.playbackState === 'playing' || narrator.playbackState === 'loading';
      if (narratorIsActive && settings.narratorEnabled && settings.narratorAutoPlay) {
        setPendingOverlayText(action);
      } else {
        setPlayerActionOverlayText(action);
      }
    }
    try {
      await generateScene(action, false, isCustomAction, fromAutoPlayer);
      sceneGenSucceededRef.current = true;
    } catch {
      // Error displayed in UI via context
    }
  };

  const handleFieldTurnReady = useCallback(() => {
    if (!state.world?.fieldMap) return;
    const fm = state.world.fieldMap;
    const buf = fm.stepBuffer || [];
    const from = buf.length > 0 ? buf[0] : fm.playerPos;
    const to = fm.playerPos;
    const uniqueTiles = new Set(buf.map((s) => s.tile)).size;
    const idleSteps = buf.filter((s) => s.x === from.x && s.y === from.y).length;
    const discovered = fm.discoveredPoi.map((p) => `${p.tile}@(${p.x},${p.y})`).join(', ');
    const actionText = `[FIELD_MOVE] steps=${buf.length} from=(${from.x},${from.y}) to=(${to.x},${to.y}) uniqueTiles=${uniqueTiles} idleSteps=${idleSteps} biome=${fm.activeBiome}${discovered ? ` discovered=${discovered}` : ''}`;
    dispatch({ type: 'FIELD_MAP_RESET_STEPS' });
    generateScene(actionText, false, false).catch(() => {});
  }, [state.world?.fieldMap, dispatch, generateScene]);

  const handleSceneGridChange = useCallback((sceneId, nextSceneGrid) => {
    if (!sceneId || !nextSceneGrid) return;
    const payload = { sceneId, sceneGrid: nextSceneGrid };
    if (isMultiplayer) {
      mp.dispatch({ type: 'UPDATE_SCENE_GRID', payload });
      return;
    }
    dispatch({ type: 'UPDATE_SCENE_GRID', payload });
    setTimeout(() => autoSave(), 250);
  }, [isMultiplayer, mp, dispatch, autoSave]);

  useEffect(() => {
    if ((settings.sceneVisualization || 'image') !== 'map') return;
    if (state.world?.fieldMap) return;
    if (!state.campaign) return;
    dispatch({
      type: 'INIT_FIELD_MAP',
      payload: {
        seed: state.campaign.id ? hashCode(state.campaign.id) : Date.now(),
        activeBiome: 'plains',
      },
    });
  }, [settings.sceneVisualization, state.world?.fieldMap, state.campaign, dispatch]);

  const handleActionRef = useRef(handleAction);
  handleActionRef.current = handleAction;
  const stableHandleAction = useCallback((...args) => handleActionRef.current(...args), []);

  const autoPlayer = useAutoPlayer(
    isMultiplayer ? null : stableHandleAction,
    {
      narratorPlaybackState: narrator.playbackState,
      shouldWaitForNarration: !isMultiplayer
        && settings.narratorEnabled
        && settings.narratorAutoPlay
        && narrator.isNarratorReady,
    }
  );

  useEffect(() => {
    if (typewriterAction || autoPlayer.overlayAction || playerActionOverlayText) {
      narrator.stop();
      try { window.speechSynthesis?.cancel(); } catch {}
    }
  }, [!!typewriterAction, !!autoPlayer.overlayAction, !!playerActionOverlayText]);

  const overlayText = typewriterAction || autoPlayer.overlayAction || playerActionOverlayText;
  const overlayOnComplete = typewriterAction
    ? handleTypewriterComplete
    : autoPlayer.overlayAction
      ? autoPlayer.completeOverlay
      : handlePlayerActionOverlayComplete;
  const isPlayerActionOverlayActive = !typewriterAction && !autoPlayer.overlayAction && !!playerActionOverlayText;
  const overlayTypingSpeedMultiplier = isPlayerActionOverlayActive
    ? (isGeneratingScene ? 3 : 1)
    : 1;
  const overlayHoldOpen = isPlayerActionOverlayActive && isGeneratingScene && streamingNarrative === null;
  const overlayHoldingDurationMs = isPlayerActionOverlayActive ? 800 : 1500;

  const DICE_AFTER_TYPEWRITER_DELAY_MS = 500;
  const [diceAfterTypewriter, setDiceAfterTypewriter] = useState(false);
  const diceTypewriterTimerRef = useRef(null);

  useEffect(() => {
    if (diceTypewriterTimerRef.current) {
      clearTimeout(diceTypewriterTimerRef.current);
      diceTypewriterTimerRef.current = null;
    }

    // Decoupled from overlayText on purpose: the typewriter overlay fast-fades
    // as soon as scene streaming starts (`fastFinish={streamingNarrative !== null}`),
    // but the dice animation (z-80, pointer-events-none) renders over the chat
    // independently. If we gate on overlayText, the dice overlay disappears the
    // moment the typewriter closes, cutting off the roll mid-animation.
    if (earlyDiceRoll) {
      diceTypewriterTimerRef.current = setTimeout(
        () => setDiceAfterTypewriter(true),
        DICE_AFTER_TYPEWRITER_DELAY_MS
      );
      return () => {
        if (diceTypewriterTimerRef.current) {
          clearTimeout(diceTypewriterTimerRef.current);
          diceTypewriterTimerRef.current = null;
        }
      };
    }

    setDiceAfterTypewriter(false);
  }, [earlyDiceRoll]);

  const MAX_CONSECUTIVE_IDLE_EVENTS = 2;

  const handleIdleEvent = useCallback(({ roll, threshold }) => {
    if (!IDLE_WORLD_EVENTS_ENABLED) return;
    if (consecutiveIdleEventsRef.current >= MAX_CONSECUTIVE_IDLE_EVENTS) return;
    consecutiveIdleEventsRef.current += 1;
    generateScene(`[IDLE_WORLD_EVENT: d50=${roll}, threshold=${threshold}]`, false, false).catch(() => {});
  }, [IDLE_WORLD_EVENTS_ENABLED, generateScene]);

  const idlePaused = isMultiplayer
    || !IDLE_WORLD_EVENTS_ENABLED
    || isGeneratingScene
    || !!(isMultiplayer ? mpGameState?.combat?.active : state.combat?.active)
    || autoPlayer.isAutoPlaying
    || isReviewingPastScene
    || (campaign?.status && campaign.status !== 'active')
    || character?.status === 'dead'
    || !currentScene;

  const idleTimer = useIdleTimer({
    paused: idlePaused,
    narratorPlaybackState: narrator.playbackState,
    narratorEnabled: settings.narratorEnabled,
    narratorReady: narrator.isNarratorReady,
    sceneId: currentScene?.id || null,
    onIdleEvent: handleIdleEvent,
  });

  const combatHandlers = useCombatResolution({
    isMultiplayer,
    dispatch,
    autoSave,
    narrator,
    generateScene,
    mp,
    settings,
    t,
  });

  useMultiplayerCombatSceneDetect({
    isMultiplayer,
    isHost: mp.state.isHost,
    mp,
    mpGameState,
  });

  const dismissError = () => {
    dispatch({ type: 'SET_ERROR', payload: null });
    if (isMultiplayer) {
      mp.dispatch({ type: 'SET_ERROR', payload: null });
    }
  };

  const handleAdvancementOpen = () => {
    if (isMultiplayer && character) {
      dispatch({ type: 'UPDATE_CHARACTER', payload: character });
    }
    setAdvancementOpen(true);
  };

  const handleAdvancementClose = () => {
    if (isMultiplayer && state.character) {
      mp.syncCharacter(state.character);
    }
    setAdvancementOpen(false);
  };

  const handleShare = async () => {
    const backendId = campaign?.backendId;
    if (!backendId || !apiClient.isConnected()) return;
    setShareLoading(true);
    try {
      const { shareToken } = await apiClient.post(`/campaigns/${backendId}/share`);
      const url = `${window.location.origin}/view/${shareToken}`;
      await navigator.clipboard.writeText(url);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2500);
    } catch (err) {
      console.error('[Share] Failed:', err);
    } finally {
      setShareLoading(false);
    }
  };

  if (!campaign) return (
    <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
      <LoadingSpinner size="lg" text={t('gameplay.loadingCampaign', 'Loading campaign...')} />
    </div>
  );

  return (
    <div className="flex flex-col lg:flex-row h-[calc(100vh-4rem)] overflow-hidden">
      {/* Main Game Area */}
      <div className={`flex-1 flex flex-col min-h-0 ${readOnly ? 'lg:mt-8' : ''}`}>
        <div className="flex-1 flex flex-col px-4 md:px-6 pt-4 md:pt-6 pb-2 gap-6 overflow-y-auto custom-scrollbar min-h-0">
        <GameplayHeader
          readOnly={readOnly}
          isMultiplayer={isMultiplayer}
          mpGameState={mpGameState}
          state={state}
          campaign={campaign}
          scenes={scenes}
          displayedSceneIndex={displayedSceneIndex}
          isReviewingPastScene={isReviewingPastScene}
          tensionScore={tensionScore}
          viewedScene={viewedScene}
          currentScene={currentScene}
          character={character}
          allCharacters={allCharacters}
          displayCharacter={displayCharacter}
          isViewingCompanion={isViewingCompanion}
          attrPoints={attrPoints}
          setViewingSceneIndex={setViewingSceneIndex}
          handleSceneNavigation={handleSceneNavigation}
          navigateWithTypewriter={navigateWithTypewriter}
          playSceneNarration={playSceneNarration}
          narrator={narrator}
          settings={settings}
          autoPlayScenes={autoPlayScenes}
          setAutoPlayScenes={setAutoPlayScenes}
          handleRefresh={handleRefresh}
          isRefreshing={isRefreshing}
          handleShare={handleShare}
          shareCopied={shareCopied}
          shareLoading={shareLoading}
          aiCosts={aiCosts}
          autoPlayer={autoPlayer}
          onOpenAutoPlayerSettings={() => setAutoPlayerSettingsOpen(true)}
          onOpenAdvancement={handleAdvancementOpen}
          onOpenMpPanel={() => setMpPanelOpen(true)}
          onOpenSummaryModal={recap.openSummaryModal}
          onOpenAchievements={() => setAchievementsOpen(true)}
          onOpenWorldModal={() => setWorldModalOpen(true)}
          onOpenGmModal={() => setGmModalOpen(true)}
          videoPanelOpen={videoPanelOpen}
          setVideoPanelOpen={setVideoPanelOpen}
        />

        {/* Context Depth Slider */}
        {!readOnly && (
          <div className="px-2 flex items-center gap-3 group">
            <span
              className="text-[10px] text-on-surface-variant/60 uppercase tracking-widest font-label whitespace-nowrap cursor-help"
              title={t('gameplay.contextDepthTooltip')}
            >
              {t('gameplay.contextDepth')}
            </span>
            <input
              type="range"
              min={0}
              max={100}
              step={25}
              value={settings.dmSettings?.contextDepth ?? 100}
              onChange={(e) => updateDMSettings({ contextDepth: Number(e.target.value) })}
              className="flex-1 h-1 appearance-none bg-outline/20 rounded-full accent-primary cursor-pointer [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:shadow-[0_0_6px_rgba(197,154,255,0.5)]"
            />
            <span className="text-[10px] text-primary/80 font-label uppercase tracking-wider min-w-[72px] text-right">
              {(settings.dmSettings?.contextDepth ?? 100) === 100
                ? t('gameplay.contextLevel_full')
                : (settings.dmSettings?.contextDepth ?? 100) >= 75
                ? t('gameplay.contextLevel_rich')
                : (settings.dmSettings?.contextDepth ?? 100) >= 50
                ? t('gameplay.contextLevel_standard')
                : (settings.dmSettings?.contextDepth ?? 100) >= 25
                ? t('gameplay.contextLevel_light')
                : t('gameplay.contextLevel_minimal')}
              {' '}{settings.dmSettings?.contextDepth ?? 100}%
            </span>
          </div>
        )}

        {/* Scene Panel */}
        <div className="relative">
          <ScenePanel
            scene={viewedScene}
            combat={isMultiplayer ? mpGameState?.combat : state.combat}
            isGeneratingImage={!isReviewingPastScene && isGeneratingImage}
            highlightInfo={narrator.highlightInfo}
            currentChunk={narrator.currentChunk}
            diceRoll={viewedScene?.diceRoll && !isGeneratingScene ? viewedScene.diceRoll : null}
            diceRolls={viewedScene?.diceRolls?.length && !isGeneratingScene ? viewedScene.diceRolls : null}
            world={isMultiplayer ? mpGameState?.world : state.world}
            characterName={character?.name}
            multiplayerPlayers={isMultiplayer ? (mp.state.players || []) : []}
            interactiveMap={!isMultiplayer && !readOnly && !isReviewingPastScene && (!campaign?.status || campaign.status === 'active')}
            onSceneGridChange={handleSceneGridChange}
            onFieldTurnReady={handleFieldTurnReady}
            onImageError={(sceneId) => {
              if (!sceneId) return;
              if (isMultiplayer && !mp.state.isHost) return;
              repairSceneImage(sceneId, { reason: 'img-onerror', skipAutoSave: readOnly }).then((repaired) => {
                if (!repaired && isMultiplayer) {
                  mp.updateSceneImage(sceneId, null);
                }
              });
            }}
            onRegenerateImage={readOnly ? null : (sceneId) => {
              if (!sceneId) return Promise.resolve(false);
              if (isMultiplayer && !mp.state.isHost) return Promise.resolve(false);
              resetImageAttempts(sceneId);
              return repairSceneImage(sceneId, { reason: 'manual-retry', forceNew: true });
            }}
          />
          {overlayText && (
            <TypewriterActionOverlay
              text={overlayText}
              onComplete={overlayOnComplete}
              typingSpeedMultiplier={overlayTypingSpeedMultiplier}
              holdOpen={overlayHoldOpen}
              holdingDurationMs={overlayHoldingDurationMs}
              showLoader={isPlayerActionOverlayActive && isGeneratingScene && streamingNarrative === null}
              loaderStartTime={isMultiplayer ? mpSceneGenStartTime : sceneGenStartTime}
              loaderEstimatedMs={lastSceneGenMs}
              fastFinish={streamingNarrative !== null}
            />
          )}
          {earlyDiceRoll && diceAfterTypewriter && (
            <DiceRollAnimationOverlay
              diceRoll={earlyDiceRoll}
              onDismiss={clearEarlyDiceRoll}
              holdOpen={!!overlayText}
            />
          )}
        </div>

        {/* Cutscene Panel */}
        {viewedScene?.cutscene && (
          <CutscenePanel cutscene={viewedScene.cutscene} />
        )}

        {/* Read-only: always show readable narrative text */}
        {readOnly && viewedScene?.narrative && (
          <div className="px-2 animate-fade-in">
            <div className="bg-surface-container-low/60 backdrop-blur-md border border-outline-variant/15 rounded-sm p-5 max-h-[40vh] overflow-y-auto custom-scrollbar">
              <label className="block text-[10px] text-on-surface-variant font-label uppercase tracking-widest mb-3">
                {t('common.scene')} {displayedSceneIndex + 1}
              </label>
              <p className="text-sm text-on-surface leading-relaxed whitespace-pre-line">
                {viewedScene.narrative}
              </p>
            </div>
          </div>
        )}

        {/* Past Scene Narrative Review */}
        {isReviewingPastScene && viewedScene?.narrative && (
          <div className="px-2 animate-fade-in space-y-3">
            <div className="bg-surface-container-low/60 backdrop-blur-md border border-outline-variant/15 rounded-sm p-5 max-h-60 overflow-y-auto custom-scrollbar">
              <label className="block text-[10px] text-on-surface-variant font-label uppercase tracking-widest mb-3">
                {t('gameplay.sceneReview', 'Scene review')} — {t('common.scene')} {displayedSceneIndex + 1}
              </label>
              <p className="text-sm text-on-surface leading-relaxed whitespace-pre-line">{viewedScene.narrative}</p>
            </div>
            <button
              onClick={() => {
                setViewingSceneIndex(null);
                handleSceneNavigation(scenes.length - 1);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-primary/15 border border-primary/30 rounded-sm text-[10px] font-label uppercase tracking-widest text-primary hover:bg-primary/25 transition-all"
            >
              <span className="material-symbols-outlined text-sm">skip_next</span>
              {t('gameplay.backToCurrent', 'Back to current scene')}
            </button>
          </div>
        )}

        {/* Character Quick Stats (Wounds/Meta-currencies for mobile) */}
        {displayCharacter && (
          <div className="lg:hidden space-y-3 px-2">
            <div className="grid grid-cols-2 gap-4">
              <StatusBar label={t('common.wounds')} current={displayCharacter.wounds} max={displayCharacter.maxWounds} color="error" />
              {displayCharacter.mana && (
                <StatusBar label="Mana" current={displayCharacter.mana.current} max={displayCharacter.mana.max} color="tertiary" />
              )}
            </div>
          </div>
        )}

        {/* Loading State — fill bar to 100% + fade out once streaming starts */}
        {isGeneratingScene && !readOnly && (
          <SceneGenerationProgress
            startTime={isMultiplayer ? mpSceneGenStartTime : sceneGenStartTime}
            estimatedMs={lastSceneGenMs}
            completing={streamingNarrative !== null}
          />
        )}

        {/* Multiplayer Connection Status */}
        {showMpConnectionBanner && !readOnly && (
          <div className="bg-warning-container/20 border border-warning/20 p-3 rounded-sm mx-2 animate-fade-in">
            <p className="text-warning text-sm flex items-center gap-2">
              <span className="material-symbols-outlined text-lg">{isMpReconnecting ? 'sync' : 'wifi_off'}</span>
              {isMpReconnecting
                ? `Reconnecting to multiplayer server (${reconnectState.attempt}/${reconnectState.maxAttempts})...`
                : 'Multiplayer connection is offline. Actions cannot be sent until reconnect succeeds.'}
            </p>
          </div>
        )}

        {/* Error Display */}
        {error && !readOnly && (
          <div className="bg-error-container/20 border border-error/20 p-4 rounded-sm mx-2 animate-fade-in">
            <div className="flex items-start justify-between gap-3">
              <p className="text-error text-sm flex items-center gap-2">
                <span className="material-symbols-outlined text-lg">error</span>
                {error}
              </p>
              <button onClick={dismissError} aria-label={t('common.close')} className="text-error/60 hover:text-error transition-colors shrink-0">
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>
            {mpErrorCode === 'NO_SERVER_API_KEY' && (
              <p className="mt-2 text-xs text-on-surface-variant">
                {t('gameplay.serverApiKeyMissingHint', 'Server API keys are missing. Ask the host/admin to configure backend environment variables.')}
              </p>
            )}
            {!isMultiplayer && error.includes('backend') && (
              <button
                onClick={openSettings}
                className="mt-2 text-xs text-primary hover:text-tertiary transition-colors underline"
              >
                {t('gameplay.goToSettings')}
              </button>
            )}
          </div>
        )}

        {/* Party Panel */}
        {hasParty && !isMultiplayer && !isReviewingPastScene && !readOnly && (
          <div className="px-2 animate-fade-in">
            <PartyPanel
              party={[{ ...character, type: 'player', id: character?.name }, ...party]}
              activeCharacterId={state.activeCharacterId || character?.name}
              onSwitchCharacter={(id) => dispatch({ type: 'SET_ACTIVE_CHARACTER', payload: id })}
              onManageCompanion={(id, updates) => dispatch({ type: 'UPDATE_PARTY_MEMBER', payload: { id, updates } })}
              dispatch={dispatch}
            />
          </div>
        )}

        {/* Combat Panel */}
        {((isMultiplayer ? mpGameState?.combat?.active : state.combat?.active)) && !isViewingCompanion && !isReviewingPastScene && !readOnly && (
          <div className="px-2 animate-fade-in">
            <CombatPanel
              combat={isMultiplayer ? mpGameState.combat : state.combat}
              gameState={isMultiplayer ? mpGameState : state}
              dispatch={dispatch}
              onEndCombat={combatHandlers.onEndCombat}
              onSurrender={combatHandlers.onSurrender}
              onForceTruce={combatHandlers.onForceTruce}
              character={character}
              isMultiplayer={isMultiplayer}
              myPlayerId={isMultiplayer ? `player_${mp.state.myOdId}` : 'player'}
              onSendManoeuvre={mp.sendCombatManoeuvre}
              onHostResolve={mp.syncCombatState}
              isHost={mp.state.isHost}
              mpCharacters={isMultiplayer ? mpGameState?.characters : undefined}
              onPersistState={() => setTimeout(() => autoSave(), 300)}
            />
          </div>
        )}

        {/* Magic Panel */}
        {hasMagic && !isMultiplayer && !state.combat?.active && !isViewingCompanion && !isReviewingPastScene && !readOnly && (
          <div className="px-2 animate-fade-in">
            <MagicPanel
              character={character}
              combat={state.combat}
              onCastSpell={(result) => {
                const spellName = result.spellName || result.spell?.name || t('magic.spells');
                let content;
                if (result.success) {
                  content = t('magic.chatCastSuccess', { spell: spellName, defaultValue: `Rzucono ${spellName}` });
                } else {
                  content = result.error || t('magic.chatCastFail', { spell: spellName, defaultValue: `Nie udalo sie rzucic ${spellName}` });
                }
                dispatch({
                  type: 'ADD_CHAT_MESSAGE',
                  payload: {
                    id: `msg_${Date.now()}_magic`,
                    role: 'system',
                    subtype: 'magic_cast',
                    content,
                    timestamp: Date.now(),
                  },
                });
              }}
            />
          </div>
        )}

        {/* Trade/Crafting/Alchemy panels moved to bottom fixed area */}

        {/* Main Quest Complete Modal */}
        {state.mainQuestJustCompleted && campaign?.status === 'active' && (
          <MainQuestCompleteModal state={state} dispatch={dispatch} navigate={navigate} />
        )}

        {/* Campaign End Screen */}
        {campaign?.status && campaign.status !== 'active' && (
          <div className="px-2 animate-fade-in">
            <div className="bg-surface-container-low p-8 border border-primary/20 rounded-sm text-center space-y-4">
              <span className="material-symbols-outlined text-5xl text-primary">
                {campaign.status === 'completed' ? 'emoji_events' : 'skull'}
              </span>
              <h2 className="font-headline text-2xl text-tertiary">
                {campaign.status === 'completed' ? t('gameplay.campaignCompleted', 'Campaign Completed!') : t('gameplay.campaignFailed', 'Campaign Failed')}
              </h2>
              {campaign.epilogue && (
                <p className="text-on-surface-variant text-sm leading-relaxed max-w-xl mx-auto">{campaign.epilogue}</p>
              )}
              <div className="flex items-center justify-center gap-4 pt-4">
                <button
                  onClick={() => {
                    if (isMultiplayer && mpGameState) {
                      exportAsMarkdown({ campaign: mpGameState.campaign, character, scenes: mpGameState.scenes, chatHistory: mpGameState.chatHistory, quests: mpGameState.quests, world: mpGameState.world });
                    } else {
                      exportAsMarkdown(state);
                    }
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-surface-container-high/40 border border-outline-variant/15 rounded-sm text-xs font-label uppercase tracking-widest text-on-surface-variant hover:text-primary transition-colors"
                >
                  <span className="material-symbols-outlined text-sm">download</span>
                  {t('gameplay.exportLog')}
                </button>
                <button
                  onClick={() => {
                    const guard = canLeaveCampaign(state);
                    if (!guard.allowed) { window.alert(getLeaveBlockedMessage(guard.reason)); return; }
                    dispatch({ type: 'RESET' }); navigate('/');
                  }}
                  className="flex items-center gap-2 px-6 py-2 bg-primary/15 border border-primary/30 rounded-sm text-xs font-label uppercase tracking-widest text-primary hover:bg-primary/25 transition-all"
                >
                  <span className="material-symbols-outlined text-sm">add</span>
                  {t('gameplay.newCampaign', 'New Campaign')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Quest Offers */}
        {currentScene?.questOffers?.length > 0 && !isGeneratingScene && !state.combat?.active && !isViewingCompanion && !isReviewingPastScene && (!campaign?.status || campaign.status === 'active') && !readOnly && (
          <div className="px-2 animate-fade-in">
            <QuestOffersPanel
              offers={currentScene.questOffers}
              onAccept={(offer) => isMultiplayer ? mp.acceptMpQuestOffer(currentScene.id, offer) : acceptQuestOffer(currentScene.id, offer)}
              onDecline={(offerId) => isMultiplayer ? mp.declineMpQuestOffer(currentScene.id, offerId) : declineQuestOffer(currentScene.id, offerId)}
            />
          </div>
        )}
        </div>

        {/* Bottom panel — always visible */}
        <div className="shrink-0 px-4 md:px-6 pb-4 md:pb-6 pt-2">
        {/* Action Panel */}
        {currentScene && !isGeneratingScene && !(isMultiplayer ? mpGameState?.combat?.active : state.combat?.active) && !isViewingCompanion && !isReviewingPastScene && (!campaign?.status || campaign.status === 'active') && character?.status !== 'dead' && !mp.state.isDead && !readOnly && (
          <div className={`px-2 animate-fade-in ${autoPlayer.isAutoPlaying && !autoPlayer.overlayAction && !isMultiplayer ? 'opacity-50 pointer-events-none' : autoPlayer.overlayAction ? 'pointer-events-none' : ''}`}>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[10px] text-on-surface-variant font-label uppercase tracking-widest">
                {autoPlayer.isAutoPlaying && !isMultiplayer ? t('autoPlayer.aiControlling') : t('gameplay.chooseAction')}
              </label>
              {!isMultiplayer && !autoPlayer.isAutoPlaying && (
                <IdleTimer
                  idleSeconds={idleTimer.idleSeconds}
                  timerActive={idleTimer.timerActive}
                  lastRoll={idleTimer.lastRoll}
                  isRolling={idleTimer.isRolling}
                  fastMode={idleTimer.fastMode}
                  onToggleFastMode={idleTimer.toggleFastMode}
                />
              )}
            </div>
            <ActionPanel
              key={currentScene.id || `scene-${scenes.length}`}
              actions={currentScene.actions || currentScene.suggestedActions || []}
              onAction={handleAction}
              disabled={isGeneratingScene}
              autoPlayerTypingText={autoPlayer.typingText}
              npcs={((isMultiplayer ? mpGameState?.world?.npcs : state.world?.npcs) || []).filter((npc) => npc.alive !== false && npc.lastLocation === (isMultiplayer ? mpGameState?.world?.currentLocation : state.world?.currentLocation))}
              character={character}
              dilemma={currentScene.dilemma}
              lastChosenAction={lastChosenAction}
              multiplayerPlayers={isMultiplayer ? (mp.state.players || []) : []}
              typingPlayers={isMultiplayer ? (mp.state.typingPlayers || {}) : {}}
              dispatch={dispatch}
              gameState={state}
            />
          </div>
        )}

        {/* Trade Panel */}
        {state.trade?.active && !isViewingCompanion && !isReviewingPastScene && !readOnly && (
          <div className="px-2 animate-fade-in">
            <TradePanel
              trade={state.trade}
              character={character}
              world={state.world}
              dispatch={dispatch}
              disabled={isGeneratingScene}
            />
          </div>
        )}

        {/* Crafting Panel */}
        {state.crafting?.active && !isViewingCompanion && !isReviewingPastScene && !readOnly && (
          <div className="px-2 animate-fade-in">
            <CraftingPanel
              character={character}
              dispatch={dispatch}
              disabled={isGeneratingScene}
            />
          </div>
        )}

        {/* Alchemy Panel */}
        {state.alchemy?.active && !isViewingCompanion && !isReviewingPastScene && !readOnly && (
          <div className="px-2 animate-fade-in">
            <AlchemyPanel
              character={character}
              dispatch={dispatch}
              disabled={isGeneratingScene}
            />
          </div>
        )}

        {/* Dead character notice (solo) */}
        {character?.status === 'dead' && !isMultiplayer && (!campaign?.status || campaign.status === 'active') && !readOnly && (
          <div className="px-2 animate-fade-in">
            <div className="bg-error-container/20 border border-error/20 p-6 rounded-sm text-center space-y-3">
              <span className="material-symbols-outlined text-4xl text-error">skull</span>
              <p className="text-error font-headline text-lg">{t('gameplay.characterDead', 'Your character has fallen')}</p>
              <p className="text-on-surface-variant text-xs">{t('gameplay.characterDeadDesc', 'Death is final.')}</p>
            </div>
          </div>
        )}

        {/* MP Spectator mode for dead player */}
        {isMultiplayer && mp.state.isDead && (!campaign?.status || campaign.status === 'active') && !readOnly && (
          <div className="px-2 animate-fade-in">
            <div className="bg-error-container/20 border border-error/20 p-6 rounded-sm text-center space-y-3">
              <span className="material-symbols-outlined text-4xl text-error">skull</span>
              <p className="text-error font-headline text-lg">{t('combat.playerDied', 'Your character has fallen')}</p>
              <p className="text-on-surface-variant text-xs">{t('combat.spectatorDesc', 'You are now spectating. Your character is dead and cannot take any more actions.')}</p>
            </div>
          </div>
        )}
        </div>

      </div>

      {/* Right Sidebar: Chat Panel */}
      <aside className="w-full lg:w-96 bg-surface-container-low/50 backdrop-blur-md border-l border-outline-variant/15 flex flex-col h-[400px] lg:h-full shrink-0">
        <ChatPanel
          messages={chatHistory}
          streamingNarrative={streamingNarrative}
          streamingSegments={streamingSegments}
          narrator={settings.narratorEnabled ? narrator : null}
          autoPlay={!readOnly && settings.narratorEnabled && settings.narratorAutoPlay && !pendingOverlayText && !playerActionOverlayText}
          myOdId={isMultiplayer ? mp.state.myOdId : null}
          momentumBonus={isMultiplayer
            ? (mpGameState?.characterMomentum?.[character?.name] || 0)
            : (state.momentumBonus || 0)}
          scrollToMessageId={scrollTargetMessageId}
          onScrollTargetHandled={clearScrollTargetIfMatches}
          typingPlayers={isMultiplayer ? mp.state.typingPlayers : {}}
          sessionSeconds={sessionSeconds}
          totalPlayTime={totalPlayTime}
          narrationTime={state.narrationTime || 0}
        />
      </aside>

      <GameplayModals
        readOnly={readOnly}
        isMultiplayer={isMultiplayer}
        mpGameState={mpGameState}
        state={state}
        settings={settings}
        dispatch={dispatch}
        autoSave={autoSave}
        narrator={narrator}
        worldModalOpen={worldModalOpen}
        onWorldModalClose={() => setWorldModalOpen(false)}
        gmModalOpen={gmModalOpen}
        onGmModalClose={() => setGmModalOpen(false)}
        mpPanelOpen={mpPanelOpen}
        onMpPanelClose={() => setMpPanelOpen(false)}
        advancementOpen={advancementOpen}
        onAdvancementClose={handleAdvancementClose}
        achievementsOpen={achievementsOpen}
        onAchievementsClose={() => setAchievementsOpen(false)}
        autoPlayerSettingsOpen={autoPlayerSettingsOpen}
        onAutoPlayerSettingsClose={() => setAutoPlayerSettingsOpen(false)}
        autoPlayer={autoPlayer}
        character={character}
        isGeneratingScene={isGeneratingScene}
        recap={recap}
        displayedSceneIndex={displayedSceneIndex}
        scenes={scenes}
        videoPanelOpen={videoPanelOpen}
        onVideoPanelClose={() => setVideoPanelOpen(false)}
      />
    </div>
  );
}
