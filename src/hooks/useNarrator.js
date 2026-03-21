import { useState, useCallback, useRef, useEffect } from 'react';
import { useSettings } from '../contexts/SettingsContext';
import { elevenlabsService } from '../services/elevenlabs';

const STATES = {
  IDLE: 'idle',
  LOADING: 'loading',
  PLAYING: 'playing',
  PAUSED: 'paused',
};

export function useNarrator() {
  const { settings } = useSettings();
  const [playbackState, setPlaybackState] = useState(STATES.IDLE);
  const [currentMessageId, setCurrentMessageId] = useState(null);

  const audioRef = useRef(null);
  const queueRef = useRef([]);
  const abortRef = useRef(null);
  const objectUrlRef = useRef(null);

  const cleanup = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.removeAttribute('src');
      audioRef.current = null;
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  }, []);

  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  const processQueue = useCallback(async () => {
    if (queueRef.current.length === 0) {
      setPlaybackState(STATES.IDLE);
      setCurrentMessageId(null);
      return;
    }

    const { text, messageId } = queueRef.current[0];
    setCurrentMessageId(messageId);
    setPlaybackState(STATES.LOADING);

    const { elevenlabsApiKey, elevenlabsVoiceId } = settings;
    if (!elevenlabsApiKey || !elevenlabsVoiceId) {
      queueRef.current.shift();
      setPlaybackState(STATES.IDLE);
      setCurrentMessageId(null);
      return;
    }

    try {
      abortRef.current = new AbortController();
      const audioUrl = await elevenlabsService.textToSpeechStream(
        elevenlabsApiKey,
        elevenlabsVoiceId,
        text
      );

      objectUrlRef.current = audioUrl;
      const audio = new Audio(audioUrl);
      audioRef.current = audio;

      audio.onended = () => {
        cleanup();
        queueRef.current.shift();
        processQueue();
      };

      audio.onerror = () => {
        cleanup();
        queueRef.current.shift();
        processQueue();
      };

      await audio.play();
      setPlaybackState(STATES.PLAYING);
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.warn('Narrator TTS error:', err.message);
      }
      cleanup();
      queueRef.current.shift();
      processQueue();
    }
  }, [settings, cleanup]);

  const speak = useCallback((text, messageId) => {
    queueRef.current.push({ text, messageId });
    if (playbackState === STATES.IDLE) {
      processQueue();
    }
  }, [playbackState, processQueue]);

  const pause = useCallback(() => {
    if (audioRef.current && playbackState === STATES.PLAYING) {
      audioRef.current.pause();
      setPlaybackState(STATES.PAUSED);
    }
  }, [playbackState]);

  const resume = useCallback(() => {
    if (audioRef.current && playbackState === STATES.PAUSED) {
      audioRef.current.play();
      setPlaybackState(STATES.PLAYING);
    }
  }, [playbackState]);

  const stop = useCallback(() => {
    queueRef.current = [];
    cleanup();
    setPlaybackState(STATES.IDLE);
    setCurrentMessageId(null);
  }, [cleanup]);

  const speakSingle = useCallback((text, messageId) => {
    stop();
    queueRef.current.push({ text, messageId });
    processQueue();
  }, [stop, processQueue]);

  return {
    playbackState,
    currentMessageId,
    isNarratorReady: !!(settings.narratorEnabled && settings.elevenlabsApiKey && settings.elevenlabsVoiceId),
    speak,
    speakSingle,
    pause,
    resume,
    stop,
    STATES,
  };
}
