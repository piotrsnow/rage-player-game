/**
 * Procedural tile generation for the field map.
 * Given a biome key, grid dimensions, and a numeric seed, produces a
 * deterministic 2D tile array (col-major: tiles[col][row]).
 */

import { passableTilesForBiome, obstacleTilesForBiome, TILE_TYPES } from '../../../../shared/domain/battlefieldTiles.js';

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

// ── Generator ──

function pickRandom(arr, rng) {
  return arr[Math.floor(rng() * arr.length)];
}

/**
 * Generate a procedural tile grid for the field map.
 * @param {string} biome - biome key from biomeResolver
 * @param {number} width - grid columns
 * @param {number} height - grid rows
 * @param {string|number} seed - seed for deterministic output
 * @returns {Array<Array<string>>} tiles[col][row] of tile IDs
 */
export function generateFieldTiles(biome, width, height, seed) {
  const numericSeed = typeof seed === 'string' ? hashString(seed) : (seed || 0);
  const rng = mulberry32(numericSeed);

  const tileBiome = BIOME_TO_TILE_BIOME[biome] || 'field';
  const isInterior = INTERIOR_BIOMES.has(biome);

  // Resolve ground palette
  let groundTiles;
  if (BIOME_GROUND_OVERRIDES[biome]) {
    groundTiles = BIOME_GROUND_OVERRIDES[biome];
  } else {
    const passable = passableTilesForBiome(tileBiome);
    groundTiles = passable.length > 0
      ? passable.slice(0, 3).map(t => t.id)
      : ['grass'];
  }

  // Resolve obstacle palette
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

  // Initialize grid with ground
  const tiles = [];
  for (let col = 0; col < width; col++) {
    tiles[col] = [];
    for (let row = 0; row < height; row++) {
      tiles[col][row] = pickRandom(groundTiles, rng);
    }
  }

  // Edge walls / border
  if (isInterior) {
    for (let col = 0; col < width; col++) {
      tiles[col][0] = wallTile;
      tiles[col][height - 1] = wallTile;
    }
    for (let row = 0; row < height; row++) {
      tiles[0][row] = wallTile;
      tiles[width - 1][row] = wallTile;
    }
    // Door openings
    const midX = Math.floor(width / 2);
    const midY = Math.floor(height / 2);
    tiles[midX][height - 1] = 'door';
    if (TILE_TYPES.door) tiles[midX][0] = 'door';
    tiles[0][midY] = 'door';
    tiles[width - 1][midY] = 'door';
  } else {
    // Sparse border tiles for outdoor biomes
    for (let col = 0; col < width; col++) {
      if (rng() < 0.45) tiles[col][0] = wallTile;
      if (rng() < 0.45) tiles[col][height - 1] = wallTile;
    }
    for (let row = 1; row < height - 1; row++) {
      if (rng() < 0.45) tiles[0][row] = wallTile;
      if (rng() < 0.45) tiles[width - 1][row] = wallTile;
    }
  }

  // Scatter obstacles in the interior
  const obstacleChance = isInterior ? 0.06 : 0.04;
  const margin = isInterior ? 2 : 1;
  for (let col = margin; col < width - margin; col++) {
    for (let row = margin; row < height - margin; row++) {
      if (rng() < obstacleChance) {
        tiles[col][row] = pickRandom(obstacleTiles, rng);
      }
    }
  }

  // Campfire in camp biome center
  if (biome === 'camp') {
    const cx = Math.floor(width / 2);
    const cy = Math.floor(height / 2);
    tiles[cx][cy] = 'campfire';
  }

  return tiles;
}
