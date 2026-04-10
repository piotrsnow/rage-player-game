import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { storage } from '../../services/storage';
import { useGame } from '../../contexts/GameContext';
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
import WorldStateModal from './WorldStateModal';
import MultiplayerPanel from '../multiplayer/MultiplayerPanel';
import CostBadge from '../ui/CostBadge';
import AdvancementPanel from '../character/AdvancementPanel';
import CombatPanel from './CombatPanel';
import DialoguePanel from './DialoguePanel';
import MagicPanel from './MagicPanel';
import TradePanel from './TradePanel';
import CraftingPanel from './CraftingPanel';
import AlchemyPanel from './AlchemyPanel';
import PartyPanel from './PartyPanel';
import SummaryModal from './SummaryModal';
import AchievementsPanel from '../character/AchievementsPanel';
import QuestOffersPanel from './QuestOffersPanel';
import GMModal from './gm/GMModal';
import FloatingVideoPanel from '../multiplayer/FloatingVideoPanel';
import { useModals } from '../../contexts/ModalContext';
import { translateAttribute } from '../../utils/rpgTranslate';
import { createMultiplayerCombatState } from '../../services/combatEngine';
import { useAutoPlayer } from '../../hooks/useAutoPlayer';
import { useIdleTimer } from '../../hooks/useIdleTimer';
import AutoPlayerPanel from './AutoPlayerPanel';
import TypewriterActionOverlay from './TypewriterActionOverlay';
import DiceRollAnimationOverlay from './DiceRollAnimationOverlay';
import IdleTimer from './IdleTimer';
import CutscenePanel from './CutscenePanel';
import { calculateTensionScore } from '../../services/tensionTracker';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { canLeaveCampaign, getLeaveBlockedMessage } from '../../services/campaignGuard';
import MainQuestCompleteModal from './MainQuestCompleteModal';

function hashSummaryCacheKey(input) {
  const text = String(input || '');
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

function hashCode(str) {
  let h = 0;
  for (let i = 0; i < (str || '').length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function shuffleArray(items) {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export default function GameplayPage({ readOnly = false, shareToken = null, onRefresh = null }) {
  // Temporary kill switch for timer-driven idle world events.
  const IDLE_WORLD_EVENTS_ENABLED = false;
  const MAX_SCENE_IMAGE_REPAIR_ATTEMPTS = 2;
  const MAX_SCENE_IMAGE_REPAIRS_PER_SESSION = 20;
  const MAX_SCENE_IMAGE_MIGRATION_REPAIRS_PER_PASS = 3;
  const MAX_SCENE_IMAGE_MIGRATION_SCAN = 12;
  const SCENE_IMAGE_MIGRATION_COOLDOWN_MS = 12000;

  const navigate = useNavigate();
  const location = useLocation();
  const { campaignId: urlCampaignId } = useParams();
  const { t } = useTranslation();
  const { state, dispatch, autoSave } = useGame();
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
  const imageAttemptedRef = useRef(new Set());
  const imageRepairAttemptsRef = useRef(new Map());
  const imageRepairInFlightRef = useRef(new Set());
  const imageRepairsCountRef = useRef(0);
  const imageMigrationRunningRef = useRef(false);
  const imageMigrationLastRunRef = useRef(0);

  const isMultiplayer = mp.state.isMultiplayer && mp.state.phase === 'playing';
  const mpGameState = mp.state.gameState;
  const chatHistory = isMultiplayer ? (mpGameState?.chatHistory || []) : state.chatHistory;

  useEffect(() => {
    setNarratorState(narrator.playbackState);
  }, [narrator.playbackState, setNarratorState]);

  // --- Streaming narrator: feed segments to narrator as they arrive from AI streaming ---
  const streamingNarrationActiveRef = useRef(false);
  const streamingNarrationMsgIdRef = useRef(null);

  // Start streaming narration when first segments appear
  useEffect(() => {
    if (!streamingSegments || streamingSegments.length === 0) return;
    if (streamingNarrationActiveRef.current) return;
    if (!settings.narratorEnabled || !settings.narratorAutoPlay || !narrator.isNarratorReady) return;
    if (readOnly) return;

    const messageId = `streaming_${Date.now()}`;
    streamingNarrationMsgIdRef.current = messageId;
    streamingNarrationActiveRef.current = true;
    narrator.startStreaming(messageId);
  }, [streamingSegments, settings.narratorEnabled, settings.narratorAutoPlay, narrator.isNarratorReady, readOnly]);

  // Push new segments as they stream in
  useEffect(() => {
    if (!streamingNarrationActiveRef.current) return;
    if (!streamingSegments || streamingSegments.length === 0) return;
    narrator.pushStreamingSegments(streamingSegments);
  }, [streamingSegments]);

  // Finish streaming when streamingNarrative is cleared (scene complete)
  useEffect(() => {
    if (streamingNarrative !== null) return;
    if (!streamingNarrationActiveRef.current) return;
    streamingNarrationActiveRef.current = false;
    // Final segments come from the last chatHistory DM message
    const latestDm = [...chatHistory].reverse().find((m) => m.role === 'dm');
    narrator.finishStreaming(latestDm?.dialogueSegments || null);
    streamingNarrationMsgIdRef.current = null;
  }, [streamingNarrative, chatHistory]);

  const [sessionStartTime] = useState(() => Date.now());
  const [sessionSeconds, setSessionSeconds] = useState(0);
  const initialTotalPlayTimeRef = useRef(state.totalPlayTime || 0);

  useEffect(() => {
    const interval = setInterval(() => {
      setSessionSeconds(Math.floor((Date.now() - sessionStartTime) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [sessionStartTime]);

  useEffect(() => {
    const flush = setInterval(() => {
      const elapsed = Math.floor((Date.now() - sessionStartTime) / 1000);
      dispatch({ type: 'SET_PLAY_TIME', payload: initialTotalPlayTimeRef.current + elapsed });
    }, 30000);
    return () => {
      clearInterval(flush);
      const elapsed = Math.floor((Date.now() - sessionStartTime) / 1000);
      dispatch({ type: 'SET_PLAY_TIME', payload: initialTotalPlayTimeRef.current + elapsed });
    };
  }, [sessionStartTime, dispatch]);

  const totalPlayTime = initialTotalPlayTimeRef.current + sessionSeconds;

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [worldModalOpen, setWorldModalOpen] = useState(false);
  const [gmModalOpen, setGmModalOpen] = useState(false);
  const [mpPanelOpen, setMpPanelOpen] = useState(false);
  const [advancementOpen, setAdvancementOpen] = useState(false);
  const [achievementsOpen, setAchievementsOpen] = useState(false);
  const [videoPanelOpen, setVideoPanelOpen] = useState(false);
  const [autoPlayerSettingsOpen, setAutoPlayerSettingsOpen] = useState(false);
  const [summaryModalOpen, setSummaryModalOpen] = useState(false);
  const [summaryText, setSummaryText] = useState('');
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState(null);
  const [summaryProgress, setSummaryProgress] = useState({
    phase: 'idle',
    currentBatch: 0,
    totalBatches: 0,
    recapMode: 'story',
  });
  const [summarySentencesPerScene, setSummarySentencesPerScene] = useState(1);
  const [summaryOptions, setSummaryOptions] = useState({
    mode: 'story',
    literaryStyle: 50,
    dramaticity: 50,
    factuality: 50,
    dialogueParticipants: 3,
  });
  const [summaryNarrationMessageId, setSummaryNarrationMessageId] = useState(null);
  const [summaryNarrationWordOffset, setSummaryNarrationWordOffset] = useState(0);
  const [summarySpeakLoading, setSummarySpeakLoading] = useState(false);
  const [summaryCopied, setSummaryCopied] = useState(false);
  const summarySpeakTimeoutRef = useRef(null);
  const summaryCopyTimeoutRef = useRef(null);
  const summaryRequestIdRef = useRef(0);
  const [viewingSceneIndex, setViewingSceneIndex] = useState(null);
  const [scrollTargetMessageId, setScrollTargetMessageId] = useState(null);
  const [autoPlayScenes, setAutoPlayScenes] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [shareLoading, setShareLoading] = useState(false);
  const [mpSceneGenStartTime, setMpSceneGenStartTime] = useState(null);
  const prevScenesLenRef = useRef(0);
  const initialViewerChatAlignDoneRef = useRef(false);
  const autoPlayRef = useRef(false);
  const displayedSceneIndexRef = useRef(0);
  const handleSceneNavRef = useRef(null);
  const consecutiveIdleEventsRef = useRef(0);

  const requestChatScrollToMessage = useCallback((messageId) => {
    if (!messageId) return;
    setScrollTargetMessageId((prev) => (prev === messageId ? null : prev));
    requestAnimationFrame(() => {
      setScrollTargetMessageId(messageId);
    });
  }, []);

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
  const wasGeneratingSceneRef = useRef(false);
  const prevChatHistoryLenRef = useRef(chatHistory.length);
  const isGeneratingScene = isMultiplayer ? mp.state.isGenerating : state.isGeneratingScene;
  const isGeneratingImage = state.isGeneratingImage;
  const error = isMultiplayer ? mp.state.error : state.error;
  const mpErrorCode = isMultiplayer ? mp.state.errorCode : null;
  const reconnectState = mp.state.reconnectState || { status: 'disconnected', attempt: 0, maxAttempts: 10 };
  const isMpReconnecting = isMultiplayer && reconnectState.status === 'reconnecting';
  const showMpConnectionBanner = isMultiplayer && (!mp.state.connected || isMpReconnecting);
  const aiCosts = state.aiCosts;
  const currentScene = scenes[scenes.length - 1] || null;

  useEffect(() => {
    if (!isMultiplayer) {
      setMpSceneGenStartTime(null);
      return;
    }
    if (mp.state.isGenerating) {
      setMpSceneGenStartTime((prev) => prev || Date.now());
      return;
    }
    setMpSceneGenStartTime(null);
  }, [isMultiplayer, mp.state.isGenerating]);
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

  useEffect(() => {
    if (scenes.length > prevScenesLenRef.current) {
      setViewingSceneIndex(null);

      const newestScene = scenes[scenes.length - 1];
      const newestSceneMessage = newestScene?.id
        ? chatHistory.find((msg) => msg?.sceneId === newestScene.id)
        : null;
      const newestDmMessage = [...chatHistory].reverse().find((msg) => msg?.role === 'dm');

      if (newestSceneMessage?.id) {
        requestChatScrollToMessage(newestSceneMessage.id);
      } else if (newestDmMessage?.id) {
        requestChatScrollToMessage(newestDmMessage.id);
      }
    }
    prevScenesLenRef.current = scenes.length;
  }, [scenes.length, scenes, chatHistory, requestChatScrollToMessage]);

  useEffect(() => {
    if (isGeneratingScene) {
      wasGeneratingSceneRef.current = true;
      prevChatHistoryLenRef.current = chatHistory.length;
      return;
    }
    if (!wasGeneratingSceneRef.current) {
      prevChatHistoryLenRef.current = chatHistory.length;
      return;
    }

    const hasNewMessages = chatHistory.length > prevChatHistoryLenRef.current;
    if (hasNewMessages) {
      const newestScene = scenes[scenes.length - 1];
      const latestSceneMessage = newestScene?.id
        ? chatHistory.find((msg) => msg?.sceneId === newestScene.id)
        : null;
      const latestDmMessage = [...chatHistory].reverse().find((msg) => msg?.role === 'dm');
      const latestDiceRollMessage = [...chatHistory].reverse().find((msg) => msg?.subtype === 'dice_roll');

      const preferredMessageId = latestSceneMessage?.id || latestDmMessage?.id || latestDiceRollMessage?.id;
      if (preferredMessageId) {
        requestChatScrollToMessage(preferredMessageId);
      }
    }

    wasGeneratingSceneRef.current = false;
    prevChatHistoryLenRef.current = chatHistory.length;
  }, [isGeneratingScene, chatHistory, scenes, requestChatScrollToMessage]);

  const isReviewingPastScene = viewingSceneIndex !== null && viewingSceneIndex < scenes.length - 1;
  const displayedSceneIndex = viewingSceneIndex ?? (scenes.length - 1);
  const viewedScene = scenes[displayedSceneIndex] || currentScene;
  const tensionScore = scenes.length > 0 ? calculateTensionScore(scenes, state.combat, state.dialogue) : 0;

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

  const handleGenerateSummary = useCallback(async () => {
    const requestId = summaryRequestIdRef.current + 1;
    summaryRequestIdRef.current = requestId;
    setSummaryLoading(true);
    setSummaryError(null);
    setSummaryCopied(false);
    setSummaryText('');
    setSummaryProgress({
      phase: 'initializing',
      currentBatch: 0,
      totalBatches: 0,
      recapMode: summaryOptions?.mode || 'story',
    });
    try {
      const recapState = buildRecapStateForDisplayedScene();
      const recapScenes = Array.isArray(recapState?.scenes) ? recapState.scenes : [];
      const recapSceneIds = recapScenes
        .map((scene, idx) => scene?.id || `idx_${idx + 1}`)
        .join('|');
      const dmSignature = JSON.stringify({
        narrativeStyle: settings.dmSettings?.narrativeStyle ?? 50,
        responseLength: settings.dmSettings?.responseLength ?? 50,
        narratorPoeticism: settings.dmSettings?.narratorPoeticism ?? 50,
        narratorGrittiness: settings.dmSettings?.narratorGrittiness ?? 30,
        narratorDetail: settings.dmSettings?.narratorDetail ?? 50,
        narratorHumor: settings.dmSettings?.narratorHumor ?? 20,
        narratorDrama: settings.dmSettings?.narratorDrama ?? 50,
        narratorCustomInstructions: settings.dmSettings?.narratorCustomInstructions || '',
      });
      const cacheInput = JSON.stringify({
        v: 4,
        language: settings.language || 'pl',
        sceneScope: recapScenes.length,
        displayedSceneIndex,
        chatHistoryLength: Array.isArray(recapState?.chatHistory) ? recapState.chatHistory.length : 0,
        sceneIds: recapSceneIds,
        sentencesPerScene: summarySentencesPerScene,
        summaryOptions,
        dm: dmSignature,
      });
      const cacheKey = `recap_${hashSummaryCacheKey(cacheInput)}`;
      const backendId = recapState?.campaign?.backendId;

      if (backendId && apiClient.isConnected()) {
        try {
          const cached = await apiClient.get(`/campaigns/${backendId}/recaps?key=${encodeURIComponent(cacheKey)}`);
          const cachedRecap = typeof cached?.recap === 'string' ? cached.recap.trim() : '';
          if (cached?.found && cachedRecap) {
            if (summaryRequestIdRef.current !== requestId) return;
            setSummaryText(cachedRecap);
            setSummaryProgress({
              phase: 'done',
              currentBatch: 1,
              totalBatches: 1,
              recapMode: summaryOptions?.mode || 'story',
            });
            return;
          }
        } catch {
          // Ignore cache lookup errors and fall back to AI generation.
        }
      }

      const recap = await generateRecap(recapState, {
        sentencesPerScene: summarySentencesPerScene,
        summaryStyle: summaryOptions,
        onPartial: (partialPayload) => {
          if (summaryRequestIdRef.current !== requestId) return;
          const partialText = typeof partialPayload?.text === 'string' ? partialPayload.text.trim() : '';
          if (partialText) setSummaryText(partialText);
        },
        onProgress: (progressPayload) => {
          if (summaryRequestIdRef.current !== requestId) return;
          const nextCurrentBatch = Number(progressPayload?.currentBatch) || 0;
          const nextTotalBatches = Number(progressPayload?.totalBatches) || 0;
          setSummaryProgress({
            phase: progressPayload?.phase || 'chunking',
            currentBatch: nextCurrentBatch,
            totalBatches: nextTotalBatches,
            recapMode: progressPayload?.recapMode || summaryOptions?.mode || 'story',
          });
        },
      });
      if (summaryRequestIdRef.current !== requestId) return;
      const safeRecap = typeof recap === 'string' ? recap.trim() : '';
      setSummaryText(safeRecap);
      setSummaryProgress((prev) => ({
        ...prev,
        phase: 'done',
      }));
      if (!safeRecap) {
        setSummaryError(t('gameplay.summaryEmptyGenerated', 'AI returned an empty summary. Try again.'));
      } else if (backendId && apiClient.isConnected()) {
        apiClient.post(`/campaigns/${backendId}/recaps`, {
          key: cacheKey,
          recap: safeRecap,
          meta: {
            displayedSceneIndex,
            totalScenes: recapScenes.length,
            sentencesPerScene: summarySentencesPerScene,
            language: settings.language || 'pl',
            summaryStyle: summaryOptions,
          },
        }).catch(() => {});
      }
    } catch (err) {
      if (summaryRequestIdRef.current !== requestId) return;
      setSummaryError(err?.message || t('common.somethingWentWrong'));
    } finally {
      if (summaryRequestIdRef.current !== requestId) return;
      setSummaryLoading(false);
    }
  }, [buildRecapStateForDisplayedScene, displayedSceneIndex, generateRecap, settings.dmSettings, settings.language, summaryOptions, summarySentencesPerScene, t]);

  const handleOpenSummaryModal = useCallback(() => {
    setSummaryModalOpen(true);
    setSummaryText('');
    setSummaryError(null);
    setSummaryProgress({
      phase: 'idle',
      currentBatch: 0,
      totalBatches: 0,
      recapMode: summaryOptions?.mode || 'story',
    });
    setSummaryNarrationMessageId(null);
    setSummarySpeakLoading(false);
    setSummaryCopied(false);
  }, [summaryOptions?.mode]);

  const handleCopySummary = useCallback(async () => {
    const text = typeof summaryText === 'string' ? summaryText.trim() : '';
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setSummaryCopied(true);
      if (summaryCopyTimeoutRef.current) {
        window.clearTimeout(summaryCopyTimeoutRef.current);
      }
      summaryCopyTimeoutRef.current = window.setTimeout(() => {
        setSummaryCopied(false);
      }, 2000);
    } catch (err) {
      setSummaryError(err?.message || t('common.somethingWentWrong'));
    }
  }, [summaryText, t]);

  const probeSceneImage = useCallback((rawUrl) => {
    const resolved = apiClient.resolveMediaUrl(rawUrl);
    if (!resolved || resolved.startsWith('data:')) return Promise.resolve(Boolean(resolved));
    return new Promise((resolve) => {
      const image = new Image();
      let done = false;
      const settle = (ok) => {
        if (done) return;
        done = true;
        resolve(ok);
      };
      const timeoutId = window.setTimeout(() => settle(false), 5000);
      image.onload = () => {
        window.clearTimeout(timeoutId);
        settle(true);
      };
      image.onerror = () => {
        window.clearTimeout(timeoutId);
        settle(false);
      };
      image.src = resolved;
    });
  }, []);

  const repairSceneImage = useCallback(
    async (sceneId, options = {}) => {
      const {
        reason = 'manual',
        skipAutoSave = false,
        markAttempted = true,
        forceNew = false,
      } = options;

      if (!sceneId || (settings.sceneVisualization || 'image') !== 'image') return false;

      const targetScene = scenes.find((scene) => scene?.id === sceneId);
      if (!targetScene?.narrative) {
        console.warn(`[image-repair] Skipping ${sceneId}: missing narrative (${reason})`);
        return false;
      }

      if (imageRepairInFlightRef.current.has(sceneId)) return false;

      const attempts = imageRepairAttemptsRef.current.get(sceneId) || 0;
      if (attempts >= MAX_SCENE_IMAGE_REPAIR_ATTEMPTS) {
        console.warn(`[image-repair] Skipping ${sceneId}: attempt limit reached (${reason})`);
        return false;
      }

      if (imageRepairsCountRef.current >= MAX_SCENE_IMAGE_REPAIRS_PER_SESSION) {
        console.warn(`[image-repair] Session cap reached, skip ${sceneId}`);
        return false;
      }

      imageRepairAttemptsRef.current.set(sceneId, attempts + 1);
      imageRepairInFlightRef.current.add(sceneId);

      try {
        const imageUrl = await generateImageForScene(
          sceneId,
          targetScene.narrative,
          targetScene.imagePrompt,
          isMultiplayer ? { genre: campaign?.genre, tone: campaign?.tone } : undefined,
          { skipAutoSave: readOnly || skipAutoSave, forceNew }
        );
        if (!imageUrl) return false;

        imageRepairsCountRef.current += 1;
        if (markAttempted) {
          imageAttemptedRef.current.add(sceneId);
        }
        if (isMultiplayer) {
          mp.updateSceneImage(sceneId, imageUrl);
        }
        return true;
      } finally {
        imageRepairInFlightRef.current.delete(sceneId);
      }
    },
    [
      settings.sceneVisualization,
      scenes,
      generateImageForScene,
      isMultiplayer,
      campaign?.genre,
      campaign?.tone,
      readOnly,
      mp,
    ]
  );

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

  const speakBrowserTts = useCallback((text) => {
    try {
      if (!text || typeof window === 'undefined') return false;
      const synth = window.speechSynthesis;
      if (!synth || typeof window.SpeechSynthesisUtterance === 'undefined') return false;

      synth.cancel();
      const utter = new window.SpeechSynthesisUtterance(text);
      utter.lang = settings.language || 'pl';
      utter.rate = Math.max(0.7, Math.min(1.2, (settings.dialogueSpeed || 100) / 100));
      utter.pitch = 1;
      utter.volume = 1;
      synth.speak(utter);
      return true;
    } catch {
      return false;
    }
  }, [settings.language, settings.dialogueSpeed]);

  const SUMMARY_NARRATION_START_TIMEOUT_MS = 45000;
  const SUMMARY_UTTERANCE_PREFETCH_WINDOW = 3;

  const buildSummaryDialogueSegments = useCallback((text) => {
    const normalized = typeof text === 'string' ? text.trim() : '';
    if (!normalized) return [];

    const lines = normalized
      .split(/\r?\n+/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length === 0) return [];

    const speakerLineRegex = /^([A-Za-z0-9\u00C0-\u017F]{1,24})\s*:\s*(.+)$/u;
    const parsedLines = lines.map((line) => {
      const match = line.match(speakerLineRegex);
      if (!match) return null;
      return {
        speaker: match[1].trim(),
        text: match[2].trim(),
      };
    });

    const speakerCount = parsedLines.filter(Boolean).length;
    const isDialogueSummary = speakerCount >= Math.max(2, Math.floor(lines.length * 0.6));
    if (!isDialogueSummary) {
      return [{ type: 'narration', text: normalized }];
    }

    const fallbackVoiceId = settings.elevenlabsVoiceId || state.narratorVoiceId || null;
    const voicePool = (settings.characterVoices || [])
      .map((voice) => voice?.voiceId)
      .filter(Boolean);
    const shuffledVoices = shuffleArray(voicePool);
    const speakerVoiceMap = new Map();
    let nextVoiceIndex = 0;

    const assignVoice = (speaker) => {
      if (!speaker) return fallbackVoiceId;
      if (speakerVoiceMap.has(speaker)) return speakerVoiceMap.get(speaker);
      if (shuffledVoices.length === 0) {
        speakerVoiceMap.set(speaker, fallbackVoiceId);
        return fallbackVoiceId;
      }
      const picked = shuffledVoices[nextVoiceIndex % shuffledVoices.length];
      nextVoiceIndex += 1;
      speakerVoiceMap.set(speaker, picked);
      return picked;
    };

    return lines.map((line, index) => {
      const parsed = parsedLines[index];
      if (!parsed || !parsed.text) {
        return {
          type: 'narration',
          text: line,
          voiceId: fallbackVoiceId,
        };
      }
      return {
        type: 'dialogue',
        character: parsed.speaker,
        text: parsed.text,
        voiceId: assignVoice(parsed.speaker),
      };
    });
  }, [settings.characterVoices, settings.elevenlabsVoiceId, state.narratorVoiceId]);

  const handleSpeakSummary = useCallback((textToRead = summaryText, wordOffset = 0) => {
    const normalizedText = typeof textToRead === 'string' ? textToRead.trim() : '';
    if (!normalizedText) return;
    setSummarySpeakLoading(true);
    setSummaryError(null);
    setSummaryNarrationWordOffset(Math.max(0, Number(wordOffset) || 0));
    if (summarySpeakTimeoutRef.current) {
      window.clearTimeout(summarySpeakTimeoutRef.current);
      summarySpeakTimeoutRef.current = null;
    }

    if (narrator.isNarratorReady) {
      const narrationId = `summary_${Date.now()}`;
      const dialogueSegments = buildSummaryDialogueSegments(normalizedText);
      setSummaryNarrationMessageId(narrationId);
      narrator.speakSingle(
        {
          content: normalizedText,
          dialogueSegments,
          segmentPrefetchWindow: SUMMARY_UTTERANCE_PREFETCH_WINDOW,
        },
        narrationId
      );
      summarySpeakTimeoutRef.current = window.setTimeout(() => {
        setSummarySpeakLoading(false);
        setSummaryError(t('gameplay.summaryReadAloudUnavailable', 'Could not start voice playback. Check narrator settings.'));
      }, SUMMARY_NARRATION_START_TIMEOUT_MS);
      return;
    }

    setSummarySpeakLoading(false);
    setSummaryError(t('gameplay.summaryElevenlabsOnly', 'ElevenLabs narrator is required. Configure narrator voice/settings.'));
    openSettings();
  }, [summaryText, narrator, openSettings, t, buildSummaryDialogueSegments]);

  useEffect(() => {
    if (!summarySpeakLoading || !summaryNarrationMessageId) return;
    const isThisSummaryPlaying =
      narrator.currentMessageId === summaryNarrationMessageId
      && narrator.playbackState === narrator.STATES.PLAYING;
    if (!isThisSummaryPlaying) return;

    setSummarySpeakLoading(false);
    if (summarySpeakTimeoutRef.current) {
      window.clearTimeout(summarySpeakTimeoutRef.current);
      summarySpeakTimeoutRef.current = null;
    }
  }, [
    summarySpeakLoading,
    summaryNarrationMessageId,
    narrator.currentMessageId,
    narrator.playbackState,
    narrator.STATES.PLAYING,
  ]);

  useEffect(() => () => {
    if (summarySpeakTimeoutRef.current) {
      window.clearTimeout(summarySpeakTimeoutRef.current);
      summarySpeakTimeoutRef.current = null;
    }
    if (summaryCopyTimeoutRef.current) {
      window.clearTimeout(summaryCopyTimeoutRef.current);
      summaryCopyTimeoutRef.current = null;
    }
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
    const ok = speakBrowserTts(scene.narrative);
    if (!ok) openSettings();
  }, [narrator, chatHistory, speakBrowserTts, openSettings]);

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

  useEffect(() => {
    if (campaign || isMultiplayer || readOnly) return;
    if (urlCampaignId) {
      let cancelled = false;
      storage.loadCampaign(urlCampaignId)
        .then((data) => {
          if (cancelled) return;
          if (data) {
            dispatch({ type: 'LOAD_CAMPAIGN', payload: data });
            storage.saveLocalSnapshot(data);
          } else {
            navigate('/', { replace: true, state: { campaignNotFound: true } });
          }
        })
        .catch(() => {
          if (!cancelled) navigate('/', { replace: true, state: { campaignNotFound: true } });
        });
      return () => { cancelled = true; };
    }
    navigate('/');
  }, [campaign, isMultiplayer, readOnly, navigate, urlCampaignId, dispatch]);

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

  // Viewer mode: force-enable narrator toggle so speaker controls work.
  const viewerNarratorEnabledRef = useRef(false);
  useEffect(() => {
    if (!readOnly) return;
    if (viewerNarratorEnabledRef.current) return;
    if (!settings.narratorEnabled) {
      viewerNarratorEnabledRef.current = true;
      updateSettings({ narratorEnabled: true });
    }
  }, [readOnly, settings.narratorEnabled, updateSettings]);

  // Viewer mode: default to scene=0 unless URL says otherwise.
  useEffect(() => {
    if (!readOnly) return;
    if (!scenes || scenes.length === 0) return;

    const params = new URLSearchParams(location.search || '');
    const raw = params.get('scene');

    if (raw == null) {
      params.set('scene', '0');
      navigate(`${location.pathname}?${params.toString()}`, { replace: true });
      return;
    }

    let idx = 0;
    const parsed = Number.parseInt(raw, 10);
    if (Number.isFinite(parsed)) idx = parsed;

    const clamped = Math.max(0, Math.min(scenes.length - 1, idx));
    setViewingSceneIndex(clamped);
    handleSceneNavigation(clamped);
    initialViewerChatAlignDoneRef.current = false;
  }, [readOnly, scenes?.length, location.pathname, location.search, navigate]);

  useEffect(() => {
    if (!readOnly) return;
    if (!scenes || scenes.length === 0) return;
    if (!chatHistory || chatHistory.length === 0) return;
    if (initialViewerChatAlignDoneRef.current) return;

    const safeIndex = Number.isInteger(viewingSceneIndex)
      ? Math.max(0, Math.min(scenes.length - 1, viewingSceneIndex))
      : 0;
    const scene = scenes[safeIndex];
    if (!scene) return;

    const targetMsg = scene.id ? chatHistory.find((m) => m.sceneId === scene.id) : null;
    const fallbackMsg = !targetMsg ? chatHistory.filter((m) => m.role === 'dm')[safeIndex] : null;
    const preferredMessageId = targetMsg?.id || fallbackMsg?.id;

    if (preferredMessageId) {
      requestChatScrollToMessage(preferredMessageId);
      initialViewerChatAlignDoneRef.current = true;
    }
  }, [readOnly, scenes, chatHistory, viewingSceneIndex, requestChatScrollToMessage]);

  useEffect(() => {
    if (readOnly) return;
    if ((settings.sceneVisualization || 'image') !== 'image') return;
    if (
      currentScene &&
      !currentScene.image &&
      !isGeneratingImage &&
      !isGeneratingScene &&
      !imageAttemptedRef.current.has(currentScene.id)
    ) {
      if (isMultiplayer && !mp.state.isHost) return;
      repairSceneImage(currentScene.id, { reason: 'current-missing' });
    }
  }, [
    readOnly,
    settings.sceneVisualization,
    currentScene,
    isGeneratingImage,
    isGeneratingScene,
    isMultiplayer,
    mp.state.isHost,
    repairSceneImage,
  ]);

  useEffect(() => {
    if (!readOnly) return;
    if ((settings.sceneVisualization || 'image') !== 'image') return;
    if (
      viewedScene &&
      !viewedScene.image &&
      !isGeneratingImage &&
      !isGeneratingScene &&
      !imageAttemptedRef.current.has(viewedScene.id) &&
      viewedScene.narrative
    ) {
      repairSceneImage(viewedScene.id, { reason: 'viewer-missing', skipAutoSave: true });
    }
  }, [readOnly, settings.sceneVisualization, viewedScene, isGeneratingImage, isGeneratingScene, repairSceneImage]);

  useEffect(() => {
    if ((settings.sceneVisualization || 'image') !== 'image') return;
    if (!scenes?.length) return;
    if (isGeneratingImage || isGeneratingScene) return;
    if (isMultiplayer && !mp.state.isHost) return;

    const now = Date.now();
    if (now - imageMigrationLastRunRef.current < SCENE_IMAGE_MIGRATION_COOLDOWN_MS) return;
    if (imageMigrationRunningRef.current) return;

    let cancelled = false;
    imageMigrationRunningRef.current = true;
    imageMigrationLastRunRef.current = now;

    (async () => {
      let repairsDone = 0;
      for (const scene of scenes.slice(0, MAX_SCENE_IMAGE_MIGRATION_SCAN)) {
        if (cancelled) break;
        if (!scene?.id || !scene.narrative) continue;
        if (repairsDone >= MAX_SCENE_IMAGE_MIGRATION_REPAIRS_PER_PASS) break;
        if (imageRepairInFlightRef.current.has(scene.id)) continue;
        if ((imageRepairAttemptsRef.current.get(scene.id) || 0) >= MAX_SCENE_IMAGE_REPAIR_ATTEMPTS) continue;

        if (!scene.image) {
          const repaired = await repairSceneImage(scene.id, {
            reason: 'migration-missing',
            skipAutoSave: readOnly,
            markAttempted: false,
          });
          if (repaired) repairsDone += 1;
          continue;
        }

        const canLoad = await probeSceneImage(scene.image);
        if (!canLoad) {
          const repaired = await repairSceneImage(scene.id, {
            reason: 'migration-broken-url',
            skipAutoSave: readOnly,
            markAttempted: false,
          });
          if (repaired) repairsDone += 1;
        }
      }
    })()
      .finally(() => {
        imageMigrationRunningRef.current = false;
      });

    return () => {
      cancelled = true;
    };
  }, [
    settings.sceneVisualization,
    scenes,
    isGeneratingImage,
    isGeneratingScene,
    isMultiplayer,
    mp.state.isHost,
    readOnly,
    probeSceneImage,
    repairSceneImage,
  ]);

  useEffect(() => {
    if (!isMultiplayer) return;
    const players = mp.state.players || [];
    for (const p of players) {
      if (p.voiceId && p.name) {
        const existing = state.characterVoiceMap?.[p.name];
        if (!existing || existing.voiceId !== p.voiceId) {
          dispatch({
            type: 'MAP_CHARACTER_VOICE',
            payload: { characterName: p.name, voiceId: p.voiceId, gender: p.gender || null },
          });
        }
      }
    }
  }, [isMultiplayer, mp.state.players, state.characterVoiceMap, dispatch]);

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

    if (overlayText && earlyDiceRoll) {
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
  }, [overlayText, earlyDiceRoll]);

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
    || !!state.dialogue?.active
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

  const handleEndCombat = (summary) => {
    dispatch({ type: 'END_COMBAT' });

    const combatJournal = summary.playerSurvived
      ? `Combat: Victory — ${summary.enemiesDefeated}/${summary.totalEnemies} enemies defeated in ${summary.rounds} rounds.${summary.woundsChange ? ` Took ${Math.abs(summary.woundsChange)} wounds.` : ''}`
      : `Combat: Defeat — fell after ${summary.rounds} rounds against ${summary.totalEnemies} enemies.`;

    const stateChanges = {
      journalEntries: [combatJournal],
    };
    if (summary.woundsChange) stateChanges.woundsChange = summary.woundsChange;
    if (summary.xp) stateChanges.xp = summary.xp;

    if (!summary.playerSurvived) {
      stateChanges.forceStatus = 'dead';
    }

    dispatch({ type: 'APPLY_STATE_CHANGES', payload: stateChanges });

    const isDead = stateChanges.forceStatus === 'dead';
    const xpRewardText = summary.xp ? ` +${summary.xp} ${t('common.xp')}` : '';

    dispatch({
      type: 'ADD_CHAT_MESSAGE',
      payload: {
        id: `msg_${Date.now()}_combat_end`,
        role: 'system',
        subtype: isDead ? 'combat_death' : 'combat_end',
        content: isDead
          ? t('combat.playerDied', 'Your character has fallen in combat. Death is final.')
          : `${t('combat.endedAfterRounds', 'Combat ended after {{rounds}} rounds.', { rounds: summary.rounds })} ${summary.enemiesDefeated}/${summary.totalEnemies} ${t('combat.enemiesDefeated', 'enemies defeated')}. ${summary.playerSurvived ? t('combat.youSurvived', 'You survived!') : t('combat.youWereDefeated', 'You were defeated!')}${xpRewardText}`,
        timestamp: Date.now(),
      },
    });
    setTimeout(() => autoSave(), 300);

    if (isDead) {
      narrator.stop?.();
      return;
    }

    const combatActionText = summary.playerSurvived
      ? `[Combat resolved: defeated ${summary.enemiesDefeated}/${summary.totalEnemies} enemies in ${summary.rounds} rounds.${summary.woundsChange ? ` Took ${Math.abs(summary.woundsChange)} wounds.` : ' Unscathed.'}]`
      : `[Combat resolved: the player LOST the fight after ${summary.rounds} rounds against ${summary.totalEnemies} enemies. They were reduced to 0 wounds and did NOT win. ${summary.enemiesDefeated}/${summary.totalEnemies} enemies were defeated before the loss.${summary.woundsChange ? ` The player took ${Math.abs(summary.woundsChange)} wounds.` : ''} Narrate ONLY the defeat aftermath: capture, rescue, being left for dead, waking up wounded, losing gear, or enemies taking control. NEVER describe this as a victory, clean escape, or total enemy defeat.]`;

    generateScene(combatActionText, false, false).catch(() => {});
  };

  const handleSurrender = (summary) => {
    dispatch({ type: 'END_COMBAT' });

    const remainingList = summary.remainingEnemies.map((e) => `${e.name} (${e.wounds}/${e.maxWounds} HP)`).join(', ');
    const combatJournal = `Combat: Surrender — yielded after ${summary.rounds} rounds. ${summary.enemiesDefeated}/${summary.totalEnemies} enemies defeated. Remaining enemies: ${remainingList}.${summary.woundsChange ? ` Took ${Math.abs(summary.woundsChange)} wounds.` : ''}`;

    const stateChanges = {
      journalEntries: [combatJournal],
    };
    if (summary.woundsChange) stateChanges.woundsChange = summary.woundsChange;
    if (summary.xp) stateChanges.xp = summary.xp;
    dispatch({ type: 'APPLY_STATE_CHANGES', payload: stateChanges });

    const xpRewardText = summary.xp ? ` +${summary.xp} ${t('common.xp')}` : '';

    dispatch({
      type: 'ADD_CHAT_MESSAGE',
      payload: {
        id: `msg_${Date.now()}_combat_surrender`,
        role: 'system',
        subtype: 'combat_end',
        content: `${t('combat.youSurrenderedAfterRounds', 'You surrendered after {{rounds}} rounds.', { rounds: summary.rounds })} ${summary.enemiesDefeated}/${summary.totalEnemies} ${t('combat.enemiesDefeated', 'enemies defeated')}.${xpRewardText}`,
        timestamp: Date.now(),
      },
    });
    setTimeout(() => autoSave(), 300);

    const combatActionText = `[Combat resolved: player surrendered after ${summary.rounds} rounds. ${summary.enemiesDefeated}/${summary.totalEnemies} enemies defeated. Remaining enemies: ${remainingList}. Reason for combat: ${summary.reason || 'unknown'}.${summary.woundsChange ? ` Player took ${Math.abs(summary.woundsChange)} wounds.` : ' Player unscathed.'}]`;

    generateScene(combatActionText, false, false).catch(() => {});
  };

  const handleForceTruce = (summary) => {
    dispatch({ type: 'END_COMBAT' });

    const remainingList = summary.remainingEnemies.map((e) => `${e.name} (${e.wounds}/${e.maxWounds} HP)`).join(', ');
    const combatJournal = `Combat: Truce — forced a truce after ${summary.rounds} rounds. ${summary.enemiesDefeated}/${summary.totalEnemies} enemies defeated. Remaining enemies: ${remainingList}.${summary.woundsChange ? ` Took ${Math.abs(summary.woundsChange)} wounds.` : ''}`;

    const stateChanges = {
      journalEntries: [combatJournal],
    };
    if (summary.woundsChange) stateChanges.woundsChange = summary.woundsChange;
    if (summary.xp) stateChanges.xp = summary.xp;
    dispatch({ type: 'APPLY_STATE_CHANGES', payload: stateChanges });

    const xpRewardText = summary.xp ? ` +${summary.xp} ${t('common.xp')}` : '';

    dispatch({
      type: 'ADD_CHAT_MESSAGE',
      payload: {
        id: `msg_${Date.now()}_combat_truce`,
        role: 'system',
        subtype: 'combat_end',
        content: `${t('combat.youForcedTruceAfterRounds', 'You forced a truce after {{rounds}} rounds.', { rounds: summary.rounds })} ${summary.enemiesDefeated}/${summary.totalEnemies} ${t('combat.enemiesDefeated', 'enemies defeated')}.${xpRewardText}`,
        timestamp: Date.now(),
      },
    });
    setTimeout(() => autoSave(), 300);

    const combatActionText = `[Combat resolved: player forced a truce after ${summary.rounds} rounds. ${summary.enemiesDefeated}/${summary.totalEnemies} enemies defeated. Remaining enemies: ${remainingList}. The player had the upper hand and demanded the enemies stand down. Reason for combat: ${summary.reason || 'unknown'}.${summary.woundsChange ? ` Player took ${Math.abs(summary.woundsChange)} wounds.` : ' Player unscathed.'}]`;

    generateScene(combatActionText, false, false).catch(() => {});
  };

  const handleEndDialogue = (summary) => {
    dispatch({ type: 'END_DIALOGUE' });

    const npcList = (summary.npcs || []).join(', ');
    const journalEntry = summary.endedEarly
      ? `Dialogue: Ended conversation early with ${npcList} after ${summary.rounds}/${summary.maxRounds} rounds.`
      : `Dialogue: Completed conversation with ${npcList} over ${summary.rounds} rounds.`;

    dispatch({
      type: 'APPLY_STATE_CHANGES',
      payload: { journalEntries: [journalEntry] },
    });

    dispatch({
      type: 'ADD_CHAT_MESSAGE',
      payload: {
        id: `msg_${Date.now()}_dialogue_end`,
        role: 'system',
        subtype: 'dialogue_end',
        content: summary.endedEarly
          ? t('dialogue.endedEarly', { rounds: summary.rounds, maxRounds: summary.maxRounds })
          : t('dialogue.completed', { rounds: summary.rounds }),
        timestamp: Date.now(),
      },
    });
    setTimeout(() => autoSave(), 300);

    const dialogueActionText = `[Dialogue ended: ${summary.endedEarly ? 'ended early' : 'completed'} after ${summary.rounds} rounds with ${npcList}. Resume normal narration — describe the aftermath and consequences of the conversation.]`;
    generateScene(dialogueActionText, false, false).catch(() => {});
  };

  // --- Multiplayer combat handlers (host-only) ---
  const combatPanelRef = useRef(null);

  const handleMpEndCombat = (summary) => {
    const perChar = summary.perCharacter || {};
    const perCharForServer = {};
    for (const [name, data] of Object.entries(perChar)) {
      perCharForServer[name] = {
        wounds: data.wounds || 0,
        xp: data.xp || 0,
        manaChange: data.manaChange || 0,
      };
    }

    const allSurvived = Object.values(perChar).every((p) => p.survived);
    const combatJournal = allSurvived
      ? `Combat: Victory — ${summary.enemiesDefeated}/${summary.totalEnemies} enemies defeated in ${summary.rounds} rounds.`
      : `Combat: Defeat — party fell after ${summary.rounds} rounds against ${summary.totalEnemies} enemies.`;

    mp.endMultiplayerCombat({
      perCharacter: perCharForServer,
      enemiesDefeated: summary.enemiesDefeated,
      totalEnemies: summary.totalEnemies,
      rounds: summary.rounds,
      outcome: allSurvived ? 'victory' : 'defeat',
      journalEntry: combatJournal,
    });

    const combatActionText = allSurvived
      ? `[Combat resolved: party defeated ${summary.enemiesDefeated}/${summary.totalEnemies} enemies in ${summary.rounds} rounds.]`
      : `[Combat resolved: the party LOST the fight after ${summary.rounds} rounds against ${summary.totalEnemies} enemies. They did NOT win. ${summary.enemiesDefeated}/${summary.totalEnemies} enemies were defeated before the loss. Narrate ONLY the defeat aftermath: capture, forced retreat, rescue, imprisonment, losing equipment, or waking later under enemy control. NEVER describe this as a victory or as if all enemies were defeated.]`;

    mp.soloAction(combatActionText, false, settings.language, settings.dmSettings);
  };

  const handleMpSurrender = (summary) => {
    const perChar = summary.perCharacter || {};
    const perCharForServer = {};
    for (const [name, data] of Object.entries(perChar)) {
      perCharForServer[name] = {
        wounds: data.wounds || 0,
        xp: data.xp || 0,
        manaChange: data.manaChange || 0,
      };
    }

    const remainingList = (summary.remainingEnemies || []).map((e) => `${e.name} (${e.wounds}/${e.maxWounds} HP)`).join(', ');
    const combatJournal = `Combat: Surrender — party yielded after ${summary.rounds} rounds. ${summary.enemiesDefeated}/${summary.totalEnemies} enemies defeated. Remaining: ${remainingList}.`;

    mp.endMultiplayerCombat({
      perCharacter: perCharForServer,
      enemiesDefeated: summary.enemiesDefeated,
      totalEnemies: summary.totalEnemies,
      rounds: summary.rounds,
      outcome: 'surrender',
      journalEntry: combatJournal,
    });

    const combatActionText = `[Combat resolved: party surrendered after ${summary.rounds} rounds. ${summary.enemiesDefeated}/${summary.totalEnemies} enemies defeated. Remaining enemies: ${remainingList}. Reason: ${summary.reason || 'unknown'}.]`;

    mp.soloAction(combatActionText, false, settings.language, settings.dmSettings);
  };

  const handleMpForceTruce = (summary) => {
    const perChar = summary.perCharacter || {};
    const perCharForServer = {};
    for (const [name, data] of Object.entries(perChar)) {
      perCharForServer[name] = {
        wounds: data.wounds || 0,
        xp: data.xp || 0,
        manaChange: data.manaChange || 0,
      };
    }

    const remainingList = (summary.remainingEnemies || []).map((e) => `${e.name} (${e.wounds}/${e.maxWounds} HP)`).join(', ');
    const combatJournal = `Combat: Truce — party forced a truce after ${summary.rounds} rounds. ${summary.enemiesDefeated}/${summary.totalEnemies} enemies defeated. Remaining: ${remainingList}.`;

    mp.endMultiplayerCombat({
      perCharacter: perCharForServer,
      enemiesDefeated: summary.enemiesDefeated,
      totalEnemies: summary.totalEnemies,
      rounds: summary.rounds,
      outcome: 'truce',
      journalEntry: combatJournal,
    });

    const combatActionText = `[Combat resolved: party forced a truce after ${summary.rounds} rounds. ${summary.enemiesDefeated}/${summary.totalEnemies} enemies defeated. Remaining enemies: ${remainingList}. The party had the upper hand and demanded the enemies stand down. Reason: ${summary.reason || 'unknown'}.]`;

    mp.soloAction(combatActionText, false, settings.language, settings.dmSettings);
  };

  // Host: detect combatUpdate from scene results and create MP combat state
  const lastCombatSceneRef = useRef(null);
  useEffect(() => {
    if (!isMultiplayer || !mp.state.isHost) return;
    const lastScene = (mpGameState?.scenes || []).at(-1);
    if (!lastScene || lastScene.id === lastCombatSceneRef.current) return;
    if (mpGameState?.combat?.active) return;

    const combatUpdate = lastScene.stateChanges?.combatUpdate;
    if (combatUpdate?.active) {
      lastCombatSceneRef.current = lastScene.id;
      const chars = mpGameState.characters || [];
      const aiEnemies = Array.isArray(combatUpdate.enemies)
        ? combatUpdate.enemies.filter((enemy) => enemy?.name)
        : [];
      const fallbackEnemies = aiEnemies.length > 0
        ? aiEnemies
        : [{
            name: 'Hostile Foe',
            characteristics: { ws: 35, bs: 25, s: 30, t: 30, i: 30, ag: 30, dex: 25, int: 20, wp: 25, fel: 15 },
            wounds: 10,
            maxWounds: 10,
            skills: { 'Melee (Basic)': 5 },
            traits: [],
            armour: { body: 0 },
            weapons: ['Hand Weapon'],
          }];
      const combatState = createMultiplayerCombatState(chars, fallbackEnemies, []);
      combatState.reason = combatUpdate.reason || '';
      mp.syncCombatState(combatState);
    }
  }, [isMultiplayer, mp.state.isHost, mpGameState?.scenes, mpGameState?.combat, mpGameState?.characters]);

  // Host: handle incoming COMBAT_MANOEUVRE from other players
  useEffect(() => {
    if (!isMultiplayer || !mp.state.isHost) return;
    const pending = mp.state.pendingCombatManoeuvre;
    if (!pending) return;

    mp.clearPendingCombatManoeuvre();
    const fromPlayerId = `player_${pending.fromOdId}`;
    if (CombatPanel.resolveRemoteManoeuvre) {
      CombatPanel.resolveRemoteManoeuvre(fromPlayerId, pending.manoeuvre, pending.targetId, pending.customDescription);
    }
  }, [isMultiplayer, mp.state.isHost, mp.state.pendingCombatManoeuvre]);

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
        {/* Scene Counter */}
        {scenes.length > 0 && (
          <div className="flex items-center justify-between px-2">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">
                {campaign.name}
              </span>
              <span className="w-1 h-1 bg-primary/50 rounded-full" />
              <span className="flex items-center gap-1">
                <button
                  onClick={() => {
                    setViewingSceneIndex(0);
                    handleSceneNavigation(0);
                  }}
                  disabled={displayedSceneIndex <= 0}
                  title={t('gameplay.firstScene', 'First scene')}
                  aria-label={t('gameplay.firstScene', 'First scene')}
                  className="material-symbols-outlined text-base text-outline hover:text-primary disabled:text-outline/30 disabled:cursor-default transition-colors"
                >
                  first_page
                </button>
                <button
                  onClick={() => {
                    const newIndex = Math.max(0, displayedSceneIndex - 1);
                    setViewingSceneIndex(newIndex);
                    handleSceneNavigation(newIndex);
                  }}
                  disabled={displayedSceneIndex <= 0}
                  title={t('gameplay.previousScene', 'Previous scene')}
                  aria-label={t('gameplay.previousScene', 'Previous scene')}
                  className="material-symbols-outlined text-base text-outline hover:text-primary disabled:text-outline/30 disabled:cursor-default transition-colors"
                >
                  chevron_left
                </button>
                <span className={`text-xs ${isReviewingPastScene ? 'text-primary font-bold' : 'text-outline'}`}>
                  {t('common.scene')} {displayedSceneIndex + 1} / {scenes.length}
                </span>
                {scenes.length > 2 && (
                  <span
                    className={`text-[9px] px-1.5 py-0.5 rounded-sm border ${
                      tensionScore > 70 ? 'text-error border-error/30 bg-error/10' :
                      tensionScore > 40 ? 'text-amber-400 border-amber-400/30 bg-amber-400/10' :
                      'text-tertiary border-tertiary/30 bg-tertiary/10'
                    }`}
                    title={t('gameplay.tensionScore', 'Tension') + `: ${tensionScore}/100`}
                  >
                    {tensionScore > 70 ? t('gameplay.tensionHigh', 'High') :
                     tensionScore > 40 ? t('gameplay.tensionMedium', 'Med') :
                     t('gameplay.tensionLow', 'Low')}
                  </span>
                )}
                <button
                  onClick={() => {
                    const next = displayedSceneIndex + 1;
                    const newIndex = next >= scenes.length - 1 ? null : next;
                    setViewingSceneIndex(newIndex);
                    handleSceneNavigation(next);
                  }}
                  disabled={displayedSceneIndex >= scenes.length - 1}
                  title={t('gameplay.nextScene', 'Next scene')}
                  aria-label={t('gameplay.nextScene', 'Next scene')}
                  className="material-symbols-outlined text-base text-outline hover:text-primary disabled:text-outline/30 disabled:cursor-default transition-colors"
                >
                  chevron_right
                </button>
                <button
                  onClick={() => {
                    const next = displayedSceneIndex + 1;
                    navigateWithTypewriter(next);
                  }}
                  disabled={displayedSceneIndex >= scenes.length - 1}
                  title={t('gameplay.lastScene', 'Last scene')}
                  aria-label={t('gameplay.lastScene', 'Last scene')}
                  className="material-symbols-outlined text-base text-outline hover:text-primary disabled:text-outline/30 disabled:cursor-default transition-colors"
                >
                  last_page
                </button>
                {viewedScene?.narrative && (
                  <button
                    onClick={() => {
                      playSceneNarration(viewedScene, displayedSceneIndex);
                    }}
                    title={t('gameplay.playScene', 'Play scene')}
                    aria-label={t('gameplay.playScene', 'Play scene')}
                    className="material-symbols-outlined text-xs text-outline hover:text-primary transition-colors ml-1"
                  >
                    play_circle
                  </button>
                )}
                {narrator.isNarratorReady && narrator.playbackState === narrator.STATES.PLAYING && (
                  <button
                    onClick={() => narrator.skipSegment()}
                    title={t('gameplay.skipSegment', 'Skip to next segment')}
                    aria-label={t('gameplay.skipSegment', 'Skip to next segment')}
                    className="material-symbols-outlined text-xs text-outline hover:text-primary transition-colors"
                  >
                    skip_next
                  </button>
                )}
                {((settings.narratorEnabled || readOnly) && narrator.isNarratorReady && scenes.length > 1) && (
                  <button
                    onClick={() => {
                      if (autoPlayScenes) {
                        setAutoPlayScenes(false);
                        narrator.stop();
                      } else {
                        if (displayedSceneIndex >= scenes.length - 1) {
                          setViewingSceneIndex(0);
                          handleSceneNavigation(0);
                        }
                        setAutoPlayScenes(true);
                      }
                    }}
                    title={autoPlayScenes
                      ? t('gameplay.stopAutoPlay', 'Stop auto-play')
                      : t('gameplay.autoPlayScenes', 'Auto-play all scenes')}
                    aria-label={autoPlayScenes
                      ? t('gameplay.stopAutoPlay', 'Stop auto-play')
                      : t('gameplay.autoPlayScenes', 'Auto-play all scenes')}
                    className={`material-symbols-outlined text-xs transition-colors ml-1 ${
                      autoPlayScenes
                        ? 'text-tertiary hover:text-error animate-pulse'
                        : 'text-outline hover:text-primary'
                    }`}
                  >
                    {autoPlayScenes ? 'stop' : 'play_arrow'}
                  </button>
                )}
              </span>
              {campaign?.structure?.acts?.length > 0 && (
                <>
                  <span className="w-1 h-1 bg-primary/50 rounded-full" />
                  <span className="text-[10px] text-outline">
                    {t('gameplay.act', 'Act')} {campaign.structure.currentAct || 1}
                    {campaign.structure.acts.find((a) => a.number === (campaign.structure.currentAct || 1))?.name
                      ? ` — ${campaign.structure.acts.find((a) => a.number === (campaign.structure.currentAct || 1)).name}`
                      : ''}
                  </span>
                  <div className="hidden sm:flex items-center gap-1 ml-1">
                    <div className="w-16 h-1 bg-surface-container-high rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary/60 rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(100, ((scenes.length) / (campaign.structure.totalTargetScenes || 25)) * 100)}%` }}
                      />
                    </div>
                    <span className="text-[9px] text-outline">~{campaign.structure.totalTargetScenes || '?'}</span>
                  </div>
                </>
              )}
            </div>
            <div className="flex items-center gap-4">
              {!readOnly && aiCosts?.total > 0 && (
                <CostBadge costs={aiCosts} />
              )}
              {!readOnly && attrPoints > 0 && (
                <button
                  onClick={handleAdvancementOpen}
                  className="flex items-center gap-1.5 px-3 py-1 bg-primary/15 text-primary text-[10px] font-bold uppercase tracking-widest rounded-sm border border-primary/20 hover:bg-primary/25 transition-all animate-fade-in"
                >
                  <span className="material-symbols-outlined text-xs">upgrade</span>
                  +{attrPoints} pkt
                </button>
              )}
              {isMultiplayer && allCharacters.length > 0 ? (
                <div className="hidden lg:flex items-center gap-4 text-xs text-on-surface-variant">
                  {allCharacters.map((c) => (
                    <span key={c.name}>{c.name} W:{c.wounds}/{c.maxWounds}</span>
                  ))}
                </div>
              ) : displayCharacter ? (
                <div className="hidden lg:flex items-center gap-4 text-xs text-on-surface-variant">
                  <span>{displayCharacter.name}</span>
                  <span>{t(`species.${displayCharacter.species}`, { defaultValue: displayCharacter.species })}</span>
                  {isViewingCompanion && <span className="text-tertiary font-bold">(Companion)</span>}
                </div>
              ) : null}
              <button
                onClick={handleRefresh}
                disabled={isRefreshing}
                title={t('gameplay.refreshTooltip', 'Reload campaign')}
                aria-label={t('gameplay.refresh', 'Refresh')}
                className={`material-symbols-outlined text-sm transition-colors ${
                  isRefreshing ? 'text-primary animate-spin' : 'text-outline hover:text-primary'
                }`}
              >
                {isRefreshing ? 'progress_activity' : 'refresh'}
              </button>
              {!readOnly && (
                <>
                  {/* Auto-Player toggle (solo only) */}
                  {!isMultiplayer && currentScene && (!campaign?.status || campaign.status === 'active') && character?.status !== 'dead' && (
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={autoPlayer.toggleAutoPlayer}
                        title={t('autoPlayer.toggle')}
                        aria-label={t('autoPlayer.toggle')}
                        className={`relative w-8 h-[18px] rounded-full transition-colors duration-200 ${
                          autoPlayer.isAutoPlaying ? 'bg-primary' : 'bg-outline/30'
                        }`}
                      >
                        <span
                          className={`absolute top-[3px] left-[3px] w-3 h-3 rounded-full bg-on-primary transition-transform duration-200 ${
                            autoPlayer.isAutoPlaying ? 'translate-x-[14px]' : 'translate-x-0'
                          }`}
                        />
                      </button>
                      {autoPlayer.isAutoPlaying && autoPlayer.isThinking && (
                        <span className="material-symbols-outlined text-xs text-primary animate-spin">progress_activity</span>
                      )}
                      <span className="text-[9px] font-label uppercase tracking-widest text-on-surface-variant hidden xl:inline">
                        {t('autoPlayer.title')}
                      </span>
                      {autoPlayer.isAutoPlaying && (
                        <span className="text-[9px] text-outline tabular-nums">
                          {autoPlayer.turnsPlayed}{autoPlayer.autoPlayerSettings.maxTurns > 0 ? `/${autoPlayer.autoPlayerSettings.maxTurns}` : ''}
                        </span>
                      )}
                      <button
                        onClick={() => setAutoPlayerSettingsOpen(true)}
                        title={t('autoPlayer.settings')}
                        aria-label={t('autoPlayer.settings')}
                        className="material-symbols-outlined text-sm text-outline hover:text-primary transition-colors"
                      >
                        tune
                      </button>
                    </div>
                  )}
                  <button
                    onClick={() => setMpPanelOpen(true)}
                    title={isMultiplayer ? t('multiplayer.invitePlayers') : t('multiplayer.openMultiplayer')}
                    aria-label={isMultiplayer ? t('multiplayer.invitePlayers') : t('multiplayer.openMultiplayer')}
                    className={`material-symbols-outlined text-sm transition-colors ${
                      isMultiplayer ? 'text-primary hover:text-tertiary' : 'text-outline hover:text-primary'
                    }`}
                  >
                    {isMultiplayer ? 'group' : 'group_add'}
                  </button>
                  {isMultiplayer && (
                    <button
                      onClick={() => setVideoPanelOpen((v) => !v)}
                      title={t('webcam.videoChat')}
                      aria-label={t('webcam.videoChat')}
                      className={`material-symbols-outlined text-sm transition-colors ${
                        videoPanelOpen ? 'text-primary hover:text-tertiary' : 'text-outline hover:text-primary'
                      }`}
                    >
                      video_camera_front
                    </button>
                  )}
                  {campaign?.backendId && apiClient.isConnected() && (
                    <button
                      onClick={handleShare}
                      disabled={shareLoading}
                      title={shareCopied ? t('gameplay.shareCopied') : t('gameplay.share')}
                      aria-label={t('gameplay.share')}
                      className={`material-symbols-outlined text-sm transition-colors ${
                        shareCopied ? 'text-emerald-400' : shareLoading ? 'text-outline/50 animate-pulse' : 'text-outline hover:text-primary'
                      }`}
                    >
                      {shareCopied ? 'check' : 'share'}
                    </button>
                  )}
                  <button
                    onClick={handleOpenSummaryModal}
                    title={t('gameplay.summaryTitle', 'Story summary')}
                    aria-label={t('gameplay.summaryTitle', 'Story summary')}
                    className="material-symbols-outlined text-sm text-outline hover:text-primary transition-colors"
                  >
                    short_text
                  </button>
                  <button
                    onClick={() => setAchievementsOpen(true)}
                    title={t('achievements.title', 'Achievements')}
                    aria-label={t('achievements.title', 'Achievements')}
                    className="material-symbols-outlined text-sm text-outline hover:text-primary transition-colors"
                  >
                    emoji_events
                  </button>
                  <button
                    onClick={() => setWorldModalOpen(true)}
                    title={t('worldState.title')}
                    aria-label={t('worldState.title')}
                    className="material-symbols-outlined text-sm text-outline hover:text-primary transition-colors"
                  >
                    public
                  </button>
                  <button
                    onClick={() => setGmModalOpen(true)}
                    title={t('gmModal.title')}
                    aria-label={t('gmModal.title')}
                    className="material-symbols-outlined text-sm text-outline hover:text-primary transition-colors"
                  >
                    auto_stories
                  </button>
                  <button
                    onClick={() => {
                      if (isMultiplayer && mpGameState) {
                        exportAsMarkdown({
                          campaign: mpGameState.campaign,
                          character: character,
                          scenes: mpGameState.scenes,
                          chatHistory: mpGameState.chatHistory,
                          quests: mpGameState.quests,
                          world: mpGameState.world,
                        });
                      } else {
                        exportAsMarkdown(state);
                      }
                    }}
                    title={t('gameplay.exportLog')}
                    aria-label={t('gameplay.exportLog')}
                    className="material-symbols-outlined text-sm text-outline hover:text-primary transition-colors"
                  >
                    download
                  </button>
                </>
              )}
            </div>
          </div>
        )}

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
              imageAttemptedRef.current.delete(sceneId);
              imageRepairAttemptsRef.current.delete(sceneId);
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
              onEndCombat={isMultiplayer ? handleMpEndCombat : handleEndCombat}
              onSurrender={isMultiplayer ? handleMpSurrender : handleSurrender}
              onForceTruce={isMultiplayer ? handleMpForceTruce : handleForceTruce}
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

        {/* Dialogue Panel */}
        {state.dialogue?.active && !isViewingCompanion && !isReviewingPastScene && !readOnly && (
          <div className="px-2 animate-fade-in">
            <DialoguePanel
              dialogue={state.dialogue}
              gameState={state}
              onAction={handleAction}
              onEndDialogue={handleEndDialogue}
              disabled={isGeneratingScene}
            />
          </div>
        )}

        {/* Magic Panel */}
        {hasMagic && !isMultiplayer && !state.combat?.active && !state.dialogue?.active && !isViewingCompanion && !isReviewingPastScene && !readOnly && (
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
        {currentScene?.questOffers?.length > 0 && !isGeneratingScene && !state.combat?.active && !state.dialogue?.active && !isViewingCompanion && !isReviewingPastScene && (!campaign?.status || campaign.status === 'active') && !readOnly && (
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
        {currentScene && !isGeneratingScene && !(isMultiplayer ? mpGameState?.combat?.active : state.combat?.active) && !state.dialogue?.active && !isViewingCompanion && !isReviewingPastScene && (!campaign?.status || campaign.status === 'active') && character?.status !== 'dead' && !mp.state.isDead && !readOnly && (
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
              dialogueCooldown={state.dialogueCooldown || 0}
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
          onScrollTargetHandled={(handledId) => {
            setScrollTargetMessageId((current) => (current === handledId ? null : current));
          }}
          typingPlayers={isMultiplayer ? mp.state.typingPlayers : {}}
          sessionSeconds={sessionSeconds}
          totalPlayTime={totalPlayTime}
          narrationTime={state.narrationTime || 0}
        />
      </aside>

      {!readOnly && (
        <>
          {worldModalOpen && (
            <WorldStateModal
              world={isMultiplayer ? mpGameState?.world : state.world}
              quests={isMultiplayer ? mpGameState?.quests : state.quests}
              characterVoiceMap={state.characterVoiceMap}
              characterVoices={settings.characterVoices}
              dispatch={dispatch}
              autoSave={autoSave}
              onClose={() => setWorldModalOpen(false)}
            />
          )}

          {gmModalOpen && (
            <GMModal onClose={() => setGmModalOpen(false)} />
          )}

          {mpPanelOpen && (
            <MultiplayerPanel onClose={() => setMpPanelOpen(false)} />
          )}

          {advancementOpen && (
            <AdvancementPanel onClose={handleAdvancementClose} />
          )}

          {achievementsOpen && (
            <AchievementsPanel
              achievementState={state.achievements}
              onClose={() => setAchievementsOpen(false)}
            />
          )}

          {autoPlayerSettingsOpen && (
            <AutoPlayerPanel
              isAutoPlaying={autoPlayer.isAutoPlaying}
              isThinking={autoPlayer.isThinking}
              turnsPlayed={autoPlayer.turnsPlayed}
              lastError={autoPlayer.lastError}
              toggleAutoPlayer={autoPlayer.toggleAutoPlayer}
              autoPlayerSettings={autoPlayer.autoPlayerSettings}
              updateAutoPlayerSettings={autoPlayer.updateAutoPlayerSettings}
              characterName={character?.name}
              isGeneratingScene={isGeneratingScene}
              onClose={() => setAutoPlayerSettingsOpen(false)}
            />
          )}

          {summaryModalOpen && (
            <SummaryModal
              onClose={() => setSummaryModalOpen(false)}
              onGenerate={handleGenerateSummary}
              onCopy={handleCopySummary}
              onSpeak={handleSpeakSummary}
              summaryText={summaryText}
              isLoading={summaryLoading}
              error={summaryError}
              progress={summaryProgress}
              copied={summaryCopied}
              summaryOptions={summaryOptions}
              onSummaryOptionsChange={setSummaryOptions}
              sceneIndex={displayedSceneIndex}
              totalScenes={scenes.length}
              narrationMessageId={summaryNarrationMessageId}
              narrationWordOffset={summaryNarrationWordOffset}
              narratorCurrentMessageId={narrator.currentMessageId}
              narratorHighlightInfo={narrator.highlightInfo}
              speakLoading={summarySpeakLoading}
              sentencesPerScene={summarySentencesPerScene}
              onSentencesPerSceneChange={setSummarySentencesPerScene}
              recapScenes={scenes.slice(0, Math.max(0, displayedSceneIndex) + 1)}
            />
          )}

          {isMultiplayer && (
            <FloatingVideoPanel
              visible={videoPanelOpen}
              onClose={() => setVideoPanelOpen(false)}
            />
          )}
        </>
      )}
    </div>
  );
}
