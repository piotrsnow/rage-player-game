// Faza 6 — fragmenty dawnego mapHelpers.js (palette + helpers) zachowane
// dla CanonGraphTab.jsx, który nadal renderuje canonical graph viz.
// Reszta funkcji (tile-based map) wywalona razem z gameplay/worldMap/.

export const LOCATION_TYPE_COLORS = {
  generic: '#6b7280',
  hamlet: '#a78bfa',
  village: '#8b5cf6',
  town: '#7c3aed',
  city: '#6d28d9',
  capital: '#5b21b6',
  dungeon: '#7c2d12',
  forest: '#15803d',
  wilderness: '#16a34a',
  mountain: '#71717a',
  ruin: '#9a3412',
  camp: '#ca8a04',
  cave: '#374151',
  interior: '#0e7490',
  dungeon_room: '#991b1b',
  campaignPlace: '#be185d',
  region: '#0891b2',
  area: '#22d3ee',
  district: '#0284c7',
  site: '#06b6d4',
  room: '#0ea5e9',
  point: '#475569',
  abstract: '#78716c',
};

export const NPC_CATEGORY_COLORS = {
  commoner: '#94a3b8',
  noble: '#facc15',
  trader: '#fb923c',
  guard: '#60a5fa',
  bandit: '#dc2626',
  cleric: '#e879f9',
  scholar: '#4ade80',
  rogue: '#a78bfa',
  artisan: '#f87171',
  outsider: '#7c3aed',
};

export function edgeColour(category) {
  switch (category) {
    case 'movement': return '#60a5fa';
    case 'spatial': return '#94a3b8';
    case 'structural': return '#a78bfa';
    case 'access': return '#facc15';
    case 'perception': return '#22d3ee';
    case 'social': return '#fb923c';
    case 'narrative': return '#e879f9';
    case 'temporal': return '#4ade80';
    default: return '#6b7280';
  }
}

const LOCATION_SCALE = {
  point: 0, abstract: 0, room: 1, dungeon_room: 1,
  cave: 2, camp: 2, site: 2, interior: 2,
  hamlet: 3, dungeon: 3, ruin: 3, forest: 3, wilderness: 3, mountain: 3,
  village: 4, area: 4, district: 4,
  town: 5, campaignPlace: 5, region: 5,
  city: 6, capital: 7,
};

export function nodeRadius(locationType = 'generic') {
  const scale = LOCATION_SCALE[locationType] ?? 4;
  return 6 + scale * 3.4;
}
