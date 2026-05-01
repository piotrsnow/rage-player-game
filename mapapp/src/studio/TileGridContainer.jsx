// TileGridContainer — owns the subscriptions that the <TileGrid> actually
// consumes (tilesByLocalId, selection, overlay flags, cross-hover state)
// so that updates to those slices re-render *only* this container instead
// of the whole StudioPage. Before this split a single inspector edit
// bumped `tilesByLocalId` which in turn re-ran StudioPage + every sibling
// SectionCard / TilesetHeader / PackList.
//
// Inputs from the parent are limited to stable props: the active tileset,
// its atlas url, and per-session UX state (zoom, hover-group id,
// setHoveredTile dispatcher, draftGroup). `useShallow` groups the store
// reads into one selector so the container re-renders only when one of
// the referenced fields actually changes.

import React, { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import TileGrid from './TileGrid.jsx';
import HoverTileTooltip from './HoverTileTooltip.jsx';
import { useStudioStore } from './useStudioStore.js';
import { cellsForLayout } from '../engine/autotileLayout.js';

// Build a reverse index `localId → group` from the autotile groups and
// the atlas column count. Keeps the tooltip O(1) instead of doing a
// linear scan across all groups on every hover.
function buildGroupByLocalId(groups, cols, rows) {
  const map = new Map();
  if (!Array.isArray(groups) || !groups.length || !cols || !rows) return map;
  for (const g of groups) {
    const spec = cellsForLayout(g);
    const c0 = g.originCol || 0;
    const r0 = g.originRow || 0;
    const cEnd = Math.min(cols, c0 + spec.cols);
    const rEnd = Math.min(rows, r0 + spec.rows);
    for (let r = r0; r < rEnd; r++) {
      for (let c = c0; c < cEnd; c++) {
        const id = r * cols + c;
        // First group wins on overlaps — matches the old linear-scan
        // behaviour in findGroupForTile which returned on first match.
        if (!map.has(id)) map.set(id, g);
      }
    }
  }
  return map;
}

function TileGridContainer({
  tileset,
  imageUrl,
  autotileGroups,
  zoom,
  hoveredGroupId,
  draftGroup,
  onHoverTile,
  hoveredTile,
  onSelectionChange,
}) {
  // One grouped subscription instead of 6 individual ones — React bails
  // out on shallow-equal results so unrelated store writes don't
  // re-render the container.
  const {
    tilesByLocalId,
    selection,
    tileOverlayFlags,
    tileFocusMode,
    highlightUntagged,
    hoverTooltipEnabled,
    hoveredAtom,
    hoveredTrait,
  } = useStudioStore(
    useShallow((s) => ({
      tilesByLocalId: s.tilesByLocalId,
      selection: s.selection,
      tileOverlayFlags: s.tileOverlayFlags,
      tileFocusMode: s.tileFocusMode,
      highlightUntagged: s.highlightUntagged,
      hoverTooltipEnabled: s.hoverTooltipEnabled,
      hoveredAtom: s.hoveredAtom,
      hoveredTrait: s.hoveredTrait,
    })),
  );

  const hoveredTileData = useMemo(
    () => (hoveredTile ? tilesByLocalId.get(hoveredTile.id) : undefined),
    [hoveredTile, tilesByLocalId],
  );

  // Precompute localId → group once per groups/tileset change. Shared by
  // HoverTileTooltip (and future pin/inspector consumers) instead of
  // each running its own linear `findGroupForTile` scan per hover.
  const groupByLocalId = useMemo(() => {
    const native = tileset?.nativeTilesize;
    const iw = tileset?.imageWidth;
    const ih = tileset?.imageHeight;
    if (!native || !iw || !ih) return new Map();
    const cols = Math.floor(iw / native);
    const rows = Math.floor(ih / native);
    return buildGroupByLocalId(autotileGroups, cols, rows);
  }, [autotileGroups, tileset?.nativeTilesize, tileset?.imageWidth, tileset?.imageHeight]);

  const hoveredGroup = hoveredTile ? groupByLocalId.get(hoveredTile.id) || null : null;

  return (
    <>
      <TileGrid
        imageUrl={imageUrl}
        tilesize={tileset.nativeTilesize}
        imageWidth={tileset.imageWidth}
        imageHeight={tileset.imageHeight}
        selection={selection}
        onSelectionChange={onSelectionChange}
        groups={autotileGroups}
        tilesByLocalId={tilesByLocalId}
        hoveredGroupId={hoveredGroupId}
        onHoverTile={onHoverTile}
        draftGroup={draftGroup}
        zoom={zoom}
        overlayFlags={tileOverlayFlags}
        focusMode={tileFocusMode}
        highlightUntagged={highlightUntagged}
        hoveredAtom={hoveredAtom}
        hoveredTrait={hoveredTrait}
      />
      {hoveredTile && hoverTooltipEnabled && (
        <HoverTileTooltip
          tile={hoveredTileData}
          localId={hoveredTile.id}
          rect={hoveredTile.rect}
          groups={autotileGroups}
          tileset={tileset}
          imageUrl={imageUrl}
          group={hoveredGroup}
        />
      )}
    </>
  );
}

export default React.memo(TileGridContainer);
