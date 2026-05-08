import { useMemo, useRef, useState, useCallback, useEffect } from 'react';
import { useLocationGraph } from '../../../hooks/useLocationGraph';
import { useCurrentLocationNode } from '../../../hooks/useCurrentLocationNode';
import { useGameScenes } from '../../../stores/gameSelectors';
import { apiClient } from '../../../services/apiClient';
import { forceDirectedLayout } from '../../../services/graphLayout';
import { getNodeVisual, getEdgeVisual, getNodeRadius, NODE_VISUALS } from '../locationGraph/graphVisuals';
import { isQuietScene } from '../../../services/quietSceneCheck';

const LAYOUT_W = 800;
const LAYOUT_H = 600;

export default function MapTab({ campaignId, onTravel }) {
  const graph = useLocationGraph(campaignId);
  const currentNode = useCurrentLocationNode(graph);
  const scenes = useGameScenes();

  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [dragStart, setDragStart] = useState(null);
  const [size, setSize] = useState({ w: LAYOUT_W, h: LAYOUT_H });
  const [hovered, setHovered] = useState(null);
  const [travelPending, setTravelPending] = useState(null);
  const [travelError, setTravelError] = useState(null);

  const svgRef = useRef(null);
  const containerRef = useRef(null);

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

  const { nodes, edges } = graph;

  const positions = useMemo(() => {
    if (!nodes || nodes.length === 0) return new Map();
    const nodeIds = nodes.map((n) => n.id);
    const edgeLinks = edges.map((e) => ({ from: e.fromId, to: e.toId }));
    return forceDirectedLayout(nodeIds, edgeLinks, {
      width: LAYOUT_W, height: LAYOUT_H, iterations: 150,
    });
  }, [nodes, edges]);

  const adjacentIds = useMemo(() => {
    if (!currentNode) return new Set();
    const set = new Set();
    for (const e of edges) {
      if (e.fromId === currentNode.id) set.add(e.toId);
      if (e.toId === currentNode.id) set.add(e.fromId);
    }
    return set;
  }, [currentNode, edges]);

  const lastScene = scenes?.[scenes.length - 1] || null;
  const canAttemptDistantTravel = isQuietScene(lastScene);

  const handleNodeClick = useCallback(async (node) => {
    if (!currentNode || node.id === currentNode.id) return;

    const isAdjacent = adjacentIds.has(node.id);

    if (isAdjacent) {
      onTravel?.(node.name);
      return;
    }

    if (!canAttemptDistantTravel) {
      setTravelError('Musisz najpierw mieć spokojną scenę (bez dialogów i zmian świata), zanim spróbujesz dalekiej podróży.');
      setTimeout(() => setTravelError(null), 4000);
      return;
    }

    setTravelPending(node.name);
    setTravelError(null);

    try {
      const result = await apiClient.request(
        `/livingWorld/campaigns/${campaignId}/travel-check`,
        { method: 'POST', body: { destinationName: node.name } },
      );

      if (result.allowed) {
        onTravel?.(node.name);
      } else {
        onTravel?.(node.name, { travelFailureReason: result.reason });
      }
    } catch (err) {
      setTravelError(err.message || 'Nie udało się sprawdzić możliwości podróży.');
      setTimeout(() => setTravelError(null), 4000);
    } finally {
      setTravelPending(null);
    }
  }, [currentNode, adjacentIds, canAttemptDistantTravel, campaignId, onTravel]);

  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom((z) => Math.max(0.3, Math.min(3, z * factor)));
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

  if (graph.loading) {
    return (
      <div className="flex items-center justify-center h-64 text-on-surface-variant">
        <span className="material-symbols-outlined animate-spin mr-2">progress_activity</span>
        Wczytywanie mapy...
      </div>
    );
  }

  if (!nodes || nodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-on-surface-variant">
        <span className="material-symbols-outlined mr-2">map</span>
        Brak lokacji na mapie.
      </div>
    );
  }

  const offsetX = (size.w - LAYOUT_W) / 2;
  const offsetY = (size.h - LAYOUT_H) / 2;

  return (
    <div className="flex flex-col h-full gap-3">
      {travelError && (
        <div className="px-4 py-2 bg-error/10 border border-error/30 rounded text-error text-sm">
          {travelError}
        </div>
      )}

      {travelPending && (
        <div className="px-4 py-2 bg-primary/10 border border-primary/30 rounded text-primary text-sm flex items-center gap-2">
          <span className="material-symbols-outlined animate-spin text-base">progress_activity</span>
          Sprawdzam możliwość podróży do {travelPending}...
        </div>
      )}

      <div className="text-xs text-on-surface-variant px-1 flex items-center gap-4">
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-full bg-primary inline-block" />
          Obecna lokacja
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-full bg-tertiary inline-block" />
          Bezpośrednio dostępna
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-full bg-outline inline-block" />
          Daleka (wymaga spokojnej sceny)
        </span>
      </div>

      <div
        ref={containerRef}
        className="flex-1 min-h-[300px] rounded border border-outline-variant/20 bg-surface/40 overflow-hidden cursor-grab active:cursor-grabbing"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <svg
          ref={svgRef}
          width={size.w}
          height={size.h}
          onWheel={handleWheel}
          className="select-none"
        >
          <rect data-bg="true" width={size.w} height={size.h} fill="transparent" />
          <g transform={`translate(${pan.x + offsetX}, ${pan.y + offsetY}) scale(${zoom})`}>
            {edges.map((edge) => {
              const from = positions.get(edge.fromId);
              const to = positions.get(edge.toId);
              if (!from || !to) return null;
              const vis = getEdgeVisual(edge.category, edge.metadata);
              return (
                <line
                  key={edge.id}
                  x1={from.x} y1={from.y}
                  x2={to.x} y2={to.y}
                  stroke={vis.color}
                  strokeWidth={vis.width}
                  strokeDasharray={vis.dash || undefined}
                  opacity={0.6}
                />
              );
            })}

            {nodes.map((node) => {
              const pos = positions.get(node.id);
              if (!pos) return null;

              const isCurrent = currentNode?.id === node.id;
              const isAdjacent = adjacentIds.has(node.id);
              const vis = getNodeVisual(node.type);
              const r = getNodeRadius(node.scale);
              const isHovered = hovered === node.id;

              let ringColor = 'transparent';
              if (isCurrent) ringColor = 'var(--md-sys-color-primary, #6750a4)';
              else if (isAdjacent) ringColor = 'var(--md-sys-color-tertiary, #7d5260)';

              return (
                <g
                  key={node.id}
                  transform={`translate(${pos.x}, ${pos.y})`}
                  onClick={() => handleNodeClick(node)}
                  onMouseEnter={() => setHovered(node.id)}
                  onMouseLeave={() => setHovered(null)}
                  className={isCurrent ? 'cursor-default' : 'cursor-pointer'}
                >
                  {(isCurrent || isAdjacent) && (
                    <circle r={r + 4} fill="none" stroke={ringColor} strokeWidth={2} opacity={0.7} />
                  )}
                  {isCurrent && (
                    <circle r={r + 7} fill="none" stroke={ringColor} strokeWidth={1} opacity={0.3}>
                      <animate attributeName="r" from={r + 5} to={r + 12} dur="2s" repeatCount="indefinite" />
                      <animate attributeName="opacity" from="0.4" to="0" dur="2s" repeatCount="indefinite" />
                    </circle>
                  )}
                  <circle
                    r={r}
                    fill={vis.color}
                    opacity={isHovered ? 1 : 0.85}
                    stroke={isHovered ? '#fff' : 'none'}
                    strokeWidth={isHovered ? 2 : 0}
                  />
                  <text
                    y={r + 14}
                    textAnchor="middle"
                    fontSize="10"
                    fill="currentColor"
                    className="fill-on-surface"
                    opacity={0.9}
                  >
                    {node.name?.length > 18 ? node.name.slice(0, 16) + '…' : node.name}
                  </text>
                </g>
              );
            })}
          </g>

          {hovered && (() => {
            const node = nodes.find((n) => n.id === hovered);
            if (!node) return null;
            const pos = positions.get(hovered);
            if (!pos) return null;
            const tx = pos.x * zoom + pan.x + offsetX;
            const ty = pos.y * zoom + pan.y + offsetY - getNodeRadius(node.scale) * zoom - 12;
            const isCurrent = currentNode?.id === node.id;
            const isAdj = adjacentIds.has(node.id);
            const label = isCurrent ? '(tu jesteś)' : isAdj ? 'Kliknij → podróż' : canAttemptDistantTravel ? 'Kliknij → próba dalekiej podróży' : 'Wymaga spokojnej sceny';
            return (
              <g transform={`translate(${tx}, ${ty})`}>
                <rect x={-80} y={-32} width={160} height={30} rx={4} fill="var(--md-sys-color-surface-container, #1e1e2e)" stroke="var(--md-sys-color-outline-variant, #444)" strokeWidth={0.5} opacity={0.95} />
                <text textAnchor="middle" y={-20} fontSize="10" fill="var(--md-sys-color-on-surface, #e0e0e0)" fontWeight="600">
                  {node.name}
                </text>
                <text textAnchor="middle" y={-9} fontSize="8" fill="var(--md-sys-color-on-surface-variant, #aaa)">
                  {(NODE_VISUALS[node.type] || NODE_VISUALS.generic).label} · {label}
                </text>
              </g>
            );
          })()}
        </svg>
      </div>
    </div>
  );
}
