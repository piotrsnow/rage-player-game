import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import {
  subGridSizeFor, computeSubPxPerCell, subCellToScreen, screenToSubCell,
  drawSubParchment, drawSubGridLines, drawSubTile,
  layoutSubsWithFallback, pickSubAt,
} from './subGridRenderer';

// Sublocation drill-down grid (Round C Phase 7).
// `parent` — the top-level WorldLocation clicked on the main map.
// `sublocations` — children of parent (parentLocationId === parent.id).
// `currentLocationId` — player's actual current location (can be a sub id).
// `fogDiscoveredSubs` — Set of non-canonical sub ids already discovered
//   (canonical subs are visible as soon as parent is visited).
// `bypassFog` — admin preview (show every sub regardless).
// `onEnter(sub)` — click fires a synthetic "enter" dispatch upstream.
// `onBack()` — return to top-level map without generating a scene.
export default function SubLocationGrid({
  parent,
  sublocations,
  currentLocationId,
  fogDiscoveredSubs,
  bypassFog = false,
  onEnter,
  onBack,
  t,
}) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const [size, setSize] = useState({ w: 500, h: 500 });
  const [hoveredId, setHoveredId] = useState(null);

  const gridSize = subGridSizeFor(parent?.locationType);

  const visibleSubs = useMemo(() => {
    if (!sublocations) return [];
    const filtered = bypassFog
      ? sublocations
      : sublocations.filter((s) => s.isCanonical !== false || fogDiscoveredSubs?.has(s.id));
    return layoutSubsWithFallback(filtered, gridSize);
  }, [sublocations, fogDiscoveredSubs, bypassFog, gridSize]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setSize({ w: width, h: Math.max(height, 320) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size.w * dpr;
    canvas.height = size.h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    drawSubParchment(ctx, size.w, size.h);
    const pxPerCell = computeSubPxPerCell(size.w, size.h, gridSize);
    drawSubGridLines(ctx, pxPerCell, gridSize, size.w, size.h);

    const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 400);
    for (const sub of visibleSubs) {
      const screen = subCellToScreen(sub.subGridX, sub.subGridY, pxPerCell, gridSize, size.w, size.h);
      drawSubTile(ctx, sub, screen, pxPerCell, {
        isCurrent: sub.id === currentLocationId,
        isHovered: sub.id === hoveredId,
        pulse,
        fog: 'visible',
      });
    }
  }, [size, visibleSubs, gridSize, currentLocationId, hoveredId]);

  useEffect(() => {
    let frame;
    const loop = () => {
      draw();
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [draw]);

  const handlePointerMove = useCallback((e) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const pxPerCell = computeSubPxPerCell(size.w, size.h, gridSize);
    const cell = screenToSubCell(sx, sy, pxPerCell, gridSize, size.w, size.h);
    const picked = pickSubAt(cell.x, cell.y, visibleSubs);
    setHoveredId(picked?.id || null);
  }, [size, visibleSubs, gridSize]);

  const handleClick = useCallback((e) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const pxPerCell = computeSubPxPerCell(size.w, size.h, gridSize);
    const cell = screenToSubCell(sx, sy, pxPerCell, gridSize, size.w, size.h);
    const picked = pickSubAt(cell.x, cell.y, visibleSubs);
    if (picked && onEnter) onEnter(picked);
  }, [size, visibleSubs, gridSize, onEnter]);

  const parentName = parent?.displayName || parent?.canonicalName || '';

  return (
    <div ref={containerRef} className="relative w-full h-[480px] rounded-sm overflow-hidden border border-outline-variant/15">
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-3 py-2 bg-surface-container-highest/80 backdrop-blur-sm border-b border-outline-variant/15">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-[11px] text-on-surface-variant hover:text-primary transition-colors"
          type="button"
        >
          <span className="material-symbols-outlined text-sm">arrow_back</span>
          {t?.('worldState.backToMap') || 'Back to map'}
        </button>
        <div className="text-[11px] font-bold text-on-surface truncate ml-3">{parentName}</div>
      </div>
      <canvas
        ref={canvasRef}
        className="w-full h-full cursor-pointer"
        style={{ display: 'block' }}
        onPointerMove={handlePointerMove}
        onPointerLeave={() => setHoveredId(null)}
        onClick={handleClick}
      />
      {visibleSubs.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-[11px] text-on-surface-variant/70 italic">
            {t?.('worldState.noSublocations') || 'No sublocations here.'}
          </div>
        </div>
      )}
    </div>
  );
}
