import { useEffect } from 'react';
import { getCurrentTurnCombatant, resolveEnemyTurns } from '../services/combatEngine';
import { useEvent } from './useEvent';

const AI_TURN_DELAY_MS = 2500;

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
    setIsAwaitingAiTurn(false);
    const { combat: afterEnemies, results: enemyResults } = resolveEnemyTurns(combat);
    for (const er of enemyResults) {
      if (!isMultiplayer) dispatchCombatChatMessage(er);
      addResultToLog(er);
    }
    if (isMultiplayer) {
      afterEnemies.lastResults = enemyResults;
      afterEnemies.lastResultsTs = Date.now();
      onHostResolve?.(afterEnemies);
    } else {
      dispatch({ type: 'UPDATE_COMBAT', payload: afterEnemies });
    }
  });

  useEffect(() => {
    if (combatOver) return;
    if (isMultiplayer && !isHost) return;
    const current = getCurrentTurnCombatant(combat);
    if (!current || current.type === 'player') {
      setIsAwaitingAiTurn(false);
      return;
    }
    setIsAwaitingAiTurn(true);
    const timer = setTimeout(runEnemyTurn, AI_TURN_DELAY_MS);
    return () => clearTimeout(timer);
  }, [combat, combatOver, isMultiplayer, isHost, runEnemyTurn, setIsAwaitingAiTurn]);
}
