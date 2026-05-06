// usePaletteBuilder — builds the editor palette from a set of pack IDs.
//
// Extracted from the 70-line block at the top of EditorPage (roughly
// `buildPaletteFromPacks` + the effect that invoked it on pack
// selection change). The hook returns:
//   - palette        : live palette (mirrors useEditorStore.palette)
//   - paletteLoading : true while a build is in flight
//   - groupsByTileset: Map<tilesetId, AutotileGroup[]>
//   - wallCandidates : [{ paletteIndex, atoms, autotileRole, tilesetId }]
//   - build(packIds) : imperative build (used by useMapIO.loadMap)
//
// Why a hook: `buildPaletteFromPacks` is called in two separate places
// (the effect here + loadMap). Hoisting it out of EditorPage keeps the
// page file under its 220L budget and makes the side-effect (network
// fetches, store mutation) testable in isolation.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, mediaUrlForKey } from '../services/api.js';
import { useEditorStore } from './useEditorStore.js';
import { makePaletteEntry } from '../engine/paletteEntry.js';

function findBestVariant(rendered, target) {
  if (!rendered) return null;
  return rendered[String(target)] || null;
}

export function usePaletteBuilder({ selectedPackIds, onError }) {
  const projectTilesize = useEditorStore((s) => s.projectTilesize);
  const setPalette = useEditorStore((s) => s.setPalette);
  const setPackIds = useEditorStore((s) => s.setPackIds);
  const [paletteLoading, setPaletteLoading] = useState(false);
  const [groupsByTileset, setGroupsByTileset] = useState(new Map());
  const [wallCandidates, setWallCandidates] = useState([]);

  const build = useCallback(async (packIds) => {
    const palette = [];
    const paletteByKey = new Map();
    const groupsMap = new Map();
    const walls = [];
    if (!packIds || !packIds.length) {
      return { palette, paletteByKey, groupsMap, walls };
    }
    for (const packId of packIds) {
      const tilesets = await api.listTilesets(packId);
      for (const ts of tilesets) {
        const [tiles, groups] = await Promise.all([
          api.listTiles(ts.id),
          api.listAutotileGroups(ts.id),
        ]);
        groupsMap.set(ts.id, groups);
        const tileCols = Math.max(
          1,
          Math.floor((ts.imageWidth || 0) / (ts.nativeTilesize || 16)),
        );
        const variant = findBestVariant(ts.renderedVariants, projectTilesize);
        const imageKey = variant?.imageKey || ts.imageKey;
        const variantTilesize = variant ? projectTilesize : (ts.nativeTilesize || 16);

        const tileByLocalId = new Map(tiles.map((t) => [t.localId, t]));
        const tileCountGrid = tileCols * Math.max(
          1,
          Math.floor((ts.imageHeight || 0) / (ts.nativeTilesize || 16)),
        );
        for (let localId = 0; localId < tileCountGrid; localId++) {
          const col = localId % tileCols;
          const row = Math.floor(localId / tileCols);
          const tile = tileByLocalId.get(localId);
          const entry = makePaletteEntry({
            packId, ts, tile, imageKey, tilesize: variantTilesize, localId, col, row,
          });
          paletteByKey.set(entry.key, palette.length);
          palette.push(entry);
          if (entry.atoms?.includes('wall')) {
            walls.push({
              paletteIndex: palette.length,
              atoms: entry.atoms,
              autotileRole: entry.autotileRole,
              tilesetId: ts.id,
            });
          }
        }
      }
    }
    return { palette, paletteByKey, groupsMap, walls };
  }, [projectTilesize]);

  useEffect(() => {
    let cancelled = false;
    if (!selectedPackIds.length) {
      setPaletteLoading(false);
      return undefined;
    }
    setPaletteLoading(true);
    (async () => {
      try {
        const { palette, paletteByKey, groupsMap, walls } = await build(selectedPackIds);
        if (cancelled) return;
        setPalette({ palette, paletteByKey });
        setPackIds(selectedPackIds);
        setGroupsByTileset(groupsMap);
        setWallCandidates(walls);
      } catch (err) {
        if (!cancelled) onError?.(err);
      } finally {
        if (!cancelled) setPaletteLoading(false);
      }
    })();
    return () => { cancelled = true; };
     
  }, [selectedPackIds.join(','), build]);

  const palette = useEditorStore((s) => s.palette);
  const textureUrls = useMemo(() => {
    const out = {};
    for (const e of palette) {
      if (!out[e.imageKey]) out[e.imageKey] = mediaUrlForKey(e.imageKey);
    }
    return out;
  }, [palette]);

  return {
    palette,
    paletteLoading,
    setPaletteLoading,
    groupsByTileset,
    setGroupsByTileset,
    wallCandidates,
    setWallCandidates,
    build,
    textureUrls,
  };
}
