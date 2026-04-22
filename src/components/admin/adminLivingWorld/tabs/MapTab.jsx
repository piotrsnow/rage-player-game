import { useEffect, useState } from 'react';
import { apiClient } from '../../../../services/apiClient';
import { KV } from '../shared/primitives';
import { LOCATION_TYPE_COLORS, edgeColour, nodeRadius } from './mapHelpers';

const W = 800;
const H = 600;
const PAD = 40;

export default function MapTab() {
  const [graph, setGraph] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    setLoading(true);
    apiClient.get('/v1/admin/livingWorld/graph')
      .then(setGraph)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-[11px] text-on-surface-variant">Loading map…</div>;
  if (!graph || !graph.nodes?.length) {
    return <div className="text-[11px] text-on-surface-variant italic">No locations yet. Start a living-world campaign or run the world seed script.</div>;
  }

  // Compute bounds with ≥1-unit padding so capital@(0,0) isn't in the corner.
  const xs = graph.nodes.map((n) => n.x);
  const ys = graph.nodes.map((n) => n.y);
  const minX = Math.min(...xs, -2);
  const maxX = Math.max(...xs, 2);
  const minY = Math.min(...ys, -2);
  const maxY = Math.max(...ys, 2);
  const rangeX = Math.max(maxX - minX, 1);
  const rangeY = Math.max(maxY - minY, 1);
  const sx = (W - 2 * PAD) / rangeX;
  const sy = (H - 2 * PAD) / rangeY;
  const scale = Math.min(sx, sy);
  const offsetX = PAD + (W - 2 * PAD - scale * rangeX) / 2;
  const offsetY = PAD + (H - 2 * PAD - scale * rangeY) / 2;
  const project = (x, y) => ({
    sx: offsetX + (x - minX) * scale,
    sy: offsetY + (maxY - y) * scale, // invert Y so N is up
  });

  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
  const selectedNode = selected ? nodeById.get(selected) : null;

  return (
    <div>
      <div className="flex gap-3 mb-3 text-[11px]">
        <div className="text-on-surface-variant self-center">
          {graph.nodes.length} locations • {graph.edges.length} overworld edges
          {' • '}dungeons: {graph.nodes.filter((n) => n.locationType === 'dungeon').length}
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          {Object.entries(LOCATION_TYPE_COLORS).map(([type, color]) => (
            <span key={type} className="flex items-center gap-1 text-[10px]">
              <span className="inline-block w-2 h-2 rounded-full" style={{ background: color }} />
              <span className="text-on-surface-variant">{type}</span>
            </span>
          ))}
        </div>
      </div>

      <div className="rounded-sm border border-outline-variant/25 bg-surface-container/40 overflow-hidden">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
          {renderGrid(minX, maxX, minY, maxY, project)}

          {graph.edges.map((e) => {
            const from = nodeById.get(e.from);
            const to = nodeById.get(e.to);
            if (!from || !to) return null;
            const a = project(from.x, from.y);
            const b = project(to.x, to.y);
            const colour = edgeColour(e.difficulty);
            const opacity = e.discoveredCampaignCount > 0 ? 0.9 : 0.3;
            const dash = e.gated ? '4 3' : undefined;
            return (
              <g key={e.id}>
                <line
                  x1={a.sx} y1={a.sy} x2={b.sx} y2={b.sy}
                  stroke={colour}
                  strokeWidth={1.5}
                  strokeOpacity={opacity}
                  strokeDasharray={dash}
                />
              </g>
            );
          })}

          {graph.nodes.map((n) => {
            const p = project(n.x, n.y);
            const colour = LOCATION_TYPE_COLORS[n.locationType] || LOCATION_TYPE_COLORS.generic;
            const radius = nodeRadius(n.locationType);
            const isSelected = selected === n.id;
            return (
              <g key={n.id} onClick={() => setSelected(n.id)} className="cursor-pointer">
                <circle
                  cx={p.sx} cy={p.sy}
                  r={radius + (isSelected ? 3 : 0)}
                  fill={colour}
                  stroke={isSelected ? '#fff' : 'rgba(255,255,255,0.3)'}
                  strokeWidth={isSelected ? 2 : 1}
                  opacity={n.positionConfidence >= 0.7 ? 1 : 0.75}
                />
                <text
                  x={p.sx} y={p.sy - radius - 4}
                  textAnchor="middle"
                  fontSize="10"
                  fill="currentColor"
                  className="text-on-surface pointer-events-none"
                  style={{ fontFamily: 'monospace' }}
                >
                  {n.name}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {selectedNode && (
        <div className="mt-3 p-3 rounded-sm bg-surface-container/40 border border-outline-variant/25 text-[11px]">
          <div className="flex items-start justify-between mb-2">
            <div>
              <div className="font-bold text-on-surface text-sm">{selectedNode.name}</div>
              <div className="text-on-surface-variant">
                {selectedNode.locationType} • region: {selectedNode.region || '—'}
                {' • '}({selectedNode.x.toFixed(2)}, {selectedNode.y.toFixed(2)})
                {' • '}confidence: {Math.round((selectedNode.positionConfidence || 0) * 100)}%
              </div>
            </div>
            <button
              onClick={() => setSelected(null)}
              className="text-on-surface-variant hover:text-on-surface text-[10px]"
            >
              close
            </button>
          </div>
          <div className="grid grid-cols-3 gap-3 text-[10px]">
            <KV k="maxKeyNpcs" v={selectedNode.maxKeyNpcs} />
            <KV k="maxSubLocations" v={selectedNode.maxSubLocations} />
            <KV k="childCount" v={selectedNode.childCount} />
            {selectedNode.locationType === 'dungeon' && (
              <KV k="roomCount (seeded)" v={selectedNode.roomCount || 'not seeded'} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function renderGrid(minX, maxX, minY, maxY, project) {
  const lines = [];
  const step = 2;
  const gridMinX = Math.floor(minX / step) * step;
  const gridMaxX = Math.ceil(maxX / step) * step;
  const gridMinY = Math.floor(minY / step) * step;
  const gridMaxY = Math.ceil(maxY / step) * step;
  for (let x = gridMinX; x <= gridMaxX; x += step) {
    const a = project(x, gridMinY);
    const b = project(x, gridMaxY);
    lines.push(
      <line key={`vx${x}`} x1={a.sx} y1={a.sy} x2={b.sx} y2={b.sy}
        stroke="rgba(255,255,255,0.04)" strokeWidth={x === 0 ? 1 : 0.5} />,
    );
  }
  for (let y = gridMinY; y <= gridMaxY; y += step) {
    const a = project(gridMinX, y);
    const b = project(gridMaxX, y);
    lines.push(
      <line key={`hy${y}`} x1={a.sx} y1={a.sy} x2={b.sx} y2={b.sy}
        stroke="rgba(255,255,255,0.04)" strokeWidth={y === 0 ? 1 : 0.5} />,
    );
  }
  return lines;
}
