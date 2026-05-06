import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useSpeechRecognition } from './useSpeechRecognition';
import { classifyHeuristic, formatTranscript } from '../services/voiceModeClassifier';

const STORAGE_ENABLED = 'dictation.enabled';
const STORAGE_MODE = 'dictation.mode';
const STORAGE_AUTO_MODE = 'dictation.autoMode';
const STORAGE_HANDS_FREE = 'dictation.handsFree';
const STORAGE_MUTE_ON_TTS = 'dictation.muteOnTTS';
const STORAGE_AUTO_SUBMIT_MS = 'dictation.autoSubmitMs';

const DEFAULT_AUTO_SUBMIT_MS = 1000;
const MIN_AUTO_SUBMIT_MS = 400;
const MAX_AUTO_SUBMIT_MS = 3000;

const readBool = (key, fallback) => {
  try {
    const v = window.localStorage.getItem(key);
    if (v === 'true') return true;
    if (v === 'false') return false;
    return fallback;
  } catch {
    return fallback;
  }
};

const readMode = () => {
  try {
    const m = window.localStorage.getItem(STORAGE_MODE);
    return m === 'dialogue' ? 'dialogue' : 'action';
  } catch {
    return 'action';
  }
};

const readAutoSubmitMs = () => {
  try {
    const raw = window.localStorage.getItem(STORAGE_AUTO_SUBMIT_MS);
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return DEFAULT_AUTO_SUBMIT_MS;
    return Math.min(MAX_AUTO_SUBMIT_MS, Math.max(MIN_AUTO_SUBMIT_MS, parsed));
  } catch {
    return DEFAULT_AUTO_SUBMIT_MS;
  }
};

export function useDictation({
  lang = 'pl',
  onResult,
  narratorState = 'idle',
  narratorPause = null,
  gameContext = null,
} = {}) {
  const [enabled, setEnabled] = useState(() => readBool(STORAGE_ENABLED, false));
  const [mode, setModeState] = useState(readMode);
  const [autoMode, setAutoModeState] = useState(() => readBool(STORAGE_AUTO_MODE, true));
  const [handsFree, setHandsFreeState] = useState(() => readBool(STORAGE_HANDS_FREE, true));
  const [muteOnTTS, setMuteOnTTSState] = useState(() => readBool(STORAGE_MUTE_ON_TTS, true));
  const [autoSubmitMs, setAutoSubmitMsState] = useState(readAutoSubmitMs);
  const [detectedMode, setDetectedMode] = useState(null);

  // Refs let live mode/auto switching keep the existing audio stream open
  // without recreating the SpeechRecognition instance.
  const modeRef = useRef(mode);
  const autoModeRef = useRef(autoMode);
  const handsFreeRef = useRef(handsFree);
  const muteOnTTSRef = useRef(muteOnTTS);
  const autoSubmitMsRef = useRef(autoSubmitMs);
  const langRef = useRef(lang);
  const onResultRef = useRef(onResult);
  const onAutoSubmitRef = useRef(null);
  const gameContextRef = useRef(gameContext);
  const narratorStateRef = useRef(narratorState);
  const narratorPauseRef = useRef(narratorPause);
  const lastDetectedModeRef = useRef(null);
  const autoSubmitTimerRef = useRef(null);
  const pendingHasContentRef = useRef(false);
  const pausedByTTSRef = useRef(false);

  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { autoModeRef.current = autoMode; }, [autoMode]);
  useEffect(() => { handsFreeRef.current = handsFree; }, [handsFree]);
  useEffect(() => { muteOnTTSRef.current = muteOnTTS; }, [muteOnTTS]);
  useEffect(() => { autoSubmitMsRef.current = autoSubmitMs; }, [autoSubmitMs]);
  useEffect(() => { langRef.current = lang; }, [lang]);
  useEffect(() => { onResultRef.current = onResult; }, [onResult]);
  useEffect(() => { gameContextRef.current = gameContext; }, [gameContext]);
  useEffect(() => { narratorStateRef.current = narratorState; }, [narratorState]);
  useEffect(() => { narratorPauseRef.current = narratorPause; }, [narratorPause]);

  const fireAutoSubmit = useCallback(() => {
    if (autoSubmitTimerRef.current) {
      clearTimeout(autoSubmitTimerRef.current);
      autoSubmitTimerRef.current = null;
    }
    if (!pendingHasContentRef.current) return;
    pendingHasContentRef.current = false;
    const cb = onAutoSubmitRef.current;
    if (cb) cb();
  }, []);

  const scheduleAutoSubmit = useCallback(() => {
    if (autoSubmitTimerRef.current) clearTimeout(autoSubmitTimerRef.current);
    autoSubmitTimerRef.current = setTimeout(fireAutoSubmit, autoSubmitMsRef.current);
  }, [fireAutoSubmit]);

  const cancelAutoSubmit = useCallback(() => {
    if (autoSubmitTimerRef.current) {
      clearTimeout(autoSubmitTimerRef.current);
      autoSubmitTimerRef.current = null;
    }
    pendingHasContentRef.current = false;
  }, []);

  // Stable identity so useSpeechRecognition does not recreate the recognition
  // instance when toggles flip mid-listening.
  const wrappedOnResult = useCallback((transcript) => {
    const cb = onResultRef.current;
    if (!cb) return;

    let chosenMode = modeRef.current;
    if (autoModeRef.current) {
      const ctx = {
        lang: langRef.current,
        stickyMode: lastDetectedModeRef.current || modeRef.current,
        ...(gameContextRef.current || {}),
      };
      const decision = classifyHeuristic(transcript, ctx);
      // If heuristic is unsure, keep the sticky/UI choice.
      if (decision.confidence >= 0.5) {
        chosenMode = decision.mode;
        lastDetectedModeRef.current = decision.mode;
        setDetectedMode(decision.mode);
      } else {
        chosenMode = lastDetectedModeRef.current || modeRef.current;
      }
    }

    cb(formatTranscript(transcript, chosenMode));

    if (handsFreeRef.current) {
      pendingHasContentRef.current = true;
      scheduleAutoSubmit();
    }
  }, [scheduleAutoSubmit]);

  const speech = useSpeechRecognition({
    lang,
    onResult: wrappedOnResult,
    restartOnEnd: enabled && handsFree,
  });

  // Persist toggles.
  useEffect(() => {
    try { window.localStorage.setItem(STORAGE_ENABLED, String(enabled)); } catch {}
  }, [enabled]);
  useEffect(() => {
    try { window.localStorage.setItem(STORAGE_MODE, mode); } catch {}
  }, [mode]);
  useEffect(() => {
    try { window.localStorage.setItem(STORAGE_AUTO_MODE, String(autoMode)); } catch {}
  }, [autoMode]);
  useEffect(() => {
    try { window.localStorage.setItem(STORAGE_HANDS_FREE, String(handsFree)); } catch {}
  }, [handsFree]);
  useEffect(() => {
    try { window.localStorage.setItem(STORAGE_MUTE_ON_TTS, String(muteOnTTS)); } catch {}
  }, [muteOnTTS]);
  useEffect(() => {
    try { window.localStorage.setItem(STORAGE_AUTO_SUBMIT_MS, String(autoSubmitMs)); } catch {}
  }, [autoSubmitMs]);

  // Stop the stream when the user disables dictation entirely. Auto-submit
  // timers should not survive a disable.
  useEffect(() => {
    if (!enabled && speech.listening) {
      speech.stop();
    }
    if (!enabled) {
      cancelAutoSubmit();
      pausedByTTSRef.current = false;
    }
  }, [enabled, speech.listening, speech.stop, cancelAutoSubmit]);

  // Hands-free: if the user enabled dictation and hands-free, keep the
  // recognizer open without requiring a manual click. Skip while TTS is
  // currently muting us.
  useEffect(() => {
    if (!enabled || !handsFree) return;
    if (speech.listening) return;
    if (pausedByTTSRef.current) return;
    if (muteOnTTS && narratorState === 'playing') return;
    speech.start();
  }, [enabled, handsFree, muteOnTTS, narratorState, speech.listening, speech.start]);

  // Half-duplex: mute the mic while the narrator is speaking, then resume
  // automatically once it returns to idle (only if the user hadn't manually
  // stopped in the meantime).
  useEffect(() => {
    if (!muteOnTTS || !enabled) return;
    if (narratorState === 'playing' && speech.listening) {
      pausedByTTSRef.current = true;
      cancelAutoSubmit();
      speech.stop();
    } else if (narratorState !== 'playing' && pausedByTTSRef.current) {
      pausedByTTSRef.current = false;
      if (handsFree) {
        speech.start();
      }
    }
  }, [
    narratorState,
    muteOnTTS,
    enabled,
    handsFree,
    speech.listening,
    speech.start,
    speech.stop,
    cancelAutoSubmit,
  ]);

  const toggleEnabled = useCallback(() => {
    setEnabled((v) => !v);
  }, []);

  const setMode = useCallback((m) => {
    if (m === 'action' || m === 'dialogue') {
      setModeState(m);
      lastDetectedModeRef.current = m;
      setDetectedMode(m);
    }
  }, []);

  const setAutoMode = useCallback((value) => {
    setAutoModeState(!!value);
  }, []);
  const setHandsFree = useCallback((value) => {
    setHandsFreeState(!!value);
  }, []);
  const setMuteOnTTS = useCallback((value) => {
    setMuteOnTTSState(!!value);
  }, []);
  const setAutoSubmitMs = useCallback((ms) => {
    const clamped = Math.min(MAX_AUTO_SUBMIT_MS, Math.max(MIN_AUTO_SUBMIT_MS, Number(ms) || DEFAULT_AUTO_SUBMIT_MS));
    setAutoSubmitMsState(clamped);
  }, []);

  // Allows a child component (e.g. ActionPanel) to install its own transcript
  // handler after the hook has been instantiated higher up the tree.
  const setOnResult = useCallback((cb) => {
    onResultRef.current = cb || null;
  }, []);

  const setOnAutoSubmit = useCallback((cb) => {
    onAutoSubmitRef.current = cb || null;
  }, []);

  const setGameContext = useCallback((ctx) => {
    gameContextRef.current = ctx || null;
  }, []);

  // Cleanup any pending auto-submit on unmount.
  useEffect(() => {
    return () => {
      if (autoSubmitTimerRef.current) {
        clearTimeout(autoSubmitTimerRef.current);
        autoSubmitTimerRef.current = null;
      }
    };
  }, []);

  const pausedByTTS = pausedByTTSRef.current && narratorState === 'playing';

  return useMemo(() => ({
    enabled,
    mode,
    autoMode,
    handsFree,
    muteOnTTS,
    autoSubmitMs,
    detectedMode,
    listening: speech.listening,
    interim: speech.interim,
    supported: speech.supported,
    pausedByTTS,
    toggleEnabled,
    setMode,
    setAutoMode,
    setHandsFree,
    setMuteOnTTS,
    setAutoSubmitMs,
    setOnResult,
    setOnAutoSubmit,
    setGameContext,
    cancelAutoSubmit,
    toggleListening: speech.toggle,
    start: speech.start,
    stop: speech.stop,
  }), [
    enabled, mode, autoMode, handsFree, muteOnTTS, autoSubmitMs, detectedMode,
    speech.listening, speech.interim, speech.supported,
    pausedByTTS,
    toggleEnabled, setMode, setAutoMode, setHandsFree, setMuteOnTTS, setAutoSubmitMs,
    setOnResult, setOnAutoSubmit, setGameContext, cancelAutoSubmit,
    speech.toggle, speech.start, speech.stop,
  ]);
}
