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
const CHARS_PER_SECOND_ESTIMATE = 14;
const STREAMING_POLL_MS = 120;
// (removed) STREAMING_SENTENCE_END_RE: previously used to release the last
// in-flight segment early when its text ended on a sentence. That was unsafe
// because a segment can contain multiple sentences — the stream often went
// past the first period while the segment kept growing, and any further text
// added to that segment was lost (sentCount had already moved past it).
// Now we only release segments that are PROVEN complete (a later segment has
// appeared after them in the parsed JSON, or finishStreaming has been called).

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
  const [narrationSecondsRemaining, setNarrationSecondsRemaining] = useState(0);
  const remainingTextCharsRef = useRef(0);
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

  const startHighlightLoop = useCallback((audio, words, logicalSegmentIndex, messageId, wordOffset, segmentWordOffset, fullText, sentence) => {
    stopHighlightLoop();
    let lastActiveIdx = -1;
    let lastRemainingUpdate = 0;
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
      const segmentIdx = activeIdx >= 0 ? activeIdx + segmentWordOffset : -1;
      setHighlightInfo({
        messageId,
        segmentIndex: logicalSegmentIndex,
        logicalSegmentIndex,
        wordIndex: globalIdx,
        segmentWordIndex: segmentIdx,
        fullText,
        sentenceWordIndex: activeIdx,
      });
      const now = performance.now();
      if (now - lastRemainingUpdate > 1000) {
        lastRemainingUpdate = now;
        const adur = Number.isFinite(audio.duration) ? audio.duration : 0;
        const audioRemaining = Math.max(0, (adur - audio.currentTime) / (audio.playbackRate || 1));
        const textRemaining = remainingTextCharsRef.current / CHARS_PER_SECOND_ESTIMATE;
        setNarrationSecondsRemaining(Math.max(0, audioRemaining + textRemaining));
      }
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

  const playChunkPipeline = useCallback(async (chunks, voiceId, apiKey, logicalSegmentIndex, messageId, dialogueSpeed, fullText, campaignId, generation, scenePacing, initialWordOffset = 0, initialSegmentWordOffset = 0) => {
    let prefetchPromise = null;
    let wordOffset = initialWordOffset;
    let segmentWordOffset = initialSegmentWordOffset;

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

      startHighlightLoop(audio, result.words, logicalSegmentIndex, messageId, wordOffset, segmentWordOffset, fullText, chunk);

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

      const wordsCount = result.words.length;
      wordOffset += wordsCount;
      segmentWordOffset += wordsCount;
      stopHighlightLoop();
      audioRef.current = null;
      remainingTextCharsRef.current = Math.max(0, remainingTextCharsRef.current - chunk.length);
    }
    return Math.max(0, wordOffset - initialWordOffset);
  }, [startHighlightLoop, stopHighlightLoop, dispatch, fetchTts, viewerMode]);

  const processQueue = useCallback(async () => {
    const myGeneration = generationRef.current;

    if (queueRef.current.length === 0) {
      remainingTextCharsRef.current = 0;
      setNarrationSecondsRemaining(0);
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
      const fallbackVoiceId = Array.isArray(characterVoices) && characterVoices[0]?.voiceId
        ? characterVoices[0].voiceId
        : '';
      const defaultVoiceId = viewerMode
        ? (state.narratorVoiceId || elevenlabsVoiceId || fallbackVoiceId)
        : (elevenlabsVoiceId || state.narratorVoiceId || fallbackVoiceId);

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

      const normalizedSegments = segments.flatMap((seg, logicalSegmentIndex) => {
        const text = seg?.text?.trim();
        if (!text) return [];
        const chunks = splitTextIntoUtterances(text);
        if (chunks.length <= 1) return [{ ...seg, text, logicalSegmentIndex }];
        return chunks.map((chunk) => ({ ...seg, text: chunk, logicalSegmentIndex }));
      });

      remainingTextCharsRef.current = normalizedSegments.reduce((sum, seg) => sum + (seg.text?.trim()?.length || 0), 0)
        + queueRef.current.slice(1).reduce((sum, item) => sum + (item.narrative?.length || 0), 0);
      setNarrationSecondsRemaining(remainingTextCharsRef.current / CHARS_PER_SECOND_ESTIMATE);

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
      const segmentWordOffsets = new Map();

      for (let i = 0; i < normalizedSegments.length; i++) {
        if (abortRef.current || generationRef.current !== myGeneration) break;
        skipSegmentRef.current = false;

        const seg = normalizedSegments[i];
        const text = seg.text?.trim();
        if (!text) continue;
        const logicalSegmentIndex = Number.isInteger(seg.logicalSegmentIndex) ? seg.logicalSegmentIndex : i;
        const segmentWordOffset = segmentWordOffsets.get(logicalSegmentIndex) || 0;

        if (shouldSkipSegment(seg)) {
          continue;
        }

        setCurrentSegmentIndex(logicalSegmentIndex);
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

            startHighlightLoop(audio, prefetched.words || [], logicalSegmentIndex, messageId, globalWordOffset, segmentWordOffset, text, text);

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
            remainingTextCharsRef.current = Math.max(0, remainingTextCharsRef.current - text.length);
            const wordsCount = (prefetched.words || []).length;
            globalWordOffset += wordsCount;
            segmentWordOffsets.set(logicalSegmentIndex, segmentWordOffset + wordsCount);
            continue;
          }
        }

        const chunks = elevenlabsService.splitIntoParagraphs(text);
        const wordsPlayed = await playChunkPipeline(
          chunks,
          voiceId,
          undefined,
          logicalSegmentIndex,
          messageId,
          dialogueSpeed,
          text,
          campaignId,
          myGeneration,
          scenePacing,
          globalWordOffset,
          segmentWordOffset
        );
        globalWordOffset += wordsPlayed;
        segmentWordOffsets.set(logicalSegmentIndex, segmentWordOffset + wordsPlayed);
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
    // Also kill any streaming session
    if (streamingRef.current) {
      streamingRef.current.finished = true;
      streamingRef.current.segments = [];
      streamingRef.current = null;
    }
    cleanup();
    remainingTextCharsRef.current = 0;
    setNarrationSecondsRemaining(0);
    setPlaybackState(STATES.IDLE);
    setCurrentMessageId(null);
    setCurrentSegmentIndex(-1);
    setCurrentCharacter(null);
    setHighlightInfo(null);
    setCurrentChunk(null);
  }, [cleanup]);

  // --------------- Streaming narration ---------------
  // Allows feeding segments incrementally during AI streaming.
  // startStreaming(messageId, scenePacing) → pushStreamingSegments(segments) → finishStreaming()
  const streamingRef = useRef(null);
  const processStreamingQueueRef = useRef(null);

  const startStreaming = useCallback((messageId, scenePacing) => {
    stop();
    // Set up streamingRef SYNCHRONOUSLY so that pushStreamingSegments calls
    // landing in the same React commit phase (effect 2 in GameplayPage runs
    // right after effect 1 which calls this) can find the buffer immediately.
    // Defer only the queue start by a microtask so React can finish the commit.
    streamingRef.current = {
      messageId,
      scenePacing: scenePacing || null,
      segments: [],       // buffer of segments not yet consumed
      sentCount: 0,       // how many segments have been pushed total
      finished: false,    // set to true when stream ends
    };
    abortRef.current = false;
    Promise.resolve().then(() => processStreamingQueueRef.current?.());
  }, [stop]);

  const pushStreamingSegments = useCallback((segments) => {
    const s = streamingRef.current;
    if (!s) return;
    // Only push segments we haven't seen yet
    const newSegments = segments.slice(s.sentCount);
    if (newSegments.length === 0) return;
    // A segment is PROVEN complete only when a later segment has appeared
    // after it in the parsed JSON (meaning the model closed it and moved on).
    // While streaming, always withhold the last segment — its text can still
    // grow, and once pushed we can't retroactively extend it in the playback
    // queue. finishStreaming() flushes the tail at the end.
    let safeCount = newSegments.length;
    if (!s.finished) safeCount -= 1;
    if (safeCount > 0) {
      s.segments.push(...newSegments.slice(0, safeCount));
      s.sentCount += safeCount;
    }
  }, []);

  const finishStreaming = useCallback((finalSegments) => {
    const s = streamingRef.current;
    if (!s) return;
    s.finished = true;
    // Push any remaining segments we haven't sent yet
    if (finalSegments) {
      const remaining = finalSegments.slice(s.sentCount);
      if (remaining.length > 0) {
        s.segments.push(...remaining);
        s.sentCount += remaining.length;
      }
    }
  }, []);

  const processStreamingQueue = useCallback(async () => {
    const s = streamingRef.current;
    if (!s) return;

    const myGeneration = generationRef.current;

    const { elevenlabsVoiceId, characterVoices, dialogueSpeed } = settings;
    const fallbackVoiceId = Array.isArray(characterVoices) && characterVoices[0]?.voiceId
      ? characterVoices[0].voiceId
      : '';
    const defaultVoiceId = viewerMode
      ? (state.narratorVoiceId || elevenlabsVoiceId || fallbackVoiceId)
      : (elevenlabsVoiceId || state.narratorVoiceId || fallbackVoiceId);

    if (!defaultVoiceId || (!viewerMode && !hasApiKey('elevenlabs'))) {
      reportNarratorError('Narrator unavailable: configure ElevenLabs voice and backend key in Settings.');
      streamingRef.current = null;
      return;
    }

    const campaignId = state.campaign?.backendId || null;
    const localVoiceMap = new Map();
    const playerCharNames = viewerMode ? [] : (state.party || [state.character])
      .map(c => c?.name?.toLowerCase())
      .filter(Boolean);

    const shouldSkipSeg = (seg) => (
      !viewerMode
      && seg?.type === 'dialogue'
      && hasNamedSpeaker(seg.character)
      && playerCharNames.includes(seg.character.toLowerCase())
    );

    const resolveSegVoice = (seg) => {
      if (seg?.voiceId) return seg.voiceId;
      if (seg?.type === 'dialogue' && hasNamedSpeaker(seg.character)) {
        const existing = state.characterVoiceMap?.[seg.character];
        if (existing?.voiceId) return existing.voiceId;
        if (!viewerMode && characterVoices?.length > 0) {
          const mapped = resolveVoiceForCharacter(
            seg.character, seg.gender, state.characterVoiceMap,
            localVoiceMap, characterVoices, dispatch
          );
          if (mapped) return mapped;
        }
      }
      return defaultVoiceId;
    };

    setCurrentMessageId(s.messageId);
    let globalWordOffset = 0;

    // Main loop: consume segments from the growing buffer
    while (true) {
      if (abortRef.current || generationRef.current !== myGeneration) break;

      // Grab next segment from buffer
      const seg = s.segments.shift();
      if (!seg) {
        // Buffer empty — are we done?
        if (s.finished) break;
        // Wait for more data
        setPlaybackState(s.sentCount === 0 ? STATES.LOADING : STATES.PLAYING);
        await new Promise(r => setTimeout(r, STREAMING_POLL_MS));
        continue;
      }

      const text = seg.text?.trim();
      if (!text || shouldSkipSeg(seg)) continue;

      setPlaybackState(STATES.LOADING);
      setCurrentSegmentIndex(seg.logicalSegmentIndex ?? 0);
      setCurrentCharacter(seg.type === 'dialogue' && hasNamedSpeaker(seg.character) ? seg.character : null);

      const voiceId = resolveSegVoice(seg);
      const utterances = splitTextIntoUtterances(text);

      for (let u = 0; u < utterances.length; u++) {
        if (abortRef.current || generationRef.current !== myGeneration) break;

        const chunk = utterances[u];
        // Prefetch next utterance
        let nextPrefetch = null;
        const nextChunk = utterances[u + 1];
        if (nextChunk) {
          nextPrefetch = fetchTts(voiceId, nextChunk, campaignId, s.scenePacing).catch(() => null);
        }

        const result = await fetchTts(voiceId, chunk, campaignId, s.scenePacing);
        if (!result || abortRef.current || generationRef.current !== myGeneration) break;

        if (!viewerMode) {
          dispatch({ type: 'ADD_AI_COST', payload: calculateCost('tts', { charCount: chunk.length }) });
        }
        objectUrlsRef.current.push(result.audioUrl);
        const audio = new Audio(result.audioUrl);
        const baseRate = (dialogueSpeed || 100) / 100;
        const pacingMul = PACING_SPEED_MULTIPLIERS[s.scenePacing] || 1.0;
        const natural = clampRate(baseRate * pacingMul, 0.5, MAX_NATURAL_PLAYBACK_RATE);
        naturalPlaybackRateRef.current = natural;
        audio.playbackRate = clampRate(natural * (narrationFastForwardRateRef.current || 1), 0.5, MAX_FAST_FORWARD_PLAYBACK_RATE);
        audioRef.current = audio;
        setPlaybackState(STATES.PLAYING);
        setCurrentChunk(chunk);

        startHighlightLoop(audio, result.words || [], seg.logicalSegmentIndex ?? 0, s.messageId, globalWordOffset, 0, text, chunk);

        const playStart = performance.now();
        await new Promise((resolve) => {
          audio.onended = resolve;
          audio.onerror = resolve;
          audio.play().catch(resolve);
        });
        if (abortRef.current || generationRef.current !== myGeneration) break;

        const wallSeconds = (performance.now() - playStart) / 1000;
        if (wallSeconds > 0.1) {
          dispatch({ type: 'ADD_NARRATION_TIME', payload: wallSeconds });
        }
        stopHighlightLoop();
        audioRef.current = null;
        globalWordOffset += (result.words || []).length;
      }
    }

    // Cleanup streaming session
    streamingRef.current = null;
    if (generationRef.current === myGeneration) {
      cleanup();
      setPlaybackState(STATES.IDLE);
      setCurrentMessageId(null);
      setCurrentSegmentIndex(-1);
      setCurrentCharacter(null);
      setHighlightInfo(null);
      setCurrentChunk(null);
    }
  }, [settings, state.characterVoiceMap, state.character, state.party, state.campaign, state.narratorVoiceId, viewerMode, dispatch, cleanup, startHighlightLoop, stopHighlightLoop, fetchTts, hasApiKey, reportNarratorError]);

  processStreamingQueueRef.current = processStreamingQueue;

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
    narrationSecondsRemaining,
    currentMessageId,
    currentSegmentIndex,
    currentCharacter,
    highlightInfo,
    currentChunk,
    isNarratorReady: viewerMode
      ? !!(
          (state.narratorVoiceId || settings.elevenlabsVoiceId || settings.characterVoices?.[0]?.voiceId)
          && backendUrl
          && shareToken
        )
      : !!(
          settings.narratorEnabled
          && hasApiKey('elevenlabs')
          && (settings.elevenlabsVoiceId || settings.characterVoices?.[0]?.voiceId)
        ),
    speak,
    speakScene,
    speakSingle,
    pause,
    resume,
    stop,
    skipSegment,
    startStreaming,
    pushStreamingSegments,
    finishStreaming,
    isStreaming: !!streamingRef.current,
    startNarrationFastForwardHold,
    stopNarrationFastForwardHold,
    narrationFastForwardRate,
    isNarrationFastForwardHolding: holdActiveRef.current,
    STATES,
  };
}
