// MapCanvas — the Pixi v8 rendering surface for the Map Editor.
//
// Layers (z-order, bottom to top):
//   1. map layers (ground, overlay, objects) — cells driven by
//      useEditorStore.layers + palette. Each non-empty cell renders a
//      Sprite slice of the tileset atlas.
//   2. collision overlay — translucent red tint on blocked cells, only
//      shown when store.showCollision is true.
//   3. grid overlay — thin white lines, only when store.showGrid is true.
//   4. brush preview — hover square + drag-rect.
//
// Mouse handling:
//   - LMB: runs the current tool (brush/rect/fill/eraser/autotile/wall).
//   - shift+LMB on collision layer: toggles the cell's collision bit.
//   - MMB drag: pans the scrollable parent container (like most map editors).
//   - Alt+LMB: eyedropper — reports a `phase: 'eyedrop'` event so the
//     Editor page can pick the clicked tile into the palette selection.
//
// The canvas exposes a `toCell(ev)` helper and delegates tool logic to
// the Editor page (keeps this component dumb about autotile internals).

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Application, Assets, Container, Graphics, Rectangle, Sprite, Text, Texture } from 'pixi.js';
import { LAYER_NAMES, OBJECT_KINDS, TOOLS, useEditorStore } from './useEditorStore.js';

export default function MapCanvas({ onPaint, textureUrls, selectionRect }) {
  const hostRef = useRef(null);
  const appRef = useRef(null);
  const layerContainersRef = useRef({}); // { ground, overlay, objects }
  const overlayContainerRef = useRef(null);
  const gridGraphicsRef = useRef(null);
  const collisionGraphicsRef = useRef(null);
  const brushGraphicsRef = useRef(null);
  const objectsContainerRef = useRef(null);
  const texturesRef = useRef(new Map()); // imageKey → Texture (full atlas)
  // Sprite pool: one Sprite per (layer, x, y) reused across redraws.
  // Avoids Sprite/Texture churn on every paint tick (which was O(cols*rows*layers)).
  const spritePoolRef = useRef({}); // { layerName: Sprite[cols*rows] }
  const poolDimsRef = useRef({ cols: 0, rows: 0 }); // to detect resize
  // Texture frame cache keyed by imageKey:col:row:size. Avoids
  // `new Texture({ source, frame })` per cell per redraw.
  const frameTexCacheRef = useRef(new Map());
  const [ready, setReady] = useState(false);
  const [drag, setDrag] = useState(null);
  const [hover, setHover] = useState(null);

  const cols = useEditorStore((s) => s.cols);
  const rows = useEditorStore((s) => s.rows);
  const tsize = useEditorStore((s) => s.projectTilesize);
  const layers = useEditorStore((s) => s.layers);
  const collision = useEditorStore((s) => s.collision);
  const palette = useEditorStore((s) => s.palette);
  const showGrid = useEditorStore((s) => s.showGrid);
  const showCollision = useEditorStore((s) => s.showCollision);
  const zoom = useEditorStore((s) => s.zoom);
  const objects = useEditorStore((s) => s.objects);
  const selectedObjectId = useEditorStore((s) => s.selectedObjectId);
  const tool = useEditorStore((s) => s.tool);

  const cellSize = tsize * zoom;

  // Boot Pixi app.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    const app = new Application();
    appRef.current = app;
    let cancelled = false;
    (async () => {
      await app.init({
        width: Math.max(1, cols * cellSize),
        height: Math.max(1, rows * cellSize),
        backgroundAlpha: 1,
        background: 0x0a0a0a,
        antialias: false,
        autoDensity: true,
        resolution: window.devicePixelRatio || 1,
      });
      if (cancelled) { app.destroy(true); return; }
      host.appendChild(app.canvas);
      app.canvas.style.imageRendering = 'pixelated';

      for (const name of LAYER_NAMES) {
        const c = new Container();
        app.stage.addChild(c);
        layerContainersRef.current[name] = c;
      }
      const overlay = new Container();
      app.stage.addChild(overlay);
      overlayContainerRef.current = overlay;
      const cg = new Graphics();
      overlay.addChild(cg);
      collisionGraphicsRef.current = cg;
      const gg = new Graphics();
      overlay.addChild(gg);
      gridGraphicsRef.current = gg;
      const objectsContainer = new Container();
      overlay.addChild(objectsContainer);
      objectsContainerRef.current = objectsContainer;

      const bg = new Graphics();
      overlay.addChild(bg);
      brushGraphicsRef.current = bg;

      setReady(true);
    })();
    return () => {
      cancelled = true;
      try { app.destroy(true, { children: true }); } catch { /* ignore */ }
      if (host) host.innerHTML = '';
      appRef.current = null;
      layerContainersRef.current = {};
      overlayContainerRef.current = null;
      gridGraphicsRef.current = null;
      collisionGraphicsRef.current = null;
      brushGraphicsRef.current = null;
      objectsContainerRef.current = null;
      texturesRef.current = new Map();
      spritePoolRef.current = {};
      poolDimsRef.current = { cols: 0, rows: 0 };
      frameTexCacheRef.current = new Map();
      setReady(false);
    };
     
  }, []);

  // Resize renderer when map size / zoom changes.
  useEffect(() => {
    if (!ready) return;
    const app = appRef.current;
    if (!app) return;
    app.renderer.resize(Math.max(1, cols * cellSize), Math.max(1, rows * cellSize));
  }, [ready, cols, rows, cellSize]);

  // Preload tileset atlases referenced by the palette. textureUrls is a
  // map of imageKey → URL (resolved via mediaUrlForKey / rendered variant).
  useEffect(() => {
    if (!ready || !textureUrls) return;
    let cancelled = false;
    (async () => {
      const map = texturesRef.current;
      for (const [key, url] of Object.entries(textureUrls)) {
        if (map.has(key)) continue;
        try {
          const tex = await Assets.load(url);
          if (cancelled) return;
          tex.source.scaleMode = 'nearest';
          map.set(key, tex);
        } catch (err) {
          console.error('MapCanvas: failed to load texture', key, err);
        }
      }
      // Trigger a redraw after loads settle.
      setRedrawTick((t) => t + 1);
    })();
    return () => { cancelled = true; };
  }, [ready, textureUrls]);

  const [redrawTick, setRedrawTick] = useState(0);

  // Repaint layers whenever layers/palette/zoom change.
  //
  // Sprite-pool strategy: keep one Sprite per (layer, x, y) across redraws.
  // Empty cells → sprite.visible = false; non-empty → reuse (or lazily
  // create) the sprite and swap its .texture / .width / .height / .position.
  // Also caches the per-tile Texture by (imageKey, col, row, size) so we
  // don't allocate new Texture objects on every redraw. Combined this turns
  // a 128×128 × 3-layer paint from ~49k allocations per stroke into just
  // the set of truly-changed cells.
  useEffect(() => {
    if (!ready) return;
    const containers = layerContainersRef.current;
    const textures = texturesRef.current;
    const pool = spritePoolRef.current;
    const dims = poolDimsRef.current;
    const frameCache = frameTexCacheRef.current;

    // Resize detection: if cols/rows changed, blow away the pool and clear
    // layer containers so we don't end up with stale sprites at wrong indices.
    if (dims.cols !== cols || dims.rows !== rows) {
      for (const name of LAYER_NAMES) {
        const c = containers[name];
        if (c) c.removeChildren();
        pool[name] = [];
      }
      poolDimsRef.current = { cols, rows };
    } else {
      for (const name of LAYER_NAMES) {
        if (!pool[name]) pool[name] = [];
      }
    }

    const total = cols * rows;

    for (const name of LAYER_NAMES) {
      const c = containers[name];
      if (!c) continue;
      const sprites = pool[name];
      const arr = layers[name];
      if (!arr) {
        for (let i = 0; i < sprites.length; i++) {
          if (sprites[i]) sprites[i].visible = false;
        }
        continue;
      }
      for (let i = 0; i < total; i++) {
        const v = arr[i];
        const existing = sprites[i];
        if (!v) {
          if (existing) existing.visible = false;
          continue;
        }
        const entry = palette[v - 1];
        if (!entry) {
          if (existing) existing.visible = false;
          continue;
        }
        const baseTex = textures.get(entry.imageKey);
        if (!baseTex) {
          if (existing) existing.visible = false;
          continue;
        }
        const size = entry.tilesize || tsize;
        const cacheKey = `${entry.imageKey}:${entry.col}:${entry.row}:${size}`;
        let tex = frameCache.get(cacheKey);
        if (!tex) {
          const frame = new Rectangle(entry.col * size, entry.row * size, size, size);
          tex = new Texture({ source: baseTex.source, frame });
          frameCache.set(cacheKey, tex);
        }
        const x = i % cols;
        const y = (i - x) / cols;
        let sprite = existing;
        if (!sprite) {
          sprite = new Sprite(tex);
          sprites[i] = sprite;
          c.addChild(sprite);
        } else if (sprite.texture !== tex) {
          sprite.texture = tex;
        }
        sprite.x = x * cellSize;
        sprite.y = y * cellSize;
        sprite.width = cellSize;
        sprite.height = cellSize;
        sprite.visible = true;
      }
      // Tail: if the pool is longer than the grid (shouldn't happen without a
      // resize, but defensively), hide any extra sprites.
      for (let i = total; i < sprites.length; i++) {
        if (sprites[i]) sprites[i].visible = false;
      }
    }
  }, [ready, layers, palette, cols, rows, cellSize, tsize, redrawTick]);

  // Grid overlay.
  useEffect(() => {
    if (!ready) return;
    const g = gridGraphicsRef.current;
    if (!g) return;
    g.clear();
    if (!showGrid) return;
    g.setStrokeStyle({ width: 1, color: 0xffffff, alpha: 0.1 });
    for (let c = 0; c <= cols; c++) {
      const x = c * cellSize + 0.5;
      g.moveTo(x, 0).lineTo(x, rows * cellSize);
    }
    for (let r = 0; r <= rows; r++) {
      const y = r * cellSize + 0.5;
      g.moveTo(0, y).lineTo(cols * cellSize, y);
    }
    g.stroke();
  }, [ready, showGrid, cols, rows, cellSize]);

  // Collision overlay.
  useEffect(() => {
    if (!ready) return;
    const g = collisionGraphicsRef.current;
    if (!g) return;
    g.clear();
    if (!showCollision) return;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if (collision[y * cols + x]) {
          g.rect(x * cellSize, y * cellSize, cellSize, cellSize);
        }
      }
    }
    g.fill({ color: 0xef4444, alpha: 0.32 });
  }, [ready, showCollision, collision, cols, rows, cellSize]);

  // Objects overlay — NPC places, player start markers.
  useEffect(() => {
    if (!ready) return;
    const c = objectsContainerRef.current;
    if (!c) return;
    c.removeChildren();
    for (const obj of objects) {
      const isSel = obj.id === selectedObjectId;
      const px = obj.x * cellSize;
      const py = obj.y * cellSize;
      const g = new Graphics();
      if (obj.kind === OBJECT_KINDS.npcPlace) {
        g.circle(px + cellSize / 2, py + cellSize / 2, cellSize * 0.4);
        g.fill({ color: 0xfacc15, alpha: 0.32 });
        g.stroke({ color: isSel ? 0xfde68a : 0xfacc15, width: isSel ? 2 : 1, alpha: 0.9 });
      } else if (obj.kind === OBJECT_KINDS.playerStart) {
        g.rect(px + 2, py + 2, cellSize - 4, cellSize - 4);
        g.fill({ color: 0x22c55e, alpha: 0.32 });
        g.stroke({ color: isSel ? 0xbbf7d0 : 0x22c55e, width: isSel ? 2 : 1, alpha: 0.9 });
      } else {
        g.rect(px, py, cellSize, cellSize);
        g.stroke({ color: 0x888888, width: 1, alpha: 0.8 });
      }
      c.addChild(g);

      const label = obj.kind === OBJECT_KINDS.playerStart ? 'P'
        : obj.kind === OBJECT_KINDS.npcPlace ? 'N' : '?';
      try {
        const t = new Text({
          text: label,
          style: {
            fill: obj.kind === OBJECT_KINDS.playerStart ? 0xbbf7d0 : 0xfef3c7,
            fontSize: Math.max(10, cellSize * 0.5),
            fontWeight: '700',
          },
        });
        t.anchor.set(0.5);
        t.x = px + cellSize / 2;
        t.y = py + cellSize / 2;
        c.addChild(t);
      } catch { /* text may fail on some pixi configs */ }
    }
  }, [ready, objects, selectedObjectId, cellSize]);

  // Brush/hover preview.
  useEffect(() => {
    if (!ready) return;
    const g = brushGraphicsRef.current;
    if (!g) return;
    g.clear();
    // Persistent selection rect (from the `select` tool), drawn behind the
    // drag/hover overlay so the user can still see the active cell.
    if (selectionRect) {
      const { x0, y0, x1, y1 } = selectionRect;
      g.rect(x0 * cellSize, y0 * cellSize, (x1 - x0 + 1) * cellSize, (y1 - y0 + 1) * cellSize);
      g.fill({ color: 0xfbbf24, alpha: 0.12 });
      g.stroke({ color: 0xfbbf24, width: 2, alpha: 0.95 });
    }
    if (drag) {
      const c0 = Math.min(drag.startX, drag.endX);
      const c1 = Math.max(drag.startX, drag.endX);
      const r0 = Math.min(drag.startY, drag.endY);
      const r1 = Math.max(drag.startY, drag.endY);
      g.rect(c0 * cellSize, r0 * cellSize, (c1 - c0 + 1) * cellSize, (r1 - r0 + 1) * cellSize);
      g.stroke({ color: 0x34d399, width: 2, alpha: 0.9 });
    } else if (hover) {
      g.rect(hover.x * cellSize, hover.y * cellSize, cellSize, cellSize);
      g.stroke({ color: 0x22d3ee, width: 1, alpha: 0.9 });
    }
  }, [ready, drag, hover, cellSize, selectionRect]);

  const toCell = useCallback(
    (ev) => {
      const host = hostRef.current;
      if (!host) return null;
      const rect = host.getBoundingClientRect();
      const x = Math.floor((ev.clientX - rect.left) / cellSize);
      const y = Math.floor((ev.clientY - rect.top) / cellSize);
      if (x < 0 || y < 0 || x >= cols || y >= rows) return null;
      return { x, y };
    },
    [cellSize, cols, rows]
  );

  const painterRef = useRef({ dragging: false, button: null });
  // Middle-mouse pan: remember the last (clientX, clientY) so `onMove`
  // can translate pointer delta into scrollLeft/scrollTop on the parent
  // (the `<main>`'s overflow:auto wrapper in EditorPage).
  const panRef = useRef({ active: false, lastX: 0, lastY: 0 });

  const onDown = useCallback((e) => {
    // Middle-button → pan the scrollable parent instead of painting.
    if (e.button === 1) {
      e.preventDefault();
      panRef.current.active = true;
      panRef.current.lastX = e.clientX;
      panRef.current.lastY = e.clientY;
      return;
    }
    const cell = toCell(e);
    if (!cell) return;
    // Alt+LMB → eyedropper: let the Editor page pick the clicked tile into
    // the palette selection. We do NOT start a drag/stroke here.
    if (e.button === 0 && (e.altKey || e.metaKey)) {
      e.preventDefault();
      onPaint?.({ phase: 'eyedrop', cell, button: 'left', ev: e });
      return;
    }
    painterRef.current.dragging = true;
    if (e.button === 2) {
      painterRef.current.button = 'right';
      onPaint?.({ phase: 'down', cell, button: 'right', ev: e });
      return;
    }
    painterRef.current.button = 'left';
    setDrag({ startX: cell.x, startY: cell.y, endX: cell.x, endY: cell.y });
    onPaint?.({ phase: 'down', cell, button: 'left', ev: e });
  }, [toCell, onPaint]);

  const onMove = useCallback((e) => {
    if (panRef.current.active) {
      const host = hostRef.current;
      const scroller = host?.parentElement;
      if (scroller) {
        const dx = e.clientX - panRef.current.lastX;
        const dy = e.clientY - panRef.current.lastY;
        scroller.scrollLeft -= dx;
        scroller.scrollTop -= dy;
      }
      panRef.current.lastX = e.clientX;
      panRef.current.lastY = e.clientY;
      return;
    }
    const cell = toCell(e);
    if (!cell) { setHover(null); return; }
    setHover(cell);
    if (!painterRef.current.dragging) return;
    // Only update the drag-rect for left-button drags; RMB does not draw a rect.
    if (painterRef.current.button === 'left') {
      setDrag((d) => (d ? { ...d, endX: cell.x, endY: cell.y } : d));
    }
    onPaint?.({ phase: 'move', cell, button: painterRef.current.button, ev: e });
  }, [toCell, onPaint]);

  const onUp = useCallback((e) => {
    if (panRef.current.active && e.button === 1) {
      panRef.current.active = false;
      return;
    }
    if (!painterRef.current.dragging) return;
    const button = painterRef.current.button;
    painterRef.current.dragging = false;
    painterRef.current.button = null;
    const cell = toCell(e);
    const d = drag;
    setDrag(null);
    onPaint?.({
      phase: 'up',
      cell: cell || (d ? { x: d.endX, y: d.endY } : null),
      rect: d ? {
        x0: Math.min(d.startX, d.endX),
        y0: Math.min(d.startY, d.endY),
        x1: Math.max(d.startX, d.endX),
        y1: Math.max(d.startY, d.endY),
      } : null,
      button,
      ev: e,
    });
  }, [drag, onPaint, toCell]);

  return (
    <div
      ref={hostRef}
      onMouseDown={onDown}
      onMouseMove={onMove}
      onMouseUp={onUp}
      onMouseLeave={() => {
        setHover(null);
        panRef.current.active = false;
        if (painterRef.current.dragging) {
          painterRef.current.dragging = false;
          painterRef.current.button = null;
          if (drag) setDrag(null);
          // Notify the owner that the stroke aborted without a mouseup.
          // Tool dispatch should treat 'leave' as a no-op; the EditorPage
          // uses it to close out any in-progress undo stroke so the next
          // Ctrl+Z can roll the whole drag back.
          onPaint?.({ phase: 'leave' });
        }
      }}
      onContextMenu={(e) => e.preventDefault()}
      className="inline-block relative cursor-crosshair bg-surface-container-lowest leading-none rounded-sm border border-outline-variant/20 shadow-[0_0_0_1px_rgba(0,0,0,0.4),inset_0_0_20px_rgba(0,0,0,0.4)]"
    />
  );
}
