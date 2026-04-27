import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useCampaignMap } from '../../../hooks/useCampaignMap';
import LoadingSpinner from '../../ui/LoadingSpinner';
import TileLocationPopover from './TileLocationPopover';
import SubLocationGrid from './SubLocationGrid';
import {
  computePxPerKm, worldToScreen, screenToWorld,
  drawParchment, drawGridLines, drawEdge, drawTile,
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

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size.w * dpr;
    canvas.height = size.h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    drawParchment(ctx, size.w, size.h);
    const cell = computePxPerKm(size.w, size.h);
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
  }, [data, size, topLevelLocations, locById, fogVisited, fogHeard, discoveredEdges, hoveredId, currentParentId]);

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

  const handlePointerMove = useCallback((e) => {
    if (!data) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const cell = computePxPerKm(size.w, size.h);
    const world = screenToWorld(sx, sy, cell, size.w, size.h);
    const picked = pickLocationAt(world.x, world.y, topLevelLocations, fogVisited, fogHeard);
    // Heard-about tiles are not clickable per spec; skip hover highlight too.
    const hoverable = picked && fogVisited.has(picked.id) ? picked : null;
    setHoveredId(hoverable?.id || null);
  }, [data, size, topLevelLocations, fogVisited, fogHeard]);

  const handleClick = useCallback((e) => {
    if (!data) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const cell = computePxPerKm(size.w, size.h);
    const world = screenToWorld(sx, sy, cell, size.w, size.h);
    const picked = pickLocationAt(world.x, world.y, topLevelLocations, fogVisited, fogHeard);
    if (!picked || !fogVisited.has(picked.id)) {
      setPopover(null);
      return;
    }
    // Player already inside this settlement — skip popover + drill in directly.
    if (picked.id === currentParentId) {
      openSubView(picked);
      return;
    }
    const screen = worldToScreen(picked.regionX, picked.regionY, cell, size.w, size.h);
    setPopover({
      location: picked,
      screen: { x: Math.min(screen.x + 20, size.w - 200), y: Math.max(screen.y - 10, 8) },
    });
  }, [data, size, topLevelLocations, fogVisited, fogHeard, currentParentId, openSubView]);

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

  const popoverHasSubs = useMemo(() => {
    if (!popover) return false;
    return (childrenByParent.get(popover.location.id) || []).length > 0;
  }, [popover, childrenByParent]);

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

  return (
    <div ref={containerRef} className="relative w-full h-[480px] rounded-sm overflow-hidden border border-outline-variant/15">
      <canvas
        ref={canvasRef}
        className="w-full h-full cursor-pointer"
        style={{ display: 'block' }}
        onPointerMove={handlePointerMove}
        onPointerLeave={() => setHoveredId(null)}
        onClick={handleClick}
      />
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
