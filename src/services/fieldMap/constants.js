export const CHUNK_SIZE = 64;
export const CHUNK_SIZE_INTERIOR = 24;
export const VIEWPORT_RADIUS = 12;
export const STEPS_PER_TURN = 15;
export const CHUNK_CACHE_LIMIT = 128;
export const PREFETCH_EDGE_DISTANCE = 8;
export const TILE_PX = 16;

export function createDefaultFieldMap() {
  return {
    seed: 0,
    chunkSize: CHUNK_SIZE,
    chunks: {},
    playerPos: { x: 32, y: 32 },
    activeBiome: 'plains',
    stepCounter: 0,
    stepBuffer: [],
    discoveredPoi: [],
    interior: null,
  };
}

export function chunkKey(cx, cy) {
  return `${cx},${cy}`;
}

export function worldToChunk(wx, wy, chunkSize = CHUNK_SIZE) {
  return {
    cx: Math.floor(wx / chunkSize),
    cy: Math.floor(wy / chunkSize),
    lx: ((wx % chunkSize) + chunkSize) % chunkSize,
    ly: ((wy % chunkSize) + chunkSize) % chunkSize,
  };
}

export function chunkToWorld(cx, cy, lx, ly, chunkSize = CHUNK_SIZE) {
  return {
    wx: cx * chunkSize + lx,
    wy: cy * chunkSize + ly,
  };
}
