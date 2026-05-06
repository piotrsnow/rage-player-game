// Shared Zustand store for MapActors with a TTL-based cache.
//
// Three unrelated pages load the same actors list: /editor (ActorsPanel),
// /chargen (CharGenPage), /play/:mapId (PlayPage). Before this store each
// one fired its own `api.listActors()` on mount, duplicating the round-trip
// and keeping three copies of the same list in React state that drifted
// apart after create/update/delete.
//
// This store:
//   - Fetches once, serves the cached list for TTL_MS.
//   - De-duplicates concurrent fetches (shared in-flight promise).
//   - Exposes `upsert(actor)` / `remove(id)` for optimistic local updates
//     after a create / update / delete.
//   - Auto-refetches on window focus, tab visibility change, and the
//     `rpgon:actors-changed` CustomEvent (kept for backward compat with
//     existing dispatchers in CharGenPage).
//   - Provides a `useActors()` hook that triggers a fetch on mount iff the
//     cache is stale.

import { useEffect } from 'react';
import { create } from 'zustand';
import { api } from './api.js';

const TTL_MS = 30_000;

export const useActorsStore = create((set, get) => ({
  actors: [],
  loading: false,
  error: null,
  lastFetchedAt: 0,
  // Not part of the public API — shared promise for concurrent callers so
  // three components mounting on the same frame don't fan out to three
  // network requests.
  _inflight: null,

  isFresh() {
    const { lastFetchedAt } = get();
    return lastFetchedAt > 0 && Date.now() - lastFetchedAt < TTL_MS;
  },

  fetch({ force = false } = {}) {
    const state = get();
    if (state._inflight) return state._inflight;
    if (!force && state.isFresh()) return Promise.resolve(state.actors);

    set({ loading: true, error: null });
    const p = api.listActors()
      .then((list) => {
        set({
          actors: Array.isArray(list) ? list : [],
          lastFetchedAt: Date.now(),
          loading: false,
          error: null,
          _inflight: null,
        });
        return get().actors;
      })
      .catch((err) => {
        set({ error: err.message || String(err), loading: false, _inflight: null });
        throw err;
      });
    set({ _inflight: p });
    return p;
  },

  invalidate() {
    set({ lastFetchedAt: 0 });
  },

  // Optimistic insert-or-update. Moves the actor to the front of the list so
  // recently-edited entries bubble up in sidebars.
  upsert(actor) {
    if (!actor || !actor.id) return;
    set((s) => ({
      actors: [actor, ...s.actors.filter((a) => a.id !== actor.id)],
      lastFetchedAt: Date.now(),
    }));
  },

  remove(id) {
    if (!id) return;
    set((s) => ({
      actors: s.actors.filter((a) => a.id !== id),
      lastFetchedAt: Date.now(),
    }));
  },
}));

// Module-level listeners: any mounted consumer (or none) benefits. Consumers
// no longer need their own focus/visibility handlers. We dispatch fetches
// through the store so the in-flight dedup still applies.
if (typeof window !== 'undefined') {
  const refetch = () => {
    const s = useActorsStore.getState();
    if (s._inflight) return;
    s.fetch({ force: true }).catch(() => { /* surfaced via store.error */ });
  };
  window.addEventListener('focus', refetch);
  window.addEventListener('rpgon:actors-changed', refetch);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refetch();
  });
}

/**
 * Hook that returns the current actors list plus loading/error flags and
 * triggers a fetch on mount when the cache is stale. Multiple components
 * can call this simultaneously; the store collapses them into a single
 * request.
 */
export function useActors() {
  const actors = useActorsStore((s) => s.actors);
  const loading = useActorsStore((s) => s.loading);
  const error = useActorsStore((s) => s.error);
  const fetchActors = useActorsStore((s) => s.fetch);

  useEffect(() => {
    fetchActors().catch(() => { /* error state already set on the store */ });
  }, [fetchActors]);

  return { actors, loading, error, refetch: () => fetchActors({ force: true }) };
}
