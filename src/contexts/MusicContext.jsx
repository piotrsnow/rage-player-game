import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { useSettings } from './SettingsContext';
import { useGame } from './GameContext';
import { useLocalMusic } from '../hooks/useLocalMusic';

const GENRE_MUSIC_FOLDER = { 'Sci-Fi': 'scifi' };

const MusicContext = createContext(null);

export function MusicProvider({ children }) {
  const location = useLocation();
  const { settings, updateSettings } = useSettings();
  const { state: gameState } = useGame();

  const [narratorState, setNarratorState] = useState(null);

  const isGameplay = location.pathname.startsWith('/play') || location.pathname.startsWith('/view/');
  const prevIsGameplayRef = useRef(isGameplay);

  const campaignMusicFolder = GENRE_MUSIC_FOLDER[gameState.campaign?.genre] || undefined;

  const ambient = useLocalMusic(null, { folder: 'lobby', active: !isGameplay });
  const campaign = useLocalMusic(isGameplay ? narratorState : null, { folder: campaignMusicFolder, active: isGameplay });

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

  const togglePlayPause = useCallback(() => {
    if (active) active.togglePlayPause();
  }, [active]);

  const skip = useCallback(() => {
    if (active) active.skip();
  }, [active]);

  return (
    <MusicContext.Provider
      value={{
        isPlaying: active?.isPlaying || false,
        currentTrack: active?.currentTrack || null,
        hasMusic: ambient.hasMusic || campaign.hasMusic || (settings.localMusicEnabled && settings.useBackend),
        hasActiveMusic: active?.hasMusic || false,
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
