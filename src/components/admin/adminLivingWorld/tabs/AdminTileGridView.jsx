import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import {
  computePxPerKm, worldToScreen, screenToWorld,
  drawParchment, drawGridLines, drawEdge, drawTile,
  pickLocationAt,
} from '../../../gameplay/worldMap/tileMapRenderer';

// Admin-only unfiltered tile-grid view (Round C Phase 8).
// Renders the same canonical -10..10 grid as the player map but without fog.
// Uses admin `/graph` payload directly: nodes have `x/y/locationType/dangerLevel`.
// Click on a node fires `onSelectParent(node)` so the parent tab can open the
// sublocation drill-down modal.
export default function AdminTileGridView({ graph, onSelectParent }) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const [size, setSize] = useState({ w: 600, h: 500 });
  const [hoveredId, setHoveredId] = useState(null);

  // Adapt admin graph node shape to the shape tileMapRenderer expects.
  const adapted = useMemo(() => {
    return (graph?.nodes || []).map((n) => ({
      id: n.id,
      regionX: n.x || 0,
      regionY: n.y || 0,
      locationType: n.locationType || 'generic',
      dangerLevel: n.dangerLevel || 'safe',
      canonicalName: n.name,
      displayName: n.displayName || n.name,
      isCanonical: n.isCanonical !== false,
      parentLocationId: null,
    }));
  }, [graph]);

  const adaptedById = useMemo(() => {
    const m = new Map();
    for (const n of adapted) m.set(n.id, n);
    return m;
  }, [adapted]);

  // Admin sees everything — seed both fog sets with every id so the renderer
  // treats all tiles as "visited".
  const fogAll = useMemo(() => new Set(adapted.map((n) => n.id)), [adapted]);
  const fogNone = useMemo(() => new Set(), []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setSize({ w: width, h: Math.max(height, 400) });
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

    drawParchment(ctx, size.w, size.h);
    const cell = computePxPerKm(size.w, size.h);
    drawGridLines(ctx, cell, size.w, size.h);

    for (const e of graph?.edges || []) {
      const a = adaptedById.get(e.from);
      const b = adaptedById.get(e.to);
      if (!a || !b) continue;
      const pa = worldToScreen(a.regionX, a.regionY, cell, size.w, size.h);
      const pb = worldToScreen(b.regionX, b.regionY, cell, size.w, size.h);
      drawEdge(ctx, pa, pb, { discovered: (e.discoveredCampaignCount || 0) > 0 });
    }

    const pulse = 0;
    for (const loc of adapted) {
      const screen = worldToScreen(loc.regionX, loc.regionY, cell, size.w, size.h);
      drawTile(ctx, loc, screen, cell, {
        fog: 'visited',
        isCurrent: false,
        isHovered: loc.id === hoveredId,
        pulse,
      });
    }
  }, [size, adapted, adaptedById, graph, hoveredId]);

  useEffect(() => {
    draw();
  }, [draw]);

  const handlePointerMove = useCallback((e) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const cell = computePxPerKm(size.w, size.h);
    const world = screenToWorld(sx, sy, cell, size.w, size.h);
    const picked = pickLocationAt(world.x, world.y, adapted, fogAll, fogNone);
    setHoveredId(picked?.id || null);
  }, [size, adapted, fogAll, fogNone]);

  const handleClick = useCallback((e) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const cell = computePxPerKm(size.w, size.h);
    const world = screenToWorld(sx, sy, cell, size.w, size.h);
    const picked = pickLocationAt(world.x, world.y, adapted, fogAll, fogNone);
    if (picked && onSelectParent) {
      const node = graph.nodes.find((n) => n.id === picked.id);
      onSelectParent(node || null);
    }
  }, [size, adapted, fogAll, fogNone, graph, onSelectParent]);

  return (
    <div ref={containerRef} className="relative w-full h-[560px] rounded-sm overflow-hidden border border-outline-variant/25">
      <canvas
        ref={canvasRef}
        className="w-full h-full cursor-pointer"
        style={{ display: 'block' }}
        onPointerMove={handlePointerMove}
        onPointerLeave={() => setHoveredId(null)}
        onClick={handleClick}
      />
    </div>
  );
}
