// Regression tests for the "edits revert after reload" bug.
//
// The store used to wipe `pendingPatches` whenever the user switched
// tilesets / packs or cleared their selection — which silently dropped
// any Inspector edits still waiting in the 400 ms debounce window that
// `useBulkSave` uses. A separate gap was that `setTiles` overwrote the
// optimistic tile map with the stale server snapshot even when the user
// had newer unsaved edits pending.
//
// These tests pin both behaviours so the two code paths can't regress
// together again. See also the hand-written notes in useBulkSave.js.

import { describe, it, expect, beforeEach } from 'vitest';
import { useStudioStore } from './useStudioStore.js';

function resetStore() {
  useStudioStore.setState({
    packs: [],
    selectedPackId: null,
    tilesets: [],
    selectedTilesetId: null,
    tilesByLocalId: new Map(),
    autotileGroups: [],
    rules: [],
    selection: new Set(),
    pendingPatches: new Map(),
    isLoadingTiles: false,
    isSaving: false,
    lastSavedAt: null,
    error: null,
    hoveredAtom: null,
    hoveredTrait: null,
  });
}

describe('useStudioStore — pending patches are not dropped on navigation', () => {
  beforeEach(() => resetStore());

  it('keeps pendingPatches when switching tilesets', () => {
    useStudioStore.setState({
      tilesets: [{ id: 'ts-a' }, { id: 'ts-b' }],
      selectedTilesetId: 'ts-a',
      selection: new Set([7]),
      tilesByLocalId: new Map([[7, { localId: 7, atoms: [], traits: {}, tags: [] }]]),
    });

    useStudioStore.getState().queuePerTilePatch(() => ({ atoms: ['walkable'] }));
    expect(useStudioStore.getState().pendingPatches.size).toBe(1);

    useStudioStore.getState().selectTileset('ts-b');

    expect(useStudioStore.getState().pendingPatches.size).toBe(1);
    expect(useStudioStore.getState().pendingPatches.get(7)).toEqual({ atoms: ['walkable'] });
  });

  it('keeps pendingPatches when switching packs', () => {
    useStudioStore.setState({
      packs: [{ id: 'p-a' }, { id: 'p-b' }],
      selectedPackId: 'p-a',
      selection: new Set([3]),
      tilesByLocalId: new Map([[3, { localId: 3, atoms: [], traits: {}, tags: [] }]]),
    });

    useStudioStore.getState().queuePerTilePatch(() => ({ tags: ['foo'] }));
    expect(useStudioStore.getState().pendingPatches.size).toBe(1);

    useStudioStore.getState().selectPack('p-b');

    expect(useStudioStore.getState().pendingPatches.size).toBe(1);
    expect(useStudioStore.getState().pendingPatches.get(3)).toEqual({ tags: ['foo'] });
  });

  it('keeps pendingPatches when clearing selection', () => {
    useStudioStore.setState({
      selectedTilesetId: 'ts-a',
      selection: new Set([5]),
      tilesByLocalId: new Map([[5, { localId: 5, atoms: [], traits: {}, tags: [] }]]),
    });
    useStudioStore.getState().queuePerTilePatch(() => ({ atoms: ['floor'] }));
    expect(useStudioStore.getState().pendingPatches.size).toBe(1);

    useStudioStore.getState().clearSelection();

    expect(useStudioStore.getState().pendingPatches.size).toBe(1);
  });
});

describe('useStudioStore.setTiles — preserves in-flight pending patches', () => {
  beforeEach(() => resetStore());

  it('re-applies a pending patch on top of the fresh server snapshot', () => {
    useStudioStore.setState({
      selection: new Set([2]),
      tilesByLocalId: new Map([[2, { localId: 2, atoms: [], traits: {}, tags: [] }]]),
    });
    useStudioStore.getState().queuePerTilePatch(() => ({ atoms: ['walkable'] }));

    // Concurrent re-fetch lands with a "stale" server snapshot that
    // hasn't seen the edit yet.
    useStudioStore.getState().setTiles([
      { localId: 2, atoms: [], traits: {}, tags: [] },
      { localId: 3, atoms: ['solid'], traits: {}, tags: [] },
    ]);

    const tile2 = useStudioStore.getState().tilesByLocalId.get(2);
    expect(tile2.atoms).toEqual(['walkable']);
    // Rows without a pending patch should still mirror the server.
    const tile3 = useStudioStore.getState().tilesByLocalId.get(3);
    expect(tile3.atoms).toEqual(['solid']);
    // The pending patch itself must still be queued until the save
    // pipeline flushes it — setTiles must not silently ACK.
    expect(useStudioStore.getState().pendingPatches.get(2)).toEqual({ atoms: ['walkable'] });
  });
});
