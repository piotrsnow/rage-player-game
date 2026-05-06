// RegionEditor — rectangular region picker over a tileset PNG.
//
// Use:
//   <RegionEditor
//     imageUrl="/v1/media/file/tilesets-src/abc.png"
//     regions={regions}
//     defaultNativeTilesize={16}
//     onChange={(nextRegions) => ...}
//   />
//
// Produces regions matching `shared/mapSchemas` RegionSchema:
//   { id, name, role, x, y, w, h, nativeTilesize, defaultTraits? }
//
// Behaviour:
//   - Click + drag on the canvas to draw a new region.
//   - Click an existing region to select it; edit name / role / nativeTilesize
//     in the side panel.
//   - Draws are snapped to a grid (input on the toolbar; default = the
//     region-level nativeTilesize, fallbacks to defaultNativeTilesize).
//   - Delete key removes the selected region.
//
// The component is self-contained: no external CSS, no Pixi — plain canvas
// plus React state. It will drop into the Studio scaffolding once
// `mapapp/src/studio/StudioPage.jsx` exists.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const ROLES = ['tiles', 'autotile_group', 'stamp_template'];
const DEFAULT_ROLE = 'tiles';

function slugify(str) {
  return String(str || 'region')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64) || 'region';
}

function uniqueRegionId(base, existing) {
  const used = new Set(existing.map((r) => r.id));
  let id = base;
  let i = 1;
  while (used.has(id)) {
    id = `${base}_${i++}`;
  }
  return id;
}

function snap(value, grid) {
  if (!grid || grid <= 0) return Math.round(value);
  return Math.round(value / grid) * grid;
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

import Button from '../ui/Button.jsx';
import { Input, Select } from '../ui/Input.jsx';
import ZoomControl from '../ui/ZoomControl.jsx';

const PANEL_CLS = 'flex gap-4 font-body text-on-surface';
const CANVAS_WRAP_CLS =
  'relative bg-surface-container-lowest border border-outline-variant/25 overflow-auto flex-1 min-h-[300px] rounded-sm custom-scrollbar';
const SIDE_CLS =
  'w-[280px] flex flex-col gap-2 p-3 glass-panel-elevated border border-outline-variant/15 rounded-xl';
const LABEL_CLS = 'text-xs text-on-surface-variant/80';

export default function RegionEditor({
  imageUrl,
  regions: regionsProp,
  defaultNativeTilesize = 16,
  defaultRole = DEFAULT_ROLE,
  onChange,
  disabled = false,
}) {
  const canvasRef = useRef(null);
  const imgRef = useRef(null);
  const [imgState, setImgState] = useState({ loaded: false, w: 0, h: 0 });
  const [zoom, setZoom] = useState(1);
  const [gridSize, setGridSize] = useState(defaultNativeTilesize);
  const [regions, setRegions] = useState(() => regionsProp ?? []);
  const [selectedId, setSelectedId] = useState(null);
  const [drag, setDrag] = useState(null);

  // Keep controlled / uncontrolled semantics: if `regions` prop is provided,
  // sync local state to it (uncontrolled = ignore external updates after mount).
  useEffect(() => {
    if (regionsProp) setRegions(regionsProp);
  }, [regionsProp]);

  const commit = useCallback(
    (nextRegions) => {
      setRegions(nextRegions);
      onChange?.(nextRegions);
    },
    [onChange]
  );

  // Load image
  useEffect(() => {
    if (!imageUrl) {
      imgRef.current = null;
      setImgState({ loaded: false, w: 0, h: 0 });
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      imgRef.current = img;
      setImgState({ loaded: true, w: img.naturalWidth, h: img.naturalHeight });
    };
    img.onerror = () => setImgState({ loaded: false, w: 0, h: 0 });
    img.src = imageUrl;
    return () => {
      img.onload = null;
      img.onerror = null;
    };
  }, [imageUrl]);

  // Draw image + regions + drag overlay
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const img = imgRef.current;
    const w = imgState.w * zoom;
    const h = imgState.h * zoom;
    canvas.width = Math.max(1, w);
    canvas.height = Math.max(1, h);

    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (img) ctx.drawImage(img, 0, 0, w, h);

    // Grid
    if (gridSize > 0 && imgState.loaded) {
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 1;
      for (let x = 0; x <= imgState.w; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x * zoom, 0);
        ctx.lineTo(x * zoom, h);
        ctx.stroke();
      }
      for (let y = 0; y <= imgState.h; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y * zoom);
        ctx.lineTo(w, y * zoom);
        ctx.stroke();
      }
    }

    // Regions
    for (const r of regions) {
      const selected = r.id === selectedId;
      ctx.strokeStyle = selected ? '#facc15' : '#22d3ee';
      ctx.lineWidth = selected ? 2 : 1;
      ctx.fillStyle = selected
        ? 'rgba(250, 204, 21, 0.12)'
        : 'rgba(34, 211, 238, 0.08)';
      const rx = r.x * zoom;
      const ry = r.y * zoom;
      const rw = r.w * zoom;
      const rh = r.h * zoom;
      ctx.fillRect(rx, ry, rw, rh);
      ctx.strokeRect(rx + 0.5, ry + 0.5, rw - 1, rh - 1);

      ctx.fillStyle = selected ? '#fde68a' : '#a5f3fc';
      ctx.font = '12px system-ui, sans-serif';
      ctx.textBaseline = 'top';
      const label = `${r.name || r.id} · ${r.nativeTilesize ?? defaultNativeTilesize}px`;
      ctx.fillText(label, rx + 4, ry + 4);
    }

    // Drag rectangle
    if (drag) {
      const { startX, startY, currX, currY } = drag;
      const x = Math.min(startX, currX) * zoom;
      const y = Math.min(startY, currY) * zoom;
      const dw = Math.abs(currX - startX) * zoom;
      const dh = Math.abs(currY - startY) * zoom;
      ctx.strokeStyle = '#34d399';
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(x + 0.5, y + 0.5, Math.max(0, dw - 1), Math.max(0, dh - 1));
      ctx.setLineDash([]);
    }
  }, [imgState, zoom, regions, selectedId, drag, gridSize, defaultNativeTilesize]);

  const toImgCoords = useCallback(
    (e) => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      const x = (e.clientX - rect.left) / zoom;
      const y = (e.clientY - rect.top) / zoom;
      return { x, y };
    },
    [zoom]
  );

  const hitTest = useCallback(
    (x, y) => {
      for (let i = regions.length - 1; i >= 0; i--) {
        const r = regions[i];
        if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return r;
      }
      return null;
    },
    [regions]
  );

  const onMouseDown = useCallback(
    (e) => {
      if (disabled) return;
      const { x, y } = toImgCoords(e);
      const hit = hitTest(x, y);
      if (hit) {
        setSelectedId(hit.id);
        return;
      }
      setSelectedId(null);
      setDrag({ startX: x, startY: y, currX: x, currY: y });
    },
    [toImgCoords, hitTest, disabled]
  );

  const onMouseMove = useCallback(
    (e) => {
      if (!drag) return;
      const { x, y } = toImgCoords(e);
      setDrag((d) => ({ ...d, currX: x, currY: y }));
    },
    [drag, toImgCoords]
  );

  const onMouseUp = useCallback(() => {
    if (!drag) return;
    const sx = snap(Math.min(drag.startX, drag.currX), gridSize);
    const sy = snap(Math.min(drag.startY, drag.currY), gridSize);
    let ex = snap(Math.max(drag.startX, drag.currX), gridSize);
    let ey = snap(Math.max(drag.startY, drag.currY), gridSize);
    ex = clamp(ex, 0, imgState.w);
    ey = clamp(ey, 0, imgState.h);
    const x = clamp(sx, 0, imgState.w);
    const y = clamp(sy, 0, imgState.h);
    const w = Math.max(gridSize, ex - x);
    const h = Math.max(gridSize, ey - y);
    setDrag(null);
    if (w <= 0 || h <= 0) return;

    const baseName = `region_${regions.length + 1}`;
    const id = uniqueRegionId(slugify(baseName), regions);
    const next = [
      ...regions,
      {
        id,
        name: baseName,
        role: defaultRole,
        x,
        y,
        w,
        h,
        nativeTilesize: gridSize || defaultNativeTilesize,
      },
    ];
    commit(next);
    setSelectedId(id);
  }, [drag, gridSize, imgState.w, imgState.h, regions, commit, defaultRole, defaultNativeTilesize]);

  const onKeyDown = useCallback(
    (e) => {
      if (disabled) return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        e.preventDefault();
        const next = regions.filter((r) => r.id !== selectedId);
        commit(next);
        setSelectedId(null);
      }
    },
    [selectedId, regions, commit, disabled]
  );

  const updateSelected = useCallback(
    (patch) => {
      if (!selectedId) return;
      const next = regions.map((r) => {
        if (r.id !== selectedId) return r;
        const merged = { ...r, ...patch };
        // Keep id slug-consistent when the user renames.
        if (patch.name !== undefined && !patch.id) {
          const desired = uniqueRegionId(
            slugify(patch.name),
            regions.filter((x) => x.id !== r.id)
          );
          merged.id = desired;
        }
        return merged;
      });
      commit(next);
      if (patch.name !== undefined) {
        const renamed = next.find((r) => r.name === patch.name);
        if (renamed) setSelectedId(renamed.id);
      }
    },
    [selectedId, regions, commit]
  );

  const selected = useMemo(
    () => regions.find((r) => r.id === selectedId) || null,
    [regions, selectedId]
  );

  return (
    <div className={PANEL_CLS} tabIndex={0} onKeyDown={onKeyDown}>
      <div className="flex-1 flex flex-col gap-2 min-w-0">
        <div className="flex gap-2 items-center flex-wrap">
          <ZoomControl
            value={zoom}
            onChange={setZoom}
            min={1}
            max={8}
            step={1}
          />

          <label className={`${LABEL_CLS} ml-4`}>Grid (px)</label>
          <Input
            size="sm"
            type="number"
            min={1}
            max={256}
            value={gridSize}
            onChange={(e) => setGridSize(Math.max(1, Number(e.target.value) || 1))}
            className="w-[70px] shrink-0"
          />

          <div className="ml-auto text-xs text-on-surface-variant/70">
            {imgState.loaded ? `${imgState.w}×${imgState.h}` : 'loading…'} ·{' '}
            {regions.length} region{regions.length === 1 ? '' : 's'}
          </div>
        </div>
        <div className={CANVAS_WRAP_CLS}>
          <canvas
            ref={canvasRef}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
            className={`block ${disabled ? 'cursor-not-allowed' : 'cursor-crosshair'}`}
          />
        </div>
      </div>

      <aside className={SIDE_CLS}>
        <div className="font-semibold text-on-surface">Regions</div>
        <ul className="list-none p-0 m-0 max-h-[160px] overflow-auto custom-scrollbar border border-outline-variant/20 rounded-sm">
          {regions.length === 0 && (
            <li className="p-2 text-on-surface-variant/60 text-xs">
              Drag on the canvas to draw a region.
            </li>
          )}
          {regions.map((r) => (
            <li
              key={r.id}
              onClick={() => setSelectedId(r.id)}
              className={`px-2 py-1.5 cursor-pointer text-xs border-b border-outline-variant/10 ${
                r.id === selectedId
                  ? 'bg-primary-dim/80 text-white font-semibold'
                  : 'text-on-surface hover:bg-surface-container-high/50'
              }`}
            >
              <div>{r.name}</div>
              <div className="text-[11px] text-on-surface-variant/60">
                {r.w}×{r.h} @ {r.nativeTilesize}px · {r.role}
              </div>
            </li>
          ))}
        </ul>

        {selected && (
          <div className="flex flex-col gap-1.5">
            <div className="font-semibold text-on-surface mt-2">Selected</div>
            <label className={LABEL_CLS}>Name</label>
            <Input
              value={selected.name}
              onChange={(e) => updateSelected({ name: e.target.value })}
            />
            <label className={LABEL_CLS}>Role</label>
            <Select
              value={selected.role || DEFAULT_ROLE}
              onChange={(e) => updateSelected({ role: e.target.value })}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </Select>
            <label className={LABEL_CLS}>Native tilesize (px)</label>
            <Input
              type="number"
              min={1}
              max={256}
              value={selected.nativeTilesize ?? defaultNativeTilesize}
              onChange={(e) =>
                updateSelected({
                  nativeTilesize: Math.max(1, Number(e.target.value) || 1),
                })
              }
            />
            <div className="flex gap-1.5 text-[11px] text-on-surface-variant/70">
              <span>x={selected.x}</span>
              <span>y={selected.y}</span>
              <span>w={selected.w}</span>
              <span>h={selected.h}</span>
            </div>
            <Button
              block
              variant="danger"
              onClick={() => {
                const next = regions.filter((r) => r.id !== selected.id);
                commit(next);
                setSelectedId(null);
              }}
            >
              Delete region
            </Button>
          </div>
        )}
      </aside>
    </div>
  );
}
