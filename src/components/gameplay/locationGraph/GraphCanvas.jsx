import { useMemo, useRef, useState, useCallback, useEffect } from 'react';
import { forceDirectedLayout } from '../../../services/graphLayout.js';
import { getNodeVisual, getEdgeVisual, getNodeRadius } from './graphVisuals.js';

const LAYOUT_W = 800;
const LAYOUT_H = 600;
const GRID_STEP = 40;

export default function GraphCanvas({
  nodes, edges, occupants = [], selected, onSelect, onDoubleClickNode,
  addingNode, onCanvasClick, addingEdge, onEdgeSourceClick,
  mode,
  positionOverrides, onNodeDragEnd, snapToGrid,
}) {
  const svgRef = useRef(null);
  const containerRef = useRef(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
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
    return forceDirectedLayout(nodeNames, edgeLinks, {
      width: LAYOUT_W, height: LAYOUT_H, iterations: 150,
    });
  }, [nodes, edges]);

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

  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom((z) => Math.max(0.3, Math.min(3, z * delta)));
  }, []);

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
    e.stopPropagation();
    const layoutPos = clientToLayout(e.clientX, e.clientY);
    const nodePos = positions.get(nodeId);
    if (!nodePos) return;
    dragOffsetRef.current = { x: layoutPos.x - nodePos.x, y: layoutPos.y - nodePos.y };
    didDragRef.current = false;
    setDraggingNodeId(nodeId);
    setDragNodePos(nodePos);
  }, [addingEdge, addingNode, clientToLayout, positions]);

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
          const vis = getEdgeVisual(edge.category);
          const isSelected = selected?.type === 'edge' && selected.id === edge.id;
          const isBlocked = edge.edgeType === 'blocked_path_to';

          return (
            <g key={edge.id}>
              <line
                x1={fromPos.x} y1={fromPos.y}
                x2={toPos.x} y2={toPos.y}
                stroke={isBlocked ? '#ef4444' : vis.color}
                strokeWidth={isSelected ? vis.width + 1.5 : vis.width}
                strokeDasharray={isBlocked ? '6,3' : vis.dash}
                opacity={0.7}
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
          const vis = getNodeVisual(node.type);
          const r = getNodeRadius(node.scale ?? 5);
          const isSelected = selected?.type === 'node' && selected.id === node.id;
          const locOccupants = occupantsByLocation.get(node.id) || [];
          const nodeCursor = addingEdge ? 'crosshair' : addingNode ? 'crosshair' : 'move';

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
              {isSelected && (
                <circle r={r + 4} fill="none" stroke="#fbbf24" strokeWidth={2} opacity={0.8}>
                  <animate attributeName="r" values={`${r + 3};${r + 6};${r + 3}`} dur="1.5s" repeatCount="indefinite" />
                </circle>
              )}
              <circle
                r={r}
                fill={vis.color}
                stroke={isSelected ? '#fbbf24' : 'rgba(255,255,255,0.15)'}
                strokeWidth={isSelected ? 2 : 1}
                opacity={node.discoveryState === 'rumored' ? 0.4 : 1}
              />
              <text
                y={r + 14}
                textAnchor="middle"
                fill="rgba(255,255,255,0.85)"
                fontSize={11}
                fontWeight={isSelected ? 700 : 400}
                pointerEvents="none"
              >
                {truncate(node.name, 18)}
              </text>
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

              {locOccupants.map((occ, i) => {
                const angle = (2 * Math.PI * i) / Math.max(locOccupants.length, 1) - Math.PI / 2;
                const orbitR = r + 10;
                const ox = Math.cos(angle) * orbitR;
                const oy = Math.sin(angle) * orbitR;
                const isPlayer = occ.type === 'player';
                const dotR = isPlayer ? 5 : 4;
                const color = isPlayer ? '#22d3ee' : '#f472b6';
                return (
                  <g key={occ.id} transform={`translate(${ox},${oy})`}>
                    <circle r={dotR} fill={color} stroke="rgba(0,0,0,0.5)" strokeWidth={0.8} />
                    <title>{occ.name}{isPlayer ? ' (gracz)' : ` (${occ.role || 'NPC'})`}</title>
                    <text
                      y={dotR + 8}
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
