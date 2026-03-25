/**
 * Biome configuration data for procedural 2D scene rendering.
 *
 * Each biome defines: sky palettes per time-of-day, background silhouette type,
 * ground style, element pools (weighted decoration lists), indoor flag, and
 * default light sources.
 */

/* ------------------------------------------------------------------ */
/*  Sky gradient palettes — [top, middle, bottom] per time of day     */
/* ------------------------------------------------------------------ */

const SKY_PALETTES = {
  dawn: {
    outdoor: [
      { pos: 0, color: [40, 30, 80] },
      { pos: 0.4, color: [180, 100, 60] },
      { pos: 0.7, color: [240, 160, 80] },
      { pos: 1, color: [255, 200, 140] },
    ],
    storm: [
      { pos: 0, color: [35, 30, 50] },
      { pos: 0.5, color: [90, 70, 55] },
      { pos: 1, color: [120, 90, 70] },
    ],
  },
  day: {
    outdoor: [
      { pos: 0, color: [50, 100, 180] },
      { pos: 0.5, color: [100, 160, 220] },
      { pos: 0.85, color: [160, 200, 240] },
      { pos: 1, color: [200, 220, 245] },
    ],
    storm: [
      { pos: 0, color: [40, 45, 60] },
      { pos: 0.5, color: [70, 75, 85] },
      { pos: 1, color: [95, 100, 110] },
    ],
  },
  dusk: {
    outdoor: [
      { pos: 0, color: [30, 20, 60] },
      { pos: 0.35, color: [120, 50, 80] },
      { pos: 0.65, color: [200, 100, 60] },
      { pos: 1, color: [240, 170, 90] },
    ],
    storm: [
      { pos: 0, color: [25, 20, 40] },
      { pos: 0.5, color: [70, 45, 50] },
      { pos: 1, color: [100, 70, 55] },
    ],
  },
  night: {
    outdoor: [
      { pos: 0, color: [5, 8, 25] },
      { pos: 0.4, color: [10, 15, 40] },
      { pos: 0.8, color: [15, 20, 50] },
      { pos: 1, color: [20, 25, 55] },
    ],
    storm: [
      { pos: 0, color: [5, 5, 10] },
      { pos: 0.5, color: [10, 10, 18] },
      { pos: 1, color: [15, 15, 25] },
    ],
  },
};

const INDOOR_SKY = [
  { pos: 0, color: [18, 14, 12] },
  { pos: 0.3, color: [25, 20, 16] },
  { pos: 1, color: [30, 25, 20] },
];

const CAVE_SKY = [
  { pos: 0, color: [8, 8, 12] },
  { pos: 0.5, color: [12, 12, 18] },
  { pos: 1, color: [18, 16, 22] },
];

/* ------------------------------------------------------------------ */
/*  Ground styles                                                      */
/* ------------------------------------------------------------------ */

export const GROUND_STYLES = {
  grass:      { base: [45, 65, 30], highlight: [60, 85, 40], pattern: 'grass' },
  dirt:       { base: [80, 60, 40], highlight: [100, 80, 55], pattern: 'dirt' },
  stone:      { base: [70, 65, 60], highlight: [90, 85, 80], pattern: 'stone' },
  wood:       { base: [90, 65, 35], highlight: [120, 90, 50], pattern: 'planks' },
  sand:       { base: [180, 160, 120], highlight: [200, 185, 150], pattern: 'sand' },
  cobble:     { base: [75, 70, 65], highlight: [95, 90, 85], pattern: 'cobble' },
  water:      { base: [30, 55, 70], highlight: [40, 70, 90], pattern: 'water' },
  snow:       { base: [200, 210, 220], highlight: [230, 235, 240], pattern: 'snow' },
  cave:       { base: [40, 35, 30], highlight: [55, 50, 45], pattern: 'stone' },
  marsh:      { base: [40, 50, 35], highlight: [55, 65, 45], pattern: 'water' },
};

/* ------------------------------------------------------------------ */
/*  Background silhouette types                                        */
/* ------------------------------------------------------------------ */

export const BG_SILHOUETTE_TYPES = {
  treeline:   'treeline',
  mountains:  'mountains',
  cityscape:  'cityscape',
  caveCeiling:'caveCeiling',
  indoorWall: 'indoorWall',
  seaHorizon: 'seaHorizon',
  hills:      'hills',
  ruins:      'ruins',
  none:       'none',
};

/* ------------------------------------------------------------------ */
/*  Element pools per biome — { type, weight, scale range }           */
/* ------------------------------------------------------------------ */

const ELEMENT_POOLS = {
  forest: [
    { type: 'deciduousTree', weight: 4, scaleRange: [0.7, 1.2] },
    { type: 'pine', weight: 3, scaleRange: [0.8, 1.3] },
    { type: 'bush', weight: 3, scaleRange: [0.4, 0.7] },
    { type: 'mushroom', weight: 1, scaleRange: [0.2, 0.4] },
    { type: 'rock', weight: 2, scaleRange: [0.3, 0.6] },
    { type: 'fern', weight: 2, scaleRange: [0.3, 0.5] },
    { type: 'log', weight: 1, scaleRange: [0.4, 0.6] },
  ],
  town: [
    { type: 'building', weight: 4, scaleRange: [0.8, 1.4] },
    { type: 'cottage', weight: 3, scaleRange: [0.6, 1.0] },
    { type: 'signpost', weight: 1, scaleRange: [0.4, 0.6] },
    { type: 'barrel', weight: 2, scaleRange: [0.25, 0.4] },
    { type: 'crate', weight: 1, scaleRange: [0.2, 0.35] },
    { type: 'well', weight: 1, scaleRange: [0.4, 0.6] },
    { type: 'fence', weight: 2, scaleRange: [0.5, 0.8] },
    { type: 'lampPost', weight: 1, scaleRange: [0.5, 0.7] },
  ],
  tavern: [
    { type: 'table', weight: 3, scaleRange: [0.5, 0.7] },
    { type: 'chair', weight: 3, scaleRange: [0.3, 0.45] },
    { type: 'barrel', weight: 3, scaleRange: [0.3, 0.5] },
    { type: 'mug', weight: 2, scaleRange: [0.1, 0.2] },
    { type: 'chandelier', weight: 1, scaleRange: [0.4, 0.6] },
    { type: 'shelf', weight: 1, scaleRange: [0.5, 0.7] },
  ],
  cave: [
    { type: 'stalactite', weight: 3, scaleRange: [0.4, 0.9] },
    { type: 'stalagmite', weight: 3, scaleRange: [0.3, 0.7] },
    { type: 'crystal', weight: 2, scaleRange: [0.2, 0.5] },
    { type: 'rock', weight: 3, scaleRange: [0.3, 0.7] },
    { type: 'mushroom', weight: 1, scaleRange: [0.15, 0.3] },
  ],
  mountain: [
    { type: 'pine', weight: 3, scaleRange: [0.6, 1.1] },
    { type: 'rock', weight: 4, scaleRange: [0.4, 0.9] },
    { type: 'boulder', weight: 2, scaleRange: [0.5, 0.8] },
    { type: 'deadTree', weight: 1, scaleRange: [0.5, 0.9] },
    { type: 'bush', weight: 1, scaleRange: [0.3, 0.5] },
  ],
  coast: [
    { type: 'palm', weight: 2, scaleRange: [0.7, 1.1] },
    { type: 'rock', weight: 3, scaleRange: [0.3, 0.7] },
    { type: 'driftwood', weight: 2, scaleRange: [0.3, 0.5] },
    { type: 'seashell', weight: 1, scaleRange: [0.1, 0.2] },
    { type: 'seagull', weight: 1, scaleRange: [0.15, 0.25] },
  ],
  swamp: [
    { type: 'deadTree', weight: 4, scaleRange: [0.6, 1.1] },
    { type: 'mushroom', weight: 2, scaleRange: [0.2, 0.4] },
    { type: 'willowTree', weight: 2, scaleRange: [0.8, 1.2] },
    { type: 'reed', weight: 3, scaleRange: [0.3, 0.5] },
    { type: 'willOWisp', weight: 1, scaleRange: [0.1, 0.2] },
  ],
  castle: [
    { type: 'pillar', weight: 3, scaleRange: [0.8, 1.3] },
    { type: 'banner', weight: 2, scaleRange: [0.4, 0.7] },
    { type: 'torchSconce', weight: 3, scaleRange: [0.3, 0.5] },
    { type: 'armorStand', weight: 1, scaleRange: [0.5, 0.7] },
    { type: 'crate', weight: 1, scaleRange: [0.25, 0.4] },
  ],
  road: [
    { type: 'deciduousTree', weight: 2, scaleRange: [0.7, 1.1] },
    { type: 'bush', weight: 3, scaleRange: [0.4, 0.6] },
    { type: 'rock', weight: 2, scaleRange: [0.2, 0.5] },
    { type: 'signpost', weight: 1, scaleRange: [0.4, 0.6] },
    { type: 'milestone', weight: 1, scaleRange: [0.25, 0.4] },
    { type: 'fence', weight: 1, scaleRange: [0.4, 0.7] },
  ],
  ruins: [
    { type: 'brokenPillar', weight: 3, scaleRange: [0.5, 1.0] },
    { type: 'rubble', weight: 3, scaleRange: [0.3, 0.6] },
    { type: 'arch', weight: 2, scaleRange: [0.8, 1.3] },
    { type: 'bush', weight: 2, scaleRange: [0.3, 0.6] },
    { type: 'vine', weight: 1, scaleRange: [0.4, 0.8] },
  ],
  camp: [
    { type: 'tent', weight: 2, scaleRange: [0.6, 0.9] },
    { type: 'campfire', weight: 1, scaleRange: [0.35, 0.5] },
    { type: 'bedroll', weight: 2, scaleRange: [0.3, 0.45] },
    { type: 'log', weight: 2, scaleRange: [0.3, 0.5] },
    { type: 'rock', weight: 1, scaleRange: [0.25, 0.4] },
    { type: 'bush', weight: 1, scaleRange: [0.3, 0.5] },
  ],
  field: [
    { type: 'bush', weight: 3, scaleRange: [0.3, 0.6] },
    { type: 'flower', weight: 3, scaleRange: [0.15, 0.3] },
    { type: 'rock', weight: 2, scaleRange: [0.2, 0.5] },
    { type: 'deciduousTree', weight: 1, scaleRange: [0.7, 1.0] },
    { type: 'fern', weight: 2, scaleRange: [0.2, 0.4] },
    { type: 'tallGrass', weight: 2, scaleRange: [0.25, 0.4] },
  ],
};

/* ------------------------------------------------------------------ */
/*  Light source presets                                               */
/* ------------------------------------------------------------------ */

export const LIGHT_PRESETS = {
  sun:        { color: [255, 240, 200], radius: 0.6, intensity: 0.25, y: 0.1 },
  moon:       { color: [140, 160, 220], radius: 0.5, intensity: 0.15, y: 0.1 },
  torch:      { color: [255, 180, 80], radius: 0.18, intensity: 0.5, flicker: true },
  campfire:   { color: [255, 150, 50], radius: 0.25, intensity: 0.6, flicker: true },
  candle:     { color: [255, 200, 120], radius: 0.12, intensity: 0.35, flicker: true },
  crystal:    { color: [120, 180, 255], radius: 0.15, intensity: 0.3, flicker: false },
  magic:      { color: [180, 120, 255], radius: 0.2, intensity: 0.35, flicker: true },
  fireplace:  { color: [255, 140, 40], radius: 0.3, intensity: 0.55, flicker: true },
};

/* ------------------------------------------------------------------ */
/*  Master biome config                                                */
/* ------------------------------------------------------------------ */

export const BIOMES = {
  forest: {
    indoor: false,
    ground: GROUND_STYLES.grass,
    bgSilhouette: BG_SILHOUETTE_TYPES.treeline,
    elements: ELEMENT_POOLS.forest,
    elementCount: [8, 14],
    lights: { day: ['sun'], night: ['moon'], dawn: ['sun'], dusk: ['sun'] },
    bgColor: [25, 40, 20],
    horizonLine: 0.45,
  },
  town: {
    indoor: false,
    ground: GROUND_STYLES.cobble,
    bgSilhouette: BG_SILHOUETTE_TYPES.cityscape,
    elements: ELEMENT_POOLS.town,
    elementCount: [6, 12],
    lights: { day: ['sun'], night: ['moon', 'torch', 'torch'], dawn: ['sun'], dusk: ['sun', 'torch'] },
    bgColor: [50, 45, 40],
    horizonLine: 0.4,
  },
  tavern: {
    indoor: true,
    ground: GROUND_STYLES.wood,
    bgSilhouette: BG_SILHOUETTE_TYPES.indoorWall,
    elements: ELEMENT_POOLS.tavern,
    elementCount: [6, 10],
    lights: { day: ['fireplace', 'candle'], night: ['fireplace', 'candle', 'candle'], dawn: ['fireplace', 'candle'], dusk: ['fireplace', 'candle'] },
    bgColor: [35, 25, 18],
    horizonLine: 0.35,
  },
  cave: {
    indoor: true,
    ground: GROUND_STYLES.cave,
    bgSilhouette: BG_SILHOUETTE_TYPES.caveCeiling,
    elements: ELEMENT_POOLS.cave,
    elementCount: [6, 12],
    lights: { day: ['crystal'], night: ['crystal'], dawn: ['crystal'], dusk: ['crystal'] },
    bgColor: [15, 12, 18],
    horizonLine: 0.3,
  },
  mountain: {
    indoor: false,
    ground: GROUND_STYLES.stone,
    bgSilhouette: BG_SILHOUETTE_TYPES.mountains,
    elements: ELEMENT_POOLS.mountain,
    elementCount: [5, 10],
    lights: { day: ['sun'], night: ['moon'], dawn: ['sun'], dusk: ['sun'] },
    bgColor: [60, 55, 50],
    horizonLine: 0.35,
  },
  coast: {
    indoor: false,
    ground: GROUND_STYLES.sand,
    bgSilhouette: BG_SILHOUETTE_TYPES.seaHorizon,
    elements: ELEMENT_POOLS.coast,
    elementCount: [4, 8],
    lights: { day: ['sun'], night: ['moon'], dawn: ['sun'], dusk: ['sun'] },
    bgColor: [60, 100, 130],
    horizonLine: 0.5,
  },
  swamp: {
    indoor: false,
    ground: GROUND_STYLES.marsh,
    bgSilhouette: BG_SILHOUETTE_TYPES.treeline,
    elements: ELEMENT_POOLS.swamp,
    elementCount: [6, 12],
    lights: { day: ['sun'], night: ['moon'], dawn: ['sun'], dusk: ['sun'] },
    bgColor: [25, 35, 20],
    horizonLine: 0.45,
  },
  castle: {
    indoor: true,
    ground: GROUND_STYLES.stone,
    bgSilhouette: BG_SILHOUETTE_TYPES.indoorWall,
    elements: ELEMENT_POOLS.castle,
    elementCount: [5, 9],
    lights: { day: ['torch', 'torch'], night: ['torch', 'torch'], dawn: ['torch'], dusk: ['torch', 'torch'] },
    bgColor: [40, 35, 30],
    horizonLine: 0.35,
  },
  road: {
    indoor: false,
    ground: GROUND_STYLES.dirt,
    bgSilhouette: BG_SILHOUETTE_TYPES.hills,
    elements: ELEMENT_POOLS.road,
    elementCount: [5, 10],
    lights: { day: ['sun'], night: ['moon'], dawn: ['sun'], dusk: ['sun'] },
    bgColor: [50, 55, 40],
    horizonLine: 0.45,
  },
  ruins: {
    indoor: false,
    ground: GROUND_STYLES.stone,
    bgSilhouette: BG_SILHOUETTE_TYPES.ruins,
    elements: ELEMENT_POOLS.ruins,
    elementCount: [5, 10],
    lights: { day: ['sun'], night: ['moon'], dawn: ['sun'], dusk: ['sun'] },
    bgColor: [45, 40, 35],
    horizonLine: 0.42,
  },
  camp: {
    indoor: false,
    ground: GROUND_STYLES.dirt,
    bgSilhouette: BG_SILHOUETTE_TYPES.treeline,
    elements: ELEMENT_POOLS.camp,
    elementCount: [5, 9],
    lights: { day: ['sun'], night: ['campfire', 'moon'], dawn: ['campfire'], dusk: ['campfire'] },
    bgColor: [35, 40, 30],
    horizonLine: 0.45,
  },
  field: {
    indoor: false,
    ground: GROUND_STYLES.grass,
    bgSilhouette: BG_SILHOUETTE_TYPES.hills,
    elements: ELEMENT_POOLS.field,
    elementCount: [6, 12],
    lights: { day: ['sun'], night: ['moon'], dawn: ['sun'], dusk: ['sun'] },
    bgColor: [40, 55, 30],
    horizonLine: 0.48,
  },
};

/* ------------------------------------------------------------------ */
/*  Character color schemes                                            */
/* ------------------------------------------------------------------ */

export const CHARACTER_COLORS = {
  player:  { body: [160, 120, 220], outline: [200, 170, 255], glow: [180, 140, 255] },
  ally:    { body: [80, 160, 90], outline: [120, 200, 130], glow: [100, 200, 120] },
  enemy:   { body: [180, 60, 60], outline: [220, 90, 90], glow: [220, 70, 70] },
  neutral: { body: [140, 140, 140], outline: [180, 180, 180], glow: [170, 170, 170] },
};

export const SPECIES_PROPORTIONS = {
  Human:    { height: 1.0, width: 1.0 },
  Dwarf:    { height: 0.7, width: 1.2 },
  Elf:      { height: 1.05, width: 0.85 },
  Halfling: { height: 0.6, width: 0.9 },
  default:  { height: 1.0, width: 1.0 },
};

/* ------------------------------------------------------------------ */
/*  Time of day mapping from hour                                      */
/* ------------------------------------------------------------------ */

export function timeOfDayFromHour(hour) {
  if (hour >= 5 && hour < 8) return 'dawn';
  if (hour >= 8 && hour < 17) return 'day';
  if (hour >= 17 && hour < 20) return 'dusk';
  return 'night';
}

export function timeOfDayFromPeriod(period) {
  const map = {
    morning: 'day', dawn: 'dawn', sunrise: 'dawn',
    afternoon: 'day', midday: 'day', noon: 'day',
    evening: 'dusk', sunset: 'dusk', dusk: 'dusk',
    night: 'night', midnight: 'night', 'late night': 'night',
  };
  return map[(period || '').toLowerCase()] || 'day';
}

/* ------------------------------------------------------------------ */
/*  Sky palette resolver                                               */
/* ------------------------------------------------------------------ */

export function getSkyPalette(biome, timeOfDay, weather) {
  const cfg = BIOMES[biome] || BIOMES.field;
  if (cfg.indoor) {
    return biome === 'cave' ? CAVE_SKY : INDOOR_SKY;
  }

  const isStorm = weather === 'storm' || weather === 'rain' || weather === 'fog';
  const todKey = timeOfDay || 'day';
  const palette = SKY_PALETTES[todKey] || SKY_PALETTES.day;
  return isStorm ? palette.storm : palette.outdoor;
}
