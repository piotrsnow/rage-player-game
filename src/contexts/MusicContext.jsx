import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { useSettings } from './SettingsContext';
import { useLocalMusic } from '../hooks/useLocalMusic';
import { useMusic } from '../hooks/useMusic';

const MusicContext = createContext(null);

export function MusicProvider({ children }) {
  const location = useLocation();
  const { settings, updateSettings } = useSettings();

  const [narratorState, setNarratorState] = useState(null);

  const isGameplay = location.pathname === '/play';
  const prevIsGameplayRef = useRef(isGameplay);

  const ambient = useLocalMusic(null, { folder: 'lobby', active: !isGameplay });
  const campaign = useLocalMusic(isGameplay ? narratorState : null, { active: isGameplay });
  const suno = useMusic(isGameplay ? narratorState : null);

  useEffect(() => {
    const wasGameplay = prevIsGameplayRef.current;
    prevIsGameplayRef.current = isGameplay;

    if (isGameplay && !wasGameplay) {
      ambient.pause();
      if (!settings.musicEnabled && campaign.hasMusic) campaign.resume();
    } else if (!isGameplay && wasGameplay) {
      campaign.pause();
      suno.stop();
      if (ambient.hasMusic) ambient.resume();
    }
  }, [isGameplay]);

  useEffect(() => {
    if (!isGameplay) setNarratorState(null);
  }, [isGameplay]);

  const sunoActive = settings.musicEnabled && isGameplay;
  const active = isGameplay ? (sunoActive ? null : campaign) : ambient;

  const setVolume = useCallback((vol) => {
    ambient.setVolume(vol);
    campaign.setVolume(vol);
    suno.setVolume(vol);
    updateSettings({ musicVolume: vol });
  }, [ambient, campaign, suno, updateSettings]);

  const togglePlayPause = useCallback(() => {
    if (sunoActive) {
      suno.togglePlayPause();
    } else if (active) {
      active.togglePlayPause();
    }
  }, [sunoActive, suno, active]);

  const skip = useCallback(() => {
    if (active) active.skip();
  }, [active]);

  const triggerSceneMusic = useCallback((mood, genre, tone, musicPrompt) => {
    if (sunoActive) {
      campaign.pause();
      suno.ensureMusicForMood(mood, genre, tone, musicPrompt);
    }
  }, [sunoActive, suno, campaign]);

  return (
    <MusicContext.Provider
      value={{
        isPlaying: sunoActive ? suno.isPlaying : (active?.isPlaying || false),
        currentTrack: sunoActive
          ? (suno.currentTrackTitle ? { name: suno.currentTrackTitle } : null)
          : (active?.currentTrack || null),
        hasMusic: ambient.hasMusic || campaign.hasMusic || settings.musicEnabled,
        hasActiveMusic: sunoActive ? suno.isPlaying || suno.isGenerating : (active?.hasMusic || false),
        isGameplay,
        isGeneratingMusic: suno.isGenerating,
        sunoError: suno.error,
        togglePlayPause,
        skip,
        setVolume,
        setNarratorState,
        triggerSceneMusic,
        ambient,
        campaign,
        suno,
      }}
    >
      {children}
    </MusicContext.Provider>
  );
}

export function useGlobalMusic() {
  const ctx = useContext(MusicContext);
  if (!ctx) throw new Error('useGlobalMusic must be used within MusicProvider');
  return ctx;
}
