import { useState, useEffect, useRef, useCallback } from 'react';
import { rollPercentage } from '../services/gameState.js';

const INTERVAL_SECONDS = 60;
const THRESHOLD_STEP = 10;
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

  const runIdleCheck = useCallback((forceRoll) => {
    if (isRolling) return false;

    const checkIdx = checkIndexRef.current;
    const threshold = getThreshold(checkIdx);
    const roll = forceRoll ?? rollPercentage();
    const triggered = roll <= threshold;

    checkIndexRef.current = checkIdx + 1;

    setLastRoll({ roll, threshold, triggered });
    setIsRolling(true);

    if (rollTimeoutRef.current) {
      clearTimeout(rollTimeoutRef.current);
      rollTimeoutRef.current = null;
    }
    rollTimeoutRef.current = setTimeout(() => {
      setIsRolling(false);
      if (triggered) {
        onIdleEventRef.current?.({ roll, threshold });
      }
    }, ROLL_DISPLAY_MS);

    return true;
  }, [isRolling]);

  const triggerManualCheck = useCallback(() => {
    if (!timerActive || paused || !documentVisible) return false;
    return runIdleCheck(1);
  }, [timerActive, paused, documentVisible, runIdleCheck]);

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

  // Mouse movement resets idle countdown (user is not AFK)
  useEffect(() => {
    if (!timerActive) return;
    const onMouseMove = () => {
      setIdleSeconds(0);
      checkIndexRef.current = 0;
    };
    window.addEventListener('mousemove', onMouseMove);
    return () => window.removeEventListener('mousemove', onMouseMove);
  }, [timerActive]);

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

  useEffect(() => {
    if (!timerActive || paused || !documentVisible) return;

    const interval = setInterval(() => {
      setIdleSeconds((prev) => {
        const next = prev + 1;
        const checkIdx = checkIndexRef.current;
        const checkAt = getCheckSeconds(checkIdx);

        if (next >= checkAt) {
          runIdleCheck();
        }

        return next;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [timerActive, paused, documentVisible, runIdleCheck]);

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
    triggerManualCheck,
  };
}
