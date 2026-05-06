// Palette — scrollable grid of tile thumbnails sourced from the loaded
// packs. Clicking a thumbnail selects it for the Brush / Rect / Fill
// tools. Shift+click on an autotile group's origin cell selects the
// whole group (wired up by the parent page).
//
// Layout: tileset tabs on top + grid of cells below. Each cell renders
// as a <canvas> slice of the atlas; we draw once into the canvas for
// every entry (cheap enough for a few thousand cells).

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useEditorStore } from './useEditorStore.js';

export default function Palette({ textureUrls }) {
  const palette = useEditorStore((s) => s.palette);
  const selected = useEditorStore((s) => s.selectedPaletteIndex);
  const setSelected = useEditorStore((s) => s.setSelectedPaletteIndex);
  const autotileGroupId = useEditorStore((s) => s.autotileGroupId);
  const setAutotileGroupId = useEditorStore((s) => s.setAutotileGroupId);

  const byTileset = useMemo(() => {
    const map = new Map();
    palette.forEach((entry, i) => {
      if (!map.has(entry.tilesetId)) {
        map.set(entry.tilesetId, { tilesetId: entry.tilesetId, tilesetName: entry.tilesetName, entries: [] });
      }
      map.get(entry.tilesetId).entries.push({ ...entry, paletteIndex: i });
    });
    return Array.from(map.values());
  }, [palette]);

  const [activeTilesetId, setActiveTilesetId] = useState(null);
  useEffect(() => {
    if (!byTileset.length) { setActiveTilesetId(null); return; }
    if (!byTileset.find((g) => g.tilesetId === activeTilesetId)) {
      setActiveTilesetId(byTileset[0].tilesetId);
    }
  }, [byTileset, activeTilesetId]);

  const active = byTileset.find((g) => g.tilesetId === activeTilesetId);

  return (
    <div className="flex flex-col min-h-0 h-full" data-tutorial-id="palette-right">
      <div className="flex gap-1 flex-wrap p-1.5 border-b border-outline-variant/20">
        {byTileset.map((g) => {
          const on = g.tilesetId === activeTilesetId;
          return (
            <button
              key={g.tilesetId}
              onClick={() => setActiveTilesetId(g.tilesetId)}
              className={[
                'px-2 py-1 text-[11px] rounded-sm border transition-colors',
                on
                  ? 'bg-primary-dim text-white font-semibold border-primary shadow-[0_0_8px_rgba(197,154,255,0.3)]'
                  : 'bg-surface-container/70 text-on-surface border-outline-variant/30 hover:border-primary/40 hover:bg-surface-container-high/70',
              ].join(' ')}
            >
              {g.tilesetName || 'tileset'}
            </button>
          );
        })}
      </div>
      <div className="flex-1 overflow-auto custom-scrollbar p-1.5 min-h-0">
        {!active && (
          <div className="text-xs text-on-surface-variant/60 p-2">Brak palety — wybierz paczkę.</div>
        )}
        {active && (
          <PaletteGrid
            entries={active.entries}
            url={textureUrls?.[active.entries[0]?.imageKey]}
            selectedIndex={selected}
            onSelect={(idx) => {
              setSelected(idx);
              setAutotileGroupId(null);
            }}
          />
        )}
      </div>
      {autotileGroupId && (
        <div className="p-1.5 text-[11px] text-on-surface-variant border-t border-outline-variant/20">
          Autotile group active — LMB paints with blob-47 / A2 mask.
        </div>
      )}
    </div>
  );
}

function PaletteGrid({ entries, url, selectedIndex, onSelect }) {
  const canvasRefs = useRef({});
  const [image, setImage] = useState(null);

  useEffect(() => {
    if (!url) { setImage(null); return; }
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => { if (!cancelled) setImage(img); };
    img.src = url;
    return () => { cancelled = true; };
  }, [url]);

  useEffect(() => {
    if (!image) return;
    for (const e of entries) {
      const canvas = canvasRefs.current[e.paletteIndex];
      if (!canvas) continue;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const size = e.tilesize || 16;
      try {
        ctx.drawImage(image, e.col * size, e.row * size, size, size, 0, 0, canvas.width, canvas.height);
      } catch { /* image might not be fully decoded for the specific frame */ }
    }
  }, [image, entries]);

  return (
    <div className="grid gap-0.5" style={{ gridTemplateColumns: 'repeat(auto-fill, 36px)' }}>
      {entries.map((e) => {
        const isActive = e.paletteIndex === selectedIndex;
        const isWall = Array.isArray(e.atoms) && e.atoms.includes('wall');
        const isAutotile = !!e.autotileGroupId;
        const traitList = e.traits && typeof e.traits === 'object'
          ? Object.entries(e.traits)
              .filter(([, v]) => v !== false && v !== null && v !== undefined && v !== '')
              .map(([k, v]) => (v === true ? k : `${k}=${v}`))
          : [];
        const tip = [
          `#${e.localId} (${e.col},${e.row})`,
          isWall ? 'wall' : null,
          isAutotile ? `autotile:${e.autotileRole || '?'}` : null,
          e.atoms?.length ? `atoms: ${e.atoms.join(', ')}` : null,
          traitList.length ? `traits: ${traitList.join(', ')}` : null,
        ].filter(Boolean).join('\n');
        return (
          <div
            key={e.paletteIndex}
            onClick={() => onSelect(e.paletteIndex)}
            title={tip}
            className={[
              'w-9 h-9 cursor-pointer bg-surface-container-lowest flex items-center justify-center relative',
              'border transition-shadow duration-100',
              isActive
                ? 'border-primary shadow-[0_0_0_1px_rgb(197_154_255)_inset,0_0_10px_rgba(197,154,255,0.4)]'
                : 'border-outline-variant/20 hover:border-primary/40',
            ].join(' ')}
            style={{ imageRendering: 'pixelated' }}
          >
            <canvas
              ref={(el) => { if (el) canvasRefs.current[e.paletteIndex] = el; }}
              width={32}
              height={32}
              style={{ width: 32, height: 32, imageRendering: 'pixelated' }}
            />
            {(isWall || isAutotile) && (
              <div className="absolute top-px right-px flex gap-px pointer-events-none">
                {isWall && (
                  <span className="bg-error/90 text-on-error text-[8px] font-extrabold leading-none px-0.5 rounded-sm">W</span>
                )}
                {isAutotile && (
                  <span className="bg-primary/90 text-on-primary text-[8px] font-extrabold leading-none px-0.5 rounded-sm">A</span>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
