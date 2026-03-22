import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { useSettings } from './SettingsContext';
import { useLocalMusic } from '../hooks/useLocalMusic';

const MusicContext = createContext(null);

export function MusicProvider({ children }) {
  const location = useLocation();
  const { settings, updateSettings } = useSettings();

  const [narratorState, setNarratorState] = useState(null);

  const isGameplay = location.pathname === '/play';
  const prevIsGameplayRef = useRef(isGameplay);

  const ambient = useLocalMusic(null, { folder: 'lobby' });
  const campaign = useLocalMusic(isGameplay ? narratorState : null);

  useEffect(() => {
    const wasGameplay = prevIsGameplayRef.current;
    prevIsGameplayRef.current = isGameplay;

    if (isGameplay && !wasGameplay) {
      ambient.pause();
      if (campaign.hasMusic) campaign.resume();
    } else if (!isGameplay && wasGameplay) {
      campaign.pause();
      if (ambient.hasMusic) ambient.resume();
    }
  }, [isGameplay]);

  useEffect(() => {
    if (!isGameplay) setNarratorState(null);
  }, [isGameplay]);

  const active = isGameplay ? campaign : ambient;

  const setVolume = useCallback((vol) => {
    ambient.setVolume(vol);
    campaign.setVolume(vol);
    updateSettings({ musicVolume: vol });
  }, [ambient, campaign, updateSettings]);

  const togglePlayPause = useCallback(() => active.togglePlayPause(), [active]);
  const skip = useCallback(() => active.skip(), [active]);

  return (
    <MusicContext.Provider
      value={{
        isPlaying: active.isPlaying,
        currentTrack: active.currentTrack,
        hasMusic: ambient.hasMusic || campaign.hasMusic,
        hasActiveMusic: active.hasMusic,
        isGameplay,
        togglePlayPause,
        skip,
        setVolume,
        setNarratorState,
        ambient,
        campaign,
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
