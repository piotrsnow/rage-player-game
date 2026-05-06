// TilesetTabs — horizontal row of tileset buttons for the currently
// selected pack. Pulled out of StudioPage so the main panel is easier
// to scan. Each tab is a Button (primitive) so hover / active states
// stay consistent with the rest of the app.
//
// Props:
//   tilesets          — rows (at least { id, name, nativeTilesize })
//   loading           — small spinner in-row when tilesets are refreshing
//   selectedTilesetId — active tab id
//   onSelect(id)      — click handler

import React from 'react';
import Button from '../ui/Button.jsx';
import Spinner from '../ui/Spinner.jsx';

export default function TilesetTabs({
  tilesets,
  loading,
  selectedTilesetId,
  onSelect,
}) {
  if (!tilesets.length && !loading) return null;
  return (
    <section
      className="flex gap-2 flex-wrap items-center"
      data-tutorial-id="studio-tileset-tabs"
    >
      {loading && <Spinner size={12} />}
      {tilesets.map((t) => (
        <Button
          key={t.id}
          onClick={() => onSelect(t.id)}
          active={t.id === selectedTilesetId}
        >
          {t.name}
          <span className="ml-1 opacity-70">{t.nativeTilesize}px</span>
        </Button>
      ))}
    </section>
  );
}
