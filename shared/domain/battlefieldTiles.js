/**
 * Structural battlefield tile type definitions.
 * Layer 1: every cell on the 16×9 grid has one of these.
 * Layer 2 (existing TERRAIN_TILES from combatConstants) spawns on top of passable tiles.
 */

export const TILE_TYPES = {
  // ── Ground (passable, no LoS block) ──
  stone_floor:   { id: 'stone_floor',   name: 'Kamienna podłoga',  passable: true,  blocksSight: false, destructible: false, directionalCover: null, color: '#5a5a62', pattern: 'solid',           biomes: ['dungeon', 'cave', 'ruins', 'castle'] },
  grass:         { id: 'grass',         name: 'Trawa',             passable: true,  blocksSight: false, destructible: false, directionalCover: null, color: '#3d6b35', pattern: 'grass_tufts',     biomes: ['forest', 'village', 'field', 'swamp'] },
  dirt:          { id: 'dirt',          name: 'Ziemia',            passable: true,  blocksSight: false, destructible: false, directionalCover: null, color: '#6b5432', pattern: 'dots',            biomes: ['forest', 'field', 'cave', 'village'] },
  sand:          { id: 'sand',          name: 'Piasek',            passable: true,  blocksSight: false, destructible: false, directionalCover: null, color: '#c2a652', pattern: 'dots',            biomes: ['field', 'ruins'] },
  cobblestone:   { id: 'cobblestone',   name: 'Bruk',              passable: true,  blocksSight: false, destructible: false, directionalCover: null, color: '#6e6e76', pattern: 'cobble',          biomes: ['village', 'castle', 'ruins'] },
  wooden_floor:  { id: 'wooden_floor',  name: 'Drewniana podłoga', passable: true,  blocksSight: false, destructible: false, directionalCover: null, color: '#8b6b42', pattern: 'wood_grain',      biomes: ['village', 'castle'] },
  snow:          { id: 'snow',          name: 'Śnieg',             passable: true,  blocksSight: false, destructible: false, directionalCover: null, color: '#d8dde6', pattern: 'snow_dots',       biomes: ['field', 'forest'] },
  mud:           { id: 'mud',           name: 'Błoto',             passable: true,  blocksSight: false, destructible: false, directionalCover: null, color: '#5c4a2e', pattern: 'mud_spots',       biomes: ['swamp', 'forest', 'field'] },
  moss:          { id: 'moss',          name: 'Mech',              passable: true,  blocksSight: false, destructible: false, directionalCover: null, color: '#4a7a3a', pattern: 'dots',            biomes: ['cave', 'swamp', 'ruins'] },
  carpet:        { id: 'carpet',        name: 'Dywan',             passable: true,  blocksSight: false, destructible: false, directionalCover: null, color: '#8a2e40', pattern: 'crosshatch',      biomes: ['castle'] },
  shallow_water: { id: 'shallow_water', name: 'Płytka woda',       passable: true,  blocksSight: false, destructible: false, directionalCover: null, color: '#3a7ca5', pattern: 'waves',           biomes: ['swamp', 'cave', 'forest'] },
  ice:           { id: 'ice',           name: 'Lód',               passable: true,  blocksSight: false, destructible: false, directionalCover: null, color: '#a0c4e8', pattern: 'cracks',          biomes: ['cave'] },
  gravel:        { id: 'gravel',        name: 'Żwir',              passable: true,  blocksSight: false, destructible: false, directionalCover: null, color: '#7a7a7a', pattern: 'dots',            biomes: ['dungeon', 'ruins', 'cave', 'field'] },

  // ── Nature obstacles (impassable, blocks LoS) ──
  tree:          { id: 'tree',          name: 'Drzewo',            passable: false, blocksSight: true,  destructible: false, directionalCover: null, color: '#2d5a1e', pattern: 'vines',           biomes: ['forest', 'swamp', 'field'] },
  dense_bush:    { id: 'dense_bush',    name: 'Gęsty krzak',       passable: false, blocksSight: true,  destructible: false, directionalCover: null, color: '#3a6e28', pattern: 'grass_tufts',     biomes: ['forest', 'swamp', 'village'] },
  rock:          { id: 'rock',          name: 'Skała',             passable: false, blocksSight: true,  destructible: false, directionalCover: null, color: '#5a5a5a', pattern: 'cracks',          biomes: ['cave', 'field', 'forest', 'ruins'] },
  stalagmite:    { id: 'stalagmite',    name: 'Stalaktyt',         passable: false, blocksSight: true,  destructible: false, directionalCover: null, color: '#6e6256', pattern: 'cracks',          biomes: ['cave'] },
  crystal:       { id: 'crystal',       name: 'Kryształ',          passable: false, blocksSight: true,  destructible: false, directionalCover: null, color: '#7b5ea7', pattern: 'crystals',        biomes: ['cave', 'dungeon'] },
  deep_water:    { id: 'deep_water',    name: 'Głęboka woda',      passable: false, blocksSight: false, destructible: false, directionalCover: null, color: '#1e4d6b', pattern: 'waves',           biomes: ['swamp', 'cave'] },
  lava:          { id: 'lava',          name: 'Lawa',              passable: false, blocksSight: false, destructible: false, directionalCover: null, color: '#c44a1a', pattern: 'waves',           biomes: ['cave', 'dungeon'] },

  // ── Built obstacles (impassable, blocks LoS) ──
  stone_wall:    { id: 'stone_wall',    name: 'Kamienna ściana',   passable: false, blocksSight: true,  destructible: false, directionalCover: null, color: '#4a4a52', pattern: 'brick',           biomes: ['dungeon', 'castle', 'ruins'] },
  brick_wall:    { id: 'brick_wall',    name: 'Ceglana ściana',    passable: false, blocksSight: true,  destructible: false, directionalCover: null, color: '#8b5a3a', pattern: 'brick',           biomes: ['village', 'castle'] },
  wooden_wall:   { id: 'wooden_wall',   name: 'Drewniana ściana',  passable: false, blocksSight: true,  destructible: false, directionalCover: null, color: '#7a5a32', pattern: 'wood_grain',      biomes: ['village'] },
  pillar:        { id: 'pillar',        name: 'Filar',             passable: false, blocksSight: true,  destructible: false, directionalCover: null, color: '#8a8a8e', pattern: 'solid',           biomes: ['dungeon', 'castle', 'ruins'] },
  iron_gate:     { id: 'iron_gate',     name: 'Żelazna brama',     passable: false, blocksSight: false, destructible: false, directionalCover: null, color: '#3e3e3e', pattern: 'crosshatch',      biomes: ['dungeon', 'castle'] },

  // ── Destructible (impassable→rubble on destroy, blocks LoS) ──
  crate:         { id: 'crate',         name: 'Skrzynia',          passable: false, blocksSight: true,  destructible: { hp: 2 }, directionalCover: null, pushable: true, color: '#9e7a42', pattern: 'wood_grain',  biomes: ['dungeon', 'village', 'castle'] },
  barrel:        { id: 'barrel',        name: 'Beczka',            passable: false, blocksSight: true,  destructible: { hp: 2 }, directionalCover: null, pushable: true, color: '#7a5e32', pattern: 'wood_grain',  biomes: ['dungeon', 'village', 'castle'] },
  cracked_wall:  { id: 'cracked_wall',  name: 'Pęknięta ściana',   passable: false, blocksSight: true,  destructible: { hp: 4 }, directionalCover: null, color: '#5a5a5a', pattern: 'cracks',     biomes: ['ruins', 'dungeon'] },
  hay_bale:      { id: 'hay_bale',      name: 'Bela siana',        passable: false, blocksSight: true,  destructible: { hp: 1 }, directionalCover: null, color: '#c4a844', pattern: 'diagonal_stripes', biomes: ['village', 'field'] },
  bookshelf:     { id: 'bookshelf',     name: 'Regał z książkami', passable: false, blocksSight: true,  destructible: { hp: 3 }, directionalCover: null, color: '#5e3e22', pattern: 'wood_grain',  biomes: ['castle', 'dungeon'] },
  web:           { id: 'web',           name: 'Pajęczyna',         passable: true,  blocksSight: true,  destructible: { hp: 1 }, directionalCover: null, color: '#c0c0c0', pattern: 'crosshatch',  biomes: ['cave', 'dungeon', 'ruins'] },

  // ── Directional cover (passable, blocks ranged from one side) ──
  fence:           { id: 'fence',           name: 'Płot',            passable: true, blocksSight: false, destructible: false, directionalCover: 'south', color: '#8a6e3e', pattern: 'wood_grain',      biomes: ['village', 'field'] },
  low_wall:        { id: 'low_wall',        name: 'Niski mur',       passable: true, blocksSight: false, destructible: false, directionalCover: 'south', color: '#6a6a6e', pattern: 'brick',           biomes: ['village', 'ruins', 'castle'] },
  sandbags:        { id: 'sandbags',        name: 'Worki z piaskiem', passable: true, blocksSight: false, destructible: false, directionalCover: 'south', color: '#b0a060', pattern: 'diagonal_stripes', biomes: ['village', 'field', 'ruins'] },
  overturned_table:{ id: 'overturned_table',name: 'Przewrócony stół', passable: true, blocksSight: false, destructible: false, directionalCover: 'south', color: '#7a5e3a', pattern: 'wood_grain',     biomes: ['village', 'castle'] },
  market_stall:    { id: 'market_stall',    name: 'Kram targowy',    passable: true, blocksSight: false, destructible: false, directionalCover: 'south', color: '#a08050', pattern: 'diagonal_stripes', biomes: ['village'] },

  // ── Special passable ──
  campfire:  { id: 'campfire',  name: 'Ognisko',   passable: true, blocksSight: false, destructible: false, directionalCover: null, color: '#e07020', pattern: 'solid',      biomes: ['forest', 'field', 'cave'] },
  altar:     { id: 'altar',     name: 'Ołtarz',    passable: true, blocksSight: false, destructible: false, directionalCover: null, color: '#9080a0', pattern: 'solid',      biomes: ['dungeon', 'ruins', 'cave'] },
  well:      { id: 'well',      name: 'Studnia',   passable: true, blocksSight: false, destructible: false, directionalCover: null, color: '#506878', pattern: 'cobble',     biomes: ['village'] },
  door:      { id: 'door',      name: 'Drzwi',     passable: true, blocksSight: false, destructible: false, directionalCover: null, color: '#6a4e2a', pattern: 'wood_grain', biomes: ['dungeon', 'village', 'castle'] },
  stairs:    { id: 'stairs',    name: 'Schody',    passable: true, blocksSight: false, destructible: false, directionalCover: null, color: '#7a7a82', pattern: 'diagonal_stripes', biomes: ['dungeon', 'castle'] },

  // ── Portal (passable exit point — triggers location transition) ──
  portal:    { id: 'portal',    name: 'Przejście', passable: true, blocksSight: false, destructible: false, directionalCover: null, color: '#3a8a9a', pattern: 'waves', biomes: ['dungeon', 'forest', 'village', 'cave', 'field', 'ruins', 'swamp', 'castle'], portal: true },
};

export const ALL_TILE_IDS = Object.keys(TILE_TYPES);

export const BIOME_LIST = ['dungeon', 'forest', 'village', 'cave', 'field', 'ruins', 'swamp', 'castle'];

export const RUBBLE_TILE = 'gravel';

export function getTileDef(tileId) {
  return TILE_TYPES[tileId] || null;
}

export function isTilePassable(tileId) {
  const def = TILE_TYPES[tileId];
  return def ? def.passable : true;
}

export function doesTileBlockSight(tileId) {
  const def = TILE_TYPES[tileId];
  return def ? def.blocksSight : false;
}

export function isDestructible(tileId) {
  const def = TILE_TYPES[tileId];
  return def?.destructible ? true : false;
}

export function getDestructibleHp(tileId) {
  const def = TILE_TYPES[tileId];
  return def?.destructible?.hp ?? 0;
}

export function isPushable(tileId) {
  const def = TILE_TYPES[tileId];
  return def?.pushable === true;
}

export function isPortalTile(tileId) {
  const def = TILE_TYPES[tileId];
  return def?.portal === true;
}

export function tilesForBiome(biome) {
  return Object.values(TILE_TYPES).filter(t => t.biomes.includes(biome));
}

export function passableTilesForBiome(biome) {
  return tilesForBiome(biome).filter(t => t.passable && !t.destructible);
}

export function obstacleTilesForBiome(biome) {
  return tilesForBiome(biome).filter(t => !t.passable);
}
