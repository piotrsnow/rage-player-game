import { useState, useCallback, useRef, useEffect } from 'react';
import { useSettings } from '../contexts/SettingsContext';
import { useGame } from '../contexts/GameContext';
import { elevenlabsService } from '../services/elevenlabs';
import { calculateCost } from '../services/costTracker';
import { resolveVoiceForCharacter } from '../services/characterVoiceResolver';

const STATES = {
  IDLE: 'idle',
  LOADING: 'loading',
  PLAYING: 'playing',
  PAUSED: 'paused',
};

export function useNarrator() {
  const { settings, hasApiKey } = useSettings();
  const { state, dispatch } = useGame();
  const [playbackState, setPlaybackState] = useState(STATES.IDLE);
  const [currentMessageId, setCurrentMessageId] = useState(null);
  const [currentSegmentIndex, setCurrentSegmentIndex] = useState(-1);
  const [currentCharacter, setCurrentCharacter] = useState(null);
  const [highlightInfo, setHighlightInfo] = useState(null);
  const [currentChunk, setCurrentChunk] = useState(null);

  const audioRef = useRef(null);
  const queueRef = useRef([]);
  const abortRef = useRef(false);
  const objectUrlsRef = useRef([]);
  const highlightRafRef = useRef(null);
  const generationRef = useRef(0);

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
      const a = audioRef.current;
      audioRef.current = null;
      a.dispatchEvent(new Event('ended'));
      a.pause();
      a.removeAttribute('src');
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

  const playChunkPipeline = useCallback(async (chunks, voiceId, apiKey, segmentIndex, messageId, dialogueSpeed, fullText, campaignId, generation) => {
    let prefetchPromise = null;
    let wordOffset = 0;

    for (let s = 0; s < chunks.length; s++) {
      if (abortRef.current || generationRef.current !== generation) break;
      const chunk = chunks[s].trim();
      if (!chunk) continue;

      let result;
      if (prefetchPromise) {
        result = await prefetchPromise;
        prefetchPromise = null;
      } else {
        setPlaybackState(STATES.LOADING);
        result = await elevenlabsService.textToSpeechWithTimestamps(apiKey, voiceId, chunk, undefined, campaignId);
      }
      if (generationRef.current !== generation) break;

      if (!result) {
        result = await elevenlabsService.textToSpeechWithTimestamps(apiKey, voiceId, chunk, undefined, campaignId);
      }
      if (generationRef.current !== generation) break;

      dispatch({ type: 'ADD_AI_COST', payload: calculateCost('tts', { charCount: chunk.length }) });
      objectUrlsRef.current.push(result.audioUrl);
      if (abortRef.current || generationRef.current !== generation) break;

      if (s + 1 < chunks.length && chunks[s + 1]?.trim()) {
        prefetchPromise = elevenlabsService.textToSpeechWithTimestamps(apiKey, voiceId, chunks[s + 1].trim(), undefined, campaignId)
          .catch((err) => {
            console.warn('Prefetch TTS failed:', err.message);
            return null;
          });
      }

      const audio = new Audio(result.audioUrl);
      audio.playbackRate = Math.max(0.5, Math.min(2, (dialogueSpeed || 100) / 100));
      audioRef.current = audio;
      setPlaybackState(STATES.PLAYING);
      setCurrentChunk(chunk);

      startHighlightLoop(audio, result.words, segmentIndex, messageId, wordOffset, fullText, chunk);

      const playStart = performance.now();
      await new Promise((resolve) => {
        audio.onended = resolve;
        audio.onerror = resolve;
        audio.play().catch(resolve);
      });
      if (generationRef.current !== generation) break;

      const wallSeconds = (performance.now() - playStart) / 1000;
      if (wallSeconds > 0.1) {
        dispatch({ type: 'ADD_NARRATION_TIME', payload: wallSeconds });
      }

      wordOffset += result.words.length;
      stopHighlightLoop();
      audioRef.current = null;
    }
  }, [startHighlightLoop, stopHighlightLoop, dispatch]);

  const processQueue = useCallback(async () => {
    const myGeneration = generationRef.current;

    if (queueRef.current.length === 0) {
      setPlaybackState(STATES.IDLE);
      setCurrentMessageId(null);
      setCurrentSegmentIndex(-1);
      setCurrentCharacter(null);
      setHighlightInfo(null);
      setCurrentChunk(null);
      return;
    }

    const item = queueRef.current[0];
    const { dialogueSegments, narrative, messageId } = item;
    setCurrentMessageId(messageId);
    setPlaybackState(STATES.LOADING);

      const { elevenlabsVoiceId, characterVoices, dialogueSpeed } = settings;
      if (!hasApiKey('elevenlabs') || !elevenlabsVoiceId) {
      queueRef.current.shift();
      setPlaybackState(STATES.IDLE);
      setCurrentMessageId(null);
      return;
    }

    try {
      abortRef.current = false;

      const campaignId = state.campaign?.backendId || null;

      if (generationRef.current !== myGeneration) return;

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
              .replace(/["""„«»\u2018\u2019'][^"""„«»\u2018\u2019']*["""„«»\u2018\u2019']/g, '')
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
        if (abortRef.current || generationRef.current !== myGeneration) break;

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

        const chunks = elevenlabsService.splitIntoParagraphs(text);
        await playChunkPipeline(chunks, voiceId, undefined, i, messageId, dialogueSpeed, text, campaignId, myGeneration);
        if (generationRef.current !== myGeneration) return;
      }

      if (generationRef.current !== myGeneration) return;

      cleanup();
      queueRef.current.shift();
      setCurrentSegmentIndex(-1);
      setCurrentCharacter(null);
      processQueue();
    } catch (err) {
      if (generationRef.current !== myGeneration) return;
      if (err.name !== 'AbortError') {
        console.warn('Narrator TTS error:', err.message);
      }
      cleanup();
      queueRef.current.shift();
      processQueue();
    }
  }, [settings, state.characterVoiceMap, state.campaign, dispatch, cleanup, playChunkPipeline]);

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
    generationRef.current++;
    abortRef.current = true;
    queueRef.current = [];
    cleanup();
    setPlaybackState(STATES.IDLE);
    setCurrentMessageId(null);
    setCurrentSegmentIndex(-1);
    setCurrentCharacter(null);
    setHighlightInfo(null);
    setCurrentChunk(null);
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
    currentChunk,
    isNarratorReady: !!(settings.narratorEnabled && hasApiKey('elevenlabs') && settings.elevenlabsVoiceId),
    speak,
    speakScene,
    speakSingle,
    pause,
    resume,
    stop,
    STATES,
  };
}
