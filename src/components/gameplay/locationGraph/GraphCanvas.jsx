import { useMemo, useRef, useState, useCallback, useEffect, forwardRef, useImperativeHandle } from 'react';
import LpcSprite from '../../shared/LpcSprite';
import {
  forceDirectedLayout,
  geoProjectLayout,
  directedGraphLayout,
  resolveCollisions,
  GRAPH_LAYOUT_W,
  GRAPH_LAYOUT_H,
  GRAPH_LAYOUT_PAD,
} from '../../../services/graphLayout.js';
import {
  getNodeVisual, getEdgeVisual, getNodeRadius,
  buildWavyPath, buildZigzagPath, buildBridgeTicks,
} from './graphVisuals.js';
import { SHAPE_PATHS } from './nodeShapes.js';
import { apiClient } from '../../../services/apiClient.js';

const LAYOUT_W = GRAPH_LAYOUT_W;
const LAYOUT_H = GRAPH_LAYOUT_H;
const GRID_STEP = 40;
const ANIM_DURATION_MS = 400;

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

export default forwardRef(function GraphCanvas({
  nodes, edges, occupants = [], selected, onSelect, onDoubleClickNode,
  addingNode, onCanvasClick, addingEdge, onEdgeSourceClick,
  positionOverrides, onNodeDragEnd, snapToGrid,
  highlightedNodeId = null, highlightedAdjacentIds = null,
  dimmedNodeIds = null,
  occupantSpriteMap = {},
  occupantSpriteSheetMap = {},
  /** 'auto' = geo from regionX/Y when spread exists, else force; 'geo' | 'force' = fixed basis */
  layoutBasis = 'auto',
}, ref) {
  const svgRef = useRef(null);
  const containerRef = useRef(null);
  const [pan, setPan] = useState({ x: 0, y: -500 });
  const [zoom, setZoom] = useState(1.5);
  const [dragStart, setDragStart] = useState(null);
  const [size, setSize] = useState({ w: LAYOUT_W, h: LAYOUT_H });

  const [draggingNodeId, setDraggingNodeId] = useState(null);
  const [dragNodePos, setDragNodePos] = useState(null);
  const dragOffsetRef = useRef(null);
  const didDragRef = useRef(false);
  const [edgesOnTop, setEdgesOnTop] = useState(true);

  const animRef = useRef(null);
  const panRef = useRef(pan);
  const zoomRef = useRef(zoom);
  panRef.current = pan;
  zoomRef.current = zoom;

  const cancelAnim = useCallback(() => {
    if (animRef.current) {
      cancelAnimationFrame(animRef.current.raf);
      animRef.current = null;
    }
  }, []);

  useEffect(() => cancelAnim, [cancelAnim]);

  const animateTo = useCallback((targetPan, targetZoom, duration = ANIM_DURATION_MS) => {
    cancelAnim();
    const startPan = { ...panRef.current };
    const startZoom = zoomRef.current;
    const startTime = performance.now();

    const step = (now) => {
      const elapsed = now - startTime;
      const raw = Math.min(elapsed / duration, 1);
      const t = easeInOutCubic(raw);
      const curPan = { x: lerp(startPan.x, targetPan.x, t), y: lerp(startPan.y, targetPan.y, t) };
      const curZoom = lerp(startZoom, targetZoom, t);
      setPan(curPan);
      setZoom(curZoom);
      if (raw < 1) {
        animRef.current = { raf: requestAnimationFrame(step) };
      } else {
        animRef.current = null;
      }
    };
    animRef.current = { raf: requestAnimationFrame(step) };
  }, [cancelAnim]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.shiftKey && e.code === 'KeyL') {
        e.preventDefault();
        setEdgesOnTop((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setSize({ w: width, h: height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const basePositions = useMemo(() => {
    if (nodes.length === 0) return new Map();
    const nodeNames = nodes.map((n) => n.id);
    const edgeLinks = edges.map((e) => ({ from: e.fromId, to: e.toId }));
    const force = () => forceDirectedLayout(nodeNames, edgeLinks, {
      width: LAYOUT_W, height: LAYOUT_H, iterations: 150,
    });
    const directed = () => directedGraphLayout(nodes, edges, {
      width: LAYOUT_W, height: LAYOUT_H, pad: GRAPH_LAYOUT_PAD,
    });
    if (layoutBasis === 'force') return force();
    const geo = geoProjectLayout(nodes, { width: LAYOUT_W, height: LAYOUT_H, pad: GRAPH_LAYOUT_PAD });
    if (layoutBasis === 'geo') return geo ?? directed() ?? force();
    return geo ?? directed() ?? force();
  }, [nodes, edges, layoutBasis]);

  const positions = useMemo(() => {
    const merged = new Map(basePositions);
    if (positionOverrides) {
      for (const [id, pos] of Object.entries(positionOverrides)) {
        if (merged.has(id)) merged.set(id, { ...pos });
      }
    }
    resolveCollisions(merged, nodes);
    return merged;
  }, [basePositions, positionOverrides, nodes]);

  const clientToLayout = useCallback((clientX, clientY) => {
    const rect = svgRef.current.getBoundingClientRect();
    const offsetX = (size.w - LAYOUT_W) / 2;
    const offsetY = (size.h - LAYOUT_H) / 2;
    return {
      x: (clientX - rect.left - pan.x - offsetX) / zoom,
      y: (clientY - rect.top - pan.y - offsetY) / zoom,
    };
  }, [pan, zoom, size]);

  const snapPos = useCallback((pos) => {
    if (!snapToGrid) return pos;
    return {
      x: Math.round(pos.x / GRID_STEP) * GRID_STEP,
      y: Math.round(pos.y / GRID_STEP) * GRID_STEP,
    };
  }, [snapToGrid]);

  const getNodePos = useCallback((nodeId) => {
    if (draggingNodeId === nodeId && dragNodePos) return dragNodePos;
    return positions.get(nodeId);
  }, [draggingNodeId, dragNodePos, positions]);

  const getSelectedFocal = useCallback(() => {
    if (!selected) return null;
    if (selected.type === 'node') return positions.get(selected.id) || null;
    if (selected.type === 'edge') {
      const edge = edges.find((e) => e.id === selected.id);
      if (!edge) return null;
      const from = positions.get(edge.fromId);
      const to = positions.get(edge.toId);
      if (!from || !to) return null;
      return { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
    }
    return null;
  }, [selected, positions, edges]);

  const applyZoom = useCallback((factor) => {
    const focal = getSelectedFocal();
    const oldZoom = zoom;
    const newZoom = Math.max(0.3, Math.min(3, oldZoom * factor));
    if (focal) {
      const offsetX = (size.w - LAYOUT_W) / 2;
      const offsetY = (size.h - LAYOUT_H) / 2;
      const screenX = focal.x * oldZoom + pan.x + offsetX;
      const screenY = focal.y * oldZoom + pan.y + offsetY;
      setPan({
        x: screenX - focal.x * newZoom - offsetX,
        y: screenY - focal.y * newZoom - offsetY,
      });
    }
    setZoom(newZoom);
  }, [zoom, pan, size, getSelectedFocal]);

  const handleWheel = useCallback((e) => {
    e.preventDefault();
    cancelAnim();
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    applyZoom(factor);
  }, [applyZoom, cancelAnim]);

  const handleZoomIn = useCallback(() => applyZoom(1.5), [applyZoom]);
  const handleZoomOut = useCallback(() => applyZoom(0.8), [applyZoom]);

  const computeFitToView = useCallback(() => {
    if (positions.size === 0) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const pos of positions.values()) {
      if (pos.x < minX) minX = pos.x;
      if (pos.y < minY) minY = pos.y;
      if (pos.x > maxX) maxX = pos.x;
      if (pos.y > maxY) maxY = pos.y;
    }
    const margin = 60;
    const contentW = maxX - minX + margin * 2;
    const contentH = maxY - minY + margin * 2;
    const fitZoom = Math.max(0.3, Math.min(1.2, Math.min(size.w / contentW, size.h / contentH) * 0.85));
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const offsetX = (size.w - LAYOUT_W) / 2;
    const offsetY = (size.h - LAYOUT_H) / 2;
    return {
      pan: { x: size.w / 2 - cx * fitZoom - offsetX, y: size.h / 2 - cy * fitZoom - offsetY },
      zoom: fitZoom,
    };
  }, [positions, size]);

  const handleFitToView = useCallback(() => {
    const target = computeFitToView();
    if (!target) return;
    animateTo(target.pan, target.zoom);
  }, [computeFitToView, animateTo]);

  const handleCenterOnSelection = useCallback(() => {
    const focal = getSelectedFocal();
    if (!focal) return;
    const offsetX = (size.w - LAYOUT_W) / 2;
    const offsetY = (size.h - LAYOUT_H) / 2;
    animateTo({
      x: size.w / 2 - focal.x * zoom - offsetX,
      y: size.h / 2 - focal.y * zoom - offsetY,
    }, zoom);
  }, [getSelectedFocal, zoom, size, animateTo]);

  useImperativeHandle(ref, () => ({
    fitToView: handleFitToView,
    centerOnNode: (nodeId) => {
      const pos = positions.get(nodeId);
      if (!pos) return;
      const offsetX = (size.w - LAYOUT_W) / 2;
      const offsetY = (size.h - LAYOUT_H) / 2;
      const targetZoom = 1.8;
      animateTo({
        x: size.w / 2 - pos.x * targetZoom - offsetX,
        y: size.h / 2 - pos.y * targetZoom - offsetY,
      }, targetZoom);
    },
  }), [handleFitToView, positions, size, animateTo]);

  const handleMouseDown = useCallback((e) => {
    if (e.target === svgRef.current || e.target.closest('[data-bg]') || e.target === containerRef.current) {
      cancelAnim();
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  }, [pan, cancelAnim]);

  const handleMouseMove = useCallback((e) => {
    if (draggingNodeId) {
      didDragRef.current = true;
      const layoutPos = clientToLayout(e.clientX, e.clientY);
      const off = dragOffsetRef.current;
      const raw = { x: layoutPos.x - off.x, y: layoutPos.y - off.y };
      setDragNodePos(snapPos(raw));
      return;
    }
    if (dragStart) {
      setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
    }
  }, [draggingNodeId, dragStart, clientToLayout, snapPos]);

  const handleMouseUp = useCallback(() => {
    if (draggingNodeId && dragNodePos) {
      if (didDragRef.current) {
        onNodeDragEnd?.(draggingNodeId, dragNodePos);
      }
      setDraggingNodeId(null);
      setDragNodePos(null);
      dragOffsetRef.current = null;
      return;
    }
    setDragStart(null);
  }, [draggingNodeId, dragNodePos, onNodeDragEnd]);

  const handleNodeMouseDown = useCallback((nodeId, e) => {
    if (addingEdge || addingNode) return;
    if (!onNodeDragEnd) return;
    e.stopPropagation();
    const layoutPos = clientToLayout(e.clientX, e.clientY);
    const nodePos = positions.get(nodeId);
    if (!nodePos) return;
    dragOffsetRef.current = { x: layoutPos.x - nodePos.x, y: layoutPos.y - nodePos.y };
    didDragRef.current = false;
    setDraggingNodeId(nodeId);
    setDragNodePos(nodePos);
  }, [addingEdge, addingNode, onNodeDragEnd, clientToLayout, positions]);

  const handleSvgClick = useCallback((e) => {
    if (addingNode && (e.target === svgRef.current || e.target.closest('[data-bg]'))) {
      const pos = clientToLayout(e.clientX, e.clientY);
      onCanvasClick?.(pos);
    }
  }, [addingNode, clientToLayout, onCanvasClick]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  const occupantsByLocation = useMemo(() => {
    const m = new Map();
    for (const o of occupants) {
      if (!o.locationId) continue;
      const list = m.get(o.locationId) || [];
      list.push(o);
      m.set(o.locationId, list);
    }
    return m;
  }, [occupants]);

  const svgCursor = addingNode
    ? 'crosshair'
    : draggingNodeId
      ? 'grabbing'
      : dragStart
        ? 'grabbing'
        : 'grab';

  return (
    <div ref={containerRef} className="absolute inset-0">
    <svg
      ref={svgRef}
      className="w-full h-full select-none"
      viewBox={`0 0 ${size.w} ${size.h}`}
      preserveAspectRatio="xMidYMid meet"
      style={{ cursor: svgCursor }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onClick={handleSvgClick}
    >
      <defs>
        <style>{`g[data-node]:hover .node-img { opacity: 1 !important; }
g[data-node]:hover .node-label { opacity: 1 !important; }
.npc-token {
  transform-box: fill-box;
  transform-origin: center;
  transition: transform 200ms ease var(--npc-token-delay, 0ms);
}
g[data-node]:hover .npc-token,
.npc-token:hover { transform: scale(1.25); }`}</style>
        <pattern id="graph-grid" width={GRID_STEP} height={GRID_STEP} patternUnits="userSpaceOnUse">
          <circle cx={GRID_STEP / 2} cy={GRID_STEP / 2} r={0.8} fill="rgba(255,255,255,0.12)" />
        </pattern>
        <filter id="edge-portal-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" result="blur">
            <animate attributeName="stdDeviation" values="2;4;2" dur="2s" repeatCount="indefinite" />
          </feGaussianBlur>
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="ambient-glow" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="120" />
        </filter>
        <radialGradient id="node-img-fade">
          <stop offset="55%" stopColor="white" stopOpacity={1} />
          <stop offset="100%" stopColor="white" stopOpacity={0} />
        </radialGradient>
        <mask id="node-img-mask" maskContentUnits="objectBoundingBox">
          <ellipse cx={0.5} cy={0.5} rx={0.5} ry={0.5} fill="url(#node-img-fade)" />
        </mask>
        <filter id="text-shadow" x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx={0} dy={1} stdDeviation={1.5} floodColor="#000" floodOpacity={0.7} />
        </filter>
      </defs>

      <g transform={`translate(${pan.x + (size.w - LAYOUT_W) / 2},${pan.y + (size.h - LAYOUT_H) / 2}) scale(${zoom})`}>
        <rect data-bg="1" x={-4000} y={-4000} width={8000} height={8000} fill="transparent" />
        <rect x={-4000} y={-4000} width={8000} height={8000} fill="url(#graph-grid)" pointerEvents="none" />

        <g filter="url(#ambient-glow)" opacity={0.4} pointerEvents="none">
          {nodes.map((node) => {
            if (!node.nodeImageUrl) return null;
            if (dimmedNodeIds?.has?.(node.id)) return null;
            const pos = getNodePos(node.id);
            if (!pos) return null;
            const r = getNodeRadius(node.scale ?? 5);
            const glowR = r * 10;
            return (
              <image
                key={node.id}
                href={apiClient.resolveMediaUrl(node.nodeImageUrl)}
                x={pos.x - glowR}
                y={pos.y - glowR}
                width={glowR * 2}
                height={glowR * 2}
                preserveAspectRatio="xMidYMid slice"
              />
            );
          })}
        </g>

        {!edgesOnTop && edges.map((edge) => {
          if (dimmedNodeIds && (dimmedNodeIds.has(edge.fromId) || dimmedNodeIds.has(edge.toId))) return null;
          const fromPos = getNodePos(edge.fromId);
          const toPos = getNodePos(edge.toId);
          if (!fromPos || !toPos) return null;
          return (
            <EdgeRenderer
              key={edge.id}
              edge={edge}
              fromPos={fromPos}
              toPos={toPos}
              isSelected={selected?.type === 'edge' && selected.id === edge.id}
              onSelect={onSelect}
            />
          );
        })}

        {nodes.map((node) => {
          const pos = getNodePos(node.id);
          if (!pos) return null;
          const vis = getNodeVisual(node.type, {
            shape: node.nodeShape,
            icon: node.nodeIcon,
          });
          const r = getNodeRadius(node.scale ?? 5);
          const hasImage = !!node.nodeImageUrl;
          const imgR = hasImage ? r * 5 : r;
          const isSelected = selected?.type === 'node' && selected.id === node.id;
          const locOccupants = occupantsByLocation.get(node.id) || [];
          const isHighlightedCurrent = highlightedNodeId === node.id;
          const isHighlightedAdjacent = highlightedAdjacentIds?.has?.(node.id) && !isHighlightedCurrent;
          if (dimmedNodeIds?.has?.(node.id) && !isSelected) return null;
          const nodeCursor = addingEdge || addingNode
            ? 'crosshair'
            : 'pointer';
          const shapeName = vis.shape || 'circle';
          const shapeGen = SHAPE_PATHS[shapeName];
          const useCircle = !shapeGen;

          return (
            <g
              key={node.id}
              data-node="1"
              transform={`translate(${pos.x},${pos.y})`}
              style={{ cursor: nodeCursor }}
              onMouseDown={(e) => handleNodeMouseDown(node.id, e)}
              onClick={(e) => {
                e.stopPropagation();
                if (didDragRef.current) return;
                if (addingEdge) { onEdgeSourceClick?.(node); return; }
                onSelect({ type: 'node', id: node.id });
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                onDoubleClickNode?.(node);
              }}
            >
              {isHighlightedAdjacent && (
                <circle r={imgR + 7} fill="none" stroke="var(--md-sys-color-tertiary, #7d5260)" strokeWidth={2} opacity={0.8} />
              )}
              {isHighlightedCurrent && (
                <>
                  <circle r={imgR + 7} fill="none" stroke="var(--md-sys-color-primary, #6750a4)" strokeWidth={2} opacity={0.85} />
                  <circle r={imgR + 10} fill="none" stroke="var(--md-sys-color-primary, #6750a4)" strokeWidth={1} opacity={0.35}>
                    <animate attributeName="r" values={`${imgR + 8};${imgR + 14};${imgR + 8}`} dur="2s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.45;0;0.45" dur="2s" repeatCount="indefinite" />
                  </circle>
                </>
              )}
              {isSelected && !node.nodeImageUrl && (
                useCircle ? (
                  <>
                    <circle r={r + 6} fill="none" stroke="#fbbf24" strokeWidth={3} opacity={0.9} />
                    <circle r={r + 6} fill="none" stroke="#fbbf24" strokeWidth={1} opacity={0.5}>
                      <animate attributeName="r" values={`${r + 5};${r + 10};${r + 5}`} dur="1.5s" repeatCount="indefinite" />
                      <animate attributeName="opacity" values="0.5;0;0.5" dur="1.5s" repeatCount="indefinite" />
                    </circle>
                  </>
                ) : (
                  <>
                    <path
                      d={shapeGen(r)}
                      fill="none"
                      stroke="#fbbf24"
                      strokeWidth={3}
                      opacity={0.9}
                    >
                      <animateTransform
                        attributeName="transform"
                        type="scale"
                        values="1.15;1.3;1.15"
                        dur="1.5s"
                        repeatCount="indefinite"
                      />
                    </path>
                  </>
                )
              )}
              {hasImage ? (
                <>
                  <defs>
                    <clipPath id={`clip-${node.id}`}>
                      {useCircle
                        ? <circle r={imgR} />
                        : <path d={shapeGen(imgR)} />}
                    </clipPath>
                    {isSelected && (
                      <filter id={`hl-${node.id}`} filterUnits="objectBoundingBox"
                        x="-20%" y="-20%" width="140%" height="140%">
                        <feMorphology in="SourceAlpha" operator="dilate" result="expanded">
                          <animate attributeName="radius" values="3;5;3" dur="1.5s" repeatCount="indefinite" />
                        </feMorphology>
                        <feFlood floodColor="#fbbf24" result="color" />
                        <feComposite in="color" in2="expanded" operator="in" result="outline" />
                        <feGaussianBlur in="outline" stdDeviation="2" result="glow" />
                        <feMerge>
                          <feMergeNode in="glow" />
                          <feMergeNode in="outline" />
                          <feMergeNode in="SourceGraphic" />
                        </feMerge>
                      </filter>
                    )}
                  </defs>
                  <image
                    href={apiClient.resolveMediaUrl(node.nodeImageUrl)}
                    x={-imgR}
                    y={-imgR}
                    width={imgR * 2}
                    height={imgR * 2}
                    preserveAspectRatio="xMidYMid slice"
                    filter={isSelected ? `url(#hl-${node.id})` : undefined}
                    mask="url(#node-img-mask)"
                    style={{
                      imageRendering: 'pixelated',
                      opacity: node.discoveryState === 'rumored' ? 0.2 : 0.4,
                      transition: 'opacity 1.5s ease',
                    }}
                    className="node-img"
                  />
                </>
              ) : (
                <>
                  {useCircle ? (
                    <circle
                      r={r}
                      fill={vis.color}
                      stroke={isSelected ? '#fbbf24' : 'rgba(255,255,255,0.15)'}
                      strokeWidth={isSelected ? 2 : 1}
                      opacity={node.discoveryState === 'rumored' ? 0.4 : 1}
                    />
                  ) : (
                    <path
                      d={shapeGen(r)}
                      fill={vis.color}
                      stroke={isSelected ? '#fbbf24' : 'rgba(255,255,255,0.15)'}
                      strokeWidth={isSelected ? 2 : 1}
                      opacity={node.discoveryState === 'rumored' ? 0.4 : 1}
                    />
                  )}
                  <text
                    y={1}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill="white"
                    fontSize={r * 0.7}
                    fontFamily="Material Symbols Outlined"
                    pointerEvents="none"
                  >
                    {vis.icon}
                  </text>
                </>
              )}
              {(() => {
                const fs = isSelected ? 15 : 13;
                const maxChars = isSelected ? 18 : 16;
                const lines = wrapLabel(node.name, maxChars);
                const lineHeight = fs + 3;
                const totalTextH = lines.length * lineHeight;
                const padX = 6;
                const padTop = 2;
                const padBot = 6;
                const approxCharW = fs * 0.55;
                const maxLineW = Math.max(...lines.map((l) => l.length)) * approxCharW;
                const boxW = maxLineW + padX * 2;
                const boxH = totalTextH + padTop + padBot;
                const boxY = -totalTextH / 2 - padTop;
                return (
                  <g pointerEvents="none" className="node-label" style={{ opacity: 0.6, transition: 'opacity 250ms ease' }}>
                    <rect
                      x={-boxW / 2}
                      y={boxY}
                      width={boxW}
                      height={boxH}
                      rx={4}
                      fill="rgba(0,0,0,0.55)"
                    />
                    <text
                      textAnchor="middle"
                      dominantBaseline="central"
                      fill="rgba(255,255,255,0.95)"
                      fontSize={fs}
                      fontWeight={700}
                      fontFamily="'Cinzel', 'Palatino Linotype', 'Book Antiqua', serif"
                      letterSpacing={0.5}
                      filter="url(#text-shadow)"
                    >
                      {lines.map((line, i) => (
                        <tspan
                          key={i}
                          x={0}
                          dy={i === 0 ? 0 : lineHeight}
                          y={i === 0 ? (boxY + boxH / 2 - (lines.length - 1) * lineHeight / 2) : undefined}
                        >
                          {line}
                        </tspan>
                      ))}
                    </text>
                  </g>
                );
              })()}

              {locOccupants.map((occ, i) => {
                const angle = (2 * Math.PI * i) / Math.max(locOccupants.length, 1) - Math.PI / 2;
                const isPlayer = occ.type === 'player';
                const dotR = isPlayer ? 12 : 10;
                const color = isPlayer ? '#22d3ee' : '#d4d4d8';
                const spriteHref = occupantSpriteMap[occ.id];
                const sheetHref = occupantSpriteSheetMap[occ.id];
                const tokenPx = isPlayer ? 44 : 40;
                const orbitR = imgR * 0.35 + tokenPx / 2;
                const ox = Math.cos(angle) * orbitR;
                const oy = Math.sin(angle) * orbitR;
                const labelY = (spriteHref || sheetHref ? tokenPx / 2 : dotR) + 10;
                const tokenDelayMs = Math.min(i * 45, 300);
                return (
                  <g
                    key={occ.id}
                    transform={`translate(${ox},${oy})`}
                    className="npc-token"
                    style={{ cursor: 'pointer', '--npc-token-delay': `${tokenDelayMs}ms` }}
                  >
                    {sheetHref ? (
                      <>
                        <rect
                          className="npc-token-border"
                          x={-tokenPx / 2 - 2}
                          y={-tokenPx / 2 - 2}
                          width={tokenPx + 4}
                          height={tokenPx + 4}
                          rx={3}
                          fill="none"
                          stroke={color}
                          strokeWidth={1.5}
                          opacity={0}
                          style={{ transition: 'opacity 200ms ease' }}
                        />
                        <foreignObject
                          x={-tokenPx / 2}
                          y={-tokenPx / 2}
                          width={tokenPx}
                          height={tokenPx}
                        >
                          <LpcSprite
                            sheetUrl={sheetHref}
                            animation="idle_down"
                            width={tokenPx}
                            height={tokenPx}
                            playing
                          />
                        </foreignObject>
                      </>
                    ) : spriteHref ? (
                      <>
                        <rect
                          className="npc-token-border"
                          x={-tokenPx / 2 - 2}
                          y={-tokenPx / 2 - 2}
                          width={tokenPx + 4}
                          height={tokenPx + 4}
                          rx={3}
                          fill="none"
                          stroke={color}
                          strokeWidth={1.5}
                          opacity={0}
                          style={{ transition: 'opacity 200ms ease' }}
                        />
                        <image
                          href={spriteHref}
                          x={-tokenPx / 2}
                          y={-tokenPx / 2}
                          width={tokenPx}
                          height={tokenPx}
                          style={{ imageRendering: 'pixelated' }}
                        />
                      </>
                    ) : (
                      <circle r={dotR} fill={color} stroke="rgba(0,0,0,0.5)" strokeWidth={0.8} />
                    )}
                    <title>{occ.name}{isPlayer ? ' (gracz)' : ` (${occ.role || 'NPC'})`}</title>
                    <text
                      y={labelY}
                      textAnchor="middle"
                      fill={color}
                      fontSize={9}
                      fontWeight={500}
                      pointerEvents="visiblePainted"
                      opacity={0.9}
                    >
                      {truncate(occ.name, 12)}
                    </text>
                  </g>
                );
              })}
            </g>
          );
        })}

        {edgesOnTop && edges.map((edge) => {
          if (dimmedNodeIds && (dimmedNodeIds.has(edge.fromId) || dimmedNodeIds.has(edge.toId))) return null;
          const fromPos = getNodePos(edge.fromId);
          const toPos = getNodePos(edge.toId);
          if (!fromPos || !toPos) return null;
          return (
            <EdgeRenderer
              key={edge.id}
              edge={edge}
              fromPos={fromPos}
              toPos={toPos}
              isSelected={selected?.type === 'edge' && selected.id === edge.id}
              onSelect={onSelect}
            />
          );
        })}
      </g>
    </svg>

    <div className="absolute bottom-3 left-3 flex flex-col gap-1 bg-surface-container-highest/80 backdrop-blur-sm border border-outline-variant/15 rounded-sm p-1">
      <button
        onClick={handleZoomIn}
        className="w-7 h-7 flex items-center justify-center rounded-sm hover:bg-white/10 text-on-surface-variant hover:text-on-surface transition-colors"
        title="Zoom in"
      >
        <span className="material-symbols-outlined text-lg">zoom_in</span>
      </button>
      <button
        onClick={handleZoomOut}
        className="w-7 h-7 flex items-center justify-center rounded-sm hover:bg-white/10 text-on-surface-variant hover:text-on-surface transition-colors"
        title="Zoom out"
      >
        <span className="material-symbols-outlined text-lg">zoom_out</span>
      </button>
      <div className="w-full h-px bg-outline-variant/20" />
      <button
        onClick={handleFitToView}
        className="w-7 h-7 flex items-center justify-center rounded-sm hover:bg-white/10 text-on-surface-variant hover:text-on-surface transition-colors"
        title="Fit to view"
      >
        <span className="material-symbols-outlined text-lg">fit_screen</span>
      </button>
      <button
        onClick={handleCenterOnSelection}
        disabled={!selected}
        className="w-7 h-7 flex items-center justify-center rounded-sm hover:bg-white/10 text-on-surface-variant hover:text-on-surface transition-colors disabled:opacity-30 disabled:pointer-events-none"
        title="Center on selection"
      >
        <span className="material-symbols-outlined text-lg">center_focus_strong</span>
      </button>
    </div>
    </div>
  );
})

function EdgeRenderer({ edge, fromPos, toPos, isSelected, onSelect }) {
  const [hovered, setHovered] = useState(false);
  const vis = getEdgeVisual(edge.category, edge.metadata, edge.edgeType);
  const opacity = vis.opacity ?? 0.7;
  const groupOpacity = isSelected ? 1 : hovered ? 0.85 : 0.35;
  const w = isSelected ? vis.width + 3 : vis.width;
  const handleClick = (e) => { e.stopPropagation(); onSelect({ type: 'edge', id: edge.id }); };

  const hitTarget = (
    <line
      x1={fromPos.x} y1={fromPos.y} x2={toPos.x} y2={toPos.y}
      stroke="transparent" strokeWidth={Math.max(vis.width + 8, 12)}
      style={{ cursor: 'pointer' }} onClick={handleClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    />
  );

  const selGlow = isSelected ? (
    <>
      <line
        x1={fromPos.x} y1={fromPos.y} x2={toPos.x} y2={toPos.y}
        stroke="#fbbf24" strokeWidth={vis.width + 10} opacity={0.25} pointerEvents="none"
        strokeLinecap="round"
      />
      <line
        x1={fromPos.x} y1={fromPos.y} x2={toPos.x} y2={toPos.y}
        stroke="#fbbf24" strokeWidth={vis.width + 5} opacity={0.5} pointerEvents="none"
        strokeLinecap="round"
      />
    </>
  ) : null;

  const arrow = !edge.bidirectional ? (
    <ArrowHead from={fromPos} to={toPos} color={vis.color} size={Math.max(vis.width * 1.5, 8)} />
  ) : null;

  const midIcon = vis.midIcon ? (
    <MidpointIcon from={fromPos} to={toPos} icon={vis.midIcon} color={vis.color} />
  ) : null;

  let visual;
  switch (vis.renderMode) {
    case 'double': {
      visual = (
        <>
          <line
            x1={fromPos.x} y1={fromPos.y} x2={toPos.x} y2={toPos.y}
            stroke={vis.borderColor || '#000'} strokeWidth={w}
            strokeDasharray={vis.dash} opacity={opacity}
            strokeLinecap="round" pointerEvents="none"
          />
          <line
            x1={fromPos.x} y1={fromPos.y} x2={toPos.x} y2={toPos.y}
            stroke={vis.color} strokeWidth={w * 0.55}
            strokeDasharray={vis.dash} opacity={opacity}
            strokeLinecap="round" pointerEvents="none"
          />
        </>
      );
      break;
    }
    case 'bridge': {
      const ticks = buildBridgeTicks(fromPos, toPos, w * 0.6, 14);
      visual = (
        <>
          <line
            x1={fromPos.x} y1={fromPos.y} x2={toPos.x} y2={toPos.y}
            stroke={vis.borderColor || '#000'} strokeWidth={w}
            opacity={opacity} strokeLinecap="round" pointerEvents="none"
          />
          <line
            x1={fromPos.x} y1={fromPos.y} x2={toPos.x} y2={toPos.y}
            stroke={vis.color} strokeWidth={w * 0.55}
            opacity={opacity} strokeLinecap="round" pointerEvents="none"
          />
          {ticks.map((tk, i) => (
            <line
              key={i}
              x1={tk.x1} y1={tk.y1} x2={tk.x2} y2={tk.y2}
              stroke={vis.borderColor || '#000'} strokeWidth={1.5}
              opacity={opacity} pointerEvents="none"
            />
          ))}
        </>
      );
      break;
    }
    case 'wavy': {
      const d = buildWavyPath(fromPos, toPos, vis.wavyAmp ?? 5, 3);
      visual = (
        <path
          d={d} fill="none" stroke={vis.color} strokeWidth={w}
          strokeDasharray={vis.dash} opacity={opacity}
          strokeLinecap="round" strokeLinejoin="round" pointerEvents="none"
        />
      );
      break;
    }
    case 'zigzag': {
      const d = buildZigzagPath(fromPos, toPos, vis.zigzagAmp ?? 5);
      visual = (
        <path
          d={d} fill="none" stroke={vis.color} strokeWidth={w}
          opacity={opacity} strokeLinejoin="round" strokeLinecap="round"
          pointerEvents="none"
        />
      );
      break;
    }
    case 'glow': {
      visual = (
        <>
          <line
            x1={fromPos.x} y1={fromPos.y} x2={toPos.x} y2={toPos.y}
            stroke={vis.color} strokeWidth={w}
            opacity={opacity} strokeLinecap="round"
            filter="url(#edge-portal-glow)" pointerEvents="none"
          />
          <line
            x1={fromPos.x} y1={fromPos.y} x2={toPos.x} y2={toPos.y}
            stroke="#fff" strokeWidth={w * 0.4}
            opacity={opacity * 0.6} strokeLinecap="round" pointerEvents="none"
          />
        </>
      );
      break;
    }
    case 'door': {
      const dx = toPos.x - fromPos.x;
      const dy = toPos.y - fromPos.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      const gapPx = Math.min(8, len * 0.15);
      const ux = len > 0 ? dx / len : 0;
      const uy = len > 0 ? dy / len : 0;
      const mx = (fromPos.x + toPos.x) / 2;
      const my = (fromPos.y + toPos.y) / 2;
      visual = (
        <>
          <line
            x1={fromPos.x} y1={fromPos.y}
            x2={mx - ux * gapPx} y2={my - uy * gapPx}
            stroke={vis.color} strokeWidth={w}
            opacity={opacity} strokeLinecap="round" pointerEvents="none"
          />
          <line
            x1={mx + ux * gapPx} y1={my + uy * gapPx}
            x2={toPos.x} y2={toPos.y}
            stroke={vis.color} strokeWidth={w}
            opacity={opacity} strokeLinecap="round" pointerEvents="none"
          />
        </>
      );
      break;
    }
    default: {
      visual = (
        <line
          x1={fromPos.x} y1={fromPos.y} x2={toPos.x} y2={toPos.y}
          stroke={vis.color} strokeWidth={w}
          strokeDasharray={vis.dash} opacity={opacity}
          strokeLinecap="round" pointerEvents="none"
        />
      );
      break;
    }
  }

  return (
    <g style={{ opacity: groupOpacity, transition: 'opacity 150ms ease' }}>
      {selGlow}
      {hitTarget}
      {visual}
      {midIcon}
      {arrow}
    </g>
  );
}

function MidpointIcon({ from, to, icon, color }) {
  const mx = (from.x + to.x) / 2;
  const my = (from.y + to.y) / 2;
  return (
    <g transform={`translate(${mx},${my})`} pointerEvents="none">
      <circle r={8} fill="rgba(0,0,0,0.7)" stroke={color} strokeWidth={0.5} />
      <text
        textAnchor="middle" dominantBaseline="central"
        fill={color} fontSize={10} fontFamily="Material Symbols Outlined"
      >
        {icon}
      </text>
    </g>
  );
}

function ArrowHead({ from, to, color, size = 8 }) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1) return null;
  const nx = dx / len;
  const ny = dy / len;
  const halfBase = size * 0.5;
  const midX = (from.x + to.x) / 2;
  const midY = (from.y + to.y) / 2;
  const tipX = midX + nx * size;
  const tipY = midY + ny * size;
  const baseX1 = midX - ny * halfBase;
  const baseY1 = midY + nx * halfBase;
  const baseX2 = midX + ny * halfBase;
  const baseY2 = midY - nx * halfBase;

  return (
    <polygon
      points={`${tipX},${tipY} ${baseX1},${baseY1} ${baseX2},${baseY2}`}
      fill={color} opacity={0.7} pointerEvents="none"
    />
  );
}

function truncate(str, max) {
  if (!str) return '';
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}

function wrapLabel(str, maxCharsPerLine) {
  if (!str) return [''];
  if (str.length <= maxCharsPerLine) return [str];

  const breakIdx = str.lastIndexOf(' ', maxCharsPerLine);
  const splitAt = breakIdx > 0 ? breakIdx : maxCharsPerLine;
  const line1 = str.slice(0, splitAt).trim();
  const rest = str.slice(splitAt).trim();
  const line2 = rest.length > maxCharsPerLine
    ? rest.slice(0, maxCharsPerLine - 1) + '…'
    : rest;
  return [line1, line2];
}
