import { useState, useEffect, useRef, useCallback } from 'react';
import { apiClient } from '../services/apiClient';
import { useGameStore } from '../stores/gameStore';

const inflight = new Map();

/**
 * Lazy-fetches combatStats for a custom spell that doesn't have them locally.
 * Skips built-in spells (isCustom=false) and spells that already have combatStats.
 *
 * Caches result on the character's customSpells array via dispatch.
 *
 * Returns { combatStats, explanation, loading, reloading, reload }.
 * `reload()` forces an LLM re-evaluation.
 */
export function useSpellCombatStats(spellName, customSpellMeta) {
  const [combatStats, setCombatStats] = useState(customSpellMeta?.combatStats ?? null);
  const [explanation, setExplanation] = useState(customSpellMeta?.combatStats?.explanation ?? null);
  const [loading, setLoading] = useState(false);
  const [reloading, setReloading] = useState(false);
  const cancelledRef = useRef(false);

  const characterId = useGameStore((s) => s.state.character?.backendId || s.state.character?.id);
  const dispatch = useGameStore((s) => s.dispatch);

  const isCustom = customSpellMeta?.isCustom === true;
  const hasStats = !!customSpellMeta?.combatStats;
  const shouldSkip = !spellName || !characterId || !isCustom || hasStats;

  useEffect(() => {
    cancelledRef.current = false;
    if (shouldSkip) {
      if (hasStats) {
        setCombatStats(customSpellMeta.combatStats);
        setExplanation(customSpellMeta.combatStats?.explanation ?? null);
      }
      return;
    }

    const key = `${characterId}:spell:${spellName}`;
    if (inflight.has(key)) {
      setLoading(true);
      inflight.get(key).then((result) => {
        if (!cancelledRef.current) {
          setCombatStats(result?.combatStats ?? null);
          setExplanation(result?.explanation ?? null);
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
        const expl = data?.explanation ?? null;
        if (!cancelledRef.current) {
          setCombatStats(stats);
          setExplanation(expl);
          setLoading(false);
          if (stats) {
            dispatch({
              type: 'UPDATE_CUSTOM_SPELL_COMBAT_STATS',
              payload: { spellName, combatStats: stats },
            });
          }
        }
        return data;
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

  const reload = useCallback(async () => {
    if (!spellName || !characterId || !isCustom || reloading) return;
    setReloading(true);
    try {
      const data = await apiClient.post(
        `/characters/${characterId}/spells/${encodeURIComponent(spellName)}/combat-stats`,
        { force: true },
      );
      const stats = data?.combatStats ?? null;
      const expl = data?.explanation ?? null;
      setCombatStats(stats);
      setExplanation(expl);
      if (stats) {
        dispatch({
          type: 'UPDATE_CUSTOM_SPELL_COMBAT_STATS',
          payload: { spellName, combatStats: stats },
        });
      }
    } catch { /* swallow */ }
    setReloading(false);
  }, [spellName, characterId, isCustom, reloading, dispatch]);

  return { combatStats, explanation, loading, reloading, reload };
}
