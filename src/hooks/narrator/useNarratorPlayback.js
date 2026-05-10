import { useState, useCallback, useRef, useEffect } from 'react';
import {
  setDialogSessionState,
  endDialogSession,
} from '../../utils/readAloudExclusive';
import {
  STATES,
  CHARS_PER_SECOND_ESTIMATE,
  MAX_FAST_FORWARD_PLAYBACK_RATE,
  clampRate,
} from './narratorUtils';

const FAST_FORWARD_HOLD_START_MULTIPLIER = 1.5;
const FAST_FORWARD_HOLD_MAX_MULTIPLIER = 5;
const FAST_FORWARD_HOLD_RAMP_MS = 2200;
const HIGHLIGHT_LEAD_SECONDS = 0.06;
const HIGHLIGHT_SCALE_MIN = 0.85;
const HIGHLIGHT_SCALE_MAX = 1.2;

export function useNarratorPlayback({ settings, dispatch, viewerMode, coordinatorSessionRef }) {
  const [playbackState, setPlaybackStateRaw] = useState(STATES.IDLE);
  const [highlightInfo, setHighlightInfo] = useState(null);
  const [currentChunk, setCurrentChunk] = useState(null);
  const [narrationFastForwardRate, setNarrationFastForwardRate] = useState(1);
  const [narrationSecondsRemaining, setNarrationSecondsRemaining] = useState(0);

  const audioRef = useRef(null);
  const objectUrlsRef = useRef([]);
  const highlightRafRef = useRef(null);
  const skipSegmentRef = useRef(false);
  const naturalPlaybackRateRef = useRef(1);
  const narrationFastForwardRateRef = useRef(1);
  const holdActiveRef = useRef(false);
  const [isHoldActive, setIsHoldActive] = useState(false);
  const holdStartAtRef = useRef(0);
  const holdRafRef = useRef(null);
  const remainingTextCharsRef = useRef(0);

  const setPlaybackState = useCallback((nextState) => {
    setPlaybackStateRaw(nextState);
    const sid = coordinatorSessionRef.current;
    if (nextState === STATES.IDLE) {
      if (sid != null) { endDialogSession(sid); coordinatorSessionRef.current = null; }
    } else if (sid != null) {
      setDialogSessionState(sid, nextState);
    }
  }, [coordinatorSessionRef]);

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
    setIsHoldActive(true);
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
    setIsHoldActive(false);
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
    setIsHoldActive(false);
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

  const pause = useCallback(() => {
    if (audioRef.current && playbackState === STATES.PLAYING) {
      audioRef.current.pause();
      setPlaybackState(STATES.PAUSED);
    }
  }, [playbackState, setPlaybackState]);

  const resume = useCallback(() => {
    if (audioRef.current && playbackState === STATES.PAUSED) {
      audioRef.current.play();
      setPlaybackState(STATES.PLAYING);
    }
  }, [playbackState, setPlaybackState]);

  const skipSegment = useCallback(() => {
    if (playbackState !== STATES.PLAYING && playbackState !== STATES.LOADING) return;
    skipSegmentRef.current = true;
    stopHighlightLoop();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.dispatchEvent(new Event('ended'));
    }
  }, [playbackState, stopHighlightLoop]);

  useEffect(() => {
    const handleUnload = () => {
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

  return {
    playbackState,
    setPlaybackState,
    highlightInfo,
    setHighlightInfo,
    currentChunk,
    setCurrentChunk,
    narrationSecondsRemaining,
    setNarrationSecondsRemaining,
    narrationFastForwardRate,
    isNarrationFastForwardHolding: isHoldActive,
    startHighlightLoop,
    stopHighlightLoop,
    applyPlaybackRate,
    startNarrationFastForwardHold,
    stopNarrationFastForwardHold,
    pause,
    resume,
    skipSegment,
    cleanup,
    audioRef,
    objectUrlsRef,
    naturalPlaybackRateRef,
    narrationFastForwardRateRef,
    remainingTextCharsRef,
    skipSegmentRef,
  };
}
