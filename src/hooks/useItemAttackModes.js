import { useState, useEffect, useRef } from 'react';
import { apiClient } from '../services/apiClient';
import { useGameStore } from '../stores/gameStore';

const inflight = new Map();

/**
 * Lazy-fetches attackModes for an item that doesn't have them locally.
 * Skips when the item already has resolved combat (baseType weapon) or
 * when attackModes are already present on the item props.
 *
 * Caches result in game state via dispatch so subsequent renders are instant.
 */
export function useItemAttackModes(item, resolvedCombat) {
  const [attackModes, setAttackModes] = useState(null);
  const [loading, setLoading] = useState(false);
  const cancelledRef = useRef(false);

  const characterId = useGameStore((s) => s.state.character?.backendId || s.state.character?.id);
  const dispatch = useGameStore((s) => s.dispatch);

  const itemId = item?.id;
  const hasResolvedCombat = !!resolvedCombat?.attackModes;
  const hasLocalModes = item?.attackModes !== undefined;
  const shouldSkip = !item || !characterId || hasResolvedCombat || hasLocalModes;

  useEffect(() => {
    cancelledRef.current = false;
    if (shouldSkip) {
      if (hasLocalModes) setAttackModes(item.attackModes);
      return;
    }

    const key = `${characterId}:${itemId}`;
    if (inflight.has(key)) {
      setLoading(true);
      inflight.get(key).then((result) => {
        if (!cancelledRef.current) {
          setAttackModes(result);
          setLoading(false);
        }
      });
      return;
    }

    setLoading(true);
    const promise = apiClient
      .post(`/characters/${characterId}/items/${encodeURIComponent(itemId)}/attack-modes`)
      .then((data) => {
        const modes = data?.attackModes ?? null;
        if (!cancelledRef.current) {
          setAttackModes(modes);
          setLoading(false);
          dispatch({
            type: 'UPDATE_ITEM_ATTACK_MODES',
            payload: { itemId, attackModes: modes },
          });
        }
        return modes;
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
  }, [shouldSkip, itemId, characterId, hasLocalModes, item?.attackModes, dispatch]);

  return { attackModes, loading };
}
