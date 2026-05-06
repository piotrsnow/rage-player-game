// useStudioFetches — cascading "load packs → load tilesets → load tiles"
// effects that were previously three useEffects inlined in StudioPage.
//
// Ownership rules:
//   * State and setters live in the studio Zustand store (the source of
//     truth) so other components see fresh data immediately.
//   * Loading flags (`packsLoading`, `tilesetsLoading`, `tilesLoading`)
//     are local to the hook; they drive spinners but don't survive
//     remounts intentionally — if the page is remounted we want the
//     fresh load UI again.
//   * Every effect cancels cleanly so a fast pack switch doesn't leak
//     stale responses into the newer selection.

import { useEffect, useRef, useState } from 'react';
import { api } from '../services/api.js';
import { useStudioStore } from './useStudioStore.js';
import { useToasts } from '../ui/Toasts.jsx';

export function useStudioFetches() {
  const toasts = useToasts();
  // We route toasts through a ref so the long-lived async IIFEs in the
  // effects below capture the *current* toast provider, not whatever
  // happened to be mounted when the effect first fired.
  const toastsRef = useRef(toasts);
  toastsRef.current = toasts;

  const packs = useStudioStore((s) => s.packs);
  const setPacks = useStudioStore((s) => s.setPacks);
  const selectedPackId = useStudioStore((s) => s.selectedPackId);
  const selectPack = useStudioStore((s) => s.selectPack);
  const selectedTilesetId = useStudioStore((s) => s.selectedTilesetId);
  const setTilesets = useStudioStore((s) => s.setTilesets);
  const selectTileset = useStudioStore((s) => s.selectTileset);
  const setTiles = useStudioStore((s) => s.setTiles);

  const [autotileGroups, setAutotileGroups] = useState([]);
  const [packsLoading, setPacksLoading] = useState(true);
  const [tilesetsLoading, setTilesetsLoading] = useState(false);
  const [tilesLoading, setTilesLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setPacksLoading(true);
      try {
        const rows = await api.listPacks();
        if (cancelled) return;
        setPacks(rows);
        if (rows.length && !useStudioStore.getState().selectedPackId) {
          selectPack(rows[0].id);
        }
      } catch (err) {
        if (!cancelled) toastsRef.current?.show(`Failed to load packs: ${err.message}`, { level: 'error' });
      } finally {
        if (!cancelled) setPacksLoading(false);
      }
    })();
    return () => { cancelled = true; };
     
  }, []);

  useEffect(() => {
    if (!selectedPackId) return undefined;
    let cancelled = false;
    setTilesetsLoading(true);
    (async () => {
      try {
        const rows = await api.listTilesets(selectedPackId);
        if (cancelled) return;
        setTilesets(rows);
        if (rows.length && !useStudioStore.getState().selectedTilesetId) {
          selectTileset(rows[0].id);
        }
      } catch (err) {
        if (!cancelled) toastsRef.current?.show(`Failed to load tilesets: ${err.message}`, { level: 'error' });
      } finally {
        if (!cancelled) setTilesetsLoading(false);
      }
    })();
    return () => { cancelled = true; };
     
  }, [selectedPackId]);

  useEffect(() => {
    if (!selectedTilesetId) return undefined;
    let cancelled = false;
    setTilesLoading(true);
    (async () => {
      try {
        const [tileRows, groupRows] = await Promise.all([
          api.listTiles(selectedTilesetId),
          api.listAutotileGroups(selectedTilesetId),
        ]);
        if (cancelled) return;
        setTiles(tileRows);
        setAutotileGroups(groupRows);
      } catch (err) {
        if (!cancelled) toastsRef.current?.show(`Failed to load tiles: ${err.message}`, { level: 'error' });
      } finally {
        if (!cancelled) setTilesLoading(false);
      }
    })();
    return () => { cancelled = true; };
     
  }, [selectedTilesetId]);

  async function refreshPacks() {
    const rows = await api.listPacks();
    setPacks(rows);
  }

  return {
    packs,
    packsLoading,
    tilesetsLoading,
    tilesLoading,
    autotileGroups,
    setAutotileGroups,
    refreshPacks,
  };
}
