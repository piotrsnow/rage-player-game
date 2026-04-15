import { useEffect } from 'react';
import { getCurrentTurnCombatant, resolveEnemyTurns } from '../services/combatEngine';
import { useEvent } from './useEvent';

const AI_TURN_DELAY_MS = 2500;

/**
 * Pure resolver step — runs the enemy turn logic and routes side effects
 * through injected callbacks. Extracted so it can be tested without React.
 * Returns `{ afterEnemies, enemyResults }` for introspection.
 */
export function resolveEnemyTurnStep({
  combat,
  isMultiplayer,
  dispatch,
  onHostResolve,
  addResultToLog,
  dispatchCombatChatMessage,
  setIsAwaitingAiTurn,
  now = () => Date.now(),
}) {
  setIsAwaitingAiTurn(false);
  const { combat: afterEnemies, results: enemyResults } = resolveEnemyTurns(combat);
  for (const er of enemyResults) {
    if (!isMultiplayer) dispatchCombatChatMessage(er);
    addResultToLog(er);
  }
  if (isMultiplayer) {
    afterEnemies.lastResults = enemyResults;
    afterEnemies.lastResultsTs = now();
    onHostResolve?.(afterEnemies);
  } else {
    dispatch({ type: 'UPDATE_COMBAT', payload: afterEnemies });
  }
  return { afterEnemies, enemyResults };
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
}) {
  const runEnemyTurn = useEvent(() => {
    resolveEnemyTurnStep({
      combat,
      isMultiplayer,
      dispatch,
      onHostResolve,
      addResultToLog,
      dispatchCombatChatMessage,
      setIsAwaitingAiTurn,
    });
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
