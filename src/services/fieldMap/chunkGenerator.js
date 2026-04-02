import { CHUNK_SIZE, chunkKey } from './constants.js';
import { hashSeed, mulberry32, seededPick } from './prng.js';
import {
  getBiomeGround, getBiomeTrees, getBiomeWater,
  getBiomeBuildings, getBiomeProps, getBiomeMountains,
  getBiomeFarms, getRoadTile,
} from './tileRules.js';

export function generateChunk(seed, cx, cy, biome = 'plains', neighborChunks = {}) {
  const size = CHUNK_SIZE;
  const chunkSeed = hashSeed(seed, cx, cy);
  const rng = mulberry32(chunkSeed);

  const ground = new Array(size * size);
  const objects = new Array(size * size).fill(null);
  const passable = new Array(size * size).fill(true);

  const biomeData = getBiomeGround(biome);
  const trees = getBiomeTrees(biome);
  const waterTile = getBiomeWater(biome);
  const buildings = getBiomeBuildings(biome);
  const props = getBiomeProps(biome);
  const mountains = getBiomeMountains(biome);
  const farms = getBiomeFarms(biome);

  for (let i = 0; i < size * size; i++) {
    ground[i] = seededPick(biomeData.ground, rng);
  }

  for (let i = 0; i < size * size; i++) {
    if (rng() < 0.12) {
      ground[i] = seededPick(biomeData.accent, rng);
    }
  }

  _placeWaterFeatures(objects, passable, size, rng, waterTile);

  if (mountains.length > 0) {
    _placeMountains(objects, passable, size, rng, mountains);
  }

  const treeDensity = biome === 'forest' ? 0.18 : biome === 'mountain' ? 0.06 : 0.08;
  _placeTrees(objects, passable, size, rng, trees, treeDensity);

  _placeRoads(objects, ground, passable, size, rng, cx, cy, seed, neighborChunks);

  if (farms.length > 0 && rng() < 0.3) {
    _placeFarmCluster(objects, passable, size, rng, farms);
  }

  if (rng() < 0.25) {
    _placeVillage(objects, passable, size, rng, buildings, props);
  }

  _scatterProps(objects, passable, size, rng, props);

  const pois = _detectPois(objects, size);

  return {
    key: chunkKey(cx, cy),
    cx,
    cy,
    size,
    biome,
    ground,
    objects,
    passable,
    pois,
  };
}

function _idx(x, y, size) {
  return y * size + x;
}

function _placeWaterFeatures(objects, passable, size, rng, waterTile) {
  const lakeCount = Math.floor(rng() * 3);
  for (let l = 0; l < lakeCount; l++) {
    const cx = 8 + Math.floor(rng() * (size - 16));
    const cy = 8 + Math.floor(rng() * (size - 16));
    const radius = 2 + Math.floor(rng() * 4);
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const dist = dx * dx + dy * dy;
        if (dist <= radius * radius + rng() * radius) {
          const px = cx + dx;
          const py = cy + dy;
          if (px >= 0 && px < size && py >= 0 && py < size) {
            const i = _idx(px, py, size);
            objects[i] = waterTile;
            passable[i] = false;
          }
        }
      }
    }
  }
}

function _placeMountains(objects, passable, size, rng, mountains) {
  const count = 2 + Math.floor(rng() * 5);
  for (let m = 0; m < count; m++) {
    const x = Math.floor(rng() * size);
    const y = Math.floor(rng() * size);
    const i = _idx(x, y, size);
    if (!objects[i]) {
      objects[i] = seededPick(mountains, rng);
      passable[i] = false;
    }
  }
}

function _placeTrees(objects, passable, size, rng, trees, density) {
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = _idx(x, y, size);
      if (!objects[i] && rng() < density) {
        objects[i] = seededPick(trees, rng);
        passable[i] = false;
      }
    }
  }
}

function _placeRoads(objects, ground, passable, size, rng, cx, cy, seed, neighborChunks) {
  const hasHorizontalRoad = (hashSeed(seed, cx, cy * 1000 + 1) % 3) === 0;
  const hasVerticalRoad = (hashSeed(seed, cx * 1000 + 1, cy) % 3) === 0;

  const nSeed = hashSeed(seed, cx, cy - 1);
  const sSeed = hashSeed(seed, cx, cy + 1);
  const wSeed = hashSeed(seed, cx - 1, cy);
  const eSeed = hashSeed(seed, cx + 1, cy);

  const northHasH = (hashSeed(seed, cx, (cy - 1) * 1000 + 1) % 3) === 0;
  const southHasH = (hashSeed(seed, cx, (cy + 1) * 1000 + 1) % 3) === 0;
  const westHasV = (hashSeed(seed, (cx - 1) * 1000 + 1, cy) % 3) === 0;
  const eastHasV = (hashSeed(seed, (cx + 1) * 1000 + 1, cy) % 3) === 0;

  const roadY = Math.floor(size / 2) + (hashSeed(seed, cx, cy * 7) % 5) - 2;
  const roadX = Math.floor(size / 2) + (hashSeed(seed, cx * 7, cy) % 5) - 2;

  if (hasHorizontalRoad) {
    for (let x = 0; x < size; x++) {
      const i = _idx(x, roadY, size);
      objects[i] = 'road_horizontal';
      passable[i] = true;
    }
  }

  if (hasVerticalRoad) {
    for (let y = 0; y < size; y++) {
      const i = _idx(roadX, y, size);
      const existing = objects[i];
      if (existing && existing.startsWith('road_')) {
        objects[i] = 'road_cross';
      } else {
        objects[i] = 'road_vertical';
      }
      passable[i] = true;
    }
  }

  if (hasHorizontalRoad && hasVerticalRoad) {
    const ci = _idx(roadX, roadY, size);
    objects[ci] = 'road_cross';
    passable[ci] = true;
  }
}

function _placeFarmCluster(objects, passable, size, rng, farms) {
  const fx = 10 + Math.floor(rng() * (size - 20));
  const fy = 10 + Math.floor(rng() * (size - 20));
  const count = 2 + Math.floor(rng() * 3);
  for (let f = 0; f < count; f++) {
    const px = fx + Math.floor(rng() * 6) - 3;
    const py = fy + Math.floor(rng() * 6) - 3;
    if (px >= 0 && px < size && py >= 0 && py < size) {
      const i = _idx(px, py, size);
      if (!objects[i]) {
        objects[i] = seededPick(farms, rng);
        passable[i] = true;
      }
    }
  }
}

function _placeVillage(objects, passable, size, rng, buildings, props) {
  const vx = 12 + Math.floor(rng() * (size - 24));
  const vy = 12 + Math.floor(rng() * (size - 24));
  const buildingCount = 2 + Math.floor(rng() * 4);

  for (let b = 0; b < buildingCount; b++) {
    const bx = vx + Math.floor(rng() * 8) - 4;
    const by = vy + Math.floor(rng() * 8) - 4;
    if (bx >= 1 && bx < size - 1 && by >= 1 && by < size - 1) {
      const i = _idx(bx, by, size);
      if (!objects[i]) {
        objects[i] = seededPick(buildings, rng);
        passable[i] = false;
      }
    }
  }

  const propCount = 3 + Math.floor(rng() * 4);
  for (let p = 0; p < propCount; p++) {
    const px = vx + Math.floor(rng() * 12) - 6;
    const py = vy + Math.floor(rng() * 12) - 6;
    if (px >= 0 && px < size && py >= 0 && py < size) {
      const i = _idx(px, py, size);
      if (!objects[i]) {
        objects[i] = seededPick(props, rng);
        passable[i] = true;
      }
    }
  }
}

function _scatterProps(objects, passable, size, rng, props) {
  const count = 4 + Math.floor(rng() * 8);
  for (let p = 0; p < count; p++) {
    const x = Math.floor(rng() * size);
    const y = Math.floor(rng() * size);
    const i = _idx(x, y, size);
    if (!objects[i] && passable[i]) {
      objects[i] = seededPick(props, rng);
    }
  }
}

function _detectPois(objects, size) {
  const pois = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const obj = objects[_idx(x, y, size)];
      if (obj && (obj.startsWith('house_') || obj.startsWith('tower_') ||
          obj.startsWith('fortress_') || obj.startsWith('chapel_') ||
          obj.startsWith('portal_') || obj.startsWith('shrine_') ||
          obj.startsWith('obelisk') || obj.startsWith('city_'))) {
        pois.push({ x, y, tile: obj });
      }
    }
  }
  return pois;
}
