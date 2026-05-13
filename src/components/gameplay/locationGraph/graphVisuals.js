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

export function getEdgeVisual(category, metadata) {
  const base = EDGE_VISUALS[category] || EDGE_VISUALS.movement;
  const tc = metadata?.traversalCount;
  if (typeof tc !== 'number' || tc < 1 || category !== 'movement') return base;
  const extraWidth = Math.min(tc * 0.4, 3);
  const extraOpacity = Math.min(tc * 0.05, 0.3);
  return { ...base, width: base.width + extraWidth, opacity: 0.7 + extraOpacity };
}

export function getNodeRadius(scale) {
  if (scale <= 1) return 28;
  if (scale <= 3) return 22;
  if (scale <= 5) return 18;
  return 14;
}
