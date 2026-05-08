import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getGameState } from '../../stores/gameStore';
import {
  useGameCampaign,
  useGameCharacter,
  useGameParty,
  useGameWorld,
  useGameScenes,
  useGameChatHistory,
  useGameCombat,
  useGameAiCosts,
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
import { useDictation } from '../../hooks/useDictation';
import { useDictationContext } from '../../contexts/DictationContext';
import { useNarrator } from '../../hooks/useNarrator';
import { useGlobalMusic } from '../../contexts/MusicContext';
import { apiClient } from '../../services/apiClient';
import { storage } from '../../services/storage';
import ScenePanel from './ScenePanel';
import ActionPanel from './ActionPanel';
import ChatPanel from './ChatPanel';
import StatusBar from '../ui/StatusBar';
import LoadingSpinner from '../ui/LoadingSpinner';
import SceneGenerationProgress from './SceneGenerationProgress';
import CombatPanel from './CombatPanel';
import MagicPanel from './MagicPanel';
import TradePanel from './TradePanel';
import CraftingPanel from './CraftingPanel';
import AlchemyPanel from './AlchemyPanel';
import LivingWorldCompanionsSection from './LivingWorldCompanionsSection';
import QuestOffersPanel from './QuestOffersPanel';
import GameplayModals from './GameplayModals';
import GameplayHeader from './GameplayHeader';
import ContextDepthSlider from './ContextDepthSlider';
import GameplayStatusBanners from './GameplayStatusBanners';
import GameplayCampaignEnd from './GameplayCampaignEnd';
import GameplayDeadNotices from './GameplayDeadNotices';
import { useModals } from '../../contexts/ModalContext';
import { useAutoPlayer } from '../../hooks/useAutoPlayer';
import { useIdleTimer } from '../../hooks/useIdleTimer';
import TypewriterActionOverlay from './TypewriterActionOverlay';
import DiceRollAnimationOverlay from './DiceRollAnimationOverlay';
import IdleTimer from './IdleTimer';
import CutscenePanel from './CutscenePanel';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { usePlayTimeTracker } from '../../hooks/usePlayTimeTracker';
import { useMultiplayerSceneGenTimer } from '../../hooks/useMultiplayerSceneGenTimer';
import { useSceneScrollSync } from '../../hooks/useSceneScrollSync';
import { useImageRepairQueue } from '../../hooks/useImageRepairQueue';
import { useSummary } from '../../hooks/useSummary';
import { useCampaignLoader } from '../../hooks/useCampaignLoader';
import { useViewerMode } from '../../hooks/useViewerMode';
import { useMultiplayerVoiceSync } from '../../hooks/useMultiplayerVoiceSync';
import { useMultiplayerCombatSceneDetect } from '../../hooks/useMultiplayerCombatSceneDetect';
import { useCombatResolution } from '../../hooks/useCombatResolution';
import { useGameplayDerivedState } from '../../hooks/useGameplayDerivedState';
import { useGameplayOverlays } from '../../hooks/useGameplayOverlays';
import { useGameplayActions } from '../../hooks/useGameplayActions';
import { useUltrawideBonus } from '../../hooks/useUltrawideBonus';
import { useMomentumMinigame } from '../../hooks/useMomentumMinigame';
import { useFavoriteScenes } from '../../hooks/useFavoriteScenes';
import MainQuestCompleteModal from './MainQuestCompleteModal';
import { ActionTagProvider } from '../../contexts/ActionTagContext';

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
  const uwBonus = useUltrawideBonus();

  // Granular per-slice subscriptions — each field only triggers a re-render when
  // that specific slice changes. No reconstructed `state` object: children that
  // need full state use getGameState() on demand, and MP-resolved vars below
  // swap in mpGameState fields when in multiplayer mode.
  const sCampaign = useGameCampaign();
  const sCharacter = useGameCharacter();
  const sParty = useGameParty();
  const sWorld = useGameWorld();
  const sScenes = useGameScenes();
  const sChatHistory = useGameChatHistory();
  const sCombat = useGameCombat();
  const sAiCosts = useGameAiCosts();
  const sIsGeneratingScene = useGameIsGeneratingScene();
  const sIsGeneratingImage = useGameIsGeneratingImage();
  const sError = useGameError();
  const sActiveCharacterId = useGameSlice((s) => s.activeCharacterId);
  const sLocalDiceRoll = useGameSlice((s) => s.localDiceRoll);
  const sCharacterVoiceMap = useGameSlice((s) => s.characterVoiceMap);
  const sMainQuestJustCompleted = useGameSlice((s) => s.mainQuestJustCompleted);
  const sTrade = useGameSlice((s) => s.trade);
  const sCrafting = useGameSlice((s) => s.crafting);
  const sAlchemy = useGameSlice((s) => s.alchemy);
  const sMomentumBonus = useGameSlice((s) => s.momentumBonus);
  const sNarrationTime = useGameSlice((s) => s.narrationTime);
  const { settings, updateSettings, updateDMSettings, voicePools } = useSettings();
  const viewerBackendUrl = readOnly ? (apiClient.getBaseUrl() || settings.backendUrl || '') : null;
  // useNarrator is declared above useDictation so the dictation hook can react
  // to TTS playback state (auto-mute mic while the narrator speaks).
  const narrator = useNarrator(
    readOnly && shareToken
      ? { viewerMode: true, shareToken, backendUrl: viewerBackendUrl }
      : undefined,
  );
  const dictation = useDictation({
    lang: settings.language || 'pl',
    narratorState: narrator.playbackState,
    narratorPause: narrator.pause,
  });
  const { openSettings, openGmModal, setPlayerActionHandler } = useModals();
  const dictCtx = useDictationContext();
  const mp = useMultiplayer();
  const {
    generateScene, generateImageForScene, generateRecap,
    acceptQuestOffer, declineQuestOffer,
    sceneGenStartTime, lastSceneGenMs,
    earlyDiceRoll, clearEarlyDiceRoll,
    streamingNarrative, streamingSegments,
    streamComplete,
  } = useAI();

  const { setNarratorState } = useGlobalMusic();

  // Resolve "which source of truth" for every slice — single branch point
  // for solo vs MP that the rest of the page can lean on.
  const derived = useGameplayDerivedState({
    sCampaign, sCharacter, sParty, sScenes, sChatHistory, sCombat, sAiCosts,
    sIsGeneratingScene, sIsGeneratingImage, sError, sActiveCharacterId, mp,
  });
  const {
    isMultiplayer, mpGameState, chatHistory, campaign, character,
    party, hasParty, isViewingCompanion, displayCharacter,
    hasMagic, attrPoints, allCharacters, scenes, isGeneratingScene,
    isGeneratingImage, combat, error, mpErrorCode, reconnectState,
    isMpReconnecting, showMpConnectionBanner, aiCosts, currentScene, tensionScore,
  } = derived;

  const favoriteScenesHook = useFavoriteScenes(readOnly ? null : character?.backendId);

  useDocumentTitle(campaign?.name);

  /** Keep document at top in /play — chat/combat used scrollIntoView and pulled the window down. */
  useLayoutEffect(() => {
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, [urlCampaignId, readOnly, location.pathname, location.key]);

  useEffect(() => {
    setNarratorState(narrator.playbackState);
  }, [narrator.playbackState, setNarratorState]);

  // Feed the dictation classifier with live game state so the auto-mode can
  // bias toward action during combat and dialogue when an NPC is mid-scene.
  useEffect(() => {
    dictation.setGameContext({
      combatActive: !!combat,
      activeDialogueNpc: currentScene?.npcSpeakers?.[0] || null,
    });
  }, [dictation.setGameContext, combat, currentScene]);

  useEffect(() => {
    dictCtx?.register(dictation);
    return () => dictCtx?.unregister();
  }, [dictation, dictCtx]);

  const { sessionStartTime, sessionSeconds, totalPlayTime } = usePlayTimeTracker();

  // Modal open/close flags — kept in the page because they don't fit any of
  // the extracted hooks' concerns and are wired straight into GameplayModals.
  const [worldModalOpen, setWorldModalOpen] = useState(false);
  const [worldModalInitialTab, setWorldModalInitialTab] = useState('npcs');
  const [mpPanelOpen, setMpPanelOpen] = useState(false);
  const [achievementsOpen, setAchievementsOpen] = useState(false);
  const [systemLogsOpen, setSystemLogsOpen] = useState(false);
  const [videoPanelOpen, setVideoPanelOpen] = useState(false);
  const [autoPlayerSettingsOpen, setAutoPlayerSettingsOpen] = useState(false);
  const [viewingSceneIndex, setViewingSceneIndex] = useState(null);
  const [autoPlayScenes, setAutoPlayScenes] = useState(false);
  const [combatExpandedLayout, setCombatExpandedLayout] = useState(false);
  useEffect(() => { if (!combat?.active) setCombatExpandedLayout(false); }, [combat?.active]);
  const handleSceneNavRef = useRef(null);
  const consecutiveIdleEventsRef = useRef(0);
  const sceneGenSucceededRef = useRef(false);

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

  const buildRecapStateForDisplayedScene = useCallback(() => {
    const lastIncludedIndex = Math.max(0, Math.min(displayedSceneIndex, scenes.length - 1));
    const includedScenes = scenes.slice(0, lastIncludedIndex + 1);
    const includedSceneIds = new Set(includedScenes.map((scene) => scene?.id).filter(Boolean));
    const filteredChatHistory = chatHistory.filter((msg) => {
      if (!msg?.sceneId) return true;
      return includedSceneIds.has(msg.sceneId);
    });

    const baseState = getGameState();

    if (isMultiplayer) {
      return {
        ...baseState,
        ...(mpGameState || {}),
        campaign: mpGameState?.campaign || baseState.campaign,
        character,
        scenes: includedScenes,
        chatHistory: filteredChatHistory,
      };
    }

    return {
      ...baseState,
      scenes: includedScenes,
      chatHistory: filteredChatHistory,
    };
  }, [displayedSceneIndex, scenes, chatHistory, isMultiplayer, mpGameState, character]);

  const recap = useSummary({
    settings,
    voicePools,
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

  const getSceneActionText = useCallback((scene) => {
    if (!scene) return null;
    return scene.chosenAction
      || (scene.playerActions && Object.values(scene.playerActions).filter(Boolean).join(' • '))
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

  const playSceneNarrationRef = useRef(playSceneNarration);
  playSceneNarrationRef.current = playSceneNarration;
  const replayNarrationSceneRef = useRef({ viewedScene, displayedSceneIndex });
  replayNarrationSceneRef.current = { viewedScene, displayedSceneIndex };

  useEffect(() => {
    const onKeyDown = (e) => {
      if (!e.ctrlKey || (e.key !== '8' && e.code !== 'Digit8')) return;
      const tag = e.target?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target?.isContentEditable) {
        return;
      }
      const { viewedScene: vs, displayedSceneIndex: idx } = replayNarrationSceneRef.current;
      if (!vs?.narrative) return;
      e.preventDefault();
      playSceneNarrationRef.current(vs, idx);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

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

  // Stream sometimes omits `earlyDiceRoll` (no dice_early / skill in partial JSON).
  // Still surface the full-screen dice animation from the finalized scene row.
  const [fallbackDiceRoll, setFallbackDiceRoll] = useState(null);
  const dismissedDiceSceneIdRef = useRef(null);
  /** True while a scene generation was in progress — used only to gate fallback dice on gen end, not on campaign mount/load. */
  const wasGeneratingSceneRef = useRef(false);
  const latestSceneForDice = scenes[scenes.length - 1] || null;

  useEffect(() => {
    if (isGeneratingScene) {
      wasGeneratingSceneRef.current = true;
      setFallbackDiceRoll(null);
      dismissedDiceSceneIdRef.current = null;
      return;
    }
    const justFinishedGeneration = wasGeneratingSceneRef.current;
    wasGeneratingSceneRef.current = false;

    if (earlyDiceRoll) {
      setFallbackDiceRoll(null);
      return;
    }
    const dr = latestSceneForDice?.diceRoll;
    if (!dr || !latestSceneForDice?.id) return;
    if (dismissedDiceSceneIdRef.current === latestSceneForDice.id) return;
    // Without this guard, revisiting gameplay remounts with `dismissed` cleared and replays
    // the last scene's dice overlay (e.g. after lobby → campaign or LOAD_CAMPAIGN refetch).
    if (!justFinishedGeneration) return;
    setFallbackDiceRoll(dr);
  }, [isGeneratingScene, earlyDiceRoll, latestSceneForDice?.id, latestSceneForDice?.diceRoll]);

  const mergedDiceRoll = earlyDiceRoll ?? fallbackDiceRoll;

  const clearDiceAnimation = useCallback(() => {
    clearEarlyDiceRoll();
    setFallbackDiceRoll(null);
    dismissedDiceSceneIdRef.current = latestSceneForDice?.id ?? null;
  }, [clearEarlyDiceRoll, latestSceneForDice?.id]);

  // Overlay hook owns raw overlay state (typewriter, playerAction, dice).
  // autoPlayer's overlay contribution is layered in below — keeping it out
  // of the hook avoids a cycle (autoPlayer depends on handleAction, which
  // depends on overlays.showPlayerActionOverlay).
  const overlays = useGameplayOverlays({
    scenes,
    narrator,
    autoPlayScenes,
    displayedSceneIndex,
    earlyDiceRoll: mergedDiceRoll,
    getSceneActionText,
    onSceneNavigate: (idx) => handleSceneNavRef.current?.(idx),
    setViewingSceneIndex,
  });

  // handleAction coordinates overlay + idle timer + scene gen. Lives here
  // (not in useGameplayActions) because it calls back into overlay state
  // and into idleTimer, which is defined below. The `handleActionRef`
  // trampoline lets `useAutoPlayer` take a stable identity while the real
  // handler still reads the latest overlay/idle references.
  const handleAction = async (action, isCustomAction = false, fromAutoPlayer = false, opts = {}) => {
    consecutiveIdleEventsRef.current = 0;
    idleTimer.resetTimer();
    sceneGenSucceededRef.current = false;
    if (!fromAutoPlayer && action) {
      overlays.showPlayerActionOverlay(action);
    }
    try {
      await generateScene(action, false, isCustomAction, fromAutoPlayer, {
        forceRoll: opts?.forceRoll || null,
        entityTags: opts?.entityTags || null,
        travelFailureReason: opts?.travelFailureReason || null,
      });
      sceneGenSucceededRef.current = true;
    } catch {
      // Error displayed in UI via context
    }
  };

  const handleActionRef = useRef(handleAction);
  handleActionRef.current = handleAction;
  const stableHandleAction = useCallback((...args) => handleActionRef.current(...args), []);

  useEffect(() => {
    setPlayerActionHandler(stableHandleAction);
    return () => setPlayerActionHandler(null);
  }, [stableHandleAction, setPlayerActionHandler]);

  const autoPlayer = useAutoPlayer(
    isMultiplayer ? null : stableHandleAction,
    {
      narratorPlaybackState: narrator.playbackState,
      shouldWaitForNarration: !isMultiplayer
        && settings.narratorEnabled
        && settings.narratorAutoPlay
        && narrator.isNarratorReady,
    },
  );

  // Compose final overlay props — layer autoPlayer.overlayAction between
  // typewriter and playerAction. Completion handler picks based on which
  // overlay layer is actually driving the text.
  const overlayText = overlays.typewriterAction || autoPlayer.overlayAction || overlays.playerActionOverlayText;
  const overlayOnComplete = overlays.typewriterAction
    ? overlays.handleTypewriterComplete
    : autoPlayer.overlayAction
      ? autoPlayer.completeOverlay
      : overlays.handlePlayerActionOverlayComplete;
  const isPlayerActionOverlayActive = !overlays.typewriterAction
    && !autoPlayer.overlayAction
    && !!overlays.playerActionOverlayText;
  const overlayTypingSpeedMultiplier = isPlayerActionOverlayActive
    ? (isGeneratingScene ? 3 : 1)
    : 1;
  const overlayHoldOpen = isPlayerActionOverlayActive && isGeneratingScene;
  const overlayHoldingDurationMs = isPlayerActionOverlayActive ? 800 : 1500;
  // Trigger: first TTS audio file ready to play (canplay → audio.play() in
  // playAudioWithBuffer flips playbackState to PLAYING). Applies to all
  // overlay variants (player action / scene navigation / autoPlayer).
  // Auto fast-finish only when the full LLM response is complete (not on
  // first streaming chunk) — the typewriter plays at natural speed while the
  // LLM streams, and snaps to done once the backend confirms completion.
  const ttsReady = narrator.playbackState === narrator.STATES.PLAYING;
  const llmResponded = streamComplete;
  const overlayFastFinish = ttsReady || llmResponded;
  // Manual click-to-skip is allowed once the LLM has started responding (or
  // TTS is already preparing/playing), or when dice is actively rolling —
  // clicking before that is ignored.
  const { diceAfterTypewriter } = overlays;
  const diceIsActive = !!(mergedDiceRoll && diceAfterTypewriter);
  const canManuallySkipOverlay = (streamingNarrative !== null)
    || ttsReady
    || narrator.playbackState === narrator.STATES.LOADING
    || diceIsActive;

  // Cut leftover narration only when the player starts a new turn (player
  // action overlay mounts). For typewriterAction / autoPlayer overlays we
  // intentionally don't stop the narrator: those overlays appear ALONGSIDE a
  // freshly-queued scene narration that we want to keep playing so the
  // typewriter can fastFinish as soon as audio reaches PLAYING.
  useEffect(() => {
    if (overlays.playerActionOverlayText) {
      narrator.stop();
      try { window.speechSynthesis?.cancel(); } catch {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!overlays.playerActionOverlayText]);

  useCampaignLoader({ campaign, isMultiplayer, readOnly, urlCampaignId, dispatch, navigate });

  // After an incident is rozpatrzone pozytywnie the backend already mutated
  // character + npcs + quests + codex/knowledge atomically. Refetch the
  // campaign blob so the FE store mirrors the corrected world (mapa, panel
  // postaci, lista NPC, kodeks). Same code path as useCampaignLoader uses.
  const handleIncidentCorrectionsApplied = useCallback(() => {
    const cid = sCampaign?.backendId || urlCampaignId;
    if (!cid || isMultiplayer) return;
    storage.loadCampaign(cid)
      .then((data) => {
        if (data) {
          dispatch({ type: 'LOAD_CAMPAIGN', payload: data });
          storage.saveLocalSnapshot(data);
        }
      })
      .catch(() => { /* non-fatal — modal still shows the verdict */ });
    // sCampaign?.backendId is the resolved id; urlCampaignId is the URL fallback
  }, [sCampaign?.backendId, urlCampaignId, isMultiplayer, dispatch]);

  const actions = useGameplayActions({
    dispatch,
    autoSave,
    navigate,
    mp,
    isMultiplayer,
    campaign,
    urlCampaignId,
    readOnly,
    onRefresh,
    sWorld,
    sCharacter,
    generateScene,
  });

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
    characterVoiceMap: sCharacterVoiceMap,
    ttsProvider: ['elevenlabs', 'xtts'].includes(settings.sceneTtsTier) ? settings.sceneTtsTier : (settings.ttsProvider || 'elevenlabs'),
    dispatch,
  });

  // Faza 5 — fieldMap removed; sceneVisualization='map' jest no-op (UI fallback
  // do obrazka). Cała procedural-terrain warstwa zastąpiona Location Graph.

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
    || !!(combat?.active)
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

  const momentum = useMomentumMinigame({
    dispatch,
    momentumBonus: isMultiplayer
      ? (mpGameState?.characterMomentum?.[character?.name] || 0)
      : (sMomentumBonus || 0),
    sceneId: currentScene?.id || null,
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

  if (!campaign) return (
    <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
      <LoadingSpinner size="lg" text={t('gameplay.loadingCampaign', 'Loading campaign...')} />
    </div>
  );

  return (
    <ActionTagProvider>
    <div className="flex flex-col lg:flex-row h-[calc(100vh-4rem)] overflow-hidden">
      {/* Main Game Area */}
      <div className={`flex-1 flex flex-col min-h-0 overflow-hidden ${readOnly ? 'lg:mt-8' : ''}`}>
        <div className="shrink-0 px-4 md:px-6 pt-3 md:pt-4 pb-2 space-y-3">
        <GameplayHeader
          readOnly={readOnly}
          isMultiplayer={isMultiplayer}
          mpGameState={mpGameState}
          campaign={campaign}
          scenes={scenes}
          displayedSceneIndex={displayedSceneIndex}
          isReviewingPastScene={isReviewingPastScene}
          tensionScore={tensionScore}
          viewedScene={viewedScene}
          currentScene={currentScene}
          character={character}
          allCharacters={allCharacters}
          attrPoints={attrPoints}
          setViewingSceneIndex={setViewingSceneIndex}
          handleSceneNavigation={handleSceneNavigation}
          navigateWithTypewriter={overlays.navigateWithTypewriter}
          playSceneNarration={playSceneNarration}
          narrator={narrator}
          settings={settings}
          autoPlayScenes={autoPlayScenes}
          setAutoPlayScenes={setAutoPlayScenes}
          handleShare={actions.handleShare}
          shareCopied={actions.shareCopied}
          shareLoading={actions.shareLoading}
          aiCosts={aiCosts}
          onOpenAdvancement={() => actions.handleAdvancementOpen(character)}
          onOpenMpPanel={() => setMpPanelOpen(true)}
          onOpenSummaryModal={recap.openSummaryModal}
          onOpenSystemLogs={() => setSystemLogsOpen(true)}
          onOpenAchievements={() => setAchievementsOpen(true)}
          onOpenWorldModal={() => {
            setWorldModalInitialTab('npcs');
            setWorldModalOpen(true);
          }}
          videoPanelOpen={videoPanelOpen}
          setVideoPanelOpen={setVideoPanelOpen}
          favoriteSceneIds={favoriteScenesHook.favoriteIds}
          onToggleFavoriteScene={favoriteScenesHook.toggle}
          campaignBackendId={campaign?.backendId}
        />

        {!readOnly && (
          <ContextDepthSlider settings={settings} updateDMSettings={updateDMSettings} />
        )}
        </div>

        {!(combat?.active && combatExpandedLayout) && (
        <div className="shrink-0 px-4 md:px-6 pb-2">
        {/* Scene Panel */}
        <div className="relative" id="scene-panel-container">
          <ScenePanel
            scene={viewedScene}
            combat={combat}
            isGeneratingImage={!isReviewingPastScene && isGeneratingImage}
            highlightInfo={narrator.highlightInfo}
            currentChunk={narrator.currentChunk}
            diceRoll={viewedScene?.diceRoll && !isGeneratingScene ? viewedScene.diceRoll : null}
            diceRolls={viewedScene?.diceRolls?.length && !isGeneratingScene ? viewedScene.diceRolls : null}
            world={isMultiplayer ? mpGameState?.world : sWorld}
            characterName={character?.name}
            multiplayerPlayers={isMultiplayer ? (mp.state.players || []) : []}
            interactiveMap={!isMultiplayer && !readOnly && !isReviewingPastScene && (!campaign?.status || campaign.status === 'active')}
            onSceneGridChange={actions.handleSceneGridChange}
            onFieldTurnReady={actions.handleFieldTurnReady}
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
            gameError={readOnly ? null : error}
            onDismissGameError={actions.dismissError}
            mpErrorCode={mpErrorCode}
            isMultiplayer={isMultiplayer}
            onOpenSettings={openSettings}
            momentumDice={!readOnly && (momentum.active || momentum.result) ? {
              visible: momentum.diceVisible,
              position: momentum.position,
              onDiceClick: momentum.handleDiceClick,
              counting: momentum.counting,
              countdownValue: momentum.countdownValue,
              result: momentum.result,
            } : null}
          />
          {overlayText && (
            <TypewriterActionOverlay
              text={overlayText}
              onComplete={overlayOnComplete}
              onTypingComplete={isPlayerActionOverlayActive ? overlays.markPlayerOverlayTypingDone : undefined}
              typingSpeedMultiplier={overlayTypingSpeedMultiplier}
              holdOpen={overlayHoldOpen}
              holdingDurationMs={overlayHoldingDurationMs}
              showLoader={isPlayerActionOverlayActive && isGeneratingScene}
              loaderStartTime={isMultiplayer ? mpSceneGenStartTime : sceneGenStartTime}
              loaderEstimatedMs={lastSceneGenMs}
              fastFinish={overlayFastFinish}
              canManuallySkip={canManuallySkipOverlay}
              waitForDice={diceIsActive}
              onSkipDice={clearDiceAnimation}
              mode={settings.typewriterMode || 'fullscreen'}
            />
          )}
          {overlayText && mergedDiceRoll && diceAfterTypewriter && (
            <DiceRollAnimationOverlay
              diceRoll={mergedDiceRoll}
              onDismiss={clearDiceAnimation}
              mode={settings.typewriterMode || 'fullscreen'}
            />
          )}
          {sLocalDiceRoll && (
            <DiceRollAnimationOverlay
              diceRoll={sLocalDiceRoll}
              onDismiss={() => dispatch({ type: 'CLEAR_LOCAL_DICE_ROLL' })}
            />
          )}
        </div>
        </div>
        )}

        {isGeneratingScene && !readOnly && !(overlayText && isPlayerActionOverlayActive) && (
          <div className="shrink-0 px-4 md:px-6 pb-2">
            <SceneGenerationProgress
              startTime={isMultiplayer ? mpSceneGenStartTime : sceneGenStartTime}
              estimatedMs={lastSceneGenMs}
              completing={streamingNarrative !== null}
            />
          </div>
        )}

        <div className="shrink-0 px-4 md:px-6 pb-2 pt-1">
        {/* Action Panel */}
        {currentScene && !isGeneratingScene && !(combat?.active) && !isViewingCompanion && !isReviewingPastScene && (!campaign?.status || campaign.status === 'active') && character?.status !== 'dead' && !mp.state.isDead && !readOnly && (
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
              npcs={(() => {
                const npcsList = (isMultiplayer ? mpGameState?.world?.npcs : sWorld?.npcs) || [];
                const currentRef = isMultiplayer ? mpGameState?.world?.currentLocationRef : sWorld?.currentLocationRef;
                const currentName = isMultiplayer ? mpGameState?.world?.currentLocation : sWorld?.currentLocation;
                return npcsList.filter((npc) => {
                  if (npc.alive === false) return false;
                  // Faza 3b — preferuj composite ref match. Fallback: legacy string.
                  if (currentRef && npc.locationRef) {
                    return npc.locationRef.kind === currentRef.kind && npc.locationRef.id === currentRef.id;
                  }
                  return npc.lastLocation === currentName;
                });
              })()}
              character={character}
              dilemma={currentScene.dilemma}
              lastChosenAction={lastChosenAction}
              multiplayerPlayers={isMultiplayer ? (mp.state.players || []) : []}
              typingPlayers={isMultiplayer ? (mp.state.typingPlayers || {}) : {}}
              dispatch={dispatch}
              dictation={dictation}
              campaignId={sCampaign?.backendId || urlCampaignId || null}
              onIncidentCorrectionsApplied={handleIncidentCorrectionsApplied}
              onOpenTravelMap={() => {
                setWorldModalInitialTab('map');
                setWorldModalOpen(true);
              }}
            />
          </div>
        )}

        {/* Trade Panel */}
        {sTrade?.active && !isViewingCompanion && !isReviewingPastScene && !readOnly && (
          <div className="px-2 animate-fade-in">
            <TradePanel
              trade={sTrade}
              character={character}
              world={sWorld}
              dispatch={dispatch}
              disabled={isGeneratingScene}
            />
          </div>
        )}

        {/* Crafting Panel */}
        {sCrafting?.active && !isViewingCompanion && !isReviewingPastScene && !readOnly && (
          <div className="px-2 animate-fade-in">
            <CraftingPanel
              character={character}
              dispatch={dispatch}
              disabled={isGeneratingScene}
            />
          </div>
        )}

        {/* Alchemy Panel */}
        {sAlchemy?.active && !isViewingCompanion && !isReviewingPastScene && !readOnly && (
          <div className="px-2 animate-fade-in">
            <AlchemyPanel
              character={character}
              dispatch={dispatch}
              disabled={isGeneratingScene}
            />
          </div>
        )}

        <GameplayDeadNotices
          character={character}
          campaign={campaign}
          isMultiplayer={isMultiplayer}
          mp={mp}
          readOnly={readOnly}
        />
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto lg:overflow-x-hidden custom-scrollbar px-4 md:px-6 pb-3 pt-1 space-y-3">
        {viewedScene?.cutscene && <CutscenePanel cutscene={viewedScene.cutscene} />}

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
                <StatusBar label="Mana" current={displayCharacter.mana.current} max={displayCharacter.mana.max} color="blue" />
              )}
            </div>
          </div>
        )}

        <GameplayStatusBanners
          readOnly={readOnly}
          showMpConnectionBanner={showMpConnectionBanner}
          isMpReconnecting={isMpReconnecting}
          reconnectState={reconnectState}
        />

        {/* Living World companions (Phase 2) — local party lives in the sidebar grid. */}
        {!isMultiplayer && !isReviewingPastScene && !readOnly && (
          <div className="px-2 animate-fade-in">
            <LivingWorldCompanionsSection
              campaignId={sCampaign?.backendId || urlCampaignId}
              enabled={!!sCampaign?.livingWorldEnabled}
            />
          </div>
        )}

        {/* Combat Panel */}
        {combat?.active && !isViewingCompanion && !isReviewingPastScene && !readOnly && (
          <div className="px-2 animate-fade-in">
            <CombatPanel
              combat={combat}
              gameState={isMultiplayer ? mpGameState : getGameState()}
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
              onPersistState={() => autoSave()}
              expandedLayout={combatExpandedLayout}
              onLayoutChange={setCombatExpandedLayout}
            />
          </div>
        )}

        {/* Magic Panel */}
        {hasMagic && !isMultiplayer && !sCombat?.active && !isViewingCompanion && !isReviewingPastScene && !readOnly && (
          <div className="px-2 animate-fade-in">
            <MagicPanel
              character={character}
              combat={sCombat}
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

        {sMainQuestJustCompleted && campaign?.status === 'active' && (
          <MainQuestCompleteModal dispatch={dispatch} navigate={navigate} />
        )}

        <GameplayCampaignEnd
          campaign={campaign}
          character={character}
          isMultiplayer={isMultiplayer}
          mpGameState={mpGameState}
          dispatch={dispatch}
          navigate={navigate}
        />

        {/* Quest Offers */}
        {currentScene?.questOffers?.length > 0 && !isGeneratingScene && !sCombat?.active && !isViewingCompanion && !isReviewingPastScene && (!campaign?.status || campaign.status === 'active') && !readOnly && (
          <div className="px-2 animate-fade-in">
            <QuestOffersPanel
              offers={currentScene.questOffers}
              onAccept={(offer) => isMultiplayer ? mp.acceptMpQuestOffer(currentScene.id, offer) : acceptQuestOffer(currentScene.id, offer)}
              onDecline={(offerId) => isMultiplayer ? mp.declineMpQuestOffer(currentScene.id, offerId) : declineQuestOffer(currentScene.id, offerId)}
            />
          </div>
        )}
        </div>

      </div>

      {/* Right Sidebar: Chat Panel */}
      <aside
        className="gameplay-right-aside-torn-edge w-full lg:w-[442px] bg-surface-container-low/30 backdrop-blur-md border-l border-outline-variant/15 flex flex-col min-h-0 h-[400px] lg:h-full shrink-0 overflow-hidden"
        style={uwBonus.chat > 0 ? { width: 442 + uwBonus.chat } : undefined}
      >
        <ChatPanel
          messages={chatHistory}
          streamingNarrative={streamingNarrative}
          streamingSegments={streamingSegments}
          narrator={settings.narratorEnabled ? narrator : null}
          autoPlay={!readOnly && settings.narratorEnabled && settings.narratorAutoPlay && !overlayText}
          myOdId={isMultiplayer ? mp.state.myOdId : null}
          momentumBonus={isMultiplayer
            ? (mpGameState?.characterMomentum?.[character?.name] || 0)
            : (sMomentumBonus || 0)}
          scrollToMessageId={scrollTargetMessageId}
          onScrollTargetHandled={clearScrollTargetIfMatches}
          typingPlayers={isMultiplayer ? mp.state.typingPlayers : {}}
          sessionSeconds={sessionSeconds}
          totalPlayTime={totalPlayTime}
          narrationTime={sNarrationTime || 0}
          chatGate={!!overlayText}
          onMomentumClick={!readOnly && !momentum.cooldown ? momentum.startGame : null}
          momentumMinigameActive={momentum.active}
        />
      </aside>

      <GameplayModals
        readOnly={readOnly}
        isMultiplayer={isMultiplayer}
        mpGameState={mpGameState}
        settings={settings}
        voicePools={voicePools}
        dispatch={dispatch}
        autoSave={autoSave}
        narrator={narrator}
        campaignId={sCampaign?.backendId || urlCampaignId || null}
        currentSceneId={currentScene?.id || null}
        onTravelFromMap={(destinationName, opts) => {
          setWorldModalOpen(false);
          if (destinationName) {
            handleAction(`Podróżuję do ${destinationName}.`, true, false, {
              travelFailureReason: opts?.travelFailureReason || null,
            });
          }
        }}
        onEnterSubFromMap={(subName) => {
          setWorldModalOpen(false);
          if (subName) handleAction(`Wchodzę do ${subName}.`, true);
        }}
        worldModalOpen={worldModalOpen}
        worldModalInitialTab={worldModalInitialTab}
        onWorldModalClose={() => setWorldModalOpen(false)}
        mpPanelOpen={mpPanelOpen}
        onMpPanelClose={() => setMpPanelOpen(false)}
        advancementOpen={actions.advancementOpen}
        onAdvancementClose={actions.handleAdvancementClose}
        achievementsOpen={achievementsOpen}
        onAchievementsClose={() => setAchievementsOpen(false)}
        systemLogsOpen={systemLogsOpen}
        onSystemLogsClose={() => setSystemLogsOpen(false)}
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
    </ActionTagProvider>
  );
}
