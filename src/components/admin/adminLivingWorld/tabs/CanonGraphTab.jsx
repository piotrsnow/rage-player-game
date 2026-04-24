// Round E Phase 13b — canonical knowledge graph admin tab.
//
// SVG force-directed render of the authoritative world state:
//   - Top-level canonical WorldLocations as nodes (reusing the `locationType`
//     palette from mapHelpers).
//   - Overworld `WorldLocationEdge`s as lines, colored by difficulty.
//   - Canonical WorldNPCs orbit their `homeLocationId` (falls back to
//     `currentLocationId`) — categorically colored via `NPC_CATEGORY_COLORS`.
//     NPCs without any location link cluster at the grid origin.
//   - Clicking a node surfaces a side panel with node details.
//
// Used for spotting "lonely" canon: NPCs with no home, locations with no
// edges, category imbalances, gaps in hand-authored world. Quick sanity check
// after Phase 13a auto-approvals and worldSeed reruns.

import { useEffect, useMemo, useState } from 'react';
import { apiClient } from '../../../../services/apiClient';
import { KV } from '../shared/primitives';
import {
  LOCATION_TYPE_COLORS, NPC_CATEGORY_COLORS, edgeColour, nodeRadius,
} from './mapHelpers';

const W = 800;
const H = 600;
const PAD = 50;
const NPC_ORBIT_RADIUS = 18;
const NPC_DOT_RADIUS = 3;

// Deterministic orbit placement: spread up to N NPCs evenly around a
// location. Past 10 we tighten to two rings so big settlements don't overlap
// the location node.
function orbitOffset(index, total) {
  const radius = total > 10 ? NPC_ORBIT_RADIUS * (1 + Math.floor(index / 10) * 0.55) : NPC_ORBIT_RADIUS;
  const step = total > 10 ? (Math.PI * 2) / Math.min(total, 10) : (Math.PI * 2) / Math.max(total, 1);
  const idxInRing = total > 10 ? index % 10 : index;
  const angle = idxInRing * step - Math.PI / 2;
  return { dx: Math.cos(angle) * radius, dy: Math.sin(angle) * radius };
}

function groupNpcsByLocation(npcs) {
  const byLoc = new Map();
  const orphaned = [];
  for (const npc of npcs) {
    const anchor = npc.homeLocationId || npc.currentLocationId || null;
    if (!anchor) {
      orphaned.push(npc);
      continue;
    }
    if (!byLoc.has(anchor)) byLoc.set(anchor, []);
    byLoc.get(anchor).push(npc);
  }
  return { byLoc, orphaned };
}

export default function CanonGraphTab() {
  const [graph, setGraph] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selectedKind, setSelectedKind] = useState(null); // 'location' | 'npc'
  const [selectedId, setSelectedId] = useState(null);
  const [showNpcs, setShowNpcs] = useState(true);

  useEffect(() => {
    setLoading(true);
    apiClient.get('/v1/admin/livingWorld/canon-graph')
      .then(setGraph)
      .finally(() => setLoading(false));
  }, []);

  const { nodeById, npcById, project, grouping, stats } = useMemo(() => {
    if (!graph?.locations?.length) {
      return { nodeById: new Map(), npcById: new Map(), project: null, grouping: { byLoc: new Map(), orphaned: [] }, stats: {} };
    }
    const xs = graph.locations.map((n) => n.x);
    const ys = graph.locations.map((n) => n.y);
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
    const projectFn = (x, y) => ({
      sx: offsetX + (x - minX) * scale,
      sy: offsetY + (maxY - y) * scale,
    });

    const nodeMap = new Map(graph.locations.map((n) => [n.id, n]));
    const npcMap = new Map((graph.npcs || []).map((n) => [n.id, n]));
    const grp = groupNpcsByLocation(graph.npcs || []);

    // Simple counts for the header bar.
    const npcsByCategory = {};
    for (const n of graph.npcs || []) {
      const c = n.category || 'commoner';
      npcsByCategory[c] = (npcsByCategory[c] || 0) + 1;
    }
    const lonelyLocations = graph.locations.filter((l) => {
      return !graph.edges.some((e) => e.from === l.id || e.to === l.id);
    }).length;
    const homelessNpcs = grp.orphaned.length;

    return {
      nodeById: nodeMap,
      npcById: npcMap,
      project: projectFn,
      grouping: grp,
      stats: { npcsByCategory, lonelyLocations, homelessNpcs },
    };
  }, [graph]);

  if (loading) return <div className="text-[11px] text-on-surface-variant">Loading canon graph…</div>;
  if (!graph || !graph.locations?.length) {
    return <div className="text-[11px] text-on-surface-variant italic">No canonical locations yet. Run the world seed script.</div>;
  }

  const selectedLocation = selectedKind === 'location' ? nodeById.get(selectedId) : null;
  const selectedNpc = selectedKind === 'npc' ? npcById.get(selectedId) : null;

  return (
    <div>
      <div className="flex flex-wrap gap-3 mb-3 text-[11px] items-center">
        <div className="text-on-surface-variant">
          {graph.locations.length} locations • {graph.edges.length} edges • {graph.npcs?.length || 0} NPCs
          {stats.lonelyLocations > 0 && <span className="ml-2 text-error">• {stats.lonelyLocations} lonely locations</span>}
          {stats.homelessNpcs > 0 && <span className="ml-2 text-error">• {stats.homelessNpcs} homeless NPCs</span>}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <label className="flex items-center gap-1 text-[10px] text-on-surface-variant">
            <input type="checkbox" checked={showNpcs} onChange={(e) => setShowNpcs(e.target.checked)} />
            show NPCs
          </label>
          <div className="hidden md:flex flex-wrap gap-2 ml-2">
            {Object.entries(LOCATION_TYPE_COLORS).map(([type, color]) => (
              <span key={type} className="flex items-center gap-1 text-[10px]">
                <span className="inline-block w-2 h-2 rounded-full" style={{ background: color }} />
                <span className="text-on-surface-variant">{type}</span>
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-sm border border-outline-variant/25 bg-surface-container/40 overflow-hidden">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
          {/* Location edges */}
          {graph.edges.map((e) => {
            const from = nodeById.get(e.from);
            const to = nodeById.get(e.to);
            if (!from || !to) return null;
            const a = project(from.x, from.y);
            const b = project(to.x, to.y);
            const colour = edgeColour(e.difficulty);
            const dash = e.gated ? '4 3' : undefined;
            return (
              <line
                key={e.id}
                x1={a.sx} y1={a.sy} x2={b.sx} y2={b.sy}
                stroke={colour}
                strokeWidth={1.5}
                strokeOpacity={0.5}
                strokeDasharray={dash}
              />
            );
          })}

          {/* Location nodes */}
          {graph.locations.map((n) => {
            const p = project(n.x, n.y);
            const colour = LOCATION_TYPE_COLORS[n.locationType] || LOCATION_TYPE_COLORS.generic;
            const radius = nodeRadius(n.locationType);
            const isSelected = selectedKind === 'location' && selectedId === n.id;
            return (
              <g key={n.id} onClick={() => { setSelectedKind('location'); setSelectedId(n.id); }} className="cursor-pointer">
                <circle
                  cx={p.sx} cy={p.sy}
                  r={radius + (isSelected ? 3 : 0)}
                  fill={colour}
                  stroke={isSelected ? '#fff' : 'rgba(255,255,255,0.3)'}
                  strokeWidth={isSelected ? 2 : 1}
                />
                <text
                  x={p.sx} y={p.sy - radius - 4}
                  textAnchor="middle"
                  fontSize="10"
                  fill="currentColor"
                  className="text-on-surface pointer-events-none"
                  style={{ fontFamily: 'monospace' }}
                >
                  {n.displayName || n.name}
                </text>
              </g>
            );
          })}

          {/* NPC overlays */}
          {showNpcs && [...grouping.byLoc.entries()].map(([locId, groupNpcs]) => {
            const parent = nodeById.get(locId);
            if (!parent) return null;
            const p = project(parent.x, parent.y);
            return groupNpcs.map((npc, idx) => {
              const { dx, dy } = orbitOffset(idx, groupNpcs.length);
              const cx = p.sx + dx;
              const cy = p.sy + dy;
              const color = NPC_CATEGORY_COLORS[npc.category] || NPC_CATEGORY_COLORS.commoner;
              const isSelected = selectedKind === 'npc' && selectedId === npc.id;
              return (
                <g key={npc.id} onClick={(e) => { e.stopPropagation(); setSelectedKind('npc'); setSelectedId(npc.id); }} className="cursor-pointer">
                  <line x1={p.sx} y1={p.sy} x2={cx} y2={cy} stroke={color} strokeWidth={0.5} strokeOpacity={0.4} strokeDasharray="2 2" />
                  <circle
                    cx={cx} cy={cy}
                    r={NPC_DOT_RADIUS + (isSelected ? 1.5 : 0)}
                    fill={color}
                    stroke={isSelected ? '#fff' : 'rgba(255,255,255,0.4)'}
                    strokeWidth={isSelected ? 1.5 : 0.5}
                    opacity={npc.keyNpc ? 1 : 0.6}
                  />
                </g>
              );
            });
          })}
        </svg>
      </div>

      {/* Legend for NPC categories */}
      {showNpcs && (
        <div className="mt-2 flex flex-wrap gap-2 text-[10px]">
          {Object.entries(NPC_CATEGORY_COLORS).map(([cat, color]) => {
            const count = stats.npcsByCategory?.[cat] || 0;
            return (
              <span key={cat} className="flex items-center gap-1">
                <span className="inline-block w-2 h-2 rounded-full" style={{ background: color }} />
                <span className="text-on-surface-variant">{cat} ({count})</span>
              </span>
            );
          })}
        </div>
      )}

      {/* Orphaned NPCs (no home/current) */}
      {showNpcs && grouping.orphaned.length > 0 && (
        <div className="mt-3 p-2 rounded-sm bg-error/10 border border-error/20 text-[10px]">
          <div className="text-error uppercase tracking-widest mb-1">Homeless NPCs ({grouping.orphaned.length})</div>
          <div className="flex flex-wrap gap-1">
            {grouping.orphaned.map((npc) => (
              <button
                key={npc.id}
                onClick={() => { setSelectedKind('npc'); setSelectedId(npc.id); }}
                className="px-1.5 py-0.5 rounded-sm bg-surface-container/40 border border-outline-variant/20 hover:border-tertiary/50"
              >
                {npc.name} <span className="text-on-surface-variant">({npc.category})</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Side panel */}
      {selectedLocation && (
        <div className="mt-3 p-3 rounded-sm bg-surface-container/40 border border-outline-variant/25 text-[11px]">
          <div className="flex items-start justify-between mb-2">
            <div>
              <div className="font-bold text-on-surface text-sm">{selectedLocation.displayName || selectedLocation.name}</div>
              <div className="text-on-surface-variant">
                {selectedLocation.locationType} • region: {selectedLocation.region || '—'}
                {' • '}({selectedLocation.x.toFixed(2)}, {selectedLocation.y.toFixed(2)})
                {' • '}danger: {selectedLocation.dangerLevel}
              </div>
            </div>
            <button
              onClick={() => { setSelectedKind(null); setSelectedId(null); }}
              className="text-on-surface-variant hover:text-on-surface text-[10px]"
            >
              close
            </button>
          </div>
          <div className="grid grid-cols-3 gap-3 text-[10px]">
            <KV k="maxKeyNpcs" v={selectedLocation.maxKeyNpcs} />
            <KV k="maxSubLocations" v={selectedLocation.maxSubLocations} />
            <KV k="NPCs here" v={grouping.byLoc.get(selectedLocation.id)?.length || 0} />
          </div>
        </div>
      )}

      {selectedNpc && (
        <div className="mt-3 p-3 rounded-sm bg-surface-container/40 border border-outline-variant/25 text-[11px]">
          <div className="flex items-start justify-between mb-2">
            <div>
              <div className="font-bold text-on-surface text-sm">{selectedNpc.name}</div>
              <div className="text-on-surface-variant">
                {selectedNpc.role || '—'} • category: {selectedNpc.category}
                {!selectedNpc.keyNpc && <span className="ml-1 text-on-surface-variant">(background)</span>}
              </div>
            </div>
            <button
              onClick={() => { setSelectedKind(null); setSelectedId(null); }}
              className="text-on-surface-variant hover:text-on-surface text-[10px]"
            >
              close
            </button>
          </div>
          <div className="grid grid-cols-3 gap-3 text-[10px]">
            <KV k="canonicalId" v={selectedNpc.canonicalId || '—'} />
            <KV k="home" v={selectedNpc.homeLocationId ? (nodeById.get(selectedNpc.homeLocationId)?.name || selectedNpc.homeLocationId) : '—'} />
            <KV k="current" v={selectedNpc.currentLocationId ? (nodeById.get(selectedNpc.currentLocationId)?.name || selectedNpc.currentLocationId) : '—'} />
          </div>
        </div>
      )}
    </div>
  );
}
