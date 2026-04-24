import { SCENE_INDEX_CACHE_KEY } from './keys.js';

/**
 * Scene-index high-water-mark cache. The bulk save route skips any scene
 * whose index is ≤ the cached value, which dedupes the save window against
 * the backend's own SSE-side scene write (the cache is bumped by
 * `markSceneSavedRemotely` right after a `complete` event).
 *
 * Backed by localStorage so the cache survives reload — otherwise refresh
 * would re-POST every scene. Writes are non-critical (quota-exceeded is
 * swallowed) because the worst case is a redundant bulk upload.
 */
export const sceneIndexCache = {
  _mem: new Map(),
  _loaded: false,

  _loadFromStorage() {
    if (this._loaded) return;
    this._loaded = true;
    try {
      const raw = localStorage.getItem(SCENE_INDEX_CACHE_KEY);
      if (raw) {
        const obj = JSON.parse(raw);
        for (const [k, v] of Object.entries(obj)) this._mem.set(k, v);
      }
    } catch { /* ignore corrupt data */ }
  },

  _persist() {
    try {
      const obj = Object.fromEntries(this._mem);
      localStorage.setItem(SCENE_INDEX_CACHE_KEY, JSON.stringify(obj));
    } catch { /* quota exceeded — non-critical */ }
  },

  get(backendId) {
    this._loadFromStorage();
    return this._mem.get(backendId);
  },

  set(backendId, index) {
    this._loadFromStorage();
    this._mem.set(backendId, index);
    this._persist();
  },

  delete(backendId) {
    this._loadFromStorage();
    this._mem.delete(backendId);
    this._persist();
  },

  has(backendId) {
    this._loadFromStorage();
    return this._mem.has(backendId);
  },

  // Bump cache only if newIndex is higher than current — never move the
  // marker backwards, since that would re-upload already-persisted scenes.
  bump(backendId, newIndex) {
    if (!Number.isInteger(newIndex)) return;
    this._loadFromStorage();
    const current = this._mem.get(backendId) ?? -1;
    if (newIndex > current) {
      this._mem.set(backendId, newIndex);
      this._persist();
    }
  },
};
