import { useMemo, useRef, useState, useCallback, useEffect } from 'react';
import { forceDirectedLayout } from '../../../services/graphLayout.js';
import { getNodeVisual, getEdgeVisual, getNodeRadius } from './graphVisuals.js';

const CANVAS_W = 700;
const CANVAS_H = 500;

export default function GraphCanvas({
  nodes, edges, selected, onSelect, onDoubleClickNode,
  addingNode, onCanvasClick, addingEdge, onEdgeSourceClick,
  mode,
}) {
  const svgRef = useRef(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [dragging, setDragging] = useState(null);
  const [dragStart, setDragStart] = useState(null);

  const positions = useMemo(() => {
    if (nodes.length === 0) return new Map();
    const nodeNames = nodes.map((n) => n.id);
    const edgeLinks = edges.map((e) => ({ from: e.fromId, to: e.toId }));
    const layout = forceDirectedLayout(nodeNames, edgeLinks, {
      width: CANVAS_W, height: CANVAS_H, iterations: 150,
    });
    return layout;
  }, [nodes, edges]);

  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom((z) => Math.max(0.3, Math.min(3, z * delta)));
  }, []);

  const handleMouseDown = useCallback((e) => {
    if (e.target === svgRef.current || e.target.closest('[data-bg]')) {
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  }, [pan]);

  const handleMouseMove = useCallback((e) => {
    if (dragStart) {
      setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
    }
  }, [dragStart]);

  const handleMouseUp = useCallback(() => {
    setDragStart(null);
  }, []);

  const handleSvgClick = useCallback((e) => {
    if (addingNode && e.target === svgRef.current) {
      const rect = svgRef.current.getBoundingClientRect();
      const x = (e.clientX - rect.left - pan.x) / zoom;
      const y = (e.clientY - rect.top - pan.y) / zoom;
      onCanvasClick?.({ x, y });
    }
  }, [addingNode, pan, zoom, onCanvasClick]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    svg.addEventListener('wheel', handleWheel, { passive: false });
    return () => svg.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  const nodeById = useMemo(() => {
    const m = new Map();
    for (const n of nodes) m.set(n.id, n);
    return m;
  }, [nodes]);

  return (
    <svg
      ref={svgRef}
      className="w-full h-full bg-transparent select-none"
      viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
      style={{ cursor: addingNode ? 'crosshair' : (dragStart ? 'grabbing' : 'grab') }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onClick={handleSvgClick}
    >
      <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
        <rect data-bg="1" x={-2000} y={-2000} width={4000 + CANVAS_W} height={4000 + CANVAS_H} fill="transparent" />

        {edges.map((edge) => {
          const fromPos = positions.get(edge.fromId);
          const toPos = positions.get(edge.toId);
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
          const pos = positions.get(node.id);
          if (!pos) return null;
          const vis = getNodeVisual(node.type);
          const r = getNodeRadius(node.scale ?? 5);
          const isSelected = selected?.type === 'node' && selected.id === node.id;

          return (
            <g
              key={node.id}
              transform={`translate(${pos.x},${pos.y})`}
              style={{ cursor: addingEdge ? 'crosshair' : 'pointer' }}
              onClick={(e) => {
                e.stopPropagation();
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
                {vis.icon === 'castle' ? '🏰' : vis.icon === 'skull' ? '💀' : '●'}
              </text>
            </g>
          );
        })}
      </g>
    </svg>
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
