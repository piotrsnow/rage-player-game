import { useState, useEffect, useRef, useCallback } from 'react';

const INTERVAL_SECONDS = 30;
const THRESHOLD_STEP = 5;
const GRACE_PERIOD_MS = 15_000;
const ROLL_DISPLAY_MS = 3000;

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

  // Reset when scene changes
  useEffect(() => {
    if (sceneId !== sceneIdRef.current) {
      sceneIdRef.current = sceneId;
      resetTimer();
    }
  }, [sceneId, resetTimer]);

  // Start logic: wait for narrator to finish, or use grace period
  useEffect(() => {
    if (paused || timerActive || !sceneId) return;

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
  }, [paused, timerActive, sceneId, narratorEnabled, narratorReady, narratorPlaybackState]);

  // Tick every second when active and not paused
  useEffect(() => {
    if (!timerActive || paused) return;

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
    }, 1000);

    return () => clearInterval(interval);
  }, [timerActive, paused, isRolling]);

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
    resetTimer,
  };
}
