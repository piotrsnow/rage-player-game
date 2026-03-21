import { useState, useCallback, useRef, useEffect } from 'react';
import { useSettings } from '../contexts/SettingsContext';
import { useGame } from '../contexts/GameContext';
import { elevenlabsService } from '../services/elevenlabs';

const STATES = {
  IDLE: 'idle',
  LOADING: 'loading',
  PLAYING: 'playing',
  PAUSED: 'paused',
};

function resolveVoiceForCharacter(characterName, gender, characterVoiceMap, localMap, characterVoices, dispatch) {
  const existing = localMap.get(characterName) || characterVoiceMap[characterName];
  if (existing) {
    const genderOk = !gender || !existing.gender || existing.gender === gender;
    if (genderOk) return existing.voiceId;
  }

  if (!characterVoices || characterVoices.length === 0) {
    return existing?.voiceId || null;
  }

  const usedVoiceIds = new Set();
  for (const v of Object.values(characterVoiceMap)) usedVoiceIds.add(v.voiceId);
  for (const v of localMap.values()) usedVoiceIds.add(v.voiceId);

  const genderPool = gender === 'male' || gender === 'female'
    ? characterVoices.filter((v) => v.gender === gender)
    : characterVoices;

  const pool = genderPool.length > 0 ? genderPool : characterVoices;

  let assigned = pool.find((v) => !usedVoiceIds.has(v.voiceId));
  if (!assigned) {
    const totalMapped = Object.keys(characterVoiceMap).length + localMap.size;
    assigned = pool[totalMapped % pool.length];
  }

  const entry = { voiceId: assigned.voiceId, gender: gender || null };
  localMap.set(characterName, entry);
  dispatch({
    type: 'MAP_CHARACTER_VOICE',
    payload: { characterName, voiceId: assigned.voiceId, gender: gender || null },
  });

  return assigned.voiceId;
}

export function useNarrator() {
  const { settings } = useSettings();
  const { state, dispatch } = useGame();
  const [playbackState, setPlaybackState] = useState(STATES.IDLE);
  const [currentMessageId, setCurrentMessageId] = useState(null);
  const [currentSegmentIndex, setCurrentSegmentIndex] = useState(-1);
  const [currentCharacter, setCurrentCharacter] = useState(null);

  const audioRef = useRef(null);
  const sfxAudioRef = useRef(null);
  const queueRef = useRef([]);
  const abortRef = useRef(false);
  const objectUrlsRef = useRef([]);

  const cleanup = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.removeAttribute('src');
      audioRef.current = null;
    }
    if (sfxAudioRef.current) {
      sfxAudioRef.current.pause();
      sfxAudioRef.current.removeAttribute('src');
      sfxAudioRef.current = null;
    }
    objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    objectUrlsRef.current = [];
  }, []);

  useEffect(() => {
    return () => {
      cleanup();
      abortRef.current = true;
    };
  }, [cleanup]);

  const processQueue = useCallback(async () => {
    if (queueRef.current.length === 0) {
      setPlaybackState(STATES.IDLE);
      setCurrentMessageId(null);
      setCurrentSegmentIndex(-1);
      setCurrentCharacter(null);
      return;
    }

    const item = queueRef.current[0];
    const { dialogueSegments, soundEffect, narrative, messageId } = item;
    setCurrentMessageId(messageId);
    setPlaybackState(STATES.LOADING);

    const { elevenlabsApiKey, elevenlabsVoiceId, characterVoices, sfxEnabled, sfxVolume, dialogueSpeed } = settings;
    if (!elevenlabsApiKey || !elevenlabsVoiceId) {
      queueRef.current.shift();
      setPlaybackState(STATES.IDLE);
      setCurrentMessageId(null);
      return;
    }

    try {
      abortRef.current = false;

      if (sfxEnabled && soundEffect) {
        try {
          const sfxUrl = await elevenlabsService.generateSoundEffect(elevenlabsApiKey, soundEffect, 4);
          objectUrlsRef.current.push(sfxUrl);

          if (!abortRef.current) {
            const sfxAudio = new Audio(sfxUrl);
            sfxAudio.volume = Math.max(0, Math.min(1, (sfxVolume || 70) / 100));
            sfxAudioRef.current = sfxAudio;
            await new Promise((resolve) => {
              sfxAudio.onended = resolve;
              sfxAudio.onerror = resolve;
              sfxAudio.play().catch(resolve);
            });
            sfxAudioRef.current = null;
          }
        } catch (sfxErr) {
          console.warn('SFX generation failed:', sfxErr.message);
        }
      }

      if (abortRef.current) {
        cleanup();
        queueRef.current.shift();
        processQueue();
        return;
      }

      let segments;
      if (dialogueSegments && dialogueSegments.length > 0) {
        const hasNarration = dialogueSegments.some((s) => s.type === 'narration');
        if (hasNarration) {
          const narrationInSegments = dialogueSegments
            .filter((s) => s.type === 'narration')
            .map((s) => (s.text || '').trim())
            .join(' ');
          const fullNarrative = (narrative || '').trim();

          if (fullNarrative && narrationInSegments.length < fullNarrative.length * 0.7) {
            let replaced = false;
            segments = dialogueSegments.map((s) => {
              if (s.type === 'narration') {
                if (!replaced) {
                  replaced = true;
                  return { ...s, text: fullNarrative };
                }
                return { ...s, text: '' };
              }
              return s;
            });
          } else {
            segments = dialogueSegments;
          }
        } else {
          segments = [
            { type: 'narration', text: narrative || '' },
            ...dialogueSegments,
          ];
        }
      } else {
        segments = [{ type: 'narration', text: narrative || '' }];
      }

      const localVoiceMap = new Map();

      for (let i = 0; i < segments.length; i++) {
        if (abortRef.current) break;

        const seg = segments[i];
        const text = seg.text?.trim();
        if (!text) continue;

        setCurrentSegmentIndex(i);
        setCurrentCharacter(seg.type === 'dialogue' ? seg.character : null);
        setPlaybackState(STATES.LOADING);

        let voiceId = elevenlabsVoiceId;
        if (seg.type === 'dialogue' && seg.character && characterVoices?.length > 0) {
          const mapped = resolveVoiceForCharacter(
            seg.character,
            seg.gender,
            state.characterVoiceMap,
            localVoiceMap,
            characterVoices,
            dispatch
          );
          if (mapped) voiceId = mapped;
        }

        const audioUrl = await elevenlabsService.textToSpeechStream(
          elevenlabsApiKey,
          voiceId,
          text
        );
        objectUrlsRef.current.push(audioUrl);

        if (abortRef.current) break;

        const audio = new Audio(audioUrl);
        audio.playbackRate = Math.max(0.5, Math.min(2, (dialogueSpeed || 100) / 100));
        audioRef.current = audio;
        setPlaybackState(STATES.PLAYING);

        await new Promise((resolve) => {
          audio.onended = resolve;
          audio.onerror = resolve;
          audio.play().catch(resolve);
        });

        audioRef.current = null;
      }

      cleanup();
      queueRef.current.shift();
      setCurrentSegmentIndex(-1);
      setCurrentCharacter(null);
      processQueue();
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.warn('Narrator TTS error:', err.message);
      }
      cleanup();
      queueRef.current.shift();
      processQueue();
    }
  }, [settings, state.characterVoiceMap, dispatch, cleanup]);

  const speakScene = useCallback((message, messageId) => {
    queueRef.current.push({
      dialogueSegments: message.dialogueSegments || [],
      soundEffect: message.soundEffect || null,
      narrative: message.content || message.narrative || '',
      messageId,
    });
    if (playbackState === STATES.IDLE) {
      processQueue();
    }
  }, [playbackState, processQueue]);

  const speak = useCallback((text, messageId) => {
    speakScene({ content: text }, messageId);
  }, [speakScene]);

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
    abortRef.current = true;
    queueRef.current = [];
    cleanup();
    setPlaybackState(STATES.IDLE);
    setCurrentMessageId(null);
    setCurrentSegmentIndex(-1);
    setCurrentCharacter(null);
  }, [cleanup]);

  const speakSingle = useCallback((message, messageId) => {
    stop();
    setTimeout(() => {
      if (typeof message === 'string') {
        queueRef.current.push({
          dialogueSegments: [],
          soundEffect: null,
          narrative: message,
          messageId,
        });
      } else {
        queueRef.current.push({
          dialogueSegments: message.dialogueSegments || [],
          soundEffect: message.soundEffect || null,
          narrative: message.content || message.narrative || '',
          messageId,
        });
      }
      abortRef.current = false;
      processQueue();
    }, 50);
  }, [stop, processQueue]);

  return {
    playbackState,
    currentMessageId,
    currentSegmentIndex,
    currentCharacter,
    isNarratorReady: !!(settings.narratorEnabled && settings.elevenlabsApiKey && settings.elevenlabsVoiceId),
    speak,
    speakScene,
    speakSingle,
    pause,
    resume,
    stop,
    STATES,
  };
}
