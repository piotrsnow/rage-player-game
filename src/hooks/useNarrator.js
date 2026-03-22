import { useState, useCallback, useRef, useEffect } from 'react';
import { useSettings } from '../contexts/SettingsContext';
import { useGame } from '../contexts/GameContext';
import { elevenlabsService } from '../services/elevenlabs';
import { calculateCost } from '../services/costTracker';

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
  const [highlightInfo, setHighlightInfo] = useState(null);
  const [currentSentence, setCurrentSentence] = useState(null);

  const audioRef = useRef(null);
  const sfxAudioRef = useRef(null);
  const queueRef = useRef([]);
  const abortRef = useRef(false);
  const objectUrlsRef = useRef([]);
  const highlightRafRef = useRef(null);

  const stopHighlightLoop = useCallback(() => {
    if (highlightRafRef.current) {
      cancelAnimationFrame(highlightRafRef.current);
      highlightRafRef.current = null;
    }
    setHighlightInfo(null);
  }, []);

  const startHighlightLoop = useCallback((audio, words, segmentIndex, messageId, wordOffset, fullText, sentence) => {
    stopHighlightLoop();
    const tick = () => {
      if (!audio || audio.paused || audio.ended) {
        setHighlightInfo(null);
        return;
      }
      const t = audio.currentTime;
      let activeIdx = -1;
      for (let i = 0; i < words.length; i++) {
        if (t >= words[i].start && t <= words[i].end + 0.05) {
          activeIdx = i;
        }
      }
      const globalIdx = activeIdx >= 0 ? activeIdx + wordOffset : -1;
      setHighlightInfo({ messageId, segmentIndex, wordIndex: globalIdx, fullText, sentenceWordIndex: activeIdx });
      highlightRafRef.current = requestAnimationFrame(tick);
    };
    highlightRafRef.current = requestAnimationFrame(tick);
  }, [stopHighlightLoop]);

  const cleanup = useCallback(() => {
    stopHighlightLoop();
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
  }, [stopHighlightLoop]);

  useEffect(() => {
    return () => {
      cleanup();
      abortRef.current = true;
    };
  }, [cleanup]);

  const playSentencePipeline = useCallback(async (sentences, voiceId, apiKey, segmentIndex, messageId, dialogueSpeed, fullText) => {
    let prefetchPromise = null;
    let wordOffset = 0;

    for (let s = 0; s < sentences.length; s++) {
      if (abortRef.current) break;
      const sentence = sentences[s].trim();
      if (!sentence) continue;

      let result;
      if (prefetchPromise) {
        result = await prefetchPromise;
        prefetchPromise = null;
      } else {
        setPlaybackState(STATES.LOADING);
        result = await elevenlabsService.textToSpeechWithTimestamps(apiKey, voiceId, sentence);
      }

      if (!result) {
        result = await elevenlabsService.textToSpeechWithTimestamps(apiKey, voiceId, sentence);
      }

      dispatch({ type: 'ADD_AI_COST', payload: calculateCost('tts', { charCount: sentence.length }) });
      objectUrlsRef.current.push(result.audioUrl);
      if (abortRef.current) break;

      if (s + 1 < sentences.length && sentences[s + 1]?.trim()) {
        prefetchPromise = elevenlabsService.textToSpeechWithTimestamps(apiKey, voiceId, sentences[s + 1].trim())
          .catch((err) => {
            console.warn('Prefetch TTS failed:', err.message);
            return null;
          });
      }

      const audio = new Audio(result.audioUrl);
      audio.playbackRate = Math.max(0.5, Math.min(2, (dialogueSpeed || 100) / 100));
      audioRef.current = audio;
      setPlaybackState(STATES.PLAYING);
      setCurrentSentence(sentence);

      startHighlightLoop(audio, result.words, segmentIndex, messageId, wordOffset, fullText, sentence);

      await new Promise((resolve) => {
        audio.onended = resolve;
        audio.onerror = resolve;
        audio.play().catch(resolve);
      });

      wordOffset += result.words.length;
      stopHighlightLoop();
      audioRef.current = null;
    }
  }, [startHighlightLoop, stopHighlightLoop, dispatch]);

  const processQueue = useCallback(async () => {
    if (queueRef.current.length === 0) {
      setPlaybackState(STATES.IDLE);
      setCurrentMessageId(null);
      setCurrentSegmentIndex(-1);
      setCurrentCharacter(null);
      setHighlightInfo(null);
      setCurrentSentence(null);
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
          dispatch({ type: 'ADD_AI_COST', payload: calculateCost('sfx', {}) });
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
          const allSegmentsText = dialogueSegments
            .map((s) => (s.text || '').trim())
            .join(' ');
          const fullNarrative = (narrative || '').trim();

          if (fullNarrative && allSegmentsText.length < fullNarrative.length * 0.7) {
            const narrativeNoQuotes = fullNarrative
              .replace(/["""„«»][^"""„«»]*["""„«»]/g, '')
              .replace(/\s{2,}/g, ' ')
              .trim();

            let replaced = false;
            segments = dialogueSegments.map((s) => {
              if (s.type === 'narration') {
                if (!replaced) {
                  replaced = true;
                  return { ...s, text: narrativeNoQuotes || fullNarrative };
                }
                return { ...s, text: '' };
              }
              return s;
            });
          } else {
            segments = dialogueSegments;
          }
        } else {
          segments = dialogueSegments;
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

        const sentences = elevenlabsService.splitIntoSentences(text);
        await playSentencePipeline(sentences, voiceId, elevenlabsApiKey, i, messageId, dialogueSpeed, text);
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
  }, [settings, state.characterVoiceMap, dispatch, cleanup, playSentencePipeline]);

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
    setHighlightInfo(null);
    setCurrentSentence(null);
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
    highlightInfo,
    currentSentence,
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
