import { useState, useEffect, useRef } from 'react';
import { apiClient } from '../services/apiClient';
import { useGameStore } from '../stores/gameStore';

const inflight = new Map();

/**
 * Lazy-fetches combatStats for a custom spell that doesn't have them locally.
 * Skips built-in spells (isCustom=false) and spells that already have combatStats.
 *
 * Caches result on the character's customSpells array via dispatch.
 */
export function useSpellCombatStats(spellName, customSpellMeta) {
  const [combatStats, setCombatStats] = useState(customSpellMeta?.combatStats ?? null);
  const [loading, setLoading] = useState(false);
  const cancelledRef = useRef(false);

  const characterId = useGameStore((s) => s.state.character?.backendId || s.state.character?.id);
  const dispatch = useGameStore((s) => s.dispatch);

  const isCustom = customSpellMeta?.isCustom === true;
  const hasStats = !!customSpellMeta?.combatStats;
  const shouldSkip = !spellName || !characterId || !isCustom || hasStats;

  useEffect(() => {
    cancelledRef.current = false;
    if (shouldSkip) {
      if (hasStats) setCombatStats(customSpellMeta.combatStats);
      return;
    }

    const key = `${characterId}:spell:${spellName}`;
    if (inflight.has(key)) {
      setLoading(true);
      inflight.get(key).then((result) => {
        if (!cancelledRef.current) {
          setCombatStats(result);
          setLoading(false);
        }
      });
      return;
    }

    setLoading(true);
    const promise = apiClient
      .post(`/characters/${characterId}/spells/${encodeURIComponent(spellName)}/combat-stats`)
      .then((data) => {
        const stats = data?.combatStats ?? null;
        if (!cancelledRef.current) {
          setCombatStats(stats);
          setLoading(false);
          if (stats) {
            dispatch({
              type: 'UPDATE_CUSTOM_SPELL_COMBAT_STATS',
              payload: { spellName, combatStats: stats },
            });
          }
        }
        return stats;
      })
      .catch(() => {
        if (!cancelledRef.current) setLoading(false);
        return null;
      })
      .finally(() => {
        inflight.delete(key);
      });

    inflight.set(key, promise);

    return () => { cancelledRef.current = true; };
  }, [shouldSkip, spellName, characterId, hasStats, customSpellMeta?.combatStats, dispatch]);

  return { combatStats, loading };
}
