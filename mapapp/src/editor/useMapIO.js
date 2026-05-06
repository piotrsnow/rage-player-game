// useMapIO — saveMap / loadMap / newMap helpers for the editor.
//
// Pulls the three imperative I/O paths out of EditorPage. Each one
// performs the same triple:
//   1. hit the API
//   2. reconcile the editor store (palette, mapId, dirty flag, …)
//   3. show a toast with success / failure
//
// Kept as a hook (not a plain module) because we need the `maps` setter
// and the palette builder callback from the page's own state — passing
// them as arguments would be chattier than letting the hook own the
// wiring.

import { useState, useCallback } from 'react';
import { api } from '../services/api.js';
import { serialiseMap, useEditorStore } from './useEditorStore.js';

function stripId(doc) {
  const { id, ...rest } = doc;
  return rest;
}

export function useMapIO({
  toasts,
  setMaps,
  setSelectedPackIds,
  setGroupsByTileset,
  setWallCandidates,
  setPaletteLoading,
  buildPalette,
}) {
  const [saving, setSaving] = useState(false);
  const [loadingMapId, setLoadingMapId] = useState(null);

  const saveMap = useCallback(async () => {
    setSaving(true);
    try {
      const doc = serialiseMap(useEditorStore.getState());
      let saved;
      if (doc.id) saved = await api.updateMap(doc.id, stripId(doc));
      else saved = await api.createMap(stripId(doc));
      useEditorStore.setState({ mapId: saved.id });
      useEditorStore.getState().clearDirty();
      setMaps((prev) => {
        const without = prev.filter((m) => m.id !== saved.id);
        return [saved, ...without];
      });
      toasts.show(`Saved "${saved.name}".`, { level: 'success' });
    } catch (err) {
      toasts.show(`Save failed: ${err.message}`, { level: 'error' });
    } finally {
      setSaving(false);
    }
  }, [toasts, setMaps]);

  const loadMap = useCallback(async (id) => {
    // Debounce rapid re-clicks: loading a second map while one is still
    // in flight would race the palette build and give the user a
    // partially-populated editor.
    if (loadingMapId) return;
    setLoadingMapId(id);
    try {
      const doc = await api.getMap(id);
      const packIds = doc.packIds || [];
      // Build the palette for the map's packs BEFORE loading the map,
      // so loadMap() sees a fully populated palette (avoids the old
      // setTimeout race where cold API calls would overrun 50ms).
      setPaletteLoading?.(true);
      const built = await buildPalette(packIds);
      const st = useEditorStore.getState();
      st.setPalette({ palette: built.palette, paletteByKey: built.paletteByKey });
      st.setPackIds(packIds);
      setGroupsByTileset(built.groupsMap);
      setWallCandidates(built.walls);
      setSelectedPackIds(packIds);
      st.loadMap(doc, { palette: built.palette, paletteByKey: built.paletteByKey });
      toasts.show(`Loaded "${doc.name}".`, { level: 'success' });
    } catch (err) {
      toasts.show(`Load failed: ${err.message}`, { level: 'error' });
    } finally {
      setLoadingMapId(null);
      setPaletteLoading?.(false);
    }
  }, [
    loadingMapId, toasts, buildPalette,
    setSelectedPackIds, setGroupsByTileset, setWallCandidates, setPaletteLoading,
  ]);

  const newMap = useCallback((packIds = []) => {
    const s = useEditorStore.getState();
    s.resetMap({
      cols: 32,
      rows: 24,
      projectTilesize: s.projectTilesize || 24,
      packIds,
    });
  }, []);

  return { saving, loadingMapId, saveMap, loadMap, newMap };
}
