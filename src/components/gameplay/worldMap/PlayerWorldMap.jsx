import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useCampaignMap } from '../../../hooks/useCampaignMap';
import LoadingSpinner from '../../ui/LoadingSpinner';
import TileLocationPopover from './TileLocationPopover';
import SubLocationGrid from './SubLocationGrid';
import {
  computePxPerKm, worldToScreen, screenToWorld,
  drawParchment, drawGridLines, drawEdge, drawTile,
  drawBiomeLayer, drawPlayerMarker,
  pickLocationAt, tileFogState,
} from './tileMapRenderer';

export default function PlayerWorldMap({ campaignId, sceneId, onTravel, onEnterSub }) {
  const { t } = useTranslation();
  const { data, loading, error } = useCampaignMap(campaignId, sceneId);

  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const [size, setSize] = useState({ w: 500, h: 500 });
  const [hoveredId, setHoveredId] = useState(null);
  const [popover, setPopover] = useState(null); // {location, screen}
  const [subView, setSubView] = useState(null); // parent location object
  // Zoom multiplier on top of computePxPerKm. pan is in CSS pixels relative to
  // the centered grid origin. zoom=1 + pan=0,0 reproduces the un-zoomed view
  // exactly. Pan is clamped so the grid never wanders fully offscreen.
  const [view, setView] = useState({ zoom: 1, panX: 0, panY: 0 });
  const dragRef = useRef(null); // { startX, startY, startPanX, startPanY, moved }
  const justDraggedRef = useRef(false);

  const ZOOM_MIN = 1;
  const ZOOM_MAX = 5;

  const topLevelLocations = useMemo(
    () => (data?.locations || []).filter((l) => !l.parentLocationId),
    [data]
  );
  const fogVisited = useMemo(() => new Set(data?.fog?.visited || []), [data]);
  const fogHeard = useMemo(() => new Set(data?.fog?.heardAbout || []), [data]);
  const fogDiscoveredSubs = useMemo(
    () => new Set(data?.fog?.discoveredSubLocationIds || []),
    [data]
  );

  const locById = useMemo(() => {
    const m = new Map();
    for (const l of data?.locations || []) m.set(l.id, l);
    return m;
  }, [data]);

  const childrenByParent = useMemo(() => {
    const m = new Map();
    for (const l of data?.locations || []) {
      if (!l.parentLocationId) continue;
      if (!m.has(l.parentLocationId)) m.set(l.parentLocationId, []);
      m.get(l.parentLocationId).push(l);
    }
    return m;
  }, [data]);

  // Resolve the player's current parent so the top-level pulse lands on the
  // settlement tile even when currentLocationId points to a sublocation.
  const currentParentId = useMemo(() => {
    const cur = data?.currentLocationId ? locById.get(data.currentLocationId) : null;
    return cur?.parentLocationId || cur?.id || null;
  }, [data, locById]);

  const discoveredEdges = useMemo(() => new Set(data?.fog?.discoveredEdgeIds || []), [data]);

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

  const baseCell = useMemo(() => computePxPerKm(size.w, size.h), [size]);
  const cell = baseCell * view.zoom;

  // Pan limit at current zoom — keeps the grid from drifting fully offscreen.
  // gridPx grows with zoom; when gridPx <= canvas, pan is forced to 0.
  const clampPan = useCallback((zoom, panX, panY) => {
    const gridPx = 20 * baseCell * zoom; // GRID_SPAN * cell
    const limX = Math.max(0, (gridPx - size.w) / 2);
    const limY = Math.max(0, (gridPx - size.h) / 2);
    return {
      panX: Math.max(-limX, Math.min(limX, panX)),
      panY: Math.max(-limY, Math.min(limY, panY)),
    };
  }, [baseCell, size]);

  // Re-clamp pan whenever the canvas resizes — prevents pan getting "stuck"
  // outside the new bounds after a window resize.
  useEffect(() => {
    setView((v) => {
      const clamped = clampPan(v.zoom, v.panX, v.panY);
      if (clamped.panX === v.panX && clamped.panY === v.panY) return v;
      return { ...v, ...clamped };
    });
  }, [clampPan]);

  const setZoomAt = useCallback((factor, anchorX, anchorY) => {
    setPopover(null);
    setView((prev) => {
      const newZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, prev.zoom * factor));
      if (newZoom === prev.zoom) return prev;
      const ratio = newZoom / prev.zoom;
      // Keep the world point under (anchorX, anchorY) anchored on screen.
      const rawPanX = anchorX - (anchorX - prev.panX) * ratio;
      const rawPanY = anchorY - (anchorY - prev.panY) * ratio;
      if (newZoom === 1) return { zoom: 1, panX: 0, panY: 0 };
      const clamped = clampPan(newZoom, rawPanX, rawPanY);
      return { zoom: newZoom, ...clamped };
    });
  }, [clampPan]);

  const resetView = useCallback(() => {
    setPopover(null);
    setView({ zoom: 1, panX: 0, panY: 0 });
  }, []);

  // Wheel listener bound manually so we can preventDefault (React's onWheel
  // attaches passive listeners that ignore preventDefault, letting the page
  // scroll under the map).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      setZoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, sx, sy);
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [setZoomAt]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size.w * dpr;
    canvas.height = size.h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    drawParchment(ctx, size.w, size.h);

    // Pan applies to the grid + edges + tiles only — parchment stays fixed
    // so the canvas is always fully painted regardless of how far we panned.
    ctx.save();
    ctx.translate(view.panX, view.panY);

    // F5d biome map — paint biome polygon underlay before grid lines so the
    // grid + POI dots ride on top with full readability.
    drawBiomeLayer(ctx, cell, size.w, size.h);

    drawGridLines(ctx, cell, size.w, size.h);

    for (const e of data.edges || []) {
      const a = locById.get(e.fromLocationId);
      const b = locById.get(e.toLocationId);
      if (!a || !b || a.parentLocationId || b.parentLocationId) continue;
      const aState = tileFogState(a, fogVisited, fogHeard);
      const bState = tileFogState(b, fogVisited, fogHeard);
      if (aState === 'unknown' || bState === 'unknown') continue;
      const pa = worldToScreen(a.regionX, a.regionY, cell, size.w, size.h);
      const pb = worldToScreen(b.regionX, b.regionY, cell, size.w, size.h);
      drawEdge(ctx, pa, pb, { discovered: discoveredEdges.has(e.id) });
    }

    const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 400);
    for (const loc of topLevelLocations) {
      const fog = tileFogState(loc, fogVisited, fogHeard);
      if (fog === 'unknown') continue;
      const screen = worldToScreen(loc.regionX, loc.regionY, cell, size.w, size.h);
      drawTile(ctx, loc, screen, cell, {
        fog,
        isCurrent: loc.id === currentParentId,
        isHovered: loc.id === hoveredId,
        pulse,
      });
    }

    // F5d Phase 2.5 — player position marker. Continuous Campaign.currentX/Y
    // wins (free-vector wandering); otherwise we anchor to the current POI's
    // regionX/Y so the player still sees themselves on top of an anchored
    // settlement. Skipped entirely when neither is available.
    let playerX = null;
    let playerY = null;
    if (typeof data.currentX === 'number' && typeof data.currentY === 'number') {
      playerX = data.currentX;
      playerY = data.currentY;
    } else if (data.currentLocationId) {
      const cur = locById.get(data.currentLocationId);
      const anchor = cur?.parentLocationId ? locById.get(cur.parentLocationId) : cur;
      if (anchor && typeof anchor.regionX === 'number' && typeof anchor.regionY === 'number') {
        playerX = anchor.regionX;
        playerY = anchor.regionY;
      }
    }
    if (playerX !== null && playerY !== null) {
      drawPlayerMarker(ctx, playerX, playerY, cell, size.w, size.h, pulse);
    }
    ctx.restore();
  }, [data, size, cell, view.panX, view.panY, topLevelLocations, locById, fogVisited, fogHeard, discoveredEdges, hoveredId, currentParentId]);

  useEffect(() => {
    if (subView) return; // pause top-level animation while drill-down is open
    let frame;
    const loop = () => {
      draw();
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [draw, subView]);

  const openSubView = useCallback((parent) => {
    setPopover(null);
    setSubView(parent);
  }, []);

  const handlePointerDown = useCallback((e) => {
    if (e.button !== 0) return;
    if (view.zoom <= ZOOM_MIN) return; // pan only meaningful when zoomed in
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startPanX: view.panX,
      startPanY: view.panY,
      moved: false,
    };
    canvasRef.current?.setPointerCapture?.(e.pointerId);
  }, [view]);

  const handlePointerUp = useCallback((e) => {
    if (dragRef.current?.moved) justDraggedRef.current = true;
    dragRef.current = null;
    canvasRef.current?.releasePointerCapture?.(e.pointerId);
  }, []);

  const handlePointerMove = useCallback((e) => {
    if (!data) return;
    // Snapshot drag start values up-front. React's `setView` updater runs
    // async and can land AFTER a pointerup has nulled `dragRef.current`,
    // which previously crashed with "reading 'startPanX' of null".
    const drag = dragRef.current;
    if (drag) {
      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) drag.moved = true;
      const targetX = drag.startPanX + dx;
      const targetY = drag.startPanY + dy;
      setView((v) => {
        const clamped = clampPan(v.zoom, targetX, targetY);
        return { ...v, ...clamped };
      });
      return;
    }
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    // Pan-correct the cursor before mapping to world coords.
    const sx = e.clientX - rect.left - view.panX;
    const sy = e.clientY - rect.top - view.panY;
    const world = screenToWorld(sx, sy, cell, size.w, size.h);
    const picked = pickLocationAt(world.x, world.y, topLevelLocations, fogVisited, fogHeard);
    // Heard-about and visited tiles are both hoverable (both are clickable
    // for travel). Unknown tiles never resolve via pickLocationAt anyway.
    const hoverable = picked && (fogVisited.has(picked.id) || fogHeard.has(picked.id)) ? picked : null;
    setHoveredId(hoverable?.id || null);
  }, [data, size, cell, view.panX, view.panY, topLevelLocations, fogVisited, fogHeard, clampPan]);

  const handleClick = useCallback((e) => {
    // Suppress click that follows a drag-pan — pointerup → click sequence.
    if (justDraggedRef.current) {
      justDraggedRef.current = false;
      return;
    }
    if (!data) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const sx = e.clientX - rect.left - view.panX;
    const sy = e.clientY - rect.top - view.panY;
    const world = screenToWorld(sx, sy, cell, size.w, size.h);
    const picked = pickLocationAt(world.x, world.y, topLevelLocations, fogVisited, fogHeard);
    // Heard-about and visited are both clickable; only unknown tiles are
    // ignored. Sublocation drill-down is gated to visited (heard-about
    // doesn't yet expose sub list — peek-blocked per fog policy).
    if (!picked || !(fogVisited.has(picked.id) || fogHeard.has(picked.id))) {
      setPopover(null);
      return;
    }
    // Player already inside this settlement — skip popover + drill in directly.
    if (picked.id === currentParentId) {
      openSubView(picked);
      return;
    }
    const screen = worldToScreen(picked.regionX, picked.regionY, cell, size.w, size.h);
    // Add pan offset so popover lands at the actual on-screen tile position.
    setPopover({
      location: picked,
      screen: {
        x: Math.min(screen.x + view.panX + 20, size.w - 200),
        y: Math.max(screen.y + view.panY - 10, 8),
      },
    });
  }, [data, size, cell, view.panX, view.panY, topLevelLocations, fogVisited, fogHeard, currentParentId, openSubView]);

  const closePopover = useCallback(() => setPopover(null), []);

  const handleTravel = useCallback((loc) => {
    closePopover();
    const name = loc.displayName || loc.canonicalName;
    if (onTravel && name) onTravel(name);
  }, [closePopover, onTravel]);

  const handleViewSub = useCallback((loc) => {
    openSubView(loc);
  }, [openSubView]);

  const handleEnterSub = useCallback((sub) => {
    setSubView(null);
    const name = sub.displayName || sub.canonicalName;
    if (onEnterSub && name) onEnterSub(name);
  }, [onEnterSub]);

  // Sublocation peek is gated to visited tiles only — heard-about reveals
  // the parent's existence on the map, not its interior. Travel button stays
  // available regardless so the player can use a hearsay rumour to issue a
  // travel action without first knowing what's inside.
  const popoverHasSubs = useMemo(() => {
    if (!popover) return false;
    if (!fogVisited.has(popover.location.id)) return false;
    return (childrenByParent.get(popover.location.id) || []).length > 0;
  }, [popover, childrenByParent, fogVisited]);

  if (error) {
    return (
      <div className="text-[11px] text-error/80 italic p-4">
        {t('common.unexpectedError')}: {String(error.message || error)}
      </div>
    );
  }

  if (subView) {
    const children = childrenByParent.get(subView.id) || [];
    return (
      <div ref={containerRef} className="relative w-full h-[480px]">
        <SubLocationGrid
          parent={subView}
          sublocations={children}
          currentLocationId={data?.currentLocationId || null}
          fogDiscoveredSubs={fogDiscoveredSubs}
          onEnter={handleEnterSub}
          onBack={() => setSubView(null)}
          t={t}
        />
      </div>
    );
  }

  // Wilderness banner — when BE travel resolver landed the player in a
  // server-generated flavor location ("Las", "Pustkowia"...) there's no row
  // to pin to (currentLocationId=null), so the canvas pulse is suppressed.
  // The banner reassures the player that the engine knows where they are.
  // Pre-biome-tiles flavor; once tiles ship, this morphs into a tile
  // descriptor overlay.
  const wildernessBanner = data && !data.currentLocationId && data.currentLocationName
    ? data.currentLocationName
    : null;

  const canvasCursor = dragRef.current?.moved
    ? 'grabbing'
    : view.zoom > ZOOM_MIN
      ? 'grab'
      : 'pointer';

  return (
    <div ref={containerRef} className="relative w-full h-[480px] rounded-sm overflow-hidden border border-outline-variant/15">
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        style={{ display: 'block', cursor: canvasCursor, touchAction: 'none' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={() => setHoveredId(null)}
        onClick={handleClick}
      />
      <div className="absolute top-2 right-2 flex flex-col gap-1 pointer-events-auto">
        <button
          type="button"
          onClick={() => setZoomAt(1.3, size.w / 2, size.h / 2)}
          disabled={view.zoom >= ZOOM_MAX}
          className="w-7 h-7 rounded-sm bg-surface/85 backdrop-blur-sm border border-outline-variant/30 text-on-surface text-base leading-none hover:bg-surface disabled:opacity-40 disabled:cursor-not-allowed"
          title={t('worldMap.zoomIn', 'Zoom in')}
        >+</button>
        <button
          type="button"
          onClick={() => setZoomAt(1 / 1.3, size.w / 2, size.h / 2)}
          disabled={view.zoom <= ZOOM_MIN}
          className="w-7 h-7 rounded-sm bg-surface/85 backdrop-blur-sm border border-outline-variant/30 text-on-surface text-base leading-none hover:bg-surface disabled:opacity-40 disabled:cursor-not-allowed"
          title={t('worldMap.zoomOut', 'Zoom out')}
        >−</button>
        {view.zoom > ZOOM_MIN && (
          <button
            type="button"
            onClick={resetView}
            className="w-7 h-7 rounded-sm bg-surface/85 backdrop-blur-sm border border-outline-variant/30 text-on-surface text-xs leading-none hover:bg-surface"
            title={t('worldMap.zoomReset', 'Reset')}
          >↺</button>
        )}
      </div>
      {wildernessBanner && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-sm bg-surface/90 backdrop-blur-sm border border-outline-variant/30 text-[12px] font-medium text-on-surface pointer-events-none">
          📍 {wildernessBanner}
        </div>
      )}
      {loading && !data && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <LoadingSpinner size="sm" text={t('common.loading')} />
        </div>
      )}
      {popover && (
        <TileLocationPopover
          location={popover.location}
          position={popover.screen}
          onTravel={handleTravel}
          onViewSublocations={popoverHasSubs ? handleViewSub : null}
          onClose={closePopover}
          t={t}
        />
      )}
    </div>
  );
}
