/**
 * Procedural tile generation for the field map.
 * Given a biome key, grid dimensions, and a numeric seed, produces a
 * deterministic 2D tile array (col-major: tiles[col][row]).
 *
 * Lives in shared/ so both FE and BE can use it as procedural fallback.
 */

import { passableTilesForBiome, obstacleTilesForBiome, TILE_TYPES } from './battlefieldTiles.js';

// ── Seeded PRNG (mulberry32) ──

function mulberry32(seed) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

// ── Biome → tile palette mapping ──

const BIOME_TO_TILE_BIOME = {
  forest:   'forest',
  town:     'village',
  village:  'village',
  tavern:   'village',
  cave:     'cave',
  castle:   'castle',
  ruins:    'ruins',
  field:    'field',
  road:     'field',
  coast:    'field',
  swamp:    'swamp',
  camp:     'field',
  mountain: 'cave',
  dungeon:  'dungeon',
};

const INTERIOR_BIOMES = new Set(['tavern', 'castle', 'dungeon']);

const BIOME_GROUND_OVERRIDES = {
  tavern:   ['wooden_floor'],
  coast:    ['sand', 'grass'],
  camp:     ['dirt', 'grass'],
  road:     ['dirt', 'cobblestone', 'grass'],
  mountain: ['gravel', 'stone_floor'],
};

const BIOME_WALL_TILE = {
  tavern:   'wooden_wall',
  castle:   'stone_wall',
  dungeon:  'stone_wall',
  cave:     'rock',
};

const BIOME_OBSTACLE_OVERRIDES = {
  tavern:   ['overturned_table', 'barrel', 'crate'],
  camp:     ['campfire', 'crate', 'barrel'],
  coast:    ['rock'],
  mountain: ['rock', 'stalagmite'],
};

// ── Biome resolution (keyword matching) ──

const BIOME_KEYWORDS = {
  tavern: [
    'tavern', 'inn', 'pub', 'bar', 'alehouse', 'taproom',
    'karczma', 'tawerna', 'gospoda', 'oberża',
  ],
  cave: [
    'cave', 'cavern', 'grotto', 'tunnel', 'mine', 'underground', 'crypt', 'catacomb', 'dungeon', 'sewer',
    'jaskinia', 'grota', 'tunel', 'kopalnia', 'podziemia', 'krypta', 'katakumby', 'loch', 'kanał',
  ],
  castle: [
    'castle', 'fortress', 'keep', 'citadel', 'palace', 'throne', 'stronghold', 'bastion', 'manor', 'hall',
    'zamek', 'twierdza', 'cytadela', 'pałac', 'tron', 'dworek', 'sala',
  ],
  forest: [
    'forest', 'wood', 'woods', 'grove', 'thicket', 'jungle', 'glade', 'copse', 'clearing',
    'las', 'bór', 'gaj', 'puszcza', 'polana', 'zagajnik',
  ],
  mountain: [
    'mountain', 'peak', 'summit', 'hill', 'cliff', 'ridge', 'crag', 'pass', 'highland',
    'góra', 'szczyt', 'wzgórze', 'klif', 'grzbiet', 'przełęcz', 'wyżyna',
  ],
  town: [
    'town', 'city', 'village', 'market', 'shop', 'street', 'square', 'district', 'quarter',
    'farm', 'hamlet', 'settlement', 'smithy', 'forge', 'guild',
    'miasto', 'wioska', 'targ', 'sklep', 'ulica', 'plac', 'dzielnica', 'rynek',
    'osada', 'chata', 'kuźnia', 'gildia',
  ],
  coast: [
    'coast', 'beach', 'shore', 'sea', 'ocean', 'port', 'harbor', 'harbour', 'dock', 'pier', 'lighthouse',
    'wybrzeże', 'plaża', 'brzeg', 'morze', 'ocean', 'port', 'przystań', 'dok', 'latarnia',
  ],
  swamp: [
    'swamp', 'marsh', 'bog', 'wetland', 'mire', 'fen',
    'bagno', 'mokradła', 'trzęsawisko', 'moczary',
  ],
  ruins: [
    'ruins', 'ruin', 'rubble', 'temple', 'shrine', 'tomb', 'mausoleum', 'abandoned', 'crumbling',
    'ruiny', 'ruina', 'świątynia', 'grobowiec', 'mauzoleum', 'opuszczony',
  ],
  camp: [
    'camp', 'campsite', 'bivouac', 'encampment',
    'obóz', 'obozowisko', 'biwak',
  ],
  road: [
    'road', 'path', 'trail', 'highway', 'bridge', 'crossroad', 'wagon',
    'droga', 'ścieżka', 'trakt', 'most', 'skrzyżowanie',
  ],
};

/**
 * Infer biome key from text sources (location name, narrative, imagePrompt).
 * Usable on both FE and BE — no DOM/React dependencies.
 */
export function resolveBiomeFromText(locationName, narrative, imagePrompt) {
  const primary = (locationName || '').toLowerCase();
  const fallback = `${imagePrompt || ''} ${(narrative || '').substring(0, 300)}`.toLowerCase();

  for (const [biome, keywords] of Object.entries(BIOME_KEYWORDS)) {
    if (keywords.some((kw) => primary.includes(kw))) return biome;
  }
  for (const [biome, keywords] of Object.entries(BIOME_KEYWORDS)) {
    if (keywords.some((kw) => fallback.includes(kw))) return biome;
  }

  return 'field';
}

// ── Portal placement ──

const EDGE_SLOTS = [
  { side: 'north', getPos: (w, h, i, count) => ({ x: Math.floor(w * (i + 1) / (count + 1)), y: 0 }) },
  { side: 'south', getPos: (w, h, i, count) => ({ x: Math.floor(w * (i + 1) / (count + 1)), y: h - 1 }) },
  { side: 'west',  getPos: (w, h, i, count) => ({ x: 0, y: Math.floor(h * (i + 1) / (count + 1)) }) },
  { side: 'east',  getPos: (w, h, i, count) => ({ x: w - 1, y: Math.floor(h * (i + 1) / (count + 1)) }) },
];

function placePortals(tiles, width, height, rng, neighbors, isInterior) {
  if (!neighbors || neighbors.length === 0) return [];

  const portals = [];
  const capped = neighbors.slice(0, EDGE_SLOTS.length);

  for (let i = 0; i < capped.length; i++) {
    const slot = EDGE_SLOTS[i];
    const { x, y } = slot.getPos(width, height, 0, 1);
    tiles[x][y] = 'portal';
    portals.push({
      x, y,
      destinationName: capped[i].name,
      destinationRef: capped[i].ref || null,
    });
  }

  return portals;
}

// ── Generator ──

function pickRandom(arr, rng) {
  return arr[Math.floor(rng() * arr.length)];
}

/**
 * Generate a procedural tile grid for the field map.
 * @param {string} biome - biome key
 * @param {number} width - grid columns
 * @param {number} height - grid rows
 * @param {string|number} seed - seed for deterministic output
 * @param {{ neighbors?: Array<{ name: string, ref?: { kind: string, id: string } }> }} [opts]
 * @returns {{ tiles: Array<Array<string>>, portals: Array<{ x: number, y: number, destinationName: string, destinationRef?: { kind: string, id: string } }> }}
 */
export function generateFieldTiles(biome, width, height, seed, opts) {
  const numericSeed = typeof seed === 'string' ? hashString(seed) : (seed || 0);
  const rng = mulberry32(numericSeed);

  const tileBiome = BIOME_TO_TILE_BIOME[biome] || 'field';
  const isInterior = INTERIOR_BIOMES.has(biome);

  let groundTiles;
  if (BIOME_GROUND_OVERRIDES[biome]) {
    groundTiles = BIOME_GROUND_OVERRIDES[biome];
  } else {
    const passable = passableTilesForBiome(tileBiome);
    groundTiles = passable.length > 0
      ? passable.slice(0, 3).map(t => t.id)
      : ['grass'];
  }

  let obstacleTiles;
  if (BIOME_OBSTACLE_OVERRIDES[biome]) {
    obstacleTiles = BIOME_OBSTACLE_OVERRIDES[biome];
  } else {
    const obstacles = obstacleTilesForBiome(tileBiome);
    obstacleTiles = obstacles.length > 0
      ? obstacles.slice(0, 4).map(t => t.id)
      : ['rock'];
  }

  const wallTile = BIOME_WALL_TILE[biome] || 'tree';

  const tiles = [];
  for (let col = 0; col < width; col++) {
    tiles[col] = [];
    for (let row = 0; row < height; row++) {
      tiles[col][row] = pickRandom(groundTiles, rng);
    }
  }

  if (isInterior) {
    for (let col = 0; col < width; col++) {
      tiles[col][0] = wallTile;
      tiles[col][height - 1] = wallTile;
    }
    for (let row = 0; row < height; row++) {
      tiles[0][row] = wallTile;
      tiles[width - 1][row] = wallTile;
    }
    const midX = Math.floor(width / 2);
    const midY = Math.floor(height / 2);
    tiles[midX][height - 1] = 'door';
    if (TILE_TYPES.door) tiles[midX][0] = 'door';
    tiles[0][midY] = 'door';
    tiles[width - 1][midY] = 'door';
  } else {
    for (let col = 0; col < width; col++) {
      if (rng() < 0.45) tiles[col][0] = wallTile;
      if (rng() < 0.45) tiles[col][height - 1] = wallTile;
    }
    for (let row = 1; row < height - 1; row++) {
      if (rng() < 0.45) tiles[0][row] = wallTile;
      if (rng() < 0.45) tiles[width - 1][row] = wallTile;
    }
  }

  const obstacleChance = isInterior ? 0.06 : 0.04;
  const margin = isInterior ? 2 : 1;
  for (let col = margin; col < width - margin; col++) {
    for (let row = margin; row < height - margin; row++) {
      if (rng() < obstacleChance) {
        tiles[col][row] = pickRandom(obstacleTiles, rng);
      }
    }
  }

  if (biome === 'camp') {
    const cx = Math.floor(width / 2);
    const cy = Math.floor(height / 2);
    tiles[cx][cy] = 'campfire';
  }

  const portals = placePortals(tiles, width, height, rng, opts?.neighbors, isInterior);

  return { tiles, portals };
}

/** All known tile IDs — useful for AI response validation. */
export const ALL_TILE_IDS = Object.keys(TILE_TYPES);
