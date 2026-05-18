import { useState, useEffect, useRef, useCallback } from 'react';
import { apiClient } from '../services/apiClient';
import { useGameStore } from '../stores/gameStore';
import { useGameAutoSave } from '../stores/gameSelectors';

const inflight = new Map();

const SHORT_BLADE_RE = /(^|[\s"'()[\]{}.,;:!?_-])(n[oó]ż|knife|sztylet|dagger|kordzik)(?=$|[\s"'()[\]{}.,;:!?_-])/i;

function componentHasDamageSource(component) {
  return !!(
    component
    && (
      component.formula
      || component.dice
      || typeof component.intScale === 'number'
      || (typeof component.flat === 'number' && component.flat > 0)
      || (typeof component.fixedDamage === 'number' && component.fixedDamage > 0)
      || (typeof component.bonus === 'number' && component.bonus > 0)
    )
  );
}

function shouldRefreshSuspiciousLocalModes(item) {
  if (item?.attackModes === undefined) return false;

  const text = `${item.name || ''} ${item.id || ''}`.toLowerCase();
  const meleeComponents = item.attackModes?.melee?.damageComponents || [];
  return SHORT_BLADE_RE.test(text) && !meleeComponents.some(componentHasDamageSource);
}

/**
 * Lazy-fetches attackModes for an item that doesn't have them locally.
 * Skips when the item already has resolved combat (baseType weapon) or
 * when attackModes are already present on the item props.
 *
 * Caches result in game state via dispatch so subsequent renders are instant.
 *
 * Returns { attackModes, explanation, specialProperties, loading, reloading, reload }.
 * `reload()` forces an LLM re-evaluation and returns the new explanation.
 */
export function useItemAttackModes(item, resolvedCombat) {
  const [attackModes, setAttackModes] = useState(null);
  const [explanation, setExplanation] = useState(null);
  const [specialProperties, setSpecialProperties] = useState([]);
  const [loading, setLoading] = useState(false);
  const [reloading, setReloading] = useState(false);
  const cancelledRef = useRef(false);

  const characterId = useGameStore((s) => s.state.character?.backendId || s.state.character?.id);
  const dispatch = useGameStore((s) => s.dispatch);
  const autoSave = useGameAutoSave();

  const itemId = item?.id;
  const hasResolvedCombat = !!resolvedCombat?.attackModes;
  const hasLocalModes = item?.attackModes !== undefined
    && item.attackModesVersion >= 2
    && !shouldRefreshSuspiciousLocalModes(item);
  const shouldSkip = !item || !characterId || hasResolvedCombat || hasLocalModes;

  useEffect(() => {
    cancelledRef.current = false;
    if (shouldSkip) {
      if (hasLocalModes) {
        setAttackModes(item.attackModes);
        setExplanation(item.attackModesExplanation || null);
        setSpecialProperties(item.specialProperties || []);
      }
      return;
    }

    const key = `${characterId}:${itemId}`;
    if (inflight.has(key)) {
      setLoading(true);
      inflight.get(key).then((result) => {
        if (!cancelledRef.current) {
          setAttackModes(result?.attackModes ?? null);
          setExplanation(result?.explanation ?? null);
          setSpecialProperties(result?.specialProperties ?? []);
          setLoading(false);
        }
      });
      return;
    }

    setLoading(true);
    const promise = apiClient
      .post(`/characters/${characterId}/items/${encodeURIComponent(itemId)}/attack-modes`, {})
      .then((data) => {
        const modes = data?.attackModes ?? null;
        const expl = data?.explanation ?? null;
        const sp = data?.specialProperties ?? [];
        if (!cancelledRef.current) {
          setAttackModes(modes);
          setExplanation(expl);
          setSpecialProperties(sp);
          setLoading(false);
          dispatch({
            type: 'UPDATE_ITEM_ATTACK_MODES',
            payload: { itemId, attackModes: modes, attackModesExplanation: expl, specialProperties: sp, attackModesVersion: 2 },
          });
          autoSave();
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
  }, [shouldSkip, itemId, characterId, hasLocalModes, item?.attackModes, dispatch, autoSave]);

  const reload = useCallback(async () => {
    if (!item || !characterId || reloading) return;
    setReloading(true);
    try {
      const data = await apiClient.post(
        `/characters/${characterId}/items/${encodeURIComponent(itemId)}/attack-modes`,
        { force: true },
      );
      const modes = data?.attackModes ?? null;
      const expl = data?.explanation ?? null;
      const sp = data?.specialProperties ?? [];
      setAttackModes(modes);
      setExplanation(expl);
      setSpecialProperties(sp);
      dispatch({
        type: 'UPDATE_ITEM_ATTACK_MODES',
        payload: { itemId, attackModes: modes, attackModesExplanation: expl, specialProperties: sp, attackModesVersion: 2 },
      });
      autoSave();
    } catch { /* swallow */ }
    setReloading(false);
  }, [item, characterId, itemId, reloading, dispatch, autoSave]);

  return { attackModes, explanation, specialProperties, loading, reloading, reload };
}
