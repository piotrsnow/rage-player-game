import { useEffect, useRef } from 'react';
import { useEvent } from './useEvent';

/**
 * Non-host multiplayer players consume combat results synced by the host
 * via the `lastResults` / `lastResultsTs` fields on combat state.
 * Each timestamp is processed exactly once.
 */
export function useCombatResultSync({ combat, isMultiplayer, isHost, addResultToLog }) {
  const lastProcessedTsRef = useRef(null);

  const drainResults = useEvent(() => {
    if (!combat.lastResults?.length || !combat.lastResultsTs) return;
    if (combat.lastResultsTs === lastProcessedTsRef.current) return;
    if (!isMultiplayer || isHost) return;
    lastProcessedTsRef.current = combat.lastResultsTs;
    for (const r of combat.lastResults) {
      addResultToLog(r);
    }
  });

  useEffect(() => {
    drainResults();
  }, [combat.lastResultsTs, isMultiplayer, isHost, drainResults]);
}
