export const NODE_VISUALS = {
  world:      { icon: 'public',       color: '#64748b', label: 'Świat' },
  region:     { icon: 'map',          color: '#065f46', label: 'Region' },
  area:       { icon: 'park',         color: '#15803d', label: 'Obszar' },
  settlement: { icon: 'castle',       color: '#d97706', label: 'Osada' },
  district:   { icon: 'location_city',color: '#f97316', label: 'Dzielnica' },
  site:       { icon: 'house',        color: '#3b82f6', label: 'Obiekt' },
  room:       { icon: 'door_open',    color: '#818cf8', label: 'Pomieszczenie' },
  point:      { icon: 'pin_drop',     color: '#a78bfa', label: 'Punkt' },
  abstract:   { icon: 'auto_awesome', color: '#a855f7', label: 'Abstrakcja' },
  dungeon:    { icon: 'skull',        color: '#dc2626', label: 'Loch' },
  generic:    { icon: 'place',        color: '#6b7280', label: 'Lokacja' },
};

export const EDGE_VISUALS = {
  structural: { color: '#6b7280', dash: '',        width: 1   },
  spatial:    { color: '#9ca3af', dash: '6,3',     width: 1   },
  movement:   { color: '#3b82f6', dash: '',        width: 2   },
  access:     { color: '#f97316', dash: '6,3',     width: 1.5 },
  perception: { color: '#eab308', dash: '3,3',     width: 1   },
  social:     { color: '#a855f7', dash: '6,3',     width: 1   },
  narrative:  { color: '#22c55e', dash: '3,3',     width: 1   },
  temporal:   { color: '#06b6d4', dash: '8,3,2,3', width: 1   },
};

// Per-type overrides. Merged on top of category defaults by getEdgeVisual().
// renderMode: 'line' | 'double' | 'bridge' | 'wavy' | 'zigzag' | 'glow' | 'door'
export const EDGE_TYPE_VISUALS = {
  road_to:           { color: '#c9a87c', borderColor: '#7a5c2e', width: 6,   renderMode: 'double' },
  path_to:           { color: '#a8b88c', width: 3,   renderMode: 'line',   dash: '8,4' },
  bridge_to:         { color: '#c9a96e', borderColor: '#7a6832', width: 5,   renderMode: 'bridge' },
  tunnel_to:         { color: '#9ca3af', borderColor: '#4b5563', width: 5,   renderMode: 'double', dash: '6,4' },
  stairs_to:         { color: '#9ca3af', width: 3,   renderMode: 'line',   dash: '3,3' },
  door_to:           { color: '#a78bfa', width: 3,   renderMode: 'door',   midIcon: 'door_front' },
  portal_to:         { color: '#c084fc', width: 3,   renderMode: 'glow' },
  secret_path_to:    { color: '#c4b5fd', width: 1.5, renderMode: 'line',   dash: '2,4',   opacity: 0.4 },
  one_way_to:        { color: '#60a5fa', width: 3,   renderMode: 'line' },
  dangerous_path_to: { color: '#f87171', width: 3,   renderMode: 'zigzag', zigzagAmp: 5 },
  blocked_path_to:   { color: '#ef4444', width: 3,   renderMode: 'line',   dash: '6,3',   midIcon: 'close' },
  climb_to:          { color: '#d97706', width: 2.5, renderMode: 'zigzag', zigzagAmp: 4 },
  swim_to:           { color: '#38bdf8', width: 2.5, renderMode: 'wavy',   wavyAmp: 5 },
  ferry_to:          { color: '#0ea5e9', width: 3,   renderMode: 'wavy',   wavyAmp: 4, dash: '8,4', midIcon: 'sailing' },

  contains:          { color: '#4b5563', width: 1,   renderMode: 'line' },
  overlaps:          { color: '#6b7280', width: 1,   renderMode: 'line',   dash: '4,4' },
  above:             { color: '#6b7280', width: 1,   renderMode: 'line',   dash: '2,3' },
  below:             { color: '#6b7280', width: 1,   renderMode: 'line',   dash: '2,3' },

  adjacent_to:       { color: '#94a3b8', width: 1.5, renderMode: 'line',   dash: '6,4' },
  near:              { color: '#94a3b8', width: 1,   renderMode: 'line',   dash: '4,6' },
  across_from:       { color: '#94a3b8', width: 1,   renderMode: 'line',   dash: '8,4' },

  requires_key:          { color: '#fb923c', width: 2, renderMode: 'line', dash: '6,3', midIcon: 'lock' },
  requires_permission:   { color: '#fb923c', width: 2, renderMode: 'line', dash: '6,3', midIcon: 'shield' },
  requires_skill_check:  { color: '#fb923c', width: 2, renderMode: 'line', dash: '6,3', midIcon: 'casino' },
  requires_payment:      { color: '#fb923c', width: 2, renderMode: 'line', dash: '6,3', midIcon: 'paid' },

  visible_from:      { color: '#fbbf24', width: 1,   renderMode: 'line',   dash: '2,4',   opacity: 0.4 },
  audible_from:      { color: '#fbbf24', width: 1,   renderMode: 'line',   dash: '1,5',   opacity: 0.35 },
  smell_from:        { color: '#fbbf24', width: 1,   renderMode: 'line',   dash: '2,6',   opacity: 0.3 },

  controlled_by:     { color: '#c084fc', width: 1.5, renderMode: 'line',   dash: '6,3' },
  patrolled_by:      { color: '#a855f7', width: 1.5, renderMode: 'line',   dash: '4,4' },
  inhabited_by:      { color: '#a855f7', width: 1,   renderMode: 'line',   dash: '6,3' },

  quest_related_to:  { color: '#4ade80', width: 1.5, renderMode: 'line',   dash: '4,4' },
  home_of:           { color: '#22c55e', width: 1,   renderMode: 'line',   dash: '3,5' },
  workplace_of:      { color: '#22c55e', width: 1,   renderMode: 'line',   dash: '3,5' },
  rumor_about:       { color: '#86efac', width: 1,   renderMode: 'line',   dash: '2,4',   opacity: 0.5 },

  open_during:       { color: '#22d3ee', width: 1.5, renderMode: 'line',   dash: '8,3,2,3' },
  accessible_during: { color: '#06b6d4', width: 1.5, renderMode: 'line',   dash: '8,3,2,3' },
};

export const DISCOVERY_VISUALS = {
  unknown:  { opacity: 0,   border: 'none',   render: false },
  rumored:  { opacity: 0.3, border: 'dashed', render: true  },
  known:    { opacity: 0.7, border: 'solid',  render: true  },
  visited:  { opacity: 1.0, border: 'solid',  render: true  },
  mapped:   { opacity: 1.0, border: 'solid',  render: true, ring: '#eab308' },
  hidden:   { opacity: 0,   border: 'none',   render: false, gmRender: true, gmBorder: '#ef4444' },
};

export function getNodeVisual(type, overrides) {
  const base = NODE_VISUALS[type] || NODE_VISUALS.generic;
  if (!overrides) return base;
  return {
    ...base,
    ...(overrides.shape ? { shape: overrides.shape } : {}),
    ...(overrides.icon ? { icon: overrides.icon } : {}),
  };
}

export function getEdgeVisual(category, metadata, edgeType) {
  const catBase = EDGE_VISUALS[category] || EDGE_VISUALS.movement;
  const typeOverride = edgeType ? EDGE_TYPE_VISUALS[edgeType] : null;
  const base = typeOverride
    ? { dash: '', renderMode: 'line', ...catBase, ...typeOverride }
    : { dash: '', renderMode: 'line', ...catBase };

  const tc = metadata?.traversalCount;
  if (typeof tc === 'number' && tc >= 1 && category === 'movement') {
    const extraWidth = Math.min(tc * 0.4, 3);
    const extraOpacity = Math.min(tc * 0.05, 0.3);
    return { ...base, width: base.width + extraWidth, opacity: (base.opacity ?? 0.7) + extraOpacity };
  }
  return base;
}

export function getNodeRadius(scale) {
  if (scale <= 1) return 28;
  if (scale <= 3) return 22;
  if (scale <= 5) return 18;
  return 14;
}

// ── Path geometry helpers ────────────────────────────────────────────

export function buildWavyPath(from, to, amplitude = 5, waves = 3) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1) return `M${from.x},${from.y}`;
  const nx = -dy / len;
  const ny = dx / len;
  const segments = waves * 6;
  const pts = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const off = Math.sin(t * Math.PI * 2 * waves) * amplitude;
    pts.push({
      x: from.x + dx * t + nx * off,
      y: from.y + dy * t + ny * off,
    });
  }
  return pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
}

export function buildZigzagPath(from, to, amplitude = 5, minSpacing = 10) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1) return `M${from.x},${from.y}`;
  const nx = -dy / len;
  const ny = dx / len;
  const segments = Math.max(4, Math.round(len / minSpacing));
  const pts = [from];
  for (let i = 1; i < segments; i++) {
    const t = i / segments;
    const sign = i % 2 === 0 ? 1 : -1;
    pts.push({
      x: from.x + dx * t + nx * sign * amplitude,
      y: from.y + dy * t + ny * sign * amplitude,
    });
  }
  pts.push(to);
  return pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
}

export function buildBridgeTicks(from, to, halfWidth = 3, spacing = 14) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < spacing) return [];
  const nx = -dy / len;
  const ny = dx / len;
  const count = Math.floor(len / spacing);
  const ticks = [];
  for (let i = 1; i <= count; i++) {
    const t = i / (count + 1);
    const cx = from.x + dx * t;
    const cy = from.y + dy * t;
    ticks.push({
      x1: cx + nx * halfWidth, y1: cy + ny * halfWidth,
      x2: cx - nx * halfWidth, y2: cy - ny * halfWidth,
    });
  }
  return ticks;
}
