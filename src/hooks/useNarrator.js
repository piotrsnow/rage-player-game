import { useState, useCallback, useRef, useEffect } from 'react';
import { useSettings } from '../contexts/SettingsContext';
import { useGame } from '../contexts/GameContext';
import { elevenlabsService } from '../services/elevenlabs';
import { calculateCost } from '../services/costTracker';
import { resolveVoiceForCharacter } from '../services/characterVoiceResolver';
import { hasNamedSpeaker } from '../services/dialogueSegments';

const STATES = {
  IDLE: 'idle',
  LOADING: 'loading',
  PLAYING: 'playing',
  PAUSED: 'paused',
};

const PACING_SPEED_MULTIPLIERS = {
  combat: 1.12,
  chase: 1.15,
  stealth: 0.92,
  travel_montage: 1.18,
  celebration: 1.05,
  rest: 0.95,
  dramatic: 0.97,
  exploration: 1.0,
  dialogue: 1.0,
};

const FAST_FORWARD_HOLD_START_MULTIPLIER = 1.5;
const FAST_FORWARD_HOLD_MAX_MULTIPLIER = 5;
const FAST_FORWARD_HOLD_RAMP_MS = 2200;
const DEFAULT_SEGMENT_PREFETCH_WINDOW = 3;
const MAX_UTTERANCE_CHARS = 320;
const HIGHLIGHT_LEAD_SECONDS = 0.06;
const HIGHLIGHT_SCALE_MIN = 0.85;
const HIGHLIGHT_SCALE_MAX = 1.2;
const MAX_NATURAL_PLAYBACK_RATE = 2;
const MAX_FAST_FORWARD_PLAYBACK_RATE = 5;

function clampRate(value, min = 0.5, max = 2) {
  return Math.max(min, Math.min(max, value));
}

function splitTextIntoUtterances(text, maxChars = MAX_UTTERANCE_CHARS) {
  const normalized = String(text || '').trim();
  if (!normalized) return [];

  const paragraphs = normalized
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean);

  const source = paragraphs.length > 0 ? paragraphs : [normalized];
  const utterances = [];

  for (const paragraph of source) {
    if (paragraph.length <= maxChars) {
      utterances.push(paragraph);
      continue;
    }

    const sentences = paragraph
      .split(/(?<=[.!?…])\s+/)
      .map((sentence) => sentence.trim())
      .filter(Boolean);

    if (sentences.length === 0) {
      utterances.push(paragraph);
      continue;
    }

    let chunk = '';
    for (const sentence of sentences) {
      if (sentence.length > maxChars) {
        if (chunk) {
          utterances.push(chunk);
          chunk = '';
        }
        utterances.push(sentence);
        continue;
      }

      const candidate = chunk ? `${chunk} ${sentence}` : sentence;
      if (candidate.length <= maxChars) {
        chunk = candidate;
      } else {
        if (chunk) utterances.push(chunk);
        chunk = sentence;
      }
    }
    if (chunk) utterances.push(chunk);
  }

  return utterances;
}

export function useNarrator({ viewerMode = false, shareToken = null, backendUrl = null } = {}) {
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
  const skipSegmentRef = useRef(false);
  const naturalPlaybackRateRef = useRef(1);
  const narrationFastForwardRateRef = useRef(1);
  const holdActiveRef = useRef(false);
  const holdStartAtRef = useRef(0);
  const holdRafRef = useRef(null);
  const [narrationFastForwardRate, setNarrationFastForwardRate] = useState(1);
  const reportNarratorError = useCallback((message) => {
    if (!message || viewerMode) return;
    dispatch({ type: 'SET_ERROR', payload: message });
  }, [dispatch, viewerMode]);

  const applyPlaybackRate = useCallback((audio = audioRef.current) => {
    if (!audio) return;
    const natural = naturalPlaybackRateRef.current || 1;
    const boost = narrationFastForwardRateRef.current || 1;
    audio.playbackRate = clampRate(natural * boost, 0.5, MAX_FAST_FORWARD_PLAYBACK_RATE);
  }, []);

  const stopHoldLoop = useCallback(() => {
    if (holdRafRef.current) {
      cancelAnimationFrame(holdRafRef.current);
      holdRafRef.current = null;
    }
  }, []);

  const computeHoldMultiplier = useCallback(() => {
    const elapsed = Math.max(0, performance.now() - holdStartAtRef.current);
    const progress = Math.min(1, elapsed / FAST_FORWARD_HOLD_RAMP_MS);
    return FAST_FORWARD_HOLD_START_MULTIPLIER
      + (FAST_FORWARD_HOLD_MAX_MULTIPLIER - FAST_FORWARD_HOLD_START_MULTIPLIER) * progress;
  }, []);

  const startNarrationFastForwardHold = useCallback(() => {
    if (holdActiveRef.current) return;
    holdActiveRef.current = true;
    holdStartAtRef.current = performance.now();
    narrationFastForwardRateRef.current = FAST_FORWARD_HOLD_START_MULTIPLIER;
    setNarrationFastForwardRate(FAST_FORWARD_HOLD_START_MULTIPLIER);
    applyPlaybackRate();

    const tick = () => {
      if (!holdActiveRef.current) return;
      const nextMultiplier = computeHoldMultiplier();
      narrationFastForwardRateRef.current = nextMultiplier;
      setNarrationFastForwardRate(nextMultiplier);
      applyPlaybackRate();
      holdRafRef.current = requestAnimationFrame(tick);
    };
    holdRafRef.current = requestAnimationFrame(tick);
  }, [applyPlaybackRate, computeHoldMultiplier]);

  const stopNarrationFastForwardHold = useCallback(() => {
    holdActiveRef.current = false;
    stopHoldLoop();
    narrationFastForwardRateRef.current = 1;
    setNarrationFastForwardRate(1);
    applyPlaybackRate();
  }, [applyPlaybackRate, stopHoldLoop]);

  const stopHighlightLoop = useCallback(() => {
    if (highlightRafRef.current) {
      cancelAnimationFrame(highlightRafRef.current);
      highlightRafRef.current = null;
    }
    setHighlightInfo(null);
  }, []);

  const startHighlightLoop = useCallback((audio, words, segmentIndex, messageId, wordOffset, fullText, sentence) => {
    stopHighlightLoop();
    let lastActiveIdx = -1;
    const tick = () => {
      if (!audio || audio.paused || audio.ended) {
        setHighlightInfo(null);
        return;
      }
      const lastWordEnd = words.length > 0 ? Number(words[words.length - 1]?.end || 0) : 0;
      const audioDuration = Number.isFinite(audio.duration) ? audio.duration : 0;
      const rawScale = (lastWordEnd > 0 && audioDuration > 0)
        ? (lastWordEnd / audioDuration)
        : 1;
      const timingScale = Math.max(HIGHLIGHT_SCALE_MIN, Math.min(HIGHLIGHT_SCALE_MAX, rawScale || 1));
      const t = (audio.currentTime * timingScale) + HIGHLIGHT_LEAD_SECONDS;
      let activeIdx = -1;
      // Try to continue near the previous index to reduce jitter.
      const startIdx = lastActiveIdx > 0 ? Math.max(0, lastActiveIdx - 2) : 0;
      for (let i = startIdx; i < words.length; i++) {
        if (t >= words[i].start && t <= words[i].end + 0.05) {
          activeIdx = i;
          break;
        }
        if (words[i].start > t + 0.12) break;
      }
      if (activeIdx >= 0) {
        lastActiveIdx = activeIdx;
      }
      const globalIdx = activeIdx >= 0 ? activeIdx + wordOffset : -1;
      setHighlightInfo({ messageId, segmentIndex, wordIndex: globalIdx, fullText, sentenceWordIndex: activeIdx });
      highlightRafRef.current = requestAnimationFrame(tick);
    };
    highlightRafRef.current = requestAnimationFrame(tick);
  }, [stopHighlightLoop]);

  const cleanup = useCallback(() => {
    stopHighlightLoop();
    stopHoldLoop();
    holdActiveRef.current = false;
    if (audioRef.current) {
      const a = audioRef.current;
      audioRef.current = null;
      a.dispatchEvent(new Event('ended'));
      a.pause();
      a.removeAttribute('src');
    }
    objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    objectUrlsRef.current = [];
  }, [stopHighlightLoop, stopHoldLoop]);

  useEffect(() => {
    return () => {
      cleanup();
      abortRef.current = true;
    };
  }, [cleanup]);

  const fetchTts = useCallback(async (voiceId, chunk, campaignId, pacing) => {
    if (viewerMode && backendUrl && shareToken) {
      return elevenlabsService.textToSpeechFromCache(backendUrl, shareToken, voiceId, chunk, undefined, campaignId);
    }
    return elevenlabsService.textToSpeechWithTimestamps(undefined, voiceId, chunk, undefined, campaignId, pacing);
  }, [viewerMode, backendUrl, shareToken]);

  const playChunkPipeline = useCallback(async (chunks, voiceId, apiKey, segmentIndex, messageId, dialogueSpeed, fullText, campaignId, generation, scenePacing, initialWordOffset = 0) => {
    let prefetchPromise = null;
    let wordOffset = initialWordOffset;

    for (let s = 0; s < chunks.length; s++) {
      if (abortRef.current || skipSegmentRef.current || generationRef.current !== generation) break;
      const chunk = chunks[s].trim();
      if (!chunk) continue;

      let result;
      if (prefetchPromise) {
        result = await prefetchPromise;
        prefetchPromise = null;
      } else {
        setPlaybackState(STATES.LOADING);
        result = await fetchTts(voiceId, chunk, campaignId, scenePacing);
      }
      if (generationRef.current !== generation || skipSegmentRef.current) break;

      if (!result) {
        result = await fetchTts(voiceId, chunk, campaignId, scenePacing);
      }
      if (generationRef.current !== generation || skipSegmentRef.current) break;
      if (!result) continue;

      if (!viewerMode) {
        dispatch({ type: 'ADD_AI_COST', payload: calculateCost('tts', { charCount: chunk.length }) });
      }
      objectUrlsRef.current.push(result.audioUrl);
      if (abortRef.current || skipSegmentRef.current || generationRef.current !== generation) break;

      if (s + 1 < chunks.length && chunks[s + 1]?.trim()) {
        prefetchPromise = fetchTts(voiceId, chunks[s + 1].trim(), campaignId, scenePacing)
          .catch((err) => {
            console.warn('Prefetch TTS failed:', err.message);
            return null;
          });
      }

      const audio = new Audio(result.audioUrl);
      const baseRate = (dialogueSpeed || 100) / 100;
      const pacingMul = PACING_SPEED_MULTIPLIERS[scenePacing] || 1.0;
      const natural = clampRate(baseRate * pacingMul, 0.5, MAX_NATURAL_PLAYBACK_RATE);
      naturalPlaybackRateRef.current = natural;
      audio.playbackRate = clampRate(natural * (narrationFastForwardRateRef.current || 1), 0.5, MAX_FAST_FORWARD_PLAYBACK_RATE);
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
      if (generationRef.current !== generation || skipSegmentRef.current) break;

      const wallSeconds = (performance.now() - playStart) / 1000;
      if (wallSeconds > 0.1) {
        dispatch({ type: 'ADD_NARRATION_TIME', payload: wallSeconds });
      }

      wordOffset += result.words.length;
      stopHighlightLoop();
      audioRef.current = null;
    }
    return Math.max(0, wordOffset - initialWordOffset);
  }, [startHighlightLoop, stopHighlightLoop, dispatch, fetchTts, viewerMode]);

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
    const { dialogueSegments, narrative, messageId, scenePacing, segmentPrefetchWindow } = item;
    setCurrentMessageId(messageId);
    setPlaybackState(STATES.LOADING);

      const { elevenlabsVoiceId, characterVoices, dialogueSpeed } = settings;
      const defaultVoiceId = viewerMode
        ? (state.narratorVoiceId || elevenlabsVoiceId)
        : (elevenlabsVoiceId || state.narratorVoiceId);

      if (!defaultVoiceId || (!viewerMode && !hasApiKey('elevenlabs'))) {
        reportNarratorError('Narrator unavailable: configure ElevenLabs voice and backend key in Settings.');
        queueRef.current.shift();
        setPlaybackState(STATES.IDLE);
        setCurrentMessageId(null);
        return;
      }

    try {
      abortRef.current = false;

      const campaignId = state.campaign?.backendId || null;

      if (defaultVoiceId && state.narratorVoiceId !== defaultVoiceId) {
        dispatch({ type: 'SET_NARRATOR_VOICE', payload: defaultVoiceId });
      }

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
              // Remove direct speech when we need to rebuild narration fallback.
              .replace(/(?:"[^"]*"|„[^”]*”|“[^”]*”|«[^»]*»)/g, '')
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

      const normalizedSegments = segments.flatMap((seg) => {
        const text = seg?.text?.trim();
        if (!text) return [];
        const chunks = splitTextIntoUtterances(text);
        if (chunks.length <= 1) return [{ ...seg, text }];
        return chunks.map((chunk) => ({ ...seg, text: chunk }));
      });

      const localVoiceMap = new Map();

      const playerCharNames = viewerMode ? [] : (state.party || [state.character])
        .map(c => c?.name?.toLowerCase())
        .filter(Boolean);

      const utterancePrefetchWindow = Math.max(
        1,
        Math.min(6, Number(segmentPrefetchWindow) || DEFAULT_SEGMENT_PREFETCH_WINDOW)
      );
      const prefetchMap = new Map();

      const buildPrefetchKey = (voiceId, text) => `${voiceId || ''}::${text || ''}`;
      const scheduleUtterancePrefetch = (voiceId, text, campaignIdForFetch) => {
        const key = buildPrefetchKey(voiceId, text);
        if (prefetchMap.has(key)) return key;
        prefetchMap.set(
          key,
          fetchTts(voiceId, text, campaignIdForFetch, scenePacing)
            .catch((err) => {
              console.warn('Utterance prefetch failed:', err.message);
              return null;
            })
        );
        return key;
      };

      const shouldSkipSegment = (seg) => (
        !viewerMode
        && seg?.type === 'dialogue'
        && hasNamedSpeaker(seg.character)
        && playerCharNames.includes(seg.character.toLowerCase())
      );

      const resolveSegmentVoice = (seg) => {
        let voiceId = defaultVoiceId;
        if (seg?.voiceId) {
          return seg.voiceId;
        }

        if (seg?.type === 'dialogue' && hasNamedSpeaker(seg.character)) {
          const existingMapping = state.characterVoiceMap?.[seg.character];
          if (existingMapping?.voiceId) {
            voiceId = existingMapping.voiceId;
          } else if (!viewerMode && characterVoices?.length > 0) {
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
        }

        return voiceId;
      };

      let globalWordOffset = 0;

      for (let i = 0; i < normalizedSegments.length; i++) {
        if (abortRef.current || generationRef.current !== myGeneration) break;
        skipSegmentRef.current = false;

        const seg = normalizedSegments[i];
        const text = seg.text?.trim();
        if (!text) continue;

        if (shouldSkipSegment(seg)) {
          continue;
        }

        setCurrentSegmentIndex(i);
        setCurrentCharacter(seg.type === 'dialogue' && hasNamedSpeaker(seg.character) ? seg.character : null);

        const voiceId = resolveSegmentVoice(seg);

        if (utterancePrefetchWindow > 1) {
          const currentKey = scheduleUtterancePrefetch(voiceId, text, campaignId);
          for (let lookAhead = 1; lookAhead < utterancePrefetchWindow; lookAhead += 1) {
            const nextSeg = normalizedSegments[i + lookAhead];
            const nextText = nextSeg?.text?.trim();
            if (!nextSeg || !nextText || shouldSkipSegment(nextSeg)) continue;
            const nextVoiceId = resolveSegmentVoice(nextSeg);
            scheduleUtterancePrefetch(nextVoiceId, nextText, campaignId);
          }

          let prefetched = prefetchMap.get(currentKey)
            ? await prefetchMap.get(currentKey)
            : null;
          prefetchMap.delete(currentKey);

          if (generationRef.current !== myGeneration || skipSegmentRef.current) break;
          if (!prefetched) {
            prefetched = await fetchTts(voiceId, text, campaignId, scenePacing);
          }
          if (generationRef.current !== myGeneration || skipSegmentRef.current) break;

          if (prefetched) {
            if (!viewerMode) {
              dispatch({ type: 'ADD_AI_COST', payload: calculateCost('tts', { charCount: text.length }) });
            }
            objectUrlsRef.current.push(prefetched.audioUrl);
            const audio = new Audio(prefetched.audioUrl);
            const baseRate = (dialogueSpeed || 100) / 100;
            const pacingMul = PACING_SPEED_MULTIPLIERS[scenePacing] || 1.0;
            const natural = clampRate(baseRate * pacingMul, 0.5, MAX_NATURAL_PLAYBACK_RATE);
            naturalPlaybackRateRef.current = natural;
            audio.playbackRate = clampRate(natural * (narrationFastForwardRateRef.current || 1), 0.5, MAX_FAST_FORWARD_PLAYBACK_RATE);
            audioRef.current = audio;
            setPlaybackState(STATES.PLAYING);
            setCurrentChunk(text);

            startHighlightLoop(audio, prefetched.words || [], i, messageId, globalWordOffset, text, text);

            const playStart = performance.now();
            await new Promise((resolve) => {
              audio.onended = resolve;
              audio.onerror = resolve;
              audio.play().catch(resolve);
            });
            if (generationRef.current !== myGeneration || skipSegmentRef.current) break;

            const wallSeconds = (performance.now() - playStart) / 1000;
            if (wallSeconds > 0.1) {
              dispatch({ type: 'ADD_NARRATION_TIME', payload: wallSeconds });
            }

            stopHighlightLoop();
            audioRef.current = null;
            globalWordOffset += (prefetched.words || []).length;
            continue;
          }
        }

        const chunks = elevenlabsService.splitIntoParagraphs(text);
        const wordsPlayed = await playChunkPipeline(
          chunks,
          voiceId,
          undefined,
          i,
          messageId,
          dialogueSpeed,
          text,
          campaignId,
          myGeneration,
          scenePacing,
          globalWordOffset
        );
        globalWordOffset += wordsPlayed;
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
        reportNarratorError(`Narrator playback failed: ${err.message}`);
      }
      cleanup();
      queueRef.current.shift();
      processQueue();
    }
  }, [settings, state.characterVoiceMap, state.character, state.party, state.campaign, state.narratorVoiceId, viewerMode, dispatch, cleanup, playChunkPipeline, hasApiKey, reportNarratorError]);

  const speakScene = useCallback((message, messageId) => {
    queueRef.current.push({
      dialogueSegments: message.dialogueSegments || [],
      soundEffect: message.soundEffect || null,
      narrative: message.content || message.narrative || '',
      scenePacing: message.scenePacing || null,
      segmentPrefetchWindow: message.segmentPrefetchWindow || DEFAULT_SEGMENT_PREFETCH_WINDOW,
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

  const skipSegment = useCallback(() => {
    if (playbackState !== STATES.PLAYING && playbackState !== STATES.LOADING) return;
    skipSegmentRef.current = true;
    stopHighlightLoop();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.dispatchEvent(new Event('ended'));
    }
  }, [playbackState, stopHighlightLoop]);

  const speakSingle = useCallback((message, messageId) => {
    stop();
    setTimeout(() => {
      if (typeof message === 'string') {
        queueRef.current.push({
          dialogueSegments: [],
          soundEffect: null,
          narrative: message,
          scenePacing: null,
          segmentPrefetchWindow: DEFAULT_SEGMENT_PREFETCH_WINDOW,
          messageId,
        });
      } else {
        queueRef.current.push({
          dialogueSegments: message.dialogueSegments || [],
          soundEffect: message.soundEffect || null,
          narrative: message.content || message.narrative || '',
          scenePacing: message.scenePacing || null,
          segmentPrefetchWindow: message.segmentPrefetchWindow || DEFAULT_SEGMENT_PREFETCH_WINDOW,
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
    isNarratorReady: viewerMode
      ? !!((state.narratorVoiceId || settings.elevenlabsVoiceId) && backendUrl && shareToken)
      : !!(settings.narratorEnabled && hasApiKey('elevenlabs') && settings.elevenlabsVoiceId),
    speak,
    speakScene,
    speakSingle,
    pause,
    resume,
    stop,
    skipSegment,
    startNarrationFastForwardHold,
    stopNarrationFastForwardHold,
    narrationFastForwardRate,
    isNarrationFastForwardHolding: holdActiveRef.current,
    STATES,
  };
}
