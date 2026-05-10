import { useState, useCallback, useRef, useEffect } from 'react';
import { useSettings } from '../contexts/SettingsContext';
import { useGame } from '../contexts/GameContext';
import { elevenlabsService } from '../services/elevenlabs';
import { xttsService } from '../services/xtts';
import { apiClient } from '../services/apiClient';
import { calculateCost } from '../services/costTracker';
import {
  reassignVoiceOnError,
  isVoiceNotFoundError,
  resolveSegmentVoice as resolveSegmentVoiceShared,
} from '../services/characterVoiceResolver';
import { hasNamedSpeaker } from '../services/dialogueSegments';
import {
  registerMainNarratorStop,
  silencePeerDialogAudio,
  beginDialogSession,
  setDialogSessionState,
  endDialogSession,
} from '../utils/readAloudExclusive';

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

// Starts playback only once the browser has buffered enough to play through,
// which eliminates the first-chunk stutter caused by calling .play()
// immediately after assigning src. Falls back to `canplay` + small delay if
// `canplaythrough` never fires (short clips over fast connections).
function playAudioWithBuffer(audio) {
  return new Promise((resolve) => {
    let started = false;
    let resolved = false;

    const cleanup = () => {
      audio.removeEventListener('canplaythrough', onCanPlayThrough);
      audio.removeEventListener('canplay', onCanPlay);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
    };

    const finish = () => {
      if (resolved) return;
      resolved = true;
      cleanup();
      resolve();
    };

    const start = () => {
      if (started || resolved) return;
      started = true;
      audio.play().catch(finish);
    };

    function onCanPlayThrough() { start(); }
    function onCanPlay() {
      // Short MP3s often don't emit canplaythrough; give the decoder a brief
      // head start, then begin playback.
      setTimeout(start, 60);
    }
    function onEnded() { finish(); }
    function onError() { finish(); }

    audio.addEventListener('canplaythrough', onCanPlayThrough, { once: true });
    audio.addEventListener('canplay', onCanPlay, { once: true });
    audio.addEventListener('ended', onEnded, { once: true });
    audio.addEventListener('error', onError, { once: true });

    audio.preload = 'auto';
    audio.load();

    // Hard fallback: if neither canplay nor canplaythrough fires within 2s
    // (e.g. browser already cached the clip and fired events before we
    // attached listeners), try to play anyway.
    setTimeout(start, 2000);
  });
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

const KNOWN_TTS_PROVIDERS = ['elevenlabs', 'xtts'];

export function useNarrator({ viewerMode = false, shareToken = null, backendUrl = null } = {}) {
  const { settings, hasApiKey, voicePools } = useSettings();
  const { state, dispatch } = useGame();

  // sceneTtsTier is the user's provider pick from "Koszt sceny".
  // Fall back to legacy ttsProvider for backward compat.
  const activeTtsProvider = KNOWN_TTS_PROVIDERS.includes(settings.sceneTtsTier)
    ? settings.sceneTtsTier
    : (settings.ttsProvider || 'elevenlabs');
  const [playbackState, setPlaybackStateRaw] = useState(STATES.IDLE);
  const [currentMessageId, setCurrentMessageIdRaw] = useState(null);
  const [currentSegmentIndex, setCurrentSegmentIndexRaw] = useState(-1);
  const [currentCharacter, setCurrentCharacter] = useState(null);
  const [highlightInfo, setHighlightInfo] = useState(null);
  const [currentChunk, setCurrentChunk] = useState(null);

  const coordinatorSessionRef = useRef(null);

  const setPlaybackState = useCallback((nextState) => {
    setPlaybackStateRaw(nextState);
    const sid = coordinatorSessionRef.current;
    if (nextState === STATES.IDLE) {
      if (sid != null) { endDialogSession(sid); coordinatorSessionRef.current = null; }
    } else if (sid != null) {
      setDialogSessionState(sid, nextState);
    }
  }, []);

  const setCurrentMessageId = useCallback((msgId) => {
    setCurrentMessageIdRaw(msgId);
    const sid = coordinatorSessionRef.current;
    if (sid != null) setDialogSessionState(sid, undefined, { messageId: msgId });
  }, []);

  const setCurrentSegmentIndex = useCallback((idx) => {
    setCurrentSegmentIndexRaw(idx);
    const sid = coordinatorSessionRef.current;
    if (sid != null) setDialogSessionState(sid, undefined, { segmentIndex: idx });
  }, []);

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
  const loadingSegmentsRef = useRef(new Set());
  const [loadingSegmentIndices, setLoadingSegmentIndices] = useState(new Set());
  const markSegmentLoading = useCallback((idx) => {
    loadingSegmentsRef.current.add(idx);
    setLoadingSegmentIndices(new Set(loadingSegmentsRef.current));
  }, []);
  const unmarkSegmentLoading = useCallback((idx) => {
    if (!loadingSegmentsRef.current.has(idx)) return;
    loadingSegmentsRef.current.delete(idx);
    setLoadingSegmentIndices(new Set(loadingSegmentsRef.current));
  }, []);
  const clearLoadingSegments = useCallback(() => {
    if (loadingSegmentsRef.current.size === 0) return;
    loadingSegmentsRef.current = new Set();
    setLoadingSegmentIndices(new Set());
  }, []);
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
    let lastEmittedIdx = -2;
    let lastRemainingUpdate = 0;

    if (!words || words.length === 0) {
      setHighlightInfo({
        messageId,
        segmentIndex: logicalSegmentIndex,
        logicalSegmentIndex,
        wordIndex: -1,
        segmentWordIndex: -1,
        segmentActive: true,
        fullText,
      });
      const tickNoWords = () => {
        if (!audio || audio.ended) {
          setHighlightInfo(null);
          return;
        }
        if (audio.paused) {
          highlightRafRef.current = requestAnimationFrame(tickNoWords);
          return;
        }
        const now = performance.now();
        if (now - lastRemainingUpdate > 1000) {
          lastRemainingUpdate = now;
          const adur = Number.isFinite(audio.duration) ? audio.duration : 0;
          const audioRemaining = Math.max(0, (adur - audio.currentTime) / (audio.playbackRate || 1));
          const textRemaining = remainingTextCharsRef.current / CHARS_PER_SECOND_ESTIMATE;
          setNarrationSecondsRemaining(Math.max(0, audioRemaining + textRemaining));
        }
        highlightRafRef.current = requestAnimationFrame(tickNoWords);
      };
      highlightRafRef.current = requestAnimationFrame(tickNoWords);
      return;
    }

    const tick = () => {
      if (!audio || audio.ended) {
        setHighlightInfo(null);
        return;
      }
      if (audio.paused) {
        highlightRafRef.current = requestAnimationFrame(tick);
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
      if (activeIdx !== lastEmittedIdx) {
        lastEmittedIdx = activeIdx;
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
      }
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
    clearLoadingSegments();
    if (audioRef.current) {
      const a = audioRef.current;
      audioRef.current = null;
      a.dispatchEvent(new Event('ended'));
      a.pause();
      a.removeAttribute('src');
    }
    objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    objectUrlsRef.current = [];
  }, [stopHighlightLoop, stopHoldLoop, clearLoadingSegments]);

  useEffect(() => {
    return () => {
      cleanup();
      abortRef.current = true;
      if (coordinatorSessionRef.current != null) {
        endDialogSession(coordinatorSessionRef.current);
        coordinatorSessionRef.current = null;
      }
    };
  }, [cleanup]);

  useEffect(() => {
    const handleUnload = () => {
      abortRef.current = true;
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.removeAttribute('src');
        audioRef.current = null;
      }
    };
    window.addEventListener('beforeunload', handleUnload);
    return () => window.removeEventListener('beforeunload', handleUnload);
  }, []);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = (settings.dialogueVolume ?? 80) / 100;
    }
  }, [settings.dialogueVolume]);

  const fetchTts = useCallback(async (voiceId, chunk, campaignId, pacing) => {
    if (viewerMode && backendUrl && shareToken) {
      return elevenlabsService.textToSpeechFromCache(backendUrl, shareToken, voiceId, chunk, undefined, campaignId);
    }
    if (activeTtsProvider === 'xtts') {
      const speed = (settings.dialogueSpeed || 100) / 100;
      return xttsService.textToSpeech(voiceId, chunk, settings.language || 'pl', campaignId, speed);
    }
    return elevenlabsService.textToSpeechWithTimestamps(undefined, voiceId, chunk, undefined, campaignId, pacing);
  }, [viewerMode, backendUrl, shareToken, activeTtsProvider, settings.language, settings.dialogueSpeed]);

  const fetchTtsWithRecovery = useCallback(async (voiceId, chunk, campaignId, pacing, segCtx) => {
    try {
      return await fetchTts(voiceId, chunk, campaignId, pacing);
    } catch (err) {
      if (!isVoiceNotFoundError(err) || !segCtx) throw err;
      if (segCtx.type === 'narration' || !segCtx.characterName) throw err;

      const newVoiceId = reassignVoiceOnError(
        segCtx.characterName,
        voiceId,
        segCtx.gender || null,
        state.characterVoiceMap || {},
        { maleVoices: voicePools.maleVoices, femaleVoices: voicePools.femaleVoices, narratorVoiceId: voicePools.narratorVoiceId, ttsProvider: activeTtsProvider },
        dispatch
      );
      if (!newVoiceId) throw err;
      if (segCtx.onVoiceReassigned) segCtx.onVoiceReassigned(newVoiceId);
      return await fetchTts(newVoiceId, chunk, campaignId, pacing);
    }
  }, [fetchTts, settings, voicePools, state.characterVoiceMap, dispatch]);

  const playChunkPipeline = useCallback(async (chunks, voiceId, apiKey, logicalSegmentIndex, messageId, dialogueSpeed, fullText, campaignId, generation, scenePacing, initialWordOffset = 0, initialSegmentWordOffset = 0, segCtx = null) => {
    let prefetchPromise = null;
    let wordOffset = initialWordOffset;
    let segmentWordOffset = initialSegmentWordOffset;
    let activeVoiceId = voiceId;

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
        markSegmentLoading(logicalSegmentIndex);
        result = await fetchTtsWithRecovery(activeVoiceId, chunk, campaignId, scenePacing, segCtx ? { ...segCtx, onVoiceReassigned: (v) => { activeVoiceId = v; } } : null);
      }
      if (generationRef.current !== generation || skipSegmentRef.current) break;

      if (!result) {
        result = await fetchTtsWithRecovery(activeVoiceId, chunk, campaignId, scenePacing, segCtx ? { ...segCtx, onVoiceReassigned: (v) => { activeVoiceId = v; } } : null);
      }
      if (generationRef.current !== generation || skipSegmentRef.current) break;
      if (!result) continue;

      unmarkSegmentLoading(logicalSegmentIndex);

      if (!viewerMode) {
        dispatch({ type: 'ADD_AI_COST', payload: calculateCost('tts', { charCount: chunk.length }) });
      }
      const playableAudioUrl = apiClient.resolveMediaUrl(result.audioUrl);
      objectUrlsRef.current.push(playableAudioUrl);
      if (abortRef.current || skipSegmentRef.current || generationRef.current !== generation) break;

      if (s + 1 < chunks.length && chunks[s + 1]?.trim()) {
        prefetchPromise = fetchTts(activeVoiceId, chunks[s + 1].trim(), campaignId, scenePacing)
          .catch((err) => {
            console.warn('Prefetch TTS failed:', err.message);
            return null;
          });
      }

      const audio = new Audio(playableAudioUrl);
      audio.volume = (settings.dialogueVolume ?? 80) / 100;
      const baseRate = (dialogueSpeed || 100) / 100;
      const pacingMul = PACING_SPEED_MULTIPLIERS[scenePacing] || 1.0;
      const natural = clampRate(baseRate * pacingMul, 0.5, MAX_NATURAL_PLAYBACK_RATE);
      naturalPlaybackRateRef.current = natural;
      audio.playbackRate = clampRate(natural * (narrationFastForwardRateRef.current || 1), 0.5, MAX_FAST_FORWARD_PLAYBACK_RATE);
      if (audioRef.current && !audioRef.current.ended) {
        audioRef.current.pause();
      }
      audioRef.current = audio;
      setPlaybackState(STATES.PLAYING);
      setCurrentChunk(chunk);

      startHighlightLoop(audio, result.words, logicalSegmentIndex, messageId, wordOffset, segmentWordOffset, fullText, chunk);

      const playStart = performance.now();
      await playAudioWithBuffer(audio);
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
  }, [startHighlightLoop, stopHighlightLoop, dispatch, fetchTts, fetchTtsWithRecovery, viewerMode, markSegmentLoading, unmarkSegmentLoading]);

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

    silencePeerDialogAudio();

    const item = queueRef.current[0];
    const { dialogueSegments, narrative, messageId, scenePacing, segmentPrefetchWindow } = item;

    const csid = beginDialogSession({ source: 'narrator', messageId });
    coordinatorSessionRef.current = csid;

    setCurrentMessageId(messageId);
    setPlaybackState(STATES.LOADING);

      const { dialogueSpeed } = settings;
      const narratorVoiceId = voicePools.narratorVoiceId;
      const maleVoices = voicePools.maleVoices;
      const femaleVoices = voicePools.femaleVoices;
      const allProviderVoiceIds = new Set([
        ...(maleVoices || []).map((v) => v.voiceId),
        ...(femaleVoices || []).map((v) => v.voiceId),
        ...(narratorVoiceId ? [narratorVoiceId] : []),
      ].filter(Boolean));
      const stateNarratorValid = state.narratorVoiceId
        && allProviderVoiceIds.size > 0 && allProviderVoiceIds.has(state.narratorVoiceId);
      const defaultVoiceId = viewerMode
        ? ((stateNarratorValid && state.narratorVoiceId) || narratorVoiceId)
        : (narratorVoiceId || (stateNarratorValid && state.narratorVoiceId));

      if (!defaultVoiceId || (!viewerMode && !hasApiKey(activeTtsProvider))) {
        reportNarratorError(`Narrator unavailable: configure a voice and ${activeTtsProvider} backend key in Settings.`);
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

      const playerCharNames = viewerMode ? [] : (state.party || [state.character])
        .map(c => c?.name?.toLowerCase())
        .filter(Boolean);

      const utterancePrefetchWindow = Math.max(
        1,
        Math.min(6, Number(segmentPrefetchWindow) || DEFAULT_SEGMENT_PREFETCH_WINDOW)
      );
      const prefetchMap = new Map();

      const buildPrefetchKey = (voiceId, text) => `${voiceId || ''}::${text || ''}`;
      const scheduleUtterancePrefetch = (voiceId, text, campaignIdForFetch, segIdx) => {
        const key = buildPrefetchKey(voiceId, text);
        if (prefetchMap.has(key)) return key;
        if (Number.isInteger(segIdx)) markSegmentLoading(segIdx);
        prefetchMap.set(
          key,
          fetchTts(voiceId, text, campaignIdForFetch, scenePacing)
            .then((res) => { if (Number.isInteger(segIdx)) unmarkSegmentLoading(segIdx); return res; })
            .catch((err) => {
              if (Number.isInteger(segIdx)) unmarkSegmentLoading(segIdx);
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

      // Local copy of the voice map so we can update it synchronously within
      // this run of processQueue. Without it, multiple dialogue segments from
      // the same new NPC each see an empty Redux closure and pick different
      // random voices before any dispatch lands.
      const localVoiceMap = { ...(state.characterVoiceMap || {}) };

      const resolveSegmentVoice = (seg) => {
        const { voiceId, persistMapping } = resolveSegmentVoiceShared(seg, {
          defaultVoiceId,
          narratorVoiceId,
          maleVoices,
          femaleVoices,
          characterVoiceMap: localVoiceMap,
          ttsProvider: activeTtsProvider,
          viewerMode,
          dispatch,
        });
        if (persistMapping) {
          localVoiceMap[persistMapping.characterName] = {
            voiceId: persistMapping.voiceId,
            gender: persistMapping.gender,
          };
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
          const currentKey = scheduleUtterancePrefetch(voiceId, text, campaignId, logicalSegmentIndex);
          for (let lookAhead = 1; lookAhead < utterancePrefetchWindow; lookAhead += 1) {
            const nextSeg = normalizedSegments[i + lookAhead];
            const nextText = nextSeg?.text?.trim();
            if (!nextSeg || !nextText || shouldSkipSegment(nextSeg)) continue;
            const nextVoiceId = resolveSegmentVoice(nextSeg);
            const nextLogicalIdx = Number.isInteger(nextSeg.logicalSegmentIndex) ? nextSeg.logicalSegmentIndex : (i + lookAhead);
            scheduleUtterancePrefetch(nextVoiceId, nextText, campaignId, nextLogicalIdx);
          }

          let prefetched = prefetchMap.get(currentKey)
            ? await prefetchMap.get(currentKey)
            : null;
          prefetchMap.delete(currentKey);

          if (generationRef.current !== myGeneration || skipSegmentRef.current) break;
          if (!prefetched) {
            prefetched = await fetchTtsWithRecovery(voiceId, text, campaignId, scenePacing, { type: seg.type, characterName: seg.character || null, gender: seg.gender || null });
          }
          if (generationRef.current !== myGeneration || skipSegmentRef.current) break;

          if (prefetched) {
            if (!viewerMode) {
              dispatch({ type: 'ADD_AI_COST', payload: calculateCost('tts', { charCount: text.length }) });
            }
            const playableAudioUrl = apiClient.resolveMediaUrl(prefetched.audioUrl);
            objectUrlsRef.current.push(playableAudioUrl);
            const audio = new Audio(playableAudioUrl);
            audio.volume = (settings.dialogueVolume ?? 80) / 100;
            const baseRate = (dialogueSpeed || 100) / 100;
            const pacingMul = PACING_SPEED_MULTIPLIERS[scenePacing] || 1.0;
            const natural = clampRate(baseRate * pacingMul, 0.5, MAX_NATURAL_PLAYBACK_RATE);
            naturalPlaybackRateRef.current = natural;
            audio.playbackRate = clampRate(natural * (narrationFastForwardRateRef.current || 1), 0.5, MAX_FAST_FORWARD_PLAYBACK_RATE);
            if (audioRef.current && !audioRef.current.ended) {
              audioRef.current.pause();
            }
            audioRef.current = audio;
            setPlaybackState(STATES.PLAYING);
            setCurrentChunk(text);

            startHighlightLoop(audio, prefetched.words || [], logicalSegmentIndex, messageId, globalWordOffset, segmentWordOffset, text, text);

            const playStart = performance.now();
            await playAudioWithBuffer(audio);
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
          segmentWordOffset,
          { type: seg.type, characterName: seg.character || null, gender: seg.gender || null }
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
  }, [settings, voicePools, state.characterVoiceMap, state.character, state.party, state.campaign, state.narratorVoiceId, viewerMode, dispatch, cleanup, playChunkPipeline, fetchTtsWithRecovery, hasApiKey, reportNarratorError, markSegmentLoading, unmarkSegmentLoading]);

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

  const stopNarratorPlayback = useCallback(() => {
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

  const stop = useCallback(() => {
    stopNarratorPlayback();
    silencePeerDialogAudio();
  }, [stopNarratorPlayback]);

  useEffect(() => registerMainNarratorStop(stopNarratorPlayback), [stopNarratorPlayback]);

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
    // Remember the latest raw parsed stream so finishStreaming can flush the
    // withheld tail from the SAME list that drove sentCount. The DM segments
    // that later land in chatHistory go through processSceneDialogue (player
    // dialogue inserted, narration echo removed, text mutated), so their
    // indices no longer align with sentCount and can't be used for flushing.
    s.lastRawSegments = segments;
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

  const finishStreaming = useCallback(() => {
    const s = streamingRef.current;
    if (!s) return;
    s.finished = true;
    // Flush the one segment that was withheld during streaming. Use the raw
    // stream buffer — its indices are positionally consistent with sentCount.
    const raw = s.lastRawSegments || [];
    const remaining = raw.slice(s.sentCount);
    if (remaining.length > 0) {
      s.segments.push(...remaining);
      s.sentCount += remaining.length;
    }
  }, []);

  const processStreamingQueue = useCallback(async () => {
    const s = streamingRef.current;
    if (!s) return;

    const myGeneration = generationRef.current;

    const { dialogueSpeed } = settings;
    const narratorVoiceId = voicePools.narratorVoiceId;
    const maleVoices = voicePools.maleVoices;
    const femaleVoices = voicePools.femaleVoices;
    const allProviderVoiceIds = new Set([
      ...(maleVoices || []).map((v) => v.voiceId),
      ...(femaleVoices || []).map((v) => v.voiceId),
      ...(narratorVoiceId ? [narratorVoiceId] : []),
    ].filter(Boolean));
    const stateNarratorValid = state.narratorVoiceId
      && allProviderVoiceIds.size > 0 && allProviderVoiceIds.has(state.narratorVoiceId);
    const defaultVoiceId = viewerMode
      ? ((stateNarratorValid && state.narratorVoiceId) || narratorVoiceId)
      : (narratorVoiceId || (stateNarratorValid && state.narratorVoiceId));

    if (!defaultVoiceId || (!viewerMode && !hasApiKey(activeTtsProvider))) {
      reportNarratorError(`Narrator unavailable: configure a voice and ${activeTtsProvider} backend key in Settings.`);
      streamingRef.current = null;
      return;
    }

    const campaignId = state.campaign?.backendId || null;

    const playerCharNames = viewerMode ? [] : (state.party || [state.character])
      .map(c => c?.name?.toLowerCase())
      .filter(Boolean);

    const shouldSkipSeg = (seg) => (
      !viewerMode
      && seg?.type === 'dialogue'
      && hasNamedSpeaker(seg.character)
      && playerCharNames.includes(seg.character.toLowerCase())
    );

    // See processQueue: shared closure of state.characterVoiceMap is stale
    // within one streaming run, so consecutive segments from the same NPC
    // would each pick a different random voice. Mirror the local-map fix.
    const localVoiceMap = { ...(state.characterVoiceMap || {}) };

    const resolveSegVoice = (seg) => {
      const { voiceId, persistMapping } = resolveSegmentVoiceShared(seg, {
        defaultVoiceId,
        narratorVoiceId,
        maleVoices,
        femaleVoices,
        characterVoiceMap: localVoiceMap,
        ttsProvider: activeTtsProvider,
        viewerMode,
        dispatch,
      });
      if (persistMapping) {
        localVoiceMap[persistMapping.characterName] = {
          voiceId: persistMapping.voiceId,
          gender: persistMapping.gender,
        };
      }
      return voiceId;
    };

    const csid = beginDialogSession({ source: 'narrator', messageId: s.messageId });
    coordinatorSessionRef.current = csid;

    setCurrentMessageId(s.messageId);
    let globalWordOffset = 0;

    try {
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

      const streamSegIdx = seg.logicalSegmentIndex ?? 0;
      setPlaybackState(STATES.LOADING);
      markSegmentLoading(streamSegIdx);
      setCurrentSegmentIndex(streamSegIdx);
      setCurrentCharacter(seg.type === 'dialogue' && hasNamedSpeaker(seg.character) ? seg.character : null);

      const voiceId = resolveSegVoice(seg);
      const utterances = splitTextIntoUtterances(text);

      let prefetchPromise = null;
      for (let u = 0; u < utterances.length; u++) {
        if (abortRef.current || generationRef.current !== myGeneration) break;

        const chunk = utterances[u];

        let result;
        if (prefetchPromise) {
          result = await prefetchPromise;
          prefetchPromise = null;
        }
        if (!result) {
          result = await fetchTtsWithRecovery(voiceId, chunk, campaignId, s.scenePacing, { type: seg.type, characterName: seg.character || null, gender: seg.gender || null });
        }
        if (!result || abortRef.current || generationRef.current !== myGeneration) break;

        unmarkSegmentLoading(streamSegIdx);

        const nextChunk = utterances[u + 1];
        if (nextChunk) {
          prefetchPromise = fetchTts(voiceId, nextChunk, campaignId, s.scenePacing).catch(() => null);
        }

        if (!viewerMode) {
          dispatch({ type: 'ADD_AI_COST', payload: calculateCost('tts', { charCount: chunk.length }) });
        }
        const playableAudioUrl = apiClient.resolveMediaUrl(result.audioUrl);
        objectUrlsRef.current.push(playableAudioUrl);
        const audio = new Audio(playableAudioUrl);
        audio.volume = (settings.dialogueVolume ?? 80) / 100;
        const baseRate = (dialogueSpeed || 100) / 100;
        const pacingMul = PACING_SPEED_MULTIPLIERS[s.scenePacing] || 1.0;
        const natural = clampRate(baseRate * pacingMul, 0.5, MAX_NATURAL_PLAYBACK_RATE);
        naturalPlaybackRateRef.current = natural;
        audio.playbackRate = clampRate(natural * (narrationFastForwardRateRef.current || 1), 0.5, MAX_FAST_FORWARD_PLAYBACK_RATE);
        if (audioRef.current && !audioRef.current.ended) {
          audioRef.current.pause();
        }
        audioRef.current = audio;
        setPlaybackState(STATES.PLAYING);
        setCurrentChunk(chunk);

        startHighlightLoop(audio, result.words || [], seg.logicalSegmentIndex ?? 0, s.messageId, globalWordOffset, 0, text, chunk);

        const playStart = performance.now();
        await playAudioWithBuffer(audio);
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
    } catch (err) {
      if (generationRef.current !== myGeneration) return;
      if (err.name !== 'AbortError') {
        console.warn('Narrator streaming TTS error:', err.message);
        reportNarratorError(`Narrator playback failed: ${err.message}`);
      }
      cleanup();
      streamingRef.current = null;
      setPlaybackState(STATES.IDLE);
      setCurrentMessageId(null);
      setCurrentSegmentIndex(-1);
      setCurrentCharacter(null);
      setHighlightInfo(null);
      setCurrentChunk(null);
      return;
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
  }, [settings, voicePools, state.characterVoiceMap, state.character, state.party, state.campaign, state.narratorVoiceId, viewerMode, dispatch, cleanup, startHighlightLoop, stopHighlightLoop, fetchTts, fetchTtsWithRecovery, hasApiKey, reportNarratorError, markSegmentLoading, unmarkSegmentLoading]);

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
    loadingSegmentIndices,
    isNarratorReady: viewerMode
      ? !!(
          (state.narratorVoiceId || voicePools.narratorVoiceId)
          && backendUrl
          && shareToken
        )
      : !!(
          settings.narratorEnabled
          && hasApiKey(activeTtsProvider)
          && voicePools.narratorVoiceId
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
