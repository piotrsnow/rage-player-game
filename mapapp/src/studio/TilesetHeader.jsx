// TilesetHeader — toolbar above the TileGrid: tileset name, image
// dimensions / native tile size / tile count, zoom control, and the
// auto-detect A1/A2 button.
//
// Moved out of StudioPage for parity with CharGen's PreviewPanel —
// the header has its own state transitions (Auto-detect spinner,
// zoom slider) and is dense enough to deserve a file of its own.

import React from 'react';
import Button from '../ui/Button.jsx';
import Spinner from '../ui/Spinner.jsx';
import ZoomControl from '../ui/ZoomControl.jsx';

export default function TilesetHeader({
  tileset,
  tileCount,
  zoom,
  onZoomChange,
  detectingGroups,
  onAutoDetectGroups,
  showOverlay,
  onToggleOverlay,
}) {
  return (
    <div className="flex items-center gap-2.5 flex-wrap">
      <div className="font-semibold text-on-surface">{tileset.name}</div>
      <div className="text-xs text-on-surface-variant/70">
        {tileset.imageWidth}×{tileset.imageHeight}
        {' · '}
        {tileset.nativeTilesize}px native
        {' · '}
        {tileCount} tiles
      </div>
      <ZoomControl
        className="ml-auto"
        value={zoom}
        onChange={onZoomChange}
        min={1}
        max={6}
        step={1}
      />
      <Button
        size="sm"
        active={showOverlay}
        onClick={onToggleOverlay}
        title="Pokaż/ukryj nakładkę z metadanymi kafli (krawędzie, rola, przechodzenie)"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
          <rect x="1" y="1" width="12" height="12" rx="1" />
          <line x1="1" y1="5" x2="13" y2="5" />
          <line x1="1" y1="9" x2="13" y2="9" />
          <line x1="5" y1="1" x2="5" y2="13" />
          <line x1="9" y1="1" x2="9" y2="13" />
        </svg>
        Overlay
      </Button>
      <Button
        onClick={onAutoDetectGroups}
        disabled={detectingGroups}
        data-tutorial-id="studio-autodetect"
      >
        {detectingGroups && <Spinner size={12} />}
        {detectingGroups ? 'Detecting…' : 'Auto-detect A1/A2 groups'}
      </Button>
    </div>
  );
}
