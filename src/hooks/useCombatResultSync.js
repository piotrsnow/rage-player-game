import { useEffect, useRef } from 'react';

/**
 * Non-host multiplayer players consume combat results synced by the host
 * via the `lastResults` / `lastResultsTs` fields on combat state.
 * Each timestamp is processed exactly once.
 */
export function useCombatResultSync({ combat, isMultiplayer, isHost, addResultToLog }) {
  const lastProcessedTsRef = useRef(null);

  useEffect(() => {
    if (!combat.lastResults?.length || !combat.lastResultsTs) return;
    if (combat.lastResultsTs === lastProcessedTsRef.current) return;
    if (!isMultiplayer || isHost) return;
    lastProcessedTsRef.current = combat.lastResultsTs;
    for (const r of combat.lastResults) {
      addResultToLog(r);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [combat.lastResultsTs, isMultiplayer, isHost]);
}
