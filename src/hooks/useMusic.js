import { useState, useCallback, useRef, useEffect } from 'react';
import { useSettings } from '../contexts/SettingsContext';
import { useGame } from '../contexts/GameContext';
import { sunoService, buildMusicStyle } from '../services/suno';
import { storage } from '../services/storage';
import { calculateCost } from '../services/costTracker';

const CROSSFADE_MS = 3000;
const DUCK_VOLUME_RATIO = 0.2;

const log = (...args) => console.log('%c[Music]', 'color:#34d399;font-weight:bold', ...args);

export function useMusic(narratorPlaybackState) {
  const { settings, hasApiKey } = useSettings();
  const { state, dispatch } = useGame();

  const [isGenerating, setIsGenerating] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTrackTitle, setCurrentTrackTitle] = useState(null);
  const [error, setError] = useState(null);

  const activeAudioRef = useRef(null);
  const fadingAudioRef = useRef(null);
  const abortControllerRef = useRef(null);
  const targetVolumeRef = useRef(settings.musicVolume / 100);
  const isDuckedRef = useRef(false);
  const fadeIntervalRef = useRef(null);
  const currentMoodRef = useRef(null);

  const getBaseVolume = useCallback(() => {
    return Math.max(0, Math.min(1, (settings.musicVolume ?? 40) / 100));
  }, [settings.musicVolume]);

  useEffect(() => {
    targetVolumeRef.current = getBaseVolume();
    if (activeAudioRef.current && !isDuckedRef.current) {
      activeAudioRef.current.volume = targetVolumeRef.current;
    }
  }, [getBaseVolume]);

  useEffect(() => {
    if (!narratorPlaybackState) return;
    const narrating = narratorPlaybackState === 'playing' || narratorPlaybackState === 'loading';
    isDuckedRef.current = narrating;
    if (activeAudioRef.current) {
      activeAudioRef.current.volume = narrating
        ? targetVolumeRef.current * DUCK_VOLUME_RATIO
        : targetVolumeRef.current;
    }
  }, [narratorPlaybackState]);

  const stopFade = useCallback(() => {
    if (fadeIntervalRef.current) {
      clearInterval(fadeIntervalRef.current);
      fadeIntervalRef.current = null;
    }
    if (fadingAudioRef.current) {
      fadingAudioRef.current.pause();
      fadingAudioRef.current.removeAttribute('src');
      fadingAudioRef.current = null;
    }
  }, []);

  const crossfadeTo = useCallback((newAudioUrl) => {
    stopFade();

    const baseVol = targetVolumeRef.current;
    const ducked = isDuckedRef.current;
    const effectiveMax = ducked ? baseVol * DUCK_VOLUME_RATIO : baseVol;

    if (activeAudioRef.current) {
      fadingAudioRef.current = activeAudioRef.current;
      const oldAudio = fadingAudioRef.current;
      const startVol = oldAudio.volume;
      const steps = CROSSFADE_MS / 50;
      let step = 0;

      const fadeOut = setInterval(() => {
        step++;
        oldAudio.volume = Math.max(0, startVol * (1 - step / steps));
        if (step >= steps) {
          clearInterval(fadeOut);
          oldAudio.pause();
          oldAudio.removeAttribute('src');
          if (fadingAudioRef.current === oldAudio) {
            fadingAudioRef.current = null;
          }
        }
      }, 50);
      fadeIntervalRef.current = fadeOut;
    }

    const newAudio = new Audio(newAudioUrl);
    newAudio.loop = true;
    newAudio.volume = 0;
    activeAudioRef.current = newAudio;

    newAudio.addEventListener('canplay', () => {
      newAudio.play().catch(() => {});
      setIsPlaying(true);

      let fadeStep = 0;
      const fadeSteps = CROSSFADE_MS / 50;
      const fadeIn = setInterval(() => {
        fadeStep++;
        newAudio.volume = Math.min(effectiveMax, effectiveMax * (fadeStep / fadeSteps));
        if (fadeStep >= fadeSteps) {
          clearInterval(fadeIn);
        }
      }, 50);
    }, { once: true });

    newAudio.addEventListener('error', () => {
      log('Playback error — clearing current mood so next attempt retries');
      currentMoodRef.current = null;
      setIsPlaying(false);
    });
  }, [stopFade]);

  const ensureMusicForMood = useCallback(async (mood, genre, tone, musicPrompt) => {
    if (!(settings.sunoApiKey || hasApiKey('suno')) || !settings.musicEnabled) {
      log('Skipped — musicEnabled:', settings.musicEnabled, 'hasKey:', !!(settings.sunoApiKey || hasApiKey('suno')));
      return;
    }
    if (!mood) {
      log('Skipped — no mood');
      return;
    }

    if (currentMoodRef.current === mood) {
      return;
    }

    log('Mood changed:', currentMoodRef.current, '→', mood);
    currentMoodRef.current = mood;

    const cached = storage.findMusicTrack(genre, tone, mood);
    if (cached) {
      log('Library hit:', cached.title, `(${genre}-${tone}-${mood})`);
      crossfadeTo(cached.audioUrl);
      setCurrentTrackTitle(cached.title);
      setError(null);
      return;
    }

    log('No track in library for', `${genre}-${tone}-${mood}`, '— generating...');

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setIsGenerating(true);
    setError(null);
    dispatch({ type: 'SET_GENERATING_MUSIC', payload: true });

    try {
      const baseStyle = buildMusicStyle(genre, tone);
      const style = musicPrompt
        ? (baseStyle + ', ' + musicPrompt).substring(0, 200)
        : baseStyle.substring(0, 200);
      const title = (musicPrompt || `${genre} ${tone} ${mood}`).substring(0, 80);

      log('Generating:', { genre, tone, mood, model: settings.sunoModel || 'V4_5', style: style.substring(0, 80) + '...' });

      const taskId = await sunoService.generateMusic(settings.sunoApiKey, {
        style,
        title,
        model: settings.sunoModel || 'V4_5',
      });

      log('Got taskId:', taskId, '— polling...');

      const result = await sunoService.pollUntilReady(
        settings.sunoApiKey,
        taskId,
        abortControllerRef.current.signal
      );

      if (result.audioUrl) {
        storage.saveMusicTrack({
          genre, tone, mood, style,
          audioUrl: result.audioUrl,
          title: result.title,
          duration: result.duration,
          imageUrl: result.imageUrl,
        });

        const cacheResult = await sunoService.cacheTrack({
          audioUrl: result.audioUrl,
          genre, tone, mood, style,
          title: result.title,
          duration: result.duration,
          imageUrl: result.imageUrl,
          campaignId: state.campaign?.backendId || null,
        });

        const playUrl = cacheResult?.url || result.audioUrl;
        log('Saved to library & playing:', result.title, `(${result.duration}s)`);
        crossfadeTo(playUrl);
        setCurrentTrackTitle(result.title || title);
        dispatch({ type: 'ADD_AI_COST', payload: calculateCost('music', {}) });
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        log('ERROR:', err.message);
        setError(err.message);
        currentMoodRef.current = null;
      }
    } finally {
      setIsGenerating(false);
      dispatch({ type: 'SET_GENERATING_MUSIC', payload: false });
    }
  }, [settings.sunoApiKey, settings.musicEnabled, settings.sunoModel, hasApiKey, crossfadeTo, dispatch]);

  const pause = useCallback(() => {
    if (activeAudioRef.current) {
      activeAudioRef.current.pause();
      setIsPlaying(false);
    }
  }, []);

  const resume = useCallback(() => {
    if (activeAudioRef.current) {
      activeAudioRef.current.play().catch(() => {});
      setIsPlaying(true);
    }
  }, []);

  const togglePlayPause = useCallback(() => {
    if (isPlaying) pause();
    else resume();
  }, [isPlaying, pause, resume]);

  const stop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    stopFade();
    if (activeAudioRef.current) {
      activeAudioRef.current.pause();
      activeAudioRef.current.removeAttribute('src');
      activeAudioRef.current = null;
    }
    setIsPlaying(false);
    setIsGenerating(false);
    setCurrentTrackTitle(null);
    setError(null);
    currentMoodRef.current = null;
  }, [stopFade]);

  const setVolume = useCallback((vol) => {
    const v = Math.max(0, Math.min(1, vol / 100));
    targetVolumeRef.current = v;
    if (activeAudioRef.current && !isDuckedRef.current) {
      activeAudioRef.current.volume = v;
    }
  }, []);

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) abortControllerRef.current.abort();
      stopFade();
      if (activeAudioRef.current) {
        activeAudioRef.current.pause();
        activeAudioRef.current.removeAttribute('src');
        activeAudioRef.current = null;
      }
    };
  }, [stopFade]);

  return {
    isGenerating,
    isPlaying,
    currentTrackTitle,
    error,
    ensureMusicForMood,
    togglePlayPause,
    pause,
    resume,
    stop,
    setVolume,
  };
}
