import { useState, useCallback, useRef, useEffect } from 'react';
import { useSettings } from '../contexts/SettingsContext';

const CROSSFADE_MS = 2000;
const DUCK_VOLUME_RATIO = 0.2;

const log = (...args) => console.log('%c[LocalMusic]', 'color:#34d399;font-weight:bold', ...args);

export function useLocalMusic(narratorPlaybackState, { folder, active = true } = {}) {
  const { settings } = useSettings();

  const [tracks, setTracks] = useState([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTrack, setCurrentTrack] = useState(null);
  const [loaded, setLoaded] = useState(false);

  const activeAudioRef = useRef(null);
  const fadingAudioRef = useRef(null);
  const fadeIntervalRef = useRef(null);
  const targetVolumeRef = useRef((settings.musicVolume ?? 40) / 100);
  const isDuckedRef = useRef(false);
  const trackIndexRef = useRef(-1);
  const shuffledRef = useRef([]);
  const wantPlayingRef = useRef(false);

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

  const baseUrl = settings.useBackend && settings.backendUrl
    ? settings.backendUrl.replace(/\/+$/, '')
    : '';

  const resolveTrackUrl = useCallback((track) => {
    if (!baseUrl) return track.url;
    return `${baseUrl}${track.url}`;
  }, [baseUrl]);

  const fetchTracks = useCallback(async () => {
    try {
      const qs = folder ? `?folder=${encodeURIComponent(folder)}` : '';
      const endpointBase = baseUrl || '';
      const url = endpointBase ? `${endpointBase}/music/tracks${qs}` : `/music/tracks${qs}`;
      const resp = await fetch(url);
      const data = await resp.json();
      if (data.tracks?.length) {
        setTracks(data.tracks);
        const shuffled = [...data.tracks].sort(() => Math.random() - 0.5);
        shuffledRef.current = shuffled;
        trackIndexRef.current = -1;
        log(`Loaded ${data.tracks.length} tracks${folder ? ` (folder: ${folder})` : ''}${endpointBase ? '' : ' (same-origin)'}`);
      } else {
        log(`No tracks available on server${folder ? ` (folder: ${folder})` : ''}${endpointBase ? '' : ' (same-origin)'}`);
      }
      setLoaded(true);
    } catch (err) {
      log('Failed to fetch tracks:', err.message);
      setLoaded(true);
    }
  }, [baseUrl, folder]);

  useEffect(() => {
    if (settings.localMusicEnabled && (settings.useBackend ? settings.backendUrl : true)) {
      fetchTracks();
    }
  }, [settings.localMusicEnabled, settings.useBackend, settings.backendUrl, fetchTracks]);

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

  const playTrack = useCallback((track) => {
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
          if (fadingAudioRef.current === oldAudio) fadingAudioRef.current = null;
        }
      }, 50);
      fadeIntervalRef.current = fadeOut;
    }

    const url = resolveTrackUrl(track);
    const newAudio = new Audio(url);
    newAudio.loop = false;
    newAudio.volume = 0;
    activeAudioRef.current = newAudio;

    newAudio.addEventListener('canplay', () => {
      newAudio.play().catch(() => {});
      setIsPlaying(true);
      wantPlayingRef.current = true;

      let fadeStep = 0;
      const fadeSteps = CROSSFADE_MS / 50;
      const fadeIn = setInterval(() => {
        fadeStep++;
        newAudio.volume = Math.min(effectiveMax, effectiveMax * (fadeStep / fadeSteps));
        if (fadeStep >= fadeSteps) clearInterval(fadeIn);
      }, 50);
    }, { once: true });

    newAudio.addEventListener('ended', () => {
      if (wantPlayingRef.current) playNext();
    }, { once: true });

    newAudio.addEventListener('error', () => {
      log('Playback error for:', track.name);
      setIsPlaying(false);
    });

    setCurrentTrack(track);
    log('Playing:', track.name);
  }, [stopFade, resolveTrackUrl]);

  const playNext = useCallback(() => {
    if (shuffledRef.current.length === 0) return;
    trackIndexRef.current = (trackIndexRef.current + 1) % shuffledRef.current.length;
    if (trackIndexRef.current === 0) {
      shuffledRef.current = [...shuffledRef.current].sort(() => Math.random() - 0.5);
    }
    playTrack(shuffledRef.current[trackIndexRef.current]);
  }, [playTrack]);

  const startPlaying = useCallback(() => {
    if (shuffledRef.current.length === 0) return;
    wantPlayingRef.current = true;
    playNext();
  }, [playNext]);

  const pause = useCallback(() => {
    wantPlayingRef.current = false;
    if (activeAudioRef.current) {
      activeAudioRef.current.pause();
      setIsPlaying(false);
    }
  }, []);

  const resume = useCallback(() => {
    if (activeAudioRef.current?.src) {
      wantPlayingRef.current = true;
      activeAudioRef.current.play().catch(() => {});
      setIsPlaying(true);
    } else {
      startPlaying();
    }
  }, [startPlaying]);

  const togglePlayPause = useCallback(() => {
    if (isPlaying) pause();
    else resume();
  }, [isPlaying, pause, resume]);

  const skip = useCallback(() => {
    if (shuffledRef.current.length === 0) return;
    playNext();
  }, [playNext]);

  const stop = useCallback(() => {
    wantPlayingRef.current = false;
    stopFade();
    if (activeAudioRef.current) {
      activeAudioRef.current.pause();
      activeAudioRef.current.removeAttribute('src');
      activeAudioRef.current = null;
    }
    setIsPlaying(false);
    setCurrentTrack(null);
  }, [stopFade]);

  const setVolume = useCallback((vol) => {
    const v = Math.max(0, Math.min(1, vol / 100));
    targetVolumeRef.current = v;
    if (activeAudioRef.current && !isDuckedRef.current) {
      activeAudioRef.current.volume = v;
    }
  }, []);

  useEffect(() => {
    if (active && settings.localMusicEnabled && loaded && tracks.length > 0 && !isPlaying && !currentTrack) {
      startPlaying();
    }
  }, [active, settings.localMusicEnabled, loaded, tracks.length]);

  useEffect(() => {
    return () => {
      wantPlayingRef.current = false;
      stopFade();
      if (activeAudioRef.current) {
        activeAudioRef.current.pause();
        activeAudioRef.current.removeAttribute('src');
        activeAudioRef.current = null;
      }
    };
  }, [stopFade]);

  return {
    isPlaying,
    currentTrack,
    tracks,
    hasMusic: tracks.length > 0,
    togglePlayPause,
    pause,
    resume,
    skip,
    stop,
    setVolume,
    startPlaying,
  };
}
