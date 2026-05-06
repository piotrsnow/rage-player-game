// Debounced bulk save hook.
//
// Collects pending per-tile patches in the Zustand store and flushes them to
// `PATCH /v1/map-studio/tiles/bulk` at most once per `debounceMs` window (the
// plan asks for ~400 ms). Queues coalesce multiple per-tile edits so the
// latest `atoms / traits / tags` lands on the server in a single request.

import { useEffect, useRef } from 'react';
import { api } from '../services/api.js';
import { useStudioStore } from './useStudioStore.js';

export function useBulkSave({ debounceMs = 400 } = {}) {
  const timer = useRef(null);
  const inflight = useRef(false);

  const tilesetId = useStudioStore((s) => s.selectedTilesetId);
  const pendingSize = useStudioStore((s) => s.pendingPatches.size);

  useEffect(() => {
    if (!tilesetId || !pendingSize) return undefined;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { flush(tilesetId); }, debounceMs);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [tilesetId, pendingSize, debounceMs]);
}

async function flush(tilesetId) {
  const store = useStudioStore.getState();
  if (!tilesetId) return;
  const batch = store.takePendingPatches();
  if (!batch.length) return;
  store.setSaving(true);
  try {
    await api.bulkPatchTiles({ tilesetId, patches: batch });
    store.setLastSavedAt(Date.now());
    store.setError(null);
  } catch (err) {
    // On failure, push the patches back into pending so the next debounce
    // retries. Keeps user-visible semantics "eventually saved".
    const reQueued = new Map();
    for (const { localId, patch } of batch) {
      const cur = useStudioStore.getState().pendingPatches.get(localId) || {};
      reQueued.set(localId, { ...patch, ...cur });
    }
    useStudioStore.setState((s) => {
      const next = new Map(s.pendingPatches);
      for (const [id, patch] of reQueued) next.set(id, patch);
      return { pendingPatches: next };
    });
    store.setError(err);
  } finally {
    store.setSaving(false);
  }
}
