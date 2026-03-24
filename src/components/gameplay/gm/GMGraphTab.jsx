import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { buildGraphData, NODE_COLORS, NODE_ICONS, EDGE_STYLES } from '../../../services/gmDataTransformer';
import { forceDirectedLayout } from '../../../services/graphLayout';
import GMEntityDetail from './GMEntityDetail';

const ENTITY_TYPES = ['pc', 'npc', 'location', 'faction', 'quest'];
const NODE_RADIUS = { pc: 24, npc: 18, location: 20, faction: 18, quest: 16 };

export default function GMGraphTab({ gameState }) {
  const { t } = useTranslation();
  const svgRef = useRef(null);
  const containerRef = useRef(null);

  const [filters, setFilters] = useState(() =>
    Object.fromEntries(ENTITY_TYPES.map((type) => [type, true]))
  );
  const [selectedNode, setSelectedNode] = useState(null);
  const [hoveredNode, setHoveredNode] = useState(null);
  const [hoveredEdge, setHoveredEdge] = useState(null);

  const [viewBox, setViewBox] = useState({ x: 0, y: 0, w: 800, h: 600 });
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef(null);

  const { nodes: allNodes, edges: allEdges } = useMemo(
    () => buildGraphData(gameState),
    [gameState]
  );

  const visibleNodeIds = useMemo(() => {
    const set = new Set();
    allNodes.forEach((n) => {
      if (filters[n.type]) set.add(n.id);
    });
    return set;
  }, [allNodes, filters]);

  const visibleNodes = useMemo(
    () => allNodes.filter((n) => visibleNodeIds.has(n.id)),
    [allNodes, visibleNodeIds]
  );

  const visibleEdges = useMemo(
    () => allEdges.filter((e) => visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target)),
    [allEdges, visibleNodeIds]
  );

  const layout = useMemo(() => {
    if (visibleNodes.length === 0) return new Map();
    const nodeNames = visibleNodes.map((n) => n.id);
    const edgeList = visibleEdges.map((e) => ({ from: e.source, to: e.target }));
    return forceDirectedLayout(nodeNames, edgeList, { width: 800, height: 600, iterations: 150 });
  }, [visibleNodes, visibleEdges]);

  useEffect(() => {
    if (layout.size === 0) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    layout.forEach(({ x, y }) => {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    });
    const pad = 80;
    setViewBox({
      x: minX - pad,
      y: minY - pad,
      w: Math.max(maxX - minX + pad * 2, 200),
      h: Math.max(maxY - minY + pad * 2, 200),
    });
  }, [layout]);

  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 1.12 : 0.89;
    setViewBox((vb) => {
      const cx = vb.x + vb.w / 2;
      const cy = vb.y + vb.h / 2;
      const nw = vb.w * factor;
      const nh = vb.h * factor;
      return { x: cx - nw / 2, y: cy - nh / 2, w: nw, h: nh };
    });
  }, []);

  const handlePointerDown = useCallback((e) => {
    if (e.target.closest('[data-node]')) return;
    setIsPanning(true);
    panStart.current = { x: e.clientX, y: e.clientY, vb: { ...viewBox } };
    e.currentTarget.setPointerCapture(e.pointerId);
  }, [viewBox]);

  const handlePointerMove = useCallback((e) => {
    if (!isPanning || !panStart.current) return;
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const scaleX = viewBox.w / rect.width;
    const scaleY = viewBox.h / rect.height;
    const dx = (e.clientX - panStart.current.x) * scaleX;
    const dy = (e.clientY - panStart.current.y) * scaleY;
    setViewBox({
      ...panStart.current.vb,
      x: panStart.current.vb.x - dx,
      y: panStart.current.vb.y - dy,
    });
  }, [isPanning, viewBox.w, viewBox.h]);

  const handlePointerUp = useCallback(() => {
    setIsPanning(false);
    panStart.current = null;
  }, []);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    svg.addEventListener('wheel', handleWheel, { passive: false });
    return () => svg.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  const toggleFilter = (type) => {
    setFilters((f) => ({ ...f, [type]: !f[type] }));
  };

  const connectedEdges = useMemo(() => {
    if (!hoveredNode && !selectedNode) return new Set();
    const nodeId = hoveredNode || selectedNode;
    const set = new Set();
    visibleEdges.forEach((e, i) => {
      if (e.source === nodeId || e.target === nodeId) set.add(i);
    });
    return set;
  }, [hoveredNode, selectedNode, visibleEdges]);

  const hasData = allNodes.length > 0;

  if (!hasData) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-outline">
        <span className="material-symbols-outlined text-4xl">hub</span>
        <p className="text-[11px] font-label uppercase tracking-widest">{t('gmModal.emptyGraph')}</p>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      <div className="flex-1 flex flex-col min-w-0">
        {/* Filter bar */}
        <div className="flex items-center gap-2 px-4 py-2 border-b border-outline-variant/10 shrink-0">
          <span className="text-[10px] text-outline uppercase tracking-widest font-label mr-1">
            {t('gmModal.filter')}:
          </span>
          {ENTITY_TYPES.map((type) => {
            const colors = NODE_COLORS[type];
            const count = allNodes.filter((n) => n.type === type).length;
            if (count === 0) return null;
            return (
              <button
                key={type}
                onClick={() => toggleFilter(type)}
                className={`flex items-center gap-1 px-2 py-1 rounded-sm text-[10px] font-label uppercase tracking-wider border transition-all ${
                  filters[type]
                    ? 'border-outline-variant/20 bg-surface-container/60 text-on-surface'
                    : 'border-transparent bg-transparent text-outline/40 line-through'
                }`}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: filters[type] ? colors.fill : 'transparent', border: `1.5px solid ${colors.fill}` }}
                />
                {t(`gmModal.nodeTypes.${type}`)}
                <span className="text-outline">({count})</span>
              </button>
            );
          })}
        </div>

        {/* SVG graph */}
        <div ref={containerRef} className="flex-1 relative overflow-hidden">
          <svg
            ref={svgRef}
            className={`w-full h-full ${isPanning ? 'cursor-grabbing' : 'cursor-grab'}`}
            viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
            preserveAspectRatio="xMidYMid meet"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          >
            <defs>
              <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                <path d="M0,0 L8,3 L0,6" fill="none" stroke="currentColor" strokeWidth="1" className="text-outline/40" />
              </marker>
            </defs>

            {/* Edges */}
            {visibleEdges.map((edge, i) => {
              const from = layout.get(edge.source);
              const to = layout.get(edge.target);
              if (!from || !to) return null;

              const style = EDGE_STYLES[edge.type] || EDGE_STYLES.relationship;
              const isHighlighted = connectedEdges.has(i);
              const isHovered = hoveredEdge === i;

              const dx = to.x - from.x;
              const dy = to.y - from.y;
              const mx = (from.x + to.x) / 2;
              const my = (from.y + to.y) / 2;
              const offset = Math.min(Math.sqrt(dx * dx + dy * dy) * 0.15, 30);
              const cx = mx - (dy / Math.sqrt(dx * dx + dy * dy + 1)) * offset;
              const cy = my + (dx / Math.sqrt(dx * dx + dy * dy + 1)) * offset;

              return (
                <g key={`edge-${i}`}>
                  {/* Invisible wider hit area */}
                  <path
                    d={`M${from.x},${from.y} Q${cx},${cy} ${to.x},${to.y}`}
                    fill="none"
                    stroke="transparent"
                    strokeWidth="12"
                    onMouseEnter={() => setHoveredEdge(i)}
                    onMouseLeave={() => setHoveredEdge(null)}
                  />
                  <path
                    d={`M${from.x},${from.y} Q${cx},${cy} ${to.x},${to.y}`}
                    fill="none"
                    stroke={isHighlighted ? '#c59aff' : '#888'}
                    strokeWidth={isHighlighted ? 2 : 1}
                    strokeDasharray={style.dash}
                    opacity={isHighlighted ? 0.9 : (hoveredNode || selectedNode) ? 0.15 : style.opacity}
                    className="transition-opacity pointer-events-none"
                  />
                  {/* Edge label on hover */}
                  {isHovered && edge.label && (
                    <text
                      x={cx}
                      y={cy - 6}
                      textAnchor="middle"
                      className="fill-on-surface-variant text-[8px] pointer-events-none"
                      style={{ fontFamily: 'Manrope, sans-serif' }}
                    >
                      {edge.label.startsWith('edgeLabels.') ? t(`gmModal.${edge.label}`) : edge.label}
                    </text>
                  )}
                </g>
              );
            })}

            {/* Nodes */}
            {visibleNodes.map((node) => {
              const pos = layout.get(node.id);
              if (!pos) return null;
              const colors = NODE_COLORS[node.type] || NODE_COLORS.npc;
              const r = NODE_RADIUS[node.type] || 18;
              const isSelected = selectedNode === node.id;
              const isHovered = hoveredNode === node.id;
              const isDead = node.data?.alive === false;
              const isPC = node.type === 'pc';

              return (
                <g
                  key={node.id}
                  data-node={node.id}
                  transform={`translate(${pos.x}, ${pos.y})`}
                  className="cursor-pointer"
                  onClick={() => setSelectedNode(isSelected ? null : node.id)}
                  onMouseEnter={() => setHoveredNode(node.id)}
                  onMouseLeave={() => setHoveredNode(null)}
                >
                  {/* Glow for selected/PC */}
                  {(isSelected || isPC) && (
                    <circle
                      r={r + 6}
                      fill="none"
                      stroke={colors.fill}
                      strokeWidth={isSelected ? 2 : 1}
                      opacity={isSelected ? 0.6 : 0.3}
                    />
                  )}
                  {/* Main circle */}
                  <circle
                    r={r}
                    fill={colors.fill}
                    stroke={isHovered || isSelected ? '#fff' : colors.stroke}
                    strokeWidth={isHovered || isSelected ? 2.5 : 1.5}
                    opacity={isDead ? 0.4 : 1}
                  />
                  {/* Icon */}
                  <text
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill={colors.text}
                    fontSize={r * 0.7}
                    fontFamily="Material Symbols Outlined"
                    opacity={isDead ? 0.5 : 1}
                  >
                    {NODE_ICONS[node.type] || 'circle'}
                  </text>
                  {/* Name label */}
                  <text
                    y={r + 12}
                    textAnchor="middle"
                    fill="#ddd"
                    fontSize="9"
                    style={{ fontFamily: 'Manrope, sans-serif', fontWeight: isPC ? 700 : 500 }}
                    opacity={isDead ? 0.5 : 0.9}
                  >
                    {node.name?.length > 18 ? node.name.slice(0, 16) + '…' : node.name}
                  </text>
                  {/* Dead marker */}
                  {isDead && (
                    <line x1={-r * 0.7} y1={0} x2={r * 0.7} y2={0} stroke="#ff4444" strokeWidth="2" opacity="0.7" />
                  )}
                </g>
              );
            })}
          </svg>

          {/* Zoom controls */}
          <div className="absolute bottom-3 right-3 flex flex-col gap-1">
            <button
              onClick={() => setViewBox((vb) => {
                const cx = vb.x + vb.w / 2;
                const cy = vb.y + vb.h / 2;
                return { x: cx - vb.w * 0.4, y: cy - vb.h * 0.4, w: vb.w * 0.8, h: vb.h * 0.8 };
              })}
              className="w-7 h-7 flex items-center justify-center bg-surface-container/80 backdrop-blur-sm border border-outline-variant/15 rounded-sm text-on-surface hover:bg-surface-container-high/80 transition-colors"
              aria-label="Zoom in"
            >
              <span className="material-symbols-outlined text-sm">add</span>
            </button>
            <button
              onClick={() => setViewBox((vb) => {
                const cx = vb.x + vb.w / 2;
                const cy = vb.y + vb.h / 2;
                return { x: cx - vb.w * 0.6, y: cy - vb.h * 0.6, w: vb.w * 1.2, h: vb.h * 1.2 };
              })}
              className="w-7 h-7 flex items-center justify-center bg-surface-container/80 backdrop-blur-sm border border-outline-variant/15 rounded-sm text-on-surface hover:bg-surface-container-high/80 transition-colors"
              aria-label="Zoom out"
            >
              <span className="material-symbols-outlined text-sm">remove</span>
            </button>
            <button
              onClick={() => {
                if (layout.size === 0) return;
                let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                layout.forEach(({ x, y }) => {
                  if (x < minX) minX = x;
                  if (y < minY) minY = y;
                  if (x > maxX) maxX = x;
                  if (y > maxY) maxY = y;
                });
                const pad = 80;
                setViewBox({ x: minX - pad, y: minY - pad, w: Math.max(maxX - minX + pad * 2, 200), h: Math.max(maxY - minY + pad * 2, 200) });
              }}
              className="w-7 h-7 flex items-center justify-center bg-surface-container/80 backdrop-blur-sm border border-outline-variant/15 rounded-sm text-on-surface hover:bg-surface-container-high/80 transition-colors"
              aria-label="Fit view"
            >
              <span className="material-symbols-outlined text-sm">fit_screen</span>
            </button>
          </div>

          {/* Legend */}
          <div className="absolute top-3 left-3 flex flex-wrap gap-2 text-[9px] text-on-surface-variant">
            <span className="opacity-60">{t('gmModal.graphHint')}</span>
          </div>
        </div>
      </div>

      {/* Detail panel */}
      {selectedNode && (
        <GMEntityDetail
          node={allNodes.find((n) => n.id === selectedNode)}
          edges={allEdges.filter((e) => e.source === selectedNode || e.target === selectedNode)}
          allNodes={allNodes}
          onClose={() => setSelectedNode(null)}
          onSelectNode={(id) => setSelectedNode(id)}
        />
      )}
    </div>
  );
}
