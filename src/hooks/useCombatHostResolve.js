import { useEffect } from 'react';
import { resolveManoeuvre, advanceTurn } from '../services/combatEngine';
import { useMultiplayer } from '../contexts/MultiplayerContext';
import { useEvent } from './useEvent';

// Host-side resolver for remote combat manoeuvres. Watches the multiplayer
// pending-manoeuvre slot; when a guest's action arrives, resolves it against
// the current combat state, appends the result to the local log, advances
// the turn, broadcasts via onHostResolve, and clears the slot.
export function useCombatHostResolve({
  combat,
  isMultiplayer,
  isHost,
  onHostResolve,
  addResultToLog,
}) {
  const mp = useMultiplayer();
  const pending = mp.state.pendingCombatManoeuvre;

  const handlePending = useEvent(() => {
    if (!pending) return;
    const fromPlayerId = `player_${pending.fromOdId}`;
    const { combat: updatedCombat, result } = resolveManoeuvre(
      combat,
      fromPlayerId,
      pending.manoeuvre,
      pending.targetId,
      { customDescription: pending.customDescription ?? '' },
    );
    addResultToLog(result);
    const finalCombat = advanceTurn(updatedCombat);
    finalCombat.lastResults = result ? [result] : [];
    finalCombat.lastResultsTs = Date.now();
    onHostResolve?.(finalCombat);
    mp.clearPendingCombatManoeuvre();
  });

  useEffect(() => {
    if (!isMultiplayer || !isHost || !pending) return;
    handlePending();
  }, [pending, isMultiplayer, isHost, handlePending]);
}
