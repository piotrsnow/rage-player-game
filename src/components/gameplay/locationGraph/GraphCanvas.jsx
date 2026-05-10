import { useMemo, useRef, useState, useCallback, useEffect } from 'react';
import {
  forceDirectedLayout,
  geoProjectLayout,
  GRAPH_LAYOUT_W,
  GRAPH_LAYOUT_H,
  GRAPH_LAYOUT_PAD,
} from '../../../services/graphLayout.js';
import { getNodeVisual, getEdgeVisual, getNodeRadius } from './graphVisuals.js';
import { SHAPE_PATHS } from './nodeShapes.js';
import { apiClient } from '../../../services/apiClient.js';

const LAYOUT_W = GRAPH_LAYOUT_W;
const LAYOUT_H = GRAPH_LAYOUT_H;
const GRID_STEP = 40;

export default function GraphCanvas({
  nodes, edges, occupants = [], selected, onSelect, onDoubleClickNode,
  addingNode, onCanvasClick, addingEdge, onEdgeSourceClick,
  positionOverrides, onNodeDragEnd, snapToGrid,
  highlightedNodeId = null, highlightedAdjacentIds = null,
  occupantSpriteMap = {},
  /** 'auto' = geo from regionX/Y when spread exists, else force; 'geo' | 'force' = fixed basis */
  layoutBasis = 'auto',
}) {
  const svgRef = useRef(null);
  const containerRef = useRef(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1.5);
  const [dragStart, setDragStart] = useState(null);
  const [size, setSize] = useState({ w: LAYOUT_W, h: LAYOUT_H });

  const [draggingNodeId, setDraggingNodeId] = useState(null);
  const [dragNodePos, setDragNodePos] = useState(null);
  const dragOffsetRef = useRef(null);
  const didDragRef = useRef(false);

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
    if (layoutBasis === 'force') return force();
    const geo = geoProjectLayout(nodes, { width: LAYOUT_W, height: LAYOUT_H, pad: GRAPH_LAYOUT_PAD });
    if (layoutBasis === 'geo') return geo ?? force();
    return geo ?? force();
  }, [nodes, edges, layoutBasis]);

  const positions = useMemo(() => {
    const merged = new Map(basePositions);
    if (positionOverrides) {
      for (const [id, pos] of Object.entries(positionOverrides)) {
        if (merged.has(id)) merged.set(id, pos);
      }
    }
    return merged;
  }, [basePositions, positionOverrides]);

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
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    applyZoom(factor);
  }, [applyZoom]);

  const handleZoomIn = useCallback(() => applyZoom(1.25), [applyZoom]);
  const handleZoomOut = useCallback(() => applyZoom(0.8), [applyZoom]);

  const handleFitToView = useCallback(() => {
    if (positions.size === 0) return;
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
    const fitZoom = Math.max(0.3, Math.min(2, Math.min(size.w / contentW, size.h / contentH)));
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const offsetX = (size.w - LAYOUT_W) / 2;
    const offsetY = (size.h - LAYOUT_H) / 2;
    setPan({
      x: size.w / 2 - cx * fitZoom - offsetX,
      y: size.h / 2 - cy * fitZoom - offsetY,
    });
    setZoom(fitZoom);
  }, [positions, size]);

  const handleCenterOnSelection = useCallback(() => {
    const focal = getSelectedFocal();
    if (!focal) return;
    const offsetX = (size.w - LAYOUT_W) / 2;
    const offsetY = (size.h - LAYOUT_H) / 2;
    setPan({
      x: size.w / 2 - focal.x * zoom - offsetX,
      y: size.h / 2 - focal.y * zoom - offsetY,
    });
  }, [getSelectedFocal, zoom, size]);

  const handleMouseDown = useCallback((e) => {
    if (e.target === svgRef.current || e.target.closest('[data-bg]') || e.target === containerRef.current) {
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  }, [pan]);

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
      onNodeDragEnd?.(draggingNodeId, dragNodePos);
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
        <pattern id="graph-grid" width={GRID_STEP} height={GRID_STEP} patternUnits="userSpaceOnUse">
          <circle cx={GRID_STEP / 2} cy={GRID_STEP / 2} r={0.8} fill="rgba(255,255,255,0.12)" />
        </pattern>
      </defs>

      <g transform={`translate(${pan.x + (size.w - LAYOUT_W) / 2},${pan.y + (size.h - LAYOUT_H) / 2}) scale(${zoom})`}>
        <rect data-bg="1" x={-4000} y={-4000} width={8000} height={8000} fill="transparent" />
        <rect x={-4000} y={-4000} width={8000} height={8000} fill="url(#graph-grid)" pointerEvents="none" />

        {edges.map((edge) => {
          const fromPos = getNodePos(edge.fromId);
          const toPos = getNodePos(edge.toId);
          if (!fromPos || !toPos) return null;
          const vis = getEdgeVisual(edge.category, edge.metadata);
          const isSelected = selected?.type === 'edge' && selected.id === edge.id;
          const isBlocked = edge.edgeType === 'blocked_path_to';
          const edgeOpacity = vis.opacity ?? 0.7;

          return (
            <g key={edge.id}>
              <line
                x1={fromPos.x} y1={fromPos.y}
                x2={toPos.x} y2={toPos.y}
                stroke={isBlocked ? '#ef4444' : vis.color}
                strokeWidth={isSelected ? vis.width + 1.5 : vis.width}
                strokeDasharray={isBlocked ? '6,3' : vis.dash}
                opacity={edgeOpacity}
                style={{ cursor: 'pointer' }}
                onClick={(e) => { e.stopPropagation(); onSelect({ type: 'edge', id: edge.id }); }}
              />
              {isSelected && (
                <line
                  x1={fromPos.x} y1={fromPos.y}
                  x2={toPos.x} y2={toPos.y}
                  stroke="#fbbf24" strokeWidth={vis.width + 3}
                  strokeDasharray={vis.dash} opacity={0.3}
                  pointerEvents="none"
                />
              )}
              {!edge.bidirectional && (
                <ArrowHead from={fromPos} to={toPos} color={vis.color} />
              )}
            </g>
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
          const imgR = hasImage ? r * 2 : r;
          const isSelected = selected?.type === 'node' && selected.id === node.id;
          const locOccupants = occupantsByLocation.get(node.id) || [];
          const isHighlightedCurrent = highlightedNodeId === node.id;
          const isHighlightedAdjacent = highlightedAdjacentIds?.has?.(node.id) && !isHighlightedCurrent;
          const nodeCursor = addingEdge || addingNode
            ? 'crosshair'
            : onNodeDragEnd
              ? 'move'
              : 'pointer';
          const shapeName = vis.shape || 'circle';
          const shapeGen = SHAPE_PATHS[shapeName];
          const useCircle = !shapeGen;

          return (
            <g
              key={node.id}
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
                  <circle r={r + 4} fill="none" stroke="#fbbf24" strokeWidth={2} opacity={0.8}>
                    <animate attributeName="r" values={`${r + 3};${r + 6};${r + 3}`} dur="1.5s" repeatCount="indefinite" />
                  </circle>
                ) : (
                  <path
                    d={shapeGen(r)}
                    fill="none"
                    stroke="#fbbf24"
                    strokeWidth={2}
                    opacity={0.8}
                  >
                    <animateTransform
                      attributeName="transform"
                      type="scale"
                      values="1.15;1.3;1.15"
                      dur="1.5s"
                      repeatCount="indefinite"
                    />
                  </path>
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
                        x="-15%" y="-15%" width="130%" height="130%">
                        <feMorphology in="SourceAlpha" operator="dilate" result="expanded">
                          <animate attributeName="radius" values="2;3.5;2" dur="1.5s" repeatCount="indefinite" />
                        </feMorphology>
                        <feFlood floodColor="#fbbf24" result="color" />
                        <feComposite in="color" in2="expanded" operator="in" result="outline" />
                        <feMerge>
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
                    opacity={node.discoveryState === 'rumored' ? 0.4 : 1}
                    filter={isSelected ? `url(#hl-${node.id})` : undefined}
                    style={{ imageRendering: 'pixelated' }}
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
                const fs = isSelected ? 11 : 9;
                const maxChars = isSelected ? 16 : 14;
                const lines = wrapLabel(node.name, maxChars);
                const lineHeight = fs + 2;
                const baseY = imgR + 12;
                return (
                  <text
                    textAnchor="middle"
                    fill="rgba(255,255,255,0.85)"
                    fontSize={fs}
                    fontWeight={isSelected ? 700 : 400}
                    pointerEvents="none"
                  >
                    {lines.map((line, i) => (
                      <tspan key={i} x={0} y={baseY + i * lineHeight}>{line}</tspan>
                    ))}
                  </text>
                );
              })()}

              {locOccupants.map((occ, i) => {
                const angle = (2 * Math.PI * i) / Math.max(locOccupants.length, 1) - Math.PI / 2;
                const isPlayer = occ.type === 'player';
                const dotR = isPlayer ? 10 : 8;
                const color = isPlayer ? '#22d3ee' : '#f472b6';
                const spriteHref = occupantSpriteMap[occ.id];
                const tokenPx = isPlayer ? 36 : 32;
                const orbitR = imgR + 3 + tokenPx / 2;
                const ox = Math.cos(angle) * orbitR;
                const oy = Math.sin(angle) * orbitR;
                const labelY = (spriteHref ? tokenPx / 2 : dotR) + 8;
                return (
                  <g key={occ.id} transform={`translate(${ox},${oy})`}>
                    {spriteHref ? (
                      <image
                        href={spriteHref}
                        x={-tokenPx / 2}
                        y={-tokenPx / 2}
                        width={tokenPx}
                        height={tokenPx}
                        style={{ imageRendering: 'pixelated' }}
                      />
                    ) : (
                      <circle r={dotR} fill={color} stroke="rgba(0,0,0,0.5)" strokeWidth={0.8} />
                    )}
                    <title>{occ.name}{isPlayer ? ' (gracz)' : ` (${occ.role || 'NPC'})`}</title>
                    <text
                      y={labelY}
                      textAnchor="middle"
                      fill={color}
                      fontSize={7}
                      fontWeight={500}
                      pointerEvents="none"
                      opacity={0.9}
                    >
                      {truncate(occ.name, 10)}
                    </text>
                  </g>
                );
              })}
            </g>
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
}

function ArrowHead({ from, to, color }) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1) return null;
  const nx = dx / len;
  const ny = dy / len;
  const arrowLen = 8;
  const midX = (from.x + to.x) / 2;
  const midY = (from.y + to.y) / 2;
  const tipX = midX + nx * arrowLen;
  const tipY = midY + ny * arrowLen;
  const baseX1 = midX - ny * 4;
  const baseY1 = midY + nx * 4;
  const baseX2 = midX + ny * 4;
  const baseY2 = midY - nx * 4;

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
