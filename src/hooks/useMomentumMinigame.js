import { useState, useRef, useCallback, useEffect } from 'react';
import { MOMENTUM_RANGE } from '../data/rpgSystem.js';

const GAME_DURATION_MS = 8000;
const COUNTDOWN_SECONDS = 3;
const SAFE_MARGIN = 0.08;

function randomPosition() {
  return {
    top: SAFE_MARGIN + Math.random() * (1 - 2 * SAFE_MARGIN),
    left: SAFE_MARGIN + Math.random() * (1 - 2 * SAFE_MARGIN),
  };
}

function getMomentumDelta(ratio) {
  if (ratio <= 0.5) return 3;
  if (ratio <= 0.6) return 2;
  if (ratio <= 0.7) return 1;
  if (ratio <= 0.8) return -1;
  if (ratio <= 0.9) return -2;
  return -3;
}

const TIMEOUT_PENALTY = -2;
const RESULT_DISPLAY_MS = 3500;

export function useMomentumMinigame({ dispatch, momentumBonus, sceneId }) {
  const [phase, setPhase] = useState('idle');
  const [countdownValue, setCountdownValue] = useState(0);
  const [diceVisible, setDiceVisible] = useState(false);
  const [position, setPosition] = useState({ top: 0.5, left: 0.5 });
  const [result, setResult] = useState(null);

  const visibleSinceRef = useRef(0);
  const visibleDurationRef = useRef(0);
  const gameTimerRef = useRef(null);
  const cycleTimerRef = useRef(null);
  const countdownTimerRef = useRef(null);
  const cooldownTimerRef = useRef(null);
  const prevSceneRef = useRef(null);

  const cleanup = useCallback(() => {
    clearTimeout(gameTimerRef.current);
    clearTimeout(cycleTimerRef.current);
    clearTimeout(countdownTimerRef.current);
    clearTimeout(cooldownTimerRef.current);
  }, []);

  useEffect(() => cleanup, [cleanup]);

  useEffect(() => {
    if (sceneId && sceneId !== prevSceneRef.current) {
      prevSceneRef.current = sceneId;
      cleanup();
      setPhase('idle');
      setDiceVisible(false);
      setCountdownValue(0);
      setResult(null);
    }
  }, [sceneId, cleanup]);

  const applyDelta = useCallback((delta) => {
    const current = typeof momentumBonus === 'number' ? momentumBonus : 0;
    const next = Math.max(MOMENTUM_RANGE.min, Math.min(MOMENTUM_RANGE.max, current + delta));
    dispatch({ type: 'SET_MOMENTUM', payload: next });
  }, [dispatch, momentumBonus]);

  const nextCycle = useCallback(() => {
    const visibleMs = 800 + Math.random() * 1200;
    const hiddenMs = 600 + Math.random() * 1400;

    setPosition(randomPosition());
    setDiceVisible(true);
    visibleSinceRef.current = performance.now();
    visibleDurationRef.current = visibleMs;

    cycleTimerRef.current = setTimeout(() => {
      setDiceVisible(false);
      cycleTimerRef.current = setTimeout(nextCycle, hiddenMs);
    }, visibleMs);
  }, []);

  const enterCooldown = useCallback((delta, reactionMs) => {
    cleanup();
    setDiceVisible(false);
    applyDelta(delta);
    setResult({ delta, reactionMs, ts: Date.now() });
    setPhase('cooldown');
    cooldownTimerRef.current = setTimeout(() => {
      setPhase('idle');
      setResult(null);
    }, RESULT_DISPLAY_MS);
  }, [cleanup, applyDelta]);

  const beginActivePhase = useCallback(() => {
    setPhase('active');
    setCountdownValue(0);
    setDiceVisible(false);

    const initialDelay = 400 + Math.random() * 600;
    cycleTimerRef.current = setTimeout(nextCycle, initialDelay);

    gameTimerRef.current = setTimeout(() => {
      enterCooldown(TIMEOUT_PENALTY, null);
    }, GAME_DURATION_MS);
  }, [nextCycle, enterCooldown]);

  const startGame = useCallback(() => {
    if (phase !== 'idle') return;

    setPhase('countdown');
    setCountdownValue(COUNTDOWN_SECONDS);

    let remaining = COUNTDOWN_SECONDS;
    const tick = () => {
      remaining -= 1;
      if (remaining <= 0) {
        beginActivePhase();
        return;
      }
      setCountdownValue(remaining);
      countdownTimerRef.current = setTimeout(tick, 1000);
    };
    countdownTimerRef.current = setTimeout(tick, 1000);
  }, [phase, beginActivePhase]);

  const handleDiceClick = useCallback(() => {
    if (phase !== 'active' || !diceVisible) return;

    const reactionMs = performance.now() - visibleSinceRef.current;
    const effectiveMs = Math.max(0, reactionMs - 100);
    const ratio = Math.min(effectiveMs / visibleDurationRef.current, 1);
    const delta = getMomentumDelta(ratio);

    enterCooldown(delta, Math.round(reactionMs));
  }, [phase, diceVisible, enterCooldown]);

  return {
    active: phase === 'active' || phase === 'countdown',
    counting: phase === 'countdown',
    countdownValue,
    diceVisible,
    position,
    startGame,
    handleDiceClick,
    cooldown: phase === 'cooldown',
    result,
  };
}
