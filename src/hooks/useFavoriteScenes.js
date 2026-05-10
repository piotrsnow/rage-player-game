import { useCallback, useEffect, useRef, useState } from 'react';
import { apiClient } from '../services/apiClient';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isPersistedSceneId(sceneId) {
  return typeof sceneId === 'string' && UUID_RE.test(sceneId);
}

/**
 * Tracks which scenes the active character has favorited, and exposes an
 * optimistic toggle that POSTs/DELETEs to the backend. Initial fetch on
 * mount; toggles update the local Set first then reconcile on error.
 */
export function useFavoriteScenes(characterId) {
  const [favoriteIds, setFavoriteIds] = useState(() => new Set());
  const [loaded, setLoaded] = useState(false);
  const inflight = useRef(new Map());

  useEffect(() => {
    if (!characterId) {
      setFavoriteIds(new Set());
      setLoaded(false);
      return;
    }
    let cancelled = false;
    setLoaded(false);
    apiClient.get(`/v1/characters/${characterId}/favorite-scenes?limit=200`)
      .then((res) => {
        if (cancelled) return;
        const ids = new Set((res?.favorites || []).map((f) => f.sceneId).filter(Boolean));
        setFavoriteIds(ids);
      })
      .catch(() => { if (!cancelled) setFavoriteIds(new Set()); })
      .finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [characterId]);

  const isFavorite = useCallback((sceneId) => favoriteIds.has(sceneId), [favoriteIds]);

  const toggle = useCallback(async (sceneId, campaignId) => {
    if (!characterId || !isPersistedSceneId(sceneId) || !isPersistedSceneId(campaignId)) return;
    if (inflight.current.has(sceneId)) return;

    const wasFavorite = favoriteIds.has(sceneId);
    setFavoriteIds((prev) => {
      const next = new Set(prev);
      if (wasFavorite) next.delete(sceneId);
      else next.add(sceneId);
      return next;
    });

    const promise = wasFavorite
      ? apiClient.del(`/v1/characters/${characterId}/favorite-scenes/${sceneId}`)
      : apiClient.post(`/v1/characters/${characterId}/favorite-scenes`, { sceneId, campaignId });

    inflight.current.set(sceneId, promise);
    try {
      await promise;
    } catch {
      setFavoriteIds((prev) => {
        const next = new Set(prev);
        if (wasFavorite) next.add(sceneId);
        else next.delete(sceneId);
        return next;
      });
    } finally {
      inflight.current.delete(sceneId);
    }
  }, [characterId, favoriteIds]);

  return { favoriteIds, isFavorite, toggle, loaded };
}
