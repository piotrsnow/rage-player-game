// TileGrid — Pixi v8 overlay on top of a tileset atlas PNG.
//
// Responsibilities:
//   - Draw the atlas image at integer scale (pixel-perfect).
//   - Overlay a grid of `nativeTilesize` cells.
//   - Highlight selected localIds and the user's in-progress drag rectangle.
//   - Expose click + drag-to-rectangle multi-select via props.
//
// The component owns its PIXI.Application instance. Init happens ONCE on
// mount — dimension/zoom changes go through `renderer.resize()` instead of
// a remount. This avoids creating a fresh WebGL context per upload (Chrome
// caps the per-tab context budget at ~16 and kills the oldest when it's
// exceeded, which surfaces as "WebGL context was lost" right after a
// tileset import).

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Application, Container, Graphics, Sprite, Texture } from 'pixi.js';
import { getMaxTextureSize } from '../engine/webglLimits.js';

// Load an image URL into a Pixi v8 Texture without going through the Assets
// system. Our media URLs (`/v1/media/file/tileset-src:<hash>`) have no file
// extension, so `Assets.load(url)` can't pick a parser and returns null —
// which then crashed `texture.source.scaleMode`. Going via HTMLImageElement
// avoids that: the browser handles the request (cookies attach on same
// origin) and hands us a ready-to-use bitmap source.
function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    img.src = url;
  });
}

function localIdAt(col, row, cols) {
  return row * cols + col;
}

export default function TileGrid({
  imageUrl,
  tilesize,
  imageWidth,
  imageHeight,
  selection, // Set<number>
  onSelectionChange, // (nextSet, { additive }) => void
  onActiveTileChange, // (localId | null) => void
  zoom = 2,
  showOverlay = false,
  tilesByLocalId,
}) {
  const hostRef = useRef(null);
  const appRef = useRef(null);
  const overlayRef = useRef(null);
  const spriteRef = useRef(null);
  // Tracks which imageUrl is currently on the sprite so the swap-effect skips
  // redundant reloads after the init effect already attached it.
  const loadedUrlRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [drag, setDrag] = useState(null);
  const [hover, setHover] = useState(null);
  // Bumped by the webglcontextrestored handler so the texture/overlay
  // effects re-run and repopulate the stage after a GPU reset.
  const [restoreTick, setRestoreTick] = useState(0);

  const maxTex = getMaxTextureSize();
  // Fall back to a plain <img> preview when the native atlas is larger than
  // the GPU can hold — uploading it as a WebGL texture would either silently
  // fail or kill the context. Both Pixi and WebGL compare against the NATIVE
  // texture size, not the zoomed display size, so we check imageWidth/height.
  const oversized =
    Number.isFinite(imageWidth) && Number.isFinite(imageHeight) &&
    (imageWidth > maxTex || imageHeight > maxTex);

  const cols = useMemo(
    () => (imageWidth && tilesize ? Math.floor(imageWidth / tilesize) : 0),
    [imageWidth, tilesize]
  );
  const rows = useMemo(
    () => (imageHeight && tilesize ? Math.floor(imageHeight / tilesize) : 0),
    [imageHeight, tilesize]
  );

  // Boot the Pixi app ONCE on mount. Dimension/zoom changes are handled by
  // the separate resize effect below — re-running this effect per dimension
  // change would churn WebGL contexts.
  useEffect(() => {
    if (oversized) return undefined;
    const host = hostRef.current;
    if (!host) return undefined;
    let cancelled = false;
    const app = new Application();
    appRef.current = app;

    // `resolution: 1` intentionally: the preview is pixel art with
    // `image-rendering: pixelated`, so DPR-upscaling the backing buffer
    // just wastes VRAM and pushes us toward MAX_TEXTURE_SIZE on HiDPI
    // monitors — which is exactly the scenario that was losing context
    // after large tileset uploads.
    const initPromise = app.init({
      width: 1,
      height: 1,
      backgroundAlpha: 0,
      antialias: false,
      autoDensity: false,
      resolution: 1,
    });

    const onContextLost = (e) => {
      // preventDefault lets the browser attempt to restore the context
      // instead of permanently killing it.
      e.preventDefault();
      setReady(false);
      loadedUrlRef.current = null;
    };
    const onContextRestored = () => {
      setRestoreTick((t) => t + 1);
      setReady(true);
    };

    (async () => {
      try {
        await initPromise;
      } catch (err) {
        console.error('TileGrid: Pixi init failed', err);
        return;
      }
      if (cancelled) {
        try { app.destroy(true); } catch { /* ignore */ }
        return;
      }
      host.appendChild(app.canvas);
      app.canvas.style.imageRendering = 'pixelated';
      app.canvas.addEventListener('webglcontextlost', onContextLost);
      app.canvas.addEventListener('webglcontextrestored', onContextRestored);

      const overlay = new Container();
      overlayRef.current = overlay;
      app.stage.addChild(overlay);
      setReady(true);
    })();

    return () => {
      cancelled = true;
      try {
        app.canvas?.removeEventListener('webglcontextlost', onContextLost);
        app.canvas?.removeEventListener('webglcontextrestored', onContextRestored);
      } catch { /* ignore */ }
      try { app.destroy(true, { children: true }); } catch { /* ignore */ }
      if (host) host.innerHTML = '';
      appRef.current = null;
      overlayRef.current = null;
      spriteRef.current = null;
      loadedUrlRef.current = null;
      setReady(false);
    };
    // Deliberately only depends on `oversized` — see comment above about
    // not churning WebGL contexts when dimensions change.
  }, [oversized]);

  // Resize the renderer when the atlas dimensions or zoom change. Same Pixi
  // app, same WebGL context — only the drawing buffer grows/shrinks.
  useEffect(() => {
    if (!ready || oversized) return;
    const app = appRef.current;
    if (!app) return;
    const w = Math.max(1, imageWidth * zoom);
    const h = Math.max(1, imageHeight * zoom);
    try {
      app.renderer.resize(w, h);
    } catch (err) {
      console.error('TileGrid: renderer.resize failed', err);
    }
  }, [ready, oversized, imageWidth, imageHeight, zoom]);

  // Load (or swap) the atlas texture. Covers both first-mount and
  // later-imageUrl-changes. Also re-runs after a context restore because
  // the texture lives on the GPU and is gone.
  useEffect(() => {
    if (!ready || oversized || !imageUrl) return undefined;
    if (loadedUrlRef.current === imageUrl && restoreTick === 0) return undefined;
    const app = appRef.current;
    if (!app) return undefined;
    let cancelled = false;
    (async () => {
      let img;
      try {
        img = await loadImage(imageUrl);
      } catch (err) {
        console.error('TileGrid: failed to load atlas', err);
        return;
      }
      if (cancelled) return;
      let texture;
      try {
        texture = Texture.from(img);
      } catch (err) {
        console.error('TileGrid: Texture.from failed', err);
        return;
      }
      if (cancelled) {
        try { texture.destroy(true); } catch { /* ignore */ }
        return;
      }
      if (spriteRef.current) {
        try { spriteRef.current.destroy(); } catch { /* ignore */ }
        spriteRef.current = null;
      }
      if (texture.source) texture.source.scaleMode = 'nearest';
      const sprite = new Sprite(texture);
      sprite.width = texture.width * zoom;
      sprite.height = texture.height * zoom;
      spriteRef.current = sprite;
      // Always place the atlas UNDER the overlay.
      app.stage.addChildAt(sprite, 0);
      loadedUrlRef.current = imageUrl;
    })();
    return () => { cancelled = true; };
  }, [ready, oversized, imageUrl, zoom, restoreTick]);

  // Keep the sprite's scale in sync with zoom changes even when the URL
  // didn't change (avoids recreating the sprite in the texture effect).
  useEffect(() => {
    if (!ready || oversized) return;
    const sprite = spriteRef.current;
    if (!sprite || !sprite.texture) return;
    sprite.width = sprite.texture.width * zoom;
    sprite.height = sprite.texture.height * zoom;
  }, [ready, oversized, zoom]);

  // Redraw overlay (grid + selection + drag rect).
  useEffect(() => {
    if (!ready || oversized) return;
    const overlay = overlayRef.current;
    if (!overlay) return;
    overlay.removeChildren();

    if (tilesize > 0) {
      const grid = new Graphics();
      grid.setStrokeStyle({ width: 1, color: 0xffffff, alpha: 0.08 });
      for (let c = 0; c <= cols; c++) {
        const x = c * tilesize * zoom + 0.5;
        grid.moveTo(x, 0).lineTo(x, rows * tilesize * zoom);
      }
      for (let r = 0; r <= rows; r++) {
        const y = r * tilesize * zoom + 0.5;
        grid.moveTo(0, y).lineTo(cols * tilesize * zoom, y);
      }
      grid.stroke();
      overlay.addChild(grid);
    }

    if (selection && selection.size) {
      const sel = new Graphics();
      for (const localId of selection) {
        if (cols <= 0) break;
        const col = localId % cols;
        const row = Math.floor(localId / cols);
        sel.rect(col * tilesize * zoom, row * tilesize * zoom, tilesize * zoom, tilesize * zoom);
      }
      sel.fill({ color: 0xfacc15, alpha: 0.22 });
      sel.stroke({ color: 0xfacc15, width: 2 });
      overlay.addChild(sel);
    }

    if (hover !== null && cols > 0) {
      const col = hover % cols;
      const row = Math.floor(hover / cols);
      const hov = new Graphics();
      hov.rect(col * tilesize * zoom, row * tilesize * zoom, tilesize * zoom, tilesize * zoom);
      hov.stroke({ color: 0x22d3ee, width: 1, alpha: 0.9 });
      overlay.addChild(hov);
    }

    if (drag) {
      const { startCol, startRow, endCol, endRow } = drag;
      const x = Math.min(startCol, endCol) * tilesize * zoom;
      const y = Math.min(startRow, endRow) * tilesize * zoom;
      const w = (Math.abs(endCol - startCol) + 1) * tilesize * zoom;
      const h = (Math.abs(endRow - startRow) + 1) * tilesize * zoom;
      const dg = new Graphics();
      dg.rect(x, y, w, h).stroke({ color: 0x34d399, width: 2, alpha: 0.9 });
      overlay.addChild(dg);
    }
  }, [ready, oversized, tilesize, zoom, cols, rows, selection, hover, drag, restoreTick]);

  const toCell = useCallback(
    (ev) => {
      const host = hostRef.current;
      if (!host || !tilesize) return null;
      const rect = host.getBoundingClientRect();
      const x = ev.clientX - rect.left;
      const y = ev.clientY - rect.top;
      const col = Math.floor(x / (tilesize * zoom));
      const row = Math.floor(y / (tilesize * zoom));
      if (col < 0 || col >= cols || row < 0 || row >= rows) return null;
      return { col, row };
    },
    [cols, rows, tilesize, zoom]
  );

  const onMouseDown = useCallback(
    (e) => {
      const cell = toCell(e);
      if (!cell) return;
      if (e.shiftKey || e.ctrlKey || e.metaKey) {
        const id = localIdAt(cell.col, cell.row, cols);
        const next = new Set(selection || []);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        onSelectionChange?.(next, { additive: true });
        onActiveTileChange?.(id);
        return;
      }
      setDrag({ startCol: cell.col, startRow: cell.row, endCol: cell.col, endRow: cell.row });
    },
    [toCell, cols, selection, onSelectionChange, onActiveTileChange]
  );

  const onMouseMove = useCallback(
    (e) => {
      const cell = toCell(e);
      if (!cell) { setHover(null); return; }
      setHover(localIdAt(cell.col, cell.row, cols));
      if (!drag) return;
      setDrag((d) => ({ ...d, endCol: cell.col, endRow: cell.row }));
    },
    [toCell, drag, cols]
  );

  const onMouseUp = useCallback(
    (e) => {
      if (!drag) return;
      const c0 = Math.min(drag.startCol, drag.endCol);
      const c1 = Math.max(drag.startCol, drag.endCol);
      const r0 = Math.min(drag.startRow, drag.endRow);
      const r1 = Math.max(drag.startRow, drag.endRow);
      const next = new Set();
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) next.add(localIdAt(c, r, cols));
      }
      setDrag(null);
      const additive = e.shiftKey || e.ctrlKey || e.metaKey;
      if (additive && selection) {
        for (const id of selection) next.add(id);
      }
      onSelectionChange?.(next, { additive });
      if (c0 === c1 && r0 === r1) {
        onActiveTileChange?.(localIdAt(c0, r0, cols));
      }
    },
    [drag, cols, onSelectionChange, selection, onActiveTileChange]
  );

  // Oversized fallback: plain <img> with an SVG grid overlay. Non-interactive
  // preview, but better than a blank canvas or a lost WebGL context.
  if (oversized) {
    const gridW = cols * tilesize;
    const gridH = rows * tilesize;
    return (
      <div className="flex flex-col gap-1.5">
        <div className="text-[11px] text-amber-300/90 bg-amber-950/30 border border-amber-500/30 rounded-sm px-2 py-1">
          Atlas {imageWidth}×{imageHeight}px przekracza limit GPU (
          {maxTex}px). Podgląd bez WebGL — zaznaczanie kafli wyłączone.
          Użyj mniejszych regionów lub podziel tileset.
        </div>
        <div
          ref={hostRef}
          className="inline-block relative bg-surface-container-lowest leading-none rounded-sm"
          style={{ width: imageWidth * zoom, height: imageHeight * zoom }}
        >
          <img
            src={imageUrl}
            alt=""
            width={imageWidth * zoom}
            height={imageHeight * zoom}
            style={{ imageRendering: 'pixelated', display: 'block' }}
          />
          {gridW > 0 && gridH > 0 && (
            <svg
              width={imageWidth * zoom}
              height={imageHeight * zoom}
              viewBox={`0 0 ${imageWidth * zoom} ${imageHeight * zoom}`}
              className="absolute inset-0 pointer-events-none"
            >
              <defs>
                <pattern
                  id="tg-grid"
                  width={tilesize * zoom}
                  height={tilesize * zoom}
                  patternUnits="userSpaceOnUse"
                >
                  <path
                    d={`M ${tilesize * zoom} 0 L 0 0 0 ${tilesize * zoom}`}
                    fill="none"
                    stroke="white"
                    strokeOpacity="0.08"
                    strokeWidth="1"
                  />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#tg-grid)" />
            </svg>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={hostRef}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={() => { setHover(null); if (drag) setDrag(null); }}
      className="inline-block relative cursor-crosshair bg-surface-container-lowest leading-none rounded-sm"
    >
      {showOverlay && tilesByLocalId && cols > 0 && rows > 0 && (
        <TileMetaOverlay
          tilesByLocalId={tilesByLocalId}
          cols={cols}
          rows={rows}
          tilesize={tilesize}
          zoom={zoom}
        />
      )}
    </div>
  );
}

/* ── TileMetaOverlay — SVG layer showing edges, role & passability ─── */

const EDGE_DIRECTIONS = {
  edge_N:  { x1: 0, y1: 0, x2: 1, y2: 0 },
  edge_E:  { x1: 1, y1: 0, x2: 1, y2: 1 },
  edge_S:  { x1: 0, y1: 1, x2: 1, y2: 1 },
  edge_W:  { x1: 0, y1: 0, x2: 0, y2: 1 },
};

const CORNER_POSITIONS = {
  edge_NW: { cx: 0,   cy: 0 },
  edge_NE: { cx: 1,   cy: 0 },
  edge_SE: { cx: 1,   cy: 1 },
  edge_SW: { cx: 0,   cy: 1 },
};

const ROLE_BADGE = {
  autotile_role_corner: { letter: 'C', color: '#fb923c' },
  autotile_role_edge:   { letter: 'E', color: '#38bdf8' },
  autotile_role_inner:  { letter: 'I', color: '#facc15' },
  autotile_role_fill:   { letter: 'F', color: '#4ade80' },
};

const PASSABILITY_BADGE = {
  solid:    { letter: '■', color: '#f87171' },
  walkable: { letter: '○', color: '#4ade80' },
  water:    { letter: '~', color: '#60a5fa' },
  hazard:   { letter: '!', color: '#fb923c' },
};

function TileMetaOverlay({ tilesByLocalId, cols, rows, tilesize, zoom }) {
  const ts = tilesize * zoom;
  const w = cols * ts;
  const h = rows * ts;
  const edgeInset = Math.max(1, ts * 0.06);
  const edgeStroke = Math.max(1.5, ts * 0.06);
  const cornerR = Math.max(2, ts * 0.08);

  const elements = [];
  for (const [localId, tile] of tilesByLocalId) {
    const atoms = tile.atoms || [];
    if (!atoms.length) continue;
    const col = localId % cols;
    const row = Math.floor(localId / cols);
    const ox = col * ts;
    const oy = row * ts;

    for (const atom of atoms) {
      const dir = EDGE_DIRECTIONS[atom];
      if (dir) {
        elements.push(
          <line
            key={`${localId}-${atom}`}
            x1={ox + dir.x1 * ts + (dir.x1 === 0 ? edgeInset : -edgeInset)}
            y1={oy + dir.y1 * ts + (dir.y1 === 0 ? edgeInset : -edgeInset)}
            x2={ox + dir.x2 * ts + (dir.x2 === 0 ? edgeInset : -edgeInset)}
            y2={oy + dir.y2 * ts + (dir.y2 === 0 ? edgeInset : -edgeInset)}
            stroke="#facc15"
            strokeWidth={edgeStroke}
            strokeLinecap="round"
            opacity="0.85"
          />
        );
        continue;
      }

      const corner = CORNER_POSITIONS[atom];
      if (corner) {
        elements.push(
          <circle
            key={`${localId}-${atom}`}
            cx={ox + corner.cx * ts + (corner.cx === 0 ? edgeInset : -edgeInset)}
            cy={oy + corner.cy * ts + (corner.cy === 0 ? edgeInset : -edgeInset)}
            r={cornerR}
            fill="#facc15"
            opacity="0.8"
          />
        );
        continue;
      }
    }

    const role = atoms.find((a) => ROLE_BADGE[a]);
    const pass = atoms.find((a) => PASSABILITY_BADGE[a]);

    if (role) {
      const b = ROLE_BADGE[role];
      const fontSize = Math.max(8, ts * 0.28);
      elements.push(
        <text
          key={`${localId}-role`}
          x={ox + ts - 2}
          y={oy + fontSize + 1}
          textAnchor="end"
          fill={b.color}
          fontSize={fontSize}
          fontWeight="700"
          fontFamily="monospace"
          opacity="0.9"
          style={{ textShadow: '0 0 3px rgba(0,0,0,0.8)' }}
        >
          {b.letter}
        </text>
      );
    }

    if (pass) {
      const b = PASSABILITY_BADGE[pass];
      const fontSize = Math.max(7, ts * 0.24);
      elements.push(
        <text
          key={`${localId}-pass`}
          x={ox + 2}
          y={oy + ts - 2}
          textAnchor="start"
          fill={b.color}
          fontSize={fontSize}
          fontWeight="700"
          fontFamily="monospace"
          opacity="0.85"
          style={{ textShadow: '0 0 3px rgba(0,0,0,0.8)' }}
        >
          {b.letter}
        </text>
      );
    }
  }

  if (!elements.length) return null;

  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className="absolute inset-0 pointer-events-none"
      style={{ zIndex: 10 }}
    >
      {elements}
    </svg>
  );
}
