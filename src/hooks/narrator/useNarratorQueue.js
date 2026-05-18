import { useState, useCallback, useRef, useEffect } from 'react';
import { elevenlabsService } from '../../services/elevenlabs';
import { apiClient } from '../../services/apiClient';
import { calculateCost } from '../../services/costTracker';
import { hasNamedSpeaker } from '../../services/dialogueSegments';
import {
  registerMainNarratorStop,
  silencePeerDialogAudio,
  beginDialogSession,
  setDialogSessionState,
  endDialogSession,
} from '../../utils/readAloudExclusive';
import {
  STATES,
  PACING_SPEED_MULTIPLIERS,
  CHARS_PER_SECOND_ESTIMATE,
  MAX_NATURAL_PLAYBACK_RATE,
  DEFAULT_SEGMENT_PREFETCH_WINDOW,
  STREAMING_POLL_MS,
  clampRate,
  playAudioWithBuffer,
  splitTextIntoUtterances,
} from './narratorUtils';

export function useNarratorQueue({
  viewerMode,
  voice,
  playback,
  settings,
  voicePools,
  perVoiceVolumes,
  state,
  dispatch,
  hasApiKey,
  coordinatorSessionRef,
}) {
  const {
    fetchTts,
    fetchTtsWithRecovery,
    activeTtsProvider,
    resolveDefaultVoiceId,
    createLocalVoiceResolver,
  } = voice;

  const {
    setPlaybackState,
    setHighlightInfo,
    setCurrentChunk,
    setNarrationSecondsRemaining,
    startHighlightLoop,
    stopHighlightLoop,
    applyPlaybackRate,
    cleanup,
    audioRef,
    objectUrlsRef,
    naturalPlaybackRateRef,
    narrationFastForwardRateRef,
    remainingTextCharsRef,
    skipSegmentRef,
    playbackState,
  } = playback;

  const [currentMessageId, setCurrentMessageIdRaw] = useState(null);
  const [currentSegmentIndex, setCurrentSegmentIndexRaw] = useState(-1);
  const [currentCharacter, setCurrentCharacter] = useState(null);
  const [loadingSegmentIndices, setLoadingSegmentIndices] = useState(new Set());

  const [isStreamingState, setIsStreamingState] = useState(false);

  const queueRef = useRef([]);
  const abortRef = useRef(false);
  const generationRef = useRef(0);
  const loadingSegmentsRef = useRef(new Set());
  const streamingRef = useRef(null);
  const processStreamingQueueRef = useRef(null);
  const perVoiceVolumesRef = useRef(perVoiceVolumes);
  perVoiceVolumesRef.current = perVoiceVolumes;

  const computeVolume = (voiceId) => {
    const base = (settings.dialogueVolume ?? 80) / 100;
    const voiceMul = (perVoiceVolumesRef.current?.[voiceId] ?? 100) / 100;
    return base * voiceMul;
  };

  const setCurrentMessageId = useCallback((msgId) => {
    setCurrentMessageIdRaw(msgId);
    const sid = coordinatorSessionRef.current;
    if (sid != null) setDialogSessionState(sid, undefined, { messageId: msgId });
  }, [coordinatorSessionRef]);

  const setCurrentSegmentIndex = useCallback((idx) => {
    setCurrentSegmentIndexRaw(idx);
    const sid = coordinatorSessionRef.current;
    if (sid != null) setDialogSessionState(sid, undefined, { segmentIndex: idx });
  }, [coordinatorSessionRef]);

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

  // In the original monolith, cleanup() called clearLoadingSegments().
  // Since they now live in different hooks, combine them here.
  const fullCleanup = useCallback(() => {
    cleanup();
    clearLoadingSegments();
  }, [cleanup, clearLoadingSegments]);

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
      audio._voiceId = activeVoiceId;
      audio.volume = computeVolume(activeVoiceId);
      const baseRate = (dialogueSpeed || 100) / 100;
      const pacingMul = PACING_SPEED_MULTIPLIERS[scenePacing] || 1.0;
      const natural = clampRate(baseRate * pacingMul, 0.5, MAX_NATURAL_PLAYBACK_RATE);
      naturalPlaybackRateRef.current = natural;
      applyPlaybackRate(audio);
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
  }, [startHighlightLoop, stopHighlightLoop, dispatch, fetchTts, fetchTtsWithRecovery, viewerMode, markSegmentLoading, unmarkSegmentLoading, setPlaybackState, setCurrentChunk, applyPlaybackRate, audioRef, objectUrlsRef, naturalPlaybackRateRef, remainingTextCharsRef, skipSegmentRef, settings.dialogueVolume]);

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
      const defaultVoiceId = resolveDefaultVoiceId();

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
        fullCleanup();
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
              .replace(/(?:"[^"]*"|„[^"]*"|"[^"]*"|«[^»]*»)/g, '')
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

      const resolveSegmentVoice = createLocalVoiceResolver(defaultVoiceId);

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
            audio._voiceId = voiceId;
            audio.volume = computeVolume(voiceId);
            const baseRate = (dialogueSpeed || 100) / 100;
            const pacingMul = PACING_SPEED_MULTIPLIERS[scenePacing] || 1.0;
            const natural = clampRate(baseRate * pacingMul, 0.5, MAX_NATURAL_PLAYBACK_RATE);
            naturalPlaybackRateRef.current = natural;
            applyPlaybackRate(audio);
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

      fullCleanup();
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
      fullCleanup();
      queueRef.current.shift();
      processQueue();
    }
  }, [settings, voicePools, state.characterVoiceMap, state.character, state.party, state.campaign, state.narratorVoiceId, viewerMode, dispatch, fullCleanup, playChunkPipeline, fetchTtsWithRecovery, fetchTts, hasApiKey, reportNarratorError, markSegmentLoading, unmarkSegmentLoading, resolveDefaultVoiceId, createLocalVoiceResolver, activeTtsProvider, coordinatorSessionRef, setPlaybackState, setHighlightInfo, setCurrentChunk, setNarrationSecondsRemaining, startHighlightLoop, stopHighlightLoop, applyPlaybackRate, audioRef, objectUrlsRef, naturalPlaybackRateRef, remainingTextCharsRef, skipSegmentRef, setCurrentMessageId, setCurrentSegmentIndex]);

  const processStreamingQueue = useCallback(async () => {
    const s = streamingRef.current;
    if (!s) return;

    const myGeneration = generationRef.current;

    const { dialogueSpeed } = settings;
    const defaultVoiceId = resolveDefaultVoiceId();

    if (!defaultVoiceId || (!viewerMode && !hasApiKey(activeTtsProvider))) {
      reportNarratorError(`Narrator unavailable: configure a voice and ${activeTtsProvider} backend key in Settings.`);
      streamingRef.current = null;
      setIsStreamingState(false);
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

    const resolveSegVoice = createLocalVoiceResolver(defaultVoiceId);

    const csid = beginDialogSession({ source: 'narrator', messageId: s.messageId });
    coordinatorSessionRef.current = csid;

    setCurrentMessageId(s.messageId);
    let globalWordOffset = 0;

    try {
    while (true) {
      if (abortRef.current || generationRef.current !== myGeneration) break;

      const seg = s.segments.shift();
      if (!seg) {
        if (s.finished) break;
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
        audio._voiceId = voiceId;
        audio.volume = computeVolume(voiceId);
        const baseRate = (dialogueSpeed || 100) / 100;
        const pacingMul = PACING_SPEED_MULTIPLIERS[s.scenePacing] || 1.0;
        const natural = clampRate(baseRate * pacingMul, 0.5, MAX_NATURAL_PLAYBACK_RATE);
        naturalPlaybackRateRef.current = natural;
        applyPlaybackRate(audio);
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
      fullCleanup();
      streamingRef.current = null;
      setIsStreamingState(false);
      setPlaybackState(STATES.IDLE);
      setCurrentMessageId(null);
      setCurrentSegmentIndex(-1);
      setCurrentCharacter(null);
      setHighlightInfo(null);
      setCurrentChunk(null);
      return;
    }

    streamingRef.current = null;
    setIsStreamingState(false);
    if (generationRef.current === myGeneration) {
      fullCleanup();
      setPlaybackState(STATES.IDLE);
      setCurrentMessageId(null);
      setCurrentSegmentIndex(-1);
      setCurrentCharacter(null);
      setHighlightInfo(null);
      setCurrentChunk(null);
    }
  }, [settings, voicePools, state.characterVoiceMap, state.character, state.party, state.campaign, state.narratorVoiceId, viewerMode, dispatch, fullCleanup, startHighlightLoop, stopHighlightLoop, applyPlaybackRate, fetchTts, fetchTtsWithRecovery, hasApiKey, reportNarratorError, markSegmentLoading, unmarkSegmentLoading, resolveDefaultVoiceId, createLocalVoiceResolver, activeTtsProvider, coordinatorSessionRef, setPlaybackState, setHighlightInfo, setCurrentChunk, setNarrationSecondsRemaining, audioRef, objectUrlsRef, naturalPlaybackRateRef, remainingTextCharsRef, setCurrentMessageId, setCurrentSegmentIndex]);

  processStreamingQueueRef.current = processStreamingQueue;

  const stopNarratorPlayback = useCallback(() => {
    generationRef.current++;
    abortRef.current = true;
    queueRef.current = [];
    if (streamingRef.current) {
      streamingRef.current.finished = true;
      streamingRef.current.segments = [];
      streamingRef.current = null;
      setIsStreamingState(false);
    }
    fullCleanup();
    remainingTextCharsRef.current = 0;
    setNarrationSecondsRemaining(0);
    setPlaybackState(STATES.IDLE);
    setCurrentMessageId(null);
    setCurrentSegmentIndex(-1);
    setCurrentCharacter(null);
    setHighlightInfo(null);
    setCurrentChunk(null);
  }, [fullCleanup, setPlaybackState, setNarrationSecondsRemaining, setHighlightInfo, setCurrentChunk, setCurrentMessageId, setCurrentSegmentIndex, remainingTextCharsRef]);

  const stop = useCallback(() => {
    stopNarratorPlayback();
    silencePeerDialogAudio();
  }, [stopNarratorPlayback]);

  useEffect(() => registerMainNarratorStop(stopNarratorPlayback), [stopNarratorPlayback]);

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

  const playSegment = useCallback((seg, messageId, segmentIndex, scenePacing) => {
    stop();
    setTimeout(() => {
      queueRef.current.push({
        dialogueSegments: [{ ...seg, _logicalSegmentIndex: segmentIndex }],
        soundEffect: null,
        narrative: '',
        scenePacing,
        segmentPrefetchWindow: 1,
        messageId,
      });
      abortRef.current = false;
      processQueue();
    }, 50);
  }, [stop, processQueue]);

  const startStreaming = useCallback((messageId, scenePacing) => {
    stop();
    streamingRef.current = {
      messageId,
      scenePacing: scenePacing || null,
      segments: [],
      sentCount: 0,
      finished: false,
    };
    setIsStreamingState(true);
    abortRef.current = false;
    Promise.resolve().then(() => processStreamingQueueRef.current?.());
  }, [stop]);

  const pushStreamingSegments = useCallback((segments) => {
    const s = streamingRef.current;
    if (!s) return;
    s.lastRawSegments = segments;
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
    const raw = s.lastRawSegments || [];
    const remaining = raw.slice(s.sentCount);
    if (remaining.length > 0) {
      s.segments.push(...remaining);
      s.sentCount += remaining.length;
    }
  }, []);

  useEffect(() => {
    const handleUnload = () => { abortRef.current = true; };
    window.addEventListener('beforeunload', handleUnload);
    return () => window.removeEventListener('beforeunload', handleUnload);
  }, []);

  // Unmount cleanup
  useEffect(() => {
    return () => {
      fullCleanup();
      abortRef.current = true;
      if (coordinatorSessionRef.current != null) {
        endDialogSession(coordinatorSessionRef.current);
        coordinatorSessionRef.current = null;
      }
    };
  }, [fullCleanup, coordinatorSessionRef]);

  return {
    currentMessageId,
    currentSegmentIndex,
    currentCharacter,
    loadingSegmentIndices,
    speak,
    speakScene,
    speakSingle,
    playSegment,
    startStreaming,
    pushStreamingSegments,
    finishStreaming,
    isStreaming: isStreamingState,
    stop,
    stopNarratorPlayback,
    abortRef,
  };
}
