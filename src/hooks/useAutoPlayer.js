import { useCallback, useEffect, useRef, useState } from 'react';
import { useSettings } from '../contexts/SettingsContext';
import { useGame } from '../contexts/GameContext';
import { decideAction } from '../services/autoPlayer';

const DEFAULT_AUTO_PLAYER = {
  enabled: false,
  style: 'balanced',
  delay: 3000,
  verbosity: 'medium',
  customInstructions: '',
  maxTurns: 0,
};

const AUTO_MOVE_DELAY_WITHOUT_NARRATION = 1500;
const AUTO_MOVE_DELAY_AFTER_NARRATION = 500;
const AUTO_TYPING_PAUSE = 500;
const MAX_SILENT_WAIT_BEFORE_FORCE_TURN = 3000;

export function getAutoPlayerAdvanceDelay({
  shouldWaitForNarration,
  narratorPlaybackState,
  narrationSeenForPendingScene,
  pendingSceneAgeMs,
}) {
  const narrationIsActivelyPlaying = narratorPlaybackState === 'playing';
  const silentWaitExceeded = shouldWaitForNarration
    && !narrationSeenForPendingScene
    && !narrationIsActivelyPlaying
    && pendingSceneAgeMs >= MAX_SILENT_WAIT_BEFORE_FORCE_TURN;

  if (shouldWaitForNarration && narrationIsActivelyPlaying) {
    return null;
  }

  if (silentWaitExceeded) {
    return 0;
  }

  return shouldWaitForNarration && narrationSeenForPendingScene
    ? AUTO_MOVE_DELAY_AFTER_NARRATION
    : AUTO_MOVE_DELAY_WITHOUT_NARRATION;
}

export function useAutoPlayer(handleAction, options = {}) {
  const { state, dispatch } = useGame();
  const { settings, getApiKey, updateSettings } = useSettings();
  const {
    narratorPlaybackState = 'idle',
    shouldWaitForNarration = false,
  } = options;

  const autoPlayerSettings = settings.autoPlayer || DEFAULT_AUTO_PLAYER;

  const [isThinking, setIsThinking] = useState(false);
  const [turnsPlayed, setTurnsPlayed] = useState(0);
  const [lastError, setLastError] = useState(null);
  const [typingText, setTypingText] = useState('');
  const [overlayAction, setOverlayAction] = useState(null);

  const timerRef = useRef(null);
  const typingRef = useRef(null);
  const abortRef = useRef(false);
  const enabledRef = useRef(autoPlayerSettings.enabled);
  const prevEnabledRef = useRef(autoPlayerSettings.enabled);
  const isRunningRef = useRef(false);
  const pendingSceneCountRef = useRef(0);
  const completedSceneCountRef = useRef(0);
  const narrationSeenForPendingSceneRef = useRef(false);
  const pendingSceneStartedAtRef = useRef(0);
  const overlayResolveRef = useRef(null);

  enabledRef.current = autoPlayerSettings.enabled;

  const updateAutoPlayerSettings = useCallback((partial) => {
    updateSettings({
      autoPlayer: { ...autoPlayerSettings, ...partial },
    });
  }, [autoPlayerSettings, updateSettings]);

  const toggleAutoPlayer = useCallback(() => {
    const next = !autoPlayerSettings.enabled;
    updateAutoPlayerSettings({ enabled: next });
    if (!next) {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (typingRef.current) {
        clearInterval(typingRef.current);
        typingRef.current = null;
      }
      abortRef.current = true;
      setIsThinking(false);
      setTypingText('');
      setOverlayAction(null);
      if (overlayResolveRef.current) {
        overlayResolveRef.current(false);
        overlayResolveRef.current = null;
      }
      setTurnsPlayed(0);
      setLastError(null);
      pendingSceneCountRef.current = 0;
      narrationSeenForPendingSceneRef.current = false;
      pendingSceneStartedAtRef.current = 0;
    } else {
      abortRef.current = false;
      setTurnsPlayed(0);
      setLastError(null);
    }
  }, [autoPlayerSettings, updateAutoPlayerSettings]);

  const showOverlay = useCallback((text) => {
    return new Promise((resolve) => {
      overlayResolveRef.current = resolve;
      setOverlayAction(text);
    });
  }, []);

  const completeOverlay = useCallback(() => {
    setOverlayAction(null);
    if (overlayResolveRef.current) {
      overlayResolveRef.current(true);
      overlayResolveRef.current = null;
    }
  }, []);

  const playTurn = useCallback(async () => {
    if (isRunningRef.current) return;
    if (!enabledRef.current) return;
    if (abortRef.current) return;

    isRunningRef.current = true;
    setIsThinking(true);
    setLastError(null);

    try {
      const apiKey = getApiKey();
      const provider = settings.aiProvider || 'openai';
      const result = await decideAction(state, settings, autoPlayerSettings, apiKey, provider);

      if (abortRef.current || !enabledRef.current) return;

      setIsThinking(false);

      const shown = await showOverlay(result.action);
      if (!shown) return;

      if (abortRef.current || !enabledRef.current) return;

      if (result.chatMessage) {
        dispatch({
          type: 'ADD_CHAT_MESSAGE',
          payload: {
            id: `msg_${Date.now()}_autoplayer`,
            role: 'player',
            content: result.chatMessage,
            timestamp: Date.now(),
            isAutoPlayer: true,
          },
        });
      }

      if (handleAction) {
        await handleAction(result.action, result.isCustom);
      }

      setTurnsPlayed((prev) => prev + 1);
    } catch (err) {
      console.error('[useAutoPlayer] Error during auto-play turn:', err);
      setLastError(err.message);
    } finally {
      setIsThinking(false);
      setTypingText('');
      setOverlayAction(null);
      overlayResolveRef.current = null;
      isRunningRef.current = false;
    }
  }, [state, settings, autoPlayerSettings, getApiKey, handleAction, dispatch, showOverlay]);

  useEffect(() => {
    const currentLen = state.scenes?.length || 0;

    const justEnabled = autoPlayerSettings.enabled && !prevEnabledRef.current;
    prevEnabledRef.current = autoPlayerSettings.enabled;

    if (!autoPlayerSettings.enabled) return;
    if (state.isGeneratingScene) return;
    if (state.combat?.active) return;
    if (state.campaign?.status && state.campaign.status !== 'active') return;
    if (state.character?.status === 'dead') return;
    if (isRunningRef.current) return;

    if (autoPlayerSettings.maxTurns > 0 && turnsPlayed >= autoPlayerSettings.maxTurns) {
      updateAutoPlayerSettings({ enabled: false });
      return;
    }

    if (justEnabled && currentLen > completedSceneCountRef.current) {
      pendingSceneCountRef.current = currentLen;
      narrationSeenForPendingSceneRef.current = false;
      pendingSceneStartedAtRef.current = Date.now();
    }

    if (currentLen > pendingSceneCountRef.current && currentLen > completedSceneCountRef.current) {
      pendingSceneCountRef.current = currentLen;
      narrationSeenForPendingSceneRef.current = false;
      pendingSceneStartedAtRef.current = Date.now();
    }

    const hasPendingScene = pendingSceneCountRef.current > completedSceneCountRef.current;
    if (!hasPendingScene) return;

    if (!pendingSceneStartedAtRef.current) {
      pendingSceneStartedAtRef.current = Date.now();
    }

    if (narratorPlaybackState === 'playing') {
      narrationSeenForPendingSceneRef.current = true;
    }

    const delay = getAutoPlayerAdvanceDelay({
      shouldWaitForNarration,
      narratorPlaybackState,
      narrationSeenForPendingScene: narrationSeenForPendingSceneRef.current,
      pendingSceneAgeMs: Date.now() - pendingSceneStartedAtRef.current,
    });

    if (delay == null) {
      return;
    }

    if (timerRef.current) clearTimeout(timerRef.current);
    const scheduledSceneCount = pendingSceneCountRef.current;

    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      if (enabledRef.current && !abortRef.current) {
        completedSceneCountRef.current = scheduledSceneCount;
        narrationSeenForPendingSceneRef.current = false;
        pendingSceneStartedAtRef.current = 0;
        playTurn();
      }
    }, delay);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [
    state.scenes?.length,
    state.isGeneratingScene,
    state.combat?.active,
    state.campaign?.status,
    state.character?.status,
    autoPlayerSettings.enabled,
    autoPlayerSettings.maxTurns,
    turnsPlayed,
    playTurn,
    updateAutoPlayerSettings,
    narratorPlaybackState,
    shouldWaitForNarration,
  ]);

  useEffect(() => {
    return () => {
      abortRef.current = true;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (typingRef.current) {
        clearInterval(typingRef.current);
        typingRef.current = null;
      }
      if (overlayResolveRef.current) {
        overlayResolveRef.current(false);
        overlayResolveRef.current = null;
      }
    };
  }, []);

  return {
    isAutoPlaying: autoPlayerSettings.enabled,
    isThinking,
    typingText,
    overlayAction,
    completeOverlay,
    turnsPlayed,
    lastError,
    toggleAutoPlayer,
    autoPlayerSettings,
    updateAutoPlayerSettings,
  };
}
