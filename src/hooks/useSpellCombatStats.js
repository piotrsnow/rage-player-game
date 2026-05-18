import { useState, useEffect, useRef, useCallback } from 'react';
import { apiClient } from '../services/apiClient';
import { useGameStore } from '../stores/gameStore';

const inflight = new Map();

/**
 * Lazy-fetches combatStats for a custom spell that doesn't have them cached
 * on the character (`character.customSpells[].combatStats`).
 *
 * Identifies the spell by `customSpellId` (UUID) — robust against names with
 * special characters (Ś, !, spaces). When `customSpellId` is missing (legacy
 * spells in `known[]` but not yet linked to a `CustomSpell` row) the hook
 * silently no-ops; the UI shows the empty state without a Przelicz button.
 *
 * Caches result on `character.customSpells` via dispatch so the next render
 * skips the round-trip.
 *
 * Returns { combatStats, explanation, loading, reloading, reload }.
 * `reload()` forces an LLM re-evaluation (force=true).
 */
export function useSpellCombatStats(customSpellId, customSpellMeta) {
  const [combatStats, setCombatStats] = useState(customSpellMeta?.combatStats ?? null);
  const [explanation, setExplanation] = useState(customSpellMeta?.combatStats?.explanation ?? null);
  const [loading, setLoading] = useState(false);
  const [reloading, setReloading] = useState(false);
  const cancelledRef = useRef(false);

  const characterId = useGameStore((s) => s.state.character?.backendId || s.state.character?.id);
  const dispatch = useGameStore((s) => s.dispatch);

  const isCustom = customSpellMeta?.isCustom === true;
  const hasStats = !!customSpellMeta?.combatStats;
  const shouldSkip = !customSpellId || !characterId || !isCustom || hasStats;

  useEffect(() => {
    cancelledRef.current = false;
    if (shouldSkip) {
      if (hasStats) {
        setCombatStats(customSpellMeta.combatStats);
        setExplanation(customSpellMeta.combatStats?.explanation ?? null);
      }
      return;
    }

    const key = `${characterId}:spell:${customSpellId}`;
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
      .post(`/characters/${characterId}/spells/${customSpellId}/combat-stats`, {})
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
              payload: { customSpellId, combatStats: stats },
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
  }, [shouldSkip, customSpellId, characterId, hasStats, customSpellMeta?.combatStats, dispatch]);

  const reload = useCallback(async () => {
    if (!customSpellId || !characterId || !isCustom || reloading) return;
    setReloading(true);
    try {
      const data = await apiClient.post(
        `/characters/${characterId}/spells/${customSpellId}/combat-stats`,
        { force: true },
      );
      const stats = data?.combatStats ?? null;
      const expl = data?.explanation ?? null;
      setCombatStats(stats);
      setExplanation(expl);
      if (stats) {
        dispatch({
          type: 'UPDATE_CUSTOM_SPELL_COMBAT_STATS',
          payload: { customSpellId, combatStats: stats },
        });
      }
    } catch { /* swallow */ }
    setReloading(false);
  }, [customSpellId, characterId, isCustom, reloading, dispatch]);

  return { combatStats, explanation, loading, reloading, reload };
}
