import { useCallback, useEffect, useRef } from 'react';
import { useSettings } from '../contexts/SettingsContext';
import {
  useGameCampaign,
  useGameCharacter,
  useGameParty,
  useGameSlice,
  useGameDispatch,
} from '../stores/gameSelectors';
import { elevenlabsService } from '../services/elevenlabs';
import { apiClient } from '../services/apiClient';
import { calculateCost } from '../services/costTracker';
import { resolveVoiceForCharacter } from '../services/characterVoiceResolver';
import {
  getCombatBattleCryLine,
  getCombatPreloadCategories,
  getCombatReactionCategory,
  getCombatResultCategory,
  getCombatSfxVariants,
} from '../services/combatAudio';

function getVolume(level) {
  return Math.max(0, Math.min(1, (level ?? 70) / 100));
}

export function useCombatAudio(combat) {
  const { settings, hasApiKey } = useSettings();
  const campaign = useGameCampaign();
  const character = useGameCharacter();
  const party = useGameParty();
  const npcs = useGameSlice((s) => s.world?.npcs);
  const characterVoiceMap = useGameSlice((s) => s.characterVoiceMap);
  const dispatch = useGameDispatch();
  const activeAudiosRef = useRef(new Set());
  const audioUnlockedRef = useRef(false);
  const pendingUrlsRef = useRef([]);
  const nextIndexByCategoryRef = useRef(new Map());
  const preloadedUrlsRef = useRef(new Set());
  const battleCryCacheRef = useRef(new Map());
  const battleCryCooldownRef = useRef(new Map());
  const battleCryIndexRef = useRef(new Map());

  const enabled = settings.sfxEnabled;
  const ttsEnabled = enabled && hasApiKey('elevenlabs');
  const campaignId = campaign?.id || campaign?.backendId || null;

  const flushPendingUrls = useCallback(() => {
    if (!audioUnlockedRef.current || !pendingUrlsRef.current.length) return;

    const urls = [...pendingUrlsRef.current];
    pendingUrlsRef.current = [];
    for (const url of urls) {
      if (!url) continue;

      const audio = new Audio(url);
      audio.preload = 'auto';
      audio.volume = getVolume(settings.sfxVolume);
      activeAudiosRef.current.add(audio);

      const cleanup = () => {
        activeAudiosRef.current.delete(audio);
        audio.onended = null;
        audio.onerror = null;
      };

      audio.onended = cleanup;
      audio.onerror = cleanup;
      audio.play().catch((err) => {
        cleanup();
        if (err?.name === 'NotAllowedError') {
          audioUnlockedRef.current = false;
          pendingUrlsRef.current.push(url);
        } else {
          console.warn('[CombatAudio] Playback failed:', err?.message || err);
        }
      });
    }
  }, [settings.sfxVolume]);

  const unlockAudio = useCallback(() => {
    audioUnlockedRef.current = true;
    flushPendingUrls();
  }, [flushPendingUrls]);

  const playUrl = useCallback((url) => {
    if (!url) return;
    if (!audioUnlockedRef.current) {
      pendingUrlsRef.current.push(url);
      return;
    }

    const audio = new Audio(url);
    audio.preload = 'auto';
    audio.volume = getVolume(settings.sfxVolume);
    activeAudiosRef.current.add(audio);

    const cleanup = () => {
      activeAudiosRef.current.delete(audio);
      audio.onended = null;
      audio.onerror = null;
    };

    audio.onended = cleanup;
    audio.onerror = cleanup;
    audio.play().catch((err) => {
      cleanup();
      if (err?.name === 'NotAllowedError') {
        audioUnlockedRef.current = false;
        pendingUrlsRef.current.push(url);
        return;
      }
      console.warn('[CombatAudio] Playback failed:', err?.message || err);
    });
  }, [settings.sfxVolume]);

  const ensureCategory = useCallback((category) => {
    if (!enabled || !category) return [];
    return getCombatSfxVariants(category);
  }, [enabled]);

  const playCategory = useCallback((category, delayMs = 0) => {
    if (!category) return;

    const urls = ensureCategory(category);
    if (!urls.length) return;

    const nextIndex = (nextIndexByCategoryRef.current.get(category) || 0) % urls.length;
    const url = urls[nextIndex];
    nextIndexByCategoryRef.current.set(category, (nextIndex + 1) % urls.length);

    if (delayMs > 0) {
      window.setTimeout(() => playUrl(url), delayMs);
      return;
    }

    playUrl(url);
  }, [ensureCategory, playUrl]);

  const playForResult = useCallback((result) => {
    if (!enabled || !result) return;

    const actionCategory = getCombatResultCategory(result);
    const reactionCategory = getCombatReactionCategory(result);

    void playCategory(actionCategory);
    if (reactionCategory) {
      void playCategory(reactionCategory, 120);
    }
  }, [enabled, playCategory]);

  const getCombatantGender = useCallback((combatant) => {
    if (!combatant?.name) return null;
    if (character?.name === combatant.name) {
      return character.gender || null;
    }

    const partyMatch = (party || []).find((entry) => entry?.name === combatant.name);
    if (partyMatch?.gender) return partyMatch.gender;

    const npcMatch = (npcs || []).find((entry) => entry?.name === combatant.name);
    if (npcMatch?.gender) return npcMatch.gender;

    return characterVoiceMap?.[combatant.name]?.gender || null;
  }, [character, characterVoiceMap, party, npcs]);

  const resolveCombatantVoiceId = useCallback((combatant) => {
    if (!combatant?.name) return settings.narratorVoiceId || null;

    const mappedVoice = characterVoiceMap?.[combatant.name]?.voiceId;
    if (mappedVoice) return mappedVoice;

    const gender = getCombatantGender(combatant);
    const resolved = resolveVoiceForCharacter(
      combatant.name,
      gender,
      characterVoiceMap || {},
      {
        maleVoices: settings.maleVoices || [],
        femaleVoices: settings.femaleVoices || [],
        narratorVoiceId: settings.narratorVoiceId || null,
      },
      dispatch
    );

    return resolved || settings.narratorVoiceId || null;
  }, [
    dispatch,
    getCombatantGender,
    settings.maleVoices,
    settings.femaleVoices,
    settings.narratorVoiceId,
    characterVoiceMap,
  ]);

  const playBattleCry = useCallback(async (combatant) => {
    if (!ttsEnabled || !combat?.active || !combatant?.name) return;

    const cooldownKey = combatant.id || combatant.name;
    const lastPlayedAt = battleCryCooldownRef.current.get(cooldownKey) || 0;
    const now = Date.now();
    if (now - lastPlayedAt < 1800) return;
    battleCryCooldownRef.current.set(cooldownKey, now);

    const voiceId = resolveCombatantVoiceId(combatant);
    if (!voiceId) return;

    const lineIndex = battleCryIndexRef.current.get(cooldownKey) || 0;
    battleCryIndexRef.current.set(cooldownKey, lineIndex + 1);
    const line = getCombatBattleCryLine(settings.language, lineIndex);
    if (!line) return;

    const cacheKey = `${voiceId}:${settings.language}:${line}`;
    let resolvedUrl = battleCryCacheRef.current.get(cacheKey);

    if (!resolvedUrl) {
      const generationPromise = elevenlabsService
        .textToSpeechStream(undefined, voiceId, line, undefined, campaignId)
        .then((url) => {
          battleCryCacheRef.current.set(cacheKey, url);
          dispatch({ type: 'ADD_AI_COST', payload: calculateCost('tts', { charCount: line.length }) });
          return url;
        })
        .catch((err) => {
          battleCryCacheRef.current.delete(cacheKey);
          throw err;
        });

      battleCryCacheRef.current.set(cacheKey, generationPromise);
      resolvedUrl = generationPromise;
    }

    try {
      const url = typeof resolvedUrl === 'string' ? resolvedUrl : await resolvedUrl;
      playUrl(apiClient.resolveMediaUrl(url));
    } catch (err) {
      console.warn('[CombatAudio] Battle cry failed:', err?.message || err);
    }
  }, [
    campaignId,
    combat?.active,
    dispatch,
    playUrl,
    resolveCombatantVoiceId,
    settings.language,
    ttsEnabled,
  ]);

  useEffect(() => {
    if (!enabled || !combat?.active) return undefined;

    let cancelled = false;

    const preload = async () => {
      for (const category of getCombatPreloadCategories(combat)) {
        if (cancelled) return;
        for (const url of ensureCategory(category)) {
          if (!url || preloadedUrlsRef.current.has(url)) continue;
          preloadedUrlsRef.current.add(url);
          const audio = new Audio(url);
          audio.preload = 'auto';
          audio.load();
        }
      }
    };

    void preload();

    return () => {
      cancelled = true;
    };
  }, [combat, enabled, ensureCategory]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const events = ['pointerdown', 'keydown', 'touchstart'];
    for (const eventName of events) {
      window.addEventListener(eventName, unlockAudio, { passive: true });
    }

    return () => {
      for (const eventName of events) {
        window.removeEventListener(eventName, unlockAudio);
      }
    };
  }, [unlockAudio]);

  useEffect(() => () => {
    for (const audio of activeAudiosRef.current) {
      audio.pause();
      audio.removeAttribute('src');
    }
    activeAudiosRef.current.clear();
    pendingUrlsRef.current = [];
    nextIndexByCategoryRef.current.clear();
    preloadedUrlsRef.current.clear();
    battleCryCacheRef.current.clear();
    battleCryCooldownRef.current.clear();
    battleCryIndexRef.current.clear();
  }, []);

  return {
    playForResult,
    playBattleCry,
  };
}
