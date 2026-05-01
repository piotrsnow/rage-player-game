// HoverTileTooltip — floating summary of the tile under the cursor.
//
// Thin portal wrapper around <TileInfoCard variant="tooltip" />. Handles
// viewport clamping (flip across the hovered tile when the right side of
// the screen is too tight) and passes through everything else.
//
// React.memo keeps the tooltip cheap: on a hover move the parent passes
// a fresh `rect` but the rest of the props (tile reference, groups,
// tileset, imageUrl, resolved group) stay stable — so the tooltip only
// reconciles when one of them actually flipped.

import React from 'react';
import { createPortal } from 'react-dom';
import TileInfoCard from './TileInfoCard.jsx';

const TIP_W = 260;
const TIP_H = 240;

function HoverTileTooltip({ tile, localId, rect, groups, tileset, imageUrl, group }) {
  if (!rect) return null;
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1024;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 768;
  let left = rect.left + rect.width + 8;
  let top = rect.top;
  if (left + TIP_W > vw - 8) left = Math.max(8, rect.left - TIP_W - 8);
  if (top + TIP_H > vh - 8) top = Math.max(8, vh - TIP_H - 8);

  return createPortal(
    <div
      className="z-[9998] fixed pointer-events-none"
      style={{ left, top }}
    >
      <TileInfoCard
        tile={tile}
        localId={localId}
        tilesetId={tileset?.id}
        imageUrl={imageUrl}
        tilesize={tileset?.nativeTilesize}
        imageWidth={tileset?.imageWidth}
        groups={groups}
        group={group}
        variant="tooltip"
      />
    </div>,
    document.body,
  );
}

export default React.memo(HoverTileTooltip);
