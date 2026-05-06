// Zustand store for Tileset Studio UI state.
//
// Split concerns:
//   - packs / selectedPackId  — loaded TilesetPacks for the current user
//   - tilesets / selectedTilesetId
//   - tilesByLocalId          — map of tile metadata by localId
//   - selection               — Set of localIds currently selected (for the
//                               Inspector to bulk-patch)
//   - pendingPatches          — in-flight patches keyed by localId; the
//                               debounced saver flushes these as a batch
//
// Derived data (e.g. bounding grid for rendering) is computed by selectors
// to keep renders cheap.

import { create } from 'zustand';

export const useStudioStore = create((set, get) => ({
  packs: [],
  selectedPackId: null,
  tilesets: [],
  selectedTilesetId: null,
  tilesByLocalId: new Map(),
  selection: new Set(),
  pendingPatches: new Map(),
  isLoadingTiles: false,
  isSaving: false,
  lastSavedAt: null,
  error: null,

  setPacks(packs) {
    set({ packs });
  },
  selectPack(packId) {
    set({
      selectedPackId: packId,
      tilesets: [],
      selectedTilesetId: null,
      tilesByLocalId: new Map(),
      selection: new Set(),
      pendingPatches: new Map(),
    });
  },
  setTilesets(tilesets) {
    set({ tilesets });
  },
  selectTileset(tilesetId) {
    set({
      selectedTilesetId: tilesetId,
      tilesByLocalId: new Map(),
      selection: new Set(),
      pendingPatches: new Map(),
    });
  },
  setTiles(tilesArray) {
    const map = new Map();
    for (const t of tilesArray) map.set(t.localId, t);
    set({ tilesByLocalId: map });
  },
  setSelection(localIds) {
    set({ selection: new Set(localIds) });
  },
  toggleSelection(localId, additive) {
    const next = new Set(get().selection);
    if (additive) {
      if (next.has(localId)) next.delete(localId);
      else next.add(localId);
    } else {
      next.clear();
      next.add(localId);
    }
    set({ selection: next });
  },
  clearSelection() {
    set({ selection: new Set() });
  },

  // Apply an optimistic patch to every selected tile + queue for upload.
  queuePatch(patch) {
    const { selection, tilesByLocalId, pendingPatches } = get();
    if (!selection.size) return;
    const nextTiles = new Map(tilesByLocalId);
    const nextPending = new Map(pendingPatches);
    for (const localId of selection) {
      const prev = nextTiles.get(localId) || { localId, atoms: [], traits: {}, tags: [] };
      const merged = mergePatch(prev, patch);
      nextTiles.set(localId, merged);
      const prevPending = nextPending.get(localId) || {};
      nextPending.set(localId, { ...prevPending, ...patch });
    }
    set({ tilesByLocalId: nextTiles, pendingPatches: nextPending });
  },

  // Per-tile variant: `patchFn(prevTile)` returns the patch to apply to that
  // specific tile. Needed for atom-toggle across a multi-selection where
  // other atoms per tile must be preserved.
  queuePerTilePatch(patchFn) {
    const { selection, tilesByLocalId, pendingPatches } = get();
    if (!selection.size) return;
    const nextTiles = new Map(tilesByLocalId);
    const nextPending = new Map(pendingPatches);
    for (const localId of selection) {
      const prev = nextTiles.get(localId) || { localId, atoms: [], traits: {}, tags: [] };
      const patch = patchFn(prev) || {};
      if (!Object.keys(patch).length) continue;
      nextTiles.set(localId, mergePatch(prev, patch));
      const prevPending = nextPending.get(localId) || {};
      nextPending.set(localId, { ...prevPending, ...patch });
    }
    set({ tilesByLocalId: nextTiles, pendingPatches: nextPending });
  },

  takePendingPatches() {
    const { pendingPatches } = get();
    if (!pendingPatches.size) return [];
    const batch = Array.from(pendingPatches.entries()).map(([localId, patch]) => ({
      localId,
      patch,
    }));
    set({ pendingPatches: new Map() });
    return batch;
  },

  setSaving(isSaving) {
    set({ isSaving });
  },
  setLastSavedAt(ts) {
    set({ lastSavedAt: ts });
  },
  setError(err) {
    set({ error: err ? String(err?.message || err) : null });
  },
}));

function mergePatch(prev, patch) {
  const next = { ...prev };
  if (patch.atoms !== undefined) next.atoms = [...patch.atoms];
  if (patch.traits !== undefined) next.traits = { ...(prev.traits || {}), ...patch.traits };
  if (patch.tags !== undefined) next.tags = [...patch.tags];
  if (patch.autotileGroupId !== undefined) next.autotileGroupId = patch.autotileGroupId;
  if (patch.autotileRole !== undefined) next.autotileRole = patch.autotileRole;
  if (patch.notes !== undefined) next.notes = patch.notes;
  if (patch.regionId !== undefined) next.regionId = patch.regionId;
  return next;
}
