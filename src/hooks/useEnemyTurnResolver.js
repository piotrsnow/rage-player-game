import { useEffect } from 'react';
import { getCurrentTurnCombatant, resolveEnemyTurns } from '../services/combatEngine';

const AI_TURN_DELAY_MS = 2500;

/**
 * Auto-resolves enemy turns when the current combatant is not a player.
 * Fixes deadlock when enemies win initiative or are first in a new round.
 *
 * In solo mode dispatches a UPDATE_COMBAT action; in multiplayer forwards the
 * resolved state through `onHostResolve` (host-only).
 */
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
  useEffect(() => {
    if (combatOver) return;
    if (isMultiplayer && !isHost) return;
    const current = getCurrentTurnCombatant(combat);
    if (!current || current.type === 'player') {
      setIsAwaitingAiTurn(false);
      return;
    }

    setIsAwaitingAiTurn(true);

    const timer = setTimeout(() => {
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
    }, AI_TURN_DELAY_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [combat.turnIndex, combat.round, combatOver, isMultiplayer, isHost]);
}
