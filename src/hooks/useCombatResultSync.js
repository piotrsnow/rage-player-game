import { useEffect, useRef } from 'react';
import { useEvent } from './useEvent';

/**
 * Pure decision step — given the current combat state + last-processed
 * timestamp, decides whether the caller should apply new results and which
 * results to forward. Returns `{ shouldApply, nextTs, results }`.
 * Exposed so tests can exercise gating logic without a React tree.
 */
export function planCombatResultDrain({ combat, lastProcessedTs, isMultiplayer, isHost }) {
  if (!combat?.lastResults?.length || !combat.lastResultsTs) {
    return { shouldApply: false, nextTs: lastProcessedTs, results: [] };
  }
  if (combat.lastResultsTs === lastProcessedTs) {
    return { shouldApply: false, nextTs: lastProcessedTs, results: [] };
  }
  if (!isMultiplayer || isHost) {
    return { shouldApply: false, nextTs: lastProcessedTs, results: [] };
  }
  return { shouldApply: true, nextTs: combat.lastResultsTs, results: combat.lastResults };
}

/**
 * Non-host multiplayer players consume combat results synced by the host
 * via the `lastResults` / `lastResultsTs` fields on combat state.
 * Each timestamp is processed exactly once.
 */
export function useCombatResultSync({ combat, isMultiplayer, isHost, addResultToLog }) {
  const lastProcessedTsRef = useRef(null);

  const drainResults = useEvent(() => {
    const plan = planCombatResultDrain({
      combat,
      lastProcessedTs: lastProcessedTsRef.current,
      isMultiplayer,
      isHost,
    });
    if (!plan.shouldApply) return;
    lastProcessedTsRef.current = plan.nextTs;
    for (const r of plan.results) {
      addResultToLog(r);
    }
  });

  useEffect(() => {
    drainResults();
  }, [combat.lastResultsTs, isMultiplayer, isHost, drainResults]);
}
