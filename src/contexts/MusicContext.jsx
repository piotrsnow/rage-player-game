import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { useSettings } from './SettingsContext';
import { useGameSlice } from '../stores/gameSelectors';
import { useLocalMusic } from '../hooks/useLocalMusic';
import { useDialogAudioSnapshot } from '../hooks/useDialogAudioSnapshot';

const GENRE_MUSIC_FOLDER = { 'Sci-Fi': 'scifi' };

const MusicContext = (import.meta.hot?.data?.MusicContext) || createContext(null);
if (import.meta.hot) import.meta.hot.data.MusicContext = MusicContext;

export function MusicProvider({ children }) {
  const location = useLocation();
  const { settings, updateSettings } = useSettings();
  const campaignGenre = useGameSlice((s) => s.campaign?.genre);

  const dialogSnapshot = useDialogAudioSnapshot();
  const dialogAudioState = dialogSnapshot.state !== 'idle' ? dialogSnapshot.state : null;

  const [suppressLobbyMusicForIntroVideo, setSuppressLobbyMusicForIntroVideo] = useState(false);
  const [pendingCampaignGenre, setPendingCampaignGenre] = useState(null);

  const isGameplay = location.pathname.startsWith('/play') || location.pathname.startsWith('/view/');
  const isCampaignActive = isGameplay || !!pendingCampaignGenre;
  const prevIsCampaignActiveRef = useRef(isCampaignActive);

  const effectiveCampaignGenre = campaignGenre ?? pendingCampaignGenre;
  const campaignMusicFolder = GENRE_MUSIC_FOLDER[effectiveCampaignGenre] || undefined;

  const ambient = useLocalMusic(null, {
    folder: 'lobby',
    active: !isCampaignActive,
    silenced: suppressLobbyMusicForIntroVideo,
  });
  const campaign = useLocalMusic(isCampaignActive ? dialogAudioState : null, { folder: campaignMusicFolder, active: isCampaignActive });

  useEffect(() => {
    const wasCampaignActive = prevIsCampaignActiveRef.current;
    prevIsCampaignActiveRef.current = isCampaignActive;

    if (isCampaignActive && !wasCampaignActive) {
      ambient.pause();
      if (campaign.hasMusic) campaign.resume();
    } else if (!isCampaignActive && wasCampaignActive) {
      campaign.pause();
      if (ambient.hasMusic) ambient.resume();
    }
  }, [isCampaignActive]);

  const active = isCampaignActive ? campaign : ambient;

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
        ambient,
        campaign,
        setSuppressLobbyMusicForIntroVideo,
        setPendingCampaignGenre,
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
