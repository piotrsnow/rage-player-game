import { useEffect } from 'react';
import { getCurrentTurnCombatant, resolveEnemyTurns, getEnemyAction } from '../services/combatEngine';
import { useEvent } from './useEvent';

const AI_TURN_DELAY_MS = 2500;

/**
 * Pure resolver step — runs the enemy turn logic and routes side effects
 * through injected callbacks. Extracted so it can be tested without React.
 * Returns `{ afterEnemies, enemyResults }` for introspection.
 */
function normalizePos(p) {
  if (p && typeof p === 'object' && 'x' in p) return p;
  if (typeof p === 'number') return { x: p, y: 4 };
  return { x: 0, y: 0 };
}

export function resolveEnemyTurnStep({
  combat,
  isMultiplayer,
  dispatch,
  onHostResolve,
  addResultToLog,
  dispatchCombatChatMessage,
  setIsAwaitingAiTurn,
  scheduleTokenAnim,
  flushRoundEffectEvents,
  now = () => Date.now(),
}) {
  setIsAwaitingAiTurn(false);

  const positionsBefore = {};
  for (const c of combat.combatants) {
    positionsBefore[c.id] = normalizePos(c.position);
  }

  const { combat: afterEnemies, results: enemyResults } = resolveEnemyTurns(combat);

  let maxSlideDuration = 0;
  if (scheduleTokenAnim) {
    const anims = {};
    for (const c of afterEnemies.combatants) {
      const before = positionsBefore[c.id];
      const after = normalizePos(c.position);
      if (before && (before.x !== after.x || before.y !== after.y)) {
        const dist = Math.max(Math.abs(after.x - before.x), Math.abs(after.y - before.y));
        const duration = Math.min(dist * 150, 1500);
        anims[c.id] = { durationMs: duration };
        if (duration > maxSlideDuration) maxSlideDuration = duration;
      }
    }
    if (Object.keys(anims).length) scheduleTokenAnim(anims);
  }

  for (const er of enemyResults) {
    if (!isMultiplayer) dispatchCombatChatMessage(er);
    addResultToLog(er);
  }
  flushRoundEffectEvents?.(afterEnemies);
  if (isMultiplayer) {
    afterEnemies.lastResults = enemyResults;
    afterEnemies.lastResultsTs = now();
    onHostResolve?.(afterEnemies);
  } else {
    dispatch({ type: 'UPDATE_COMBAT', payload: afterEnemies });
  }
  return { afterEnemies, enemyResults, maxSlideDuration };
}

/**
 * Decides whether the enemy turn resolver should fire for the given combat
 * state. Exposed so tests can verify gating without spinning up React.
 */
export function shouldScheduleEnemyTurn({ combat, combatOver, isMultiplayer, isHost }) {
  if (combatOver) return false;
  if (isMultiplayer && !isHost) return false;
  const current = getCurrentTurnCombatant(combat);
  if (!current || current.type === 'player') return false;
  return true;
}

export { AI_TURN_DELAY_MS };

// Auto-resolves enemy turns when the current combatant is not a player.
// Fixes deadlock when enemies win initiative or are first in a new round.
//
// In solo mode dispatches UPDATE_COMBAT; in multiplayer forwards through
// onHostResolve (host-only). Uses useEvent so the timer body always sees
// the latest combat state without re-scheduling on every render.
export function useEnemyTurnResolver({
  combat,
  combatOver,
  isMultiplayer,
  isHost,
  dispatch,
  onHostResolve,
  addResultToLog,
  dispatchCombatChatMessage,
  setIsAwaitingAiTurn,
  onBeforeResolve,
  onAfterSlide,
  scheduleTokenAnim,
  flushRoundEffectEvents,
}) {
  const runEnemyTurn = useEvent(async () => {
    const current = getCurrentTurnCombatant(combat);
    const willCharge = current && current.type !== 'player' &&
      getEnemyAction(combat, current.id)?.manoeuvre === 'charge';

    if (!willCharge && onBeforeResolve) {
      await onBeforeResolve(combat);
    }

    const { maxSlideDuration } = resolveEnemyTurnStep({
      combat,
      isMultiplayer,
      dispatch,
      onHostResolve,
      addResultToLog,
      dispatchCombatChatMessage,
      setIsAwaitingAiTurn,
      scheduleTokenAnim,
      flushRoundEffectEvents,
    });

    if (willCharge && maxSlideDuration > 0 && onAfterSlide) {
      await new Promise((r) => setTimeout(r, maxSlideDuration + 50));
      await onAfterSlide(combat);
    }
  });

  useEffect(() => {
    if (!shouldScheduleEnemyTurn({ combat, combatOver, isMultiplayer, isHost })) {
      setIsAwaitingAiTurn(false);
      return;
    }
    setIsAwaitingAiTurn(true);
    const timer = setTimeout(runEnemyTurn, AI_TURN_DELAY_MS);
    return () => clearTimeout(timer);
  }, [combat, combatOver, isMultiplayer, isHost, runEnemyTurn, setIsAwaitingAiTurn]);
}
