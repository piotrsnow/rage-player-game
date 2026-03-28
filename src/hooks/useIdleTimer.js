import { useState, useEffect, useRef, useCallback } from 'react';

const INTERVAL_SECONDS = 30;
const THRESHOLD_STEP = 5;
const GRACE_PERIOD_MS = 15_000;
const ROLL_DISPLAY_MS = 3000;
const SPEED_MULTIPLIER = 5;

function getThreshold(checkIndex) {
  return (checkIndex + 1) * THRESHOLD_STEP;
}

function getCheckSeconds(checkIndex) {
  return (checkIndex + 1) * INTERVAL_SECONDS;
}

export function useIdleTimer({
  paused = false,
  narratorPlaybackState = 'idle',
  narratorEnabled = false,
  narratorReady = false,
  sceneId = null,
  onIdleEvent,
}) {
  const [idleSeconds, setIdleSeconds] = useState(0);
  const [timerActive, setTimerActive] = useState(false);
  const [lastRoll, setLastRoll] = useState(null);
  const [isRolling, setIsRolling] = useState(false);
  const [fastMode, setFastMode] = useState(false);
  const [documentVisible, setDocumentVisible] = useState(
    () => typeof document !== 'undefined' && document.visibilityState === 'visible',
  );

  const checkIndexRef = useRef(0);
  const graceTimerRef = useRef(null);
  const rollTimeoutRef = useRef(null);
  const sceneIdRef = useRef(sceneId);
  const onIdleEventRef = useRef(onIdleEvent);
  onIdleEventRef.current = onIdleEvent;

  const resetTimer = useCallback(() => {
    setIdleSeconds(0);
    setTimerActive(false);
    setLastRoll(null);
    setIsRolling(false);
    setFastMode(false);
    checkIndexRef.current = 0;
    if (graceTimerRef.current) {
      clearTimeout(graceTimerRef.current);
      graceTimerRef.current = null;
    }
    if (rollTimeoutRef.current) {
      clearTimeout(rollTimeoutRef.current);
      rollTimeoutRef.current = null;
    }
  }, []);

  const toggleFastMode = useCallback(() => {
    setFastMode((prev) => !prev);
  }, []);

  // Reset when scene changes
  useEffect(() => {
    if (sceneId !== sceneIdRef.current) {
      sceneIdRef.current = sceneId;
      resetTimer();
    }
  }, [sceneId, resetTimer]);

  useEffect(() => {
    const onVisibilityChange = () => {
      setDocumentVisible(typeof document !== 'undefined' && document.visibilityState === 'visible');
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);

  // Start logic: wait for narrator to finish, or use grace period
  useEffect(() => {
    if (!documentVisible || paused || timerActive || !sceneId) return;

    if (narratorEnabled && narratorReady) {
      if (narratorPlaybackState === 'idle') {
        graceTimerRef.current = setTimeout(() => {
          setTimerActive(true);
        }, 2000);
        return () => {
          if (graceTimerRef.current) {
            clearTimeout(graceTimerRef.current);
            graceTimerRef.current = null;
          }
        };
      }
    } else {
      graceTimerRef.current = setTimeout(() => {
        setTimerActive(true);
      }, GRACE_PERIOD_MS);
      return () => {
        if (graceTimerRef.current) {
          clearTimeout(graceTimerRef.current);
          graceTimerRef.current = null;
        }
      };
    }
  }, [paused, timerActive, sceneId, narratorEnabled, narratorReady, narratorPlaybackState, documentVisible]);

  // Tick when active and not paused — 5x faster in fast mode (frozen while tab hidden)
  useEffect(() => {
    if (!timerActive || paused || !documentVisible) return;

    const tickMs = fastMode ? 1000 / SPEED_MULTIPLIER : 1000;

    const interval = setInterval(() => {
      setIdleSeconds((prev) => {
        const next = prev + 1;
        const checkIdx = checkIndexRef.current;
        const checkAt = getCheckSeconds(checkIdx);

        if (next >= checkAt && !isRolling) {
          const threshold = getThreshold(checkIdx);
          const roll = Math.floor(Math.random() * 100) + 1;
          const triggered = roll <= threshold;

          checkIndexRef.current = checkIdx + 1;

          setLastRoll({ roll, threshold, triggered });
          setIsRolling(true);

          rollTimeoutRef.current = setTimeout(() => {
            setIsRolling(false);
            if (triggered) {
              onIdleEventRef.current?.({ roll, threshold });
            }
          }, ROLL_DISPLAY_MS);
        }

        return next;
      });
    }, tickMs);

    return () => clearInterval(interval);
  }, [timerActive, paused, isRolling, fastMode, documentVisible]);

  useEffect(() => {
    return () => {
      if (graceTimerRef.current) clearTimeout(graceTimerRef.current);
      if (rollTimeoutRef.current) clearTimeout(rollTimeoutRef.current);
    };
  }, []);

  return {
    idleSeconds: timerActive ? idleSeconds : 0,
    timerActive,
    lastRoll,
    isRolling,
    fastMode,
    resetTimer,
    toggleFastMode,
  };
}
