import { useState, useEffect, useRef, useCallback } from 'react';
import { useSpeechRecognition } from './useSpeechRecognition';

const STORAGE_ENABLED = 'dictation.enabled';
const STORAGE_MODE = 'dictation.mode';

const readEnabled = () => {
  try {
    return window.localStorage.getItem(STORAGE_ENABLED) === 'true';
  } catch {
    return false;
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

export function useDictation({ lang = 'pl', onResult } = {}) {
  const [enabled, setEnabled] = useState(readEnabled);
  const [mode, setModeState] = useState(readMode);

  const modeRef = useRef(mode);
  const onResultRef = useRef(onResult);

  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { onResultRef.current = onResult; }, [onResult]);

  // Stable identity so useSpeechRecognition does not recreate the recognition
  // instance when `mode` flips mid-listening — that is what enables live mode
  // switching to keep the existing audio stream open.
  const wrappedOnResult = useCallback((transcript) => {
    const cb = onResultRef.current;
    if (!cb) return;
    if (modeRef.current === 'dialogue') {
      const trimmed = transcript.trim();
      cb(trimmed ? `"${trimmed}"` : transcript);
    } else {
      cb(transcript);
    }
  }, []);

  const speech = useSpeechRecognition({
    lang,
    onResult: wrappedOnResult,
  });

  useEffect(() => {
    try { window.localStorage.setItem(STORAGE_ENABLED, String(enabled)); } catch {}
  }, [enabled]);

  useEffect(() => {
    try { window.localStorage.setItem(STORAGE_MODE, mode); } catch {}
  }, [mode]);

  useEffect(() => {
    if (!enabled && speech.listening) {
      speech.stop();
    }
  }, [enabled, speech.listening, speech.stop]);

  const toggleEnabled = useCallback(() => {
    setEnabled((v) => !v);
  }, []);

  const setMode = useCallback((m) => {
    if (m === 'action' || m === 'dialogue') {
      setModeState(m);
    }
  }, []);

  // Allows a child component (e.g. ActionPanel) to install its own transcript
  // handler after the hook has been instantiated higher up the tree.
  const setOnResult = useCallback((cb) => {
    onResultRef.current = cb || null;
  }, []);

  return {
    enabled,
    mode,
    listening: speech.listening,
    interim: speech.interim,
    supported: speech.supported,
    toggleEnabled,
    setMode,
    setOnResult,
    toggleListening: speech.toggle,
    start: speech.start,
    stop: speech.stop,
  };
}
