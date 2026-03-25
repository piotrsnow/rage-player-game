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

export function useAutoPlayer(handleAction) {
  const { state, dispatch } = useGame();
  const { settings, getApiKey, updateSettings } = useSettings();

  const autoPlayerSettings = settings.autoPlayer || DEFAULT_AUTO_PLAYER;

  const [isThinking, setIsThinking] = useState(false);
  const [turnsPlayed, setTurnsPlayed] = useState(0);
  const [lastError, setLastError] = useState(null);
  const [typingText, setTypingText] = useState('');

  const timerRef = useRef(null);
  const typingRef = useRef(null);
  const abortRef = useRef(false);
  const scenesLenRef = useRef(state.scenes?.length || 0);
  const enabledRef = useRef(autoPlayerSettings.enabled);
  const prevEnabledRef = useRef(autoPlayerSettings.enabled);
  const isRunningRef = useRef(false);

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
      setTurnsPlayed(0);
      setLastError(null);
    } else {
      abortRef.current = false;
      setTurnsPlayed(0);
      setLastError(null);
    }
  }, [autoPlayerSettings, updateAutoPlayerSettings]);

  const animateTyping = useCallback((text) => {
    return new Promise((resolve) => {
      if (typingRef.current) clearInterval(typingRef.current);
      let i = 0;
      setTypingText('');
      const charDelay = Math.max(15, Math.min(40, 1200 / (text.length || 1)));
      typingRef.current = setInterval(() => {
        if (abortRef.current || !enabledRef.current) {
          clearInterval(typingRef.current);
          typingRef.current = null;
          setTypingText('');
          resolve(false);
          return;
        }
        i++;
        setTypingText(text.slice(0, i));
        if (i >= text.length) {
          clearInterval(typingRef.current);
          typingRef.current = null;
          resolve(true);
        }
      }, charDelay);
    });
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

      const typed = await animateTyping(result.action);
      if (!typed) return;

      await new Promise((r) => setTimeout(r, 400));
      setTypingText('');

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
      isRunningRef.current = false;
    }
  }, [state, settings, autoPlayerSettings, getApiKey, handleAction, dispatch, animateTyping]);

  useEffect(() => {
    const currentLen = state.scenes?.length || 0;
    const prevLen = scenesLenRef.current;
    scenesLenRef.current = currentLen;

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

    const hasNewScene = currentLen > prevLen && prevLen > 0;
    const isFirstSceneReady = currentLen === 1 && prevLen === 0;
    const enabledWithExistingScenes = justEnabled && currentLen > 0;

    if (!hasNewScene && !isFirstSceneReady && !enabledWithExistingScenes) return;

    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      if (enabledRef.current && !abortRef.current) {
        playTurn();
      }
    }, autoPlayerSettings.delay || 3000);

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
    autoPlayerSettings.delay,
    autoPlayerSettings.maxTurns,
    turnsPlayed,
    playTurn,
    updateAutoPlayerSettings,
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
    };
  }, []);

  return {
    isAutoPlaying: autoPlayerSettings.enabled,
    isThinking,
    typingText,
    turnsPlayed,
    lastError,
    toggleAutoPlayer,
    autoPlayerSettings,
    updateAutoPlayerSettings,
  };
}
