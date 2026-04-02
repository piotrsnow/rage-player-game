import { CHUNK_SIZE, CHUNK_SIZE_INTERIOR, chunkKey } from './constants.js';
import { hashSeed, mulberry32, seededPick } from './prng.js';
import {
  getBiomeGround, getBiomeTrees, getBiomeWater,
  getBiomeBuildings, getBiomeProps, getBiomeMountains,
  getBiomeFarms, getRoadTile, getWallTile,
  getMapModeProfile, getInteriorFloor, getInteriorFloorAccent,
  getInteriorProps, getCityProps,
  getLandmarks, getBreadcrumbs,
} from './tileRules.js';

export function generateChunk(seed, cx, cy, biome = 'plains', neighborChunks = {}, mapMode = null, roadVariant = null) {
  const profile = mapMode ? getMapModeProfile(mapMode, roadVariant) : null;
  const effectiveBiome = profile ? profile.biome : biome;

  if (profile?.interior) {
    return _generateInteriorChunk(seed, cx, cy, profile);
  }

  const size = CHUNK_SIZE;
  const chunkSeed = hashSeed(seed, cx, cy);
  const rng = mulberry32(chunkSeed);

  const ground = new Array(size * size);
  const objects = new Array(size * size).fill(null);
  const passable = new Array(size * size).fill(true);

  const biomeData = getBiomeGround(effectiveBiome);
  const trees = getBiomeTrees(effectiveBiome);
  const waterTile = getBiomeWater(effectiveBiome);
  const buildings = getBiomeBuildings(effectiveBiome);
  const props = profile?.cityTiles ? getCityProps() : getBiomeProps(effectiveBiome);
  const mountains = getBiomeMountains(effectiveBiome);
  const farms = getBiomeFarms(effectiveBiome);

  const groundVariants = biomeData.ground;
  const accentVariants = biomeData.accent;
  for (let i = 0; i < size * size; i++) {
    const wx = cx * size + (i % size);
    const wy = cy * size + Math.floor(i / size);
    const tileHash = hashSeed(seed, wx, wy) >>> 0;
    ground[i] = groundVariants[tileHash % groundVariants.length];
    if ((tileHash >>> 8) % 8 === 0 && accentVariants.length > 0) {
      ground[i] = accentVariants[(tileHash >>> 12) % accentVariants.length];
    }
  }

  const pWater = profile ? profile.waterChance : 0.3;
  if (rng() < pWater) {
    _placeWaterFeatures(objects, passable, size, rng, waterTile);
  }

  const pMountain = profile ? profile.mountainChance : (mountains.length > 0 ? 0.5 : 0);
  if (mountains.length > 0 && rng() < pMountain) {
    _placeMountains(objects, passable, size, rng, mountains);
  }

  const treeDensity = profile ? profile.treeDensity : (effectiveBiome === 'forest' ? 0.18 : effectiveBiome === 'mountain' ? 0.06 : 0.08);
  _placeTrees(objects, passable, size, rng, trees, treeDensity);

  const pRoad = profile ? profile.roadChance : 0.33;
  if (mapMode === 'trakt') {
    _placeCentralRoad(objects, ground, passable, size, rng, cx, cy, seed, profile);
  } else if (rng() < pRoad) {
    _placeRoads(objects, ground, passable, size, rng, cx, cy, seed, neighborChunks);
  }

  const pFarm = profile ? profile.farmChance : 0.3;
  if (farms.length > 0 && rng() < pFarm) {
    _placeFarmCluster(objects, passable, size, rng, farms);
  }

  const pBuilding = profile ? profile.buildingChance : 0.25;
  if (rng() < pBuilding) {
    if (profile?.cityTiles) {
      _placeCityBlock(objects, passable, size, rng, buildings, props);
    } else {
      _placeVillage(objects, passable, size, rng, buildings, props);
    }
  }

  const propCount = profile ? profile.propDensity : 6;
  _scatterProps(objects, passable, size, rng, props, propCount);

  _placeLandmark(objects, passable, size, rng, cx, cy, seed);
  if (mapMode === 'trakt' || pRoad > 0.5) {
    _placeBreadcrumbs(objects, passable, size, rng);
  }

  const pois = _detectPois(objects, size);

  return {
    key: chunkKey(cx, cy),
    cx,
    cy,
    size,
    biome: effectiveBiome,
    mapMode: mapMode || null,
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

function _scatterProps(objects, passable, size, rng, props, count = null) {
  const n = count != null ? count : 4 + Math.floor(rng() * 8);
  for (let p = 0; p < n; p++) {
    const x = Math.floor(rng() * size);
    const y = Math.floor(rng() * size);
    const i = _idx(x, y, size);
    if (!objects[i] && passable[i]) {
      objects[i] = seededPick(props, rng);
    }
  }
}

function _placeLandmark(objects, passable, size, rng, cx, cy, seed) {
  const landmarks = getLandmarks();
  if (landmarks.length === 0) return;
  const chunkHash = hashSeed(seed, cx * 31, cy * 37) >>> 0;
  const tile = landmarks[chunkHash % landmarks.length];
  const quadrant = chunkHash % 4;
  const halfSize = Math.floor(size / 2);

  const baseX = (quadrant % 2 === 0) ? Math.floor(halfSize * 0.3) : Math.floor(halfSize * 1.3);
  const baseY = (quadrant < 2) ? Math.floor(halfSize * 0.3) : Math.floor(halfSize * 1.3);
  const lx = Math.max(2, Math.min(size - 3, baseX + (chunkHash >> 4) % 5 - 2));
  const ly = Math.max(2, Math.min(size - 3, baseY + (chunkHash >> 8) % 5 - 2));

  const i = _idx(lx, ly, size);
  if (!objects[i]) {
    objects[i] = tile;
    passable[i] = false;
  }
}

function _placeBreadcrumbs(objects, passable, size, rng) {
  const breadcrumbs = getBreadcrumbs();
  if (breadcrumbs.length === 0) return;
  const count = 2 + Math.floor(rng() * 3);
  for (let b = 0; b < count; b++) {
    const bx = Math.floor(rng() * size);
    const by = Math.floor(rng() * size);
    const i = _idx(bx, by, size);
    if (!objects[i] && passable[i]) {
      objects[i] = seededPick(breadcrumbs, rng);
    }
  }
}

function _placeCentralRoad(objects, ground, passable, size, rng, cx, cy, seed, profile) {
  const roadY = Math.floor(size / 2) + (hashSeed(seed, cx, cy * 7) % 3) - 1;
  const width = profile?.cityTiles ? 3 : 2;
  const halfW = Math.floor(width / 2);

  for (let x = 0; x < size; x++) {
    for (let dy = -halfW; dy <= halfW; dy++) {
      const ry = roadY + dy;
      if (ry >= 0 && ry < size) {
        const i = _idx(x, ry, size);
        objects[i] = 'road_horizontal';
        passable[i] = true;
      }
    }
  }

  if (profile?.cityTiles && rng() < 0.4) {
    const roadX = Math.floor(size / 2) + (hashSeed(seed, cx * 7, cy) % 5) - 2;
    for (let y = 0; y < size; y++) {
      const i = _idx(roadX, y, size);
      const existing = objects[i];
      objects[i] = existing && existing.startsWith('road_') ? 'road_cross' : 'road_vertical';
      passable[i] = true;
    }
  }
}

function _placeCityBlock(objects, passable, size, rng, buildings, props) {
  const roadY = Math.floor(size / 2);
  const zones = [
    { yStart: 2, yEnd: roadY - 3 },
    { yStart: roadY + 3, yEnd: size - 3 },
  ];

  for (const zone of zones) {
    const buildingCount = 3 + Math.floor(rng() * 5);
    for (let b = 0; b < buildingCount; b++) {
      const bx = 2 + Math.floor(rng() * (size - 4));
      const by = zone.yStart + Math.floor(rng() * (zone.yEnd - zone.yStart));
      if (bx >= 1 && bx < size - 1 && by >= 1 && by < size - 1) {
        const i = _idx(bx, by, size);
        if (!objects[i]) {
          objects[i] = seededPick(buildings, rng);
          passable[i] = false;
        }
      }
    }
  }

  const propCount = 6 + Math.floor(rng() * 6);
  for (let p = 0; p < propCount; p++) {
    const px = Math.floor(rng() * size);
    const py = Math.floor(rng() * size);
    const i = _idx(px, py, size);
    if (!objects[i] && passable[i]) {
      objects[i] = seededPick(props, rng);
    }
  }
}

function _generateInteriorChunk(seed, cx, cy, profile) {
  const size = CHUNK_SIZE_INTERIOR;
  const chunkSeed = hashSeed(seed, cx, cy);
  const rng = mulberry32(chunkSeed);

  const ground = new Array(size * size);
  const objects = new Array(size * size).fill(null);
  const passable = new Array(size * size).fill(false);

  const floors = getInteriorFloor();
  const accents = getInteriorFloorAccent();
  const interiorProps = getInteriorProps();

  for (let i = 0; i < size * size; i++) {
    ground[i] = 'ground_bricks_dark';
  }

  const rooms = _bspSplit(1, 1, size - 2, size - 2, 3, rng);

  for (const room of rooms) {
    for (let y = room.y; y < room.y + room.h; y++) {
      for (let x = room.x; x < room.x + room.w; x++) {
        const i = _idx(x, y, size);
        ground[i] = seededPick(floors, rng);
        passable[i] = true;
        if (rng() < 0.08) {
          ground[i] = seededPick(accents, rng);
        }
      }
    }

    const wallVariants = ['wall_top', 'wall_vertical'];
    for (let x = room.x - 1; x <= room.x + room.w; x++) {
      for (const wy of [room.y - 1, room.y + room.h]) {
        if (wy >= 0 && wy < size && x >= 0 && x < size) {
          const i = _idx(x, wy, size);
          if (!passable[i]) {
            objects[i] = seededPick(wallVariants, rng);
          }
        }
      }
    }
    for (let y = room.y; y < room.y + room.h; y++) {
      for (const wx of [room.x - 1, room.x + room.w]) {
        if (wx >= 0 && wx < size && y >= 0 && y < size) {
          const i = _idx(wx, y, size);
          if (!passable[i]) {
            objects[i] = 'wall_vertical';
          }
        }
      }
    }

    const propCount = 1 + Math.floor(rng() * Math.min(room.w, room.h));
    for (let p = 0; p < propCount; p++) {
      const px = room.x + Math.floor(rng() * room.w);
      const py = room.y + Math.floor(rng() * room.h);
      const i = _idx(px, py, size);
      if (passable[i] && !objects[i]) {
        objects[i] = seededPick(interiorProps, rng);
      }
    }
  }

  for (let r = 0; r < rooms.length - 1; r++) {
    _carveCorridor(rooms[r], rooms[r + 1], ground, objects, passable, size, rng, floors);
  }
  if (rooms.length > 2) {
    _carveCorridor(rooms[rooms.length - 1], rooms[0], ground, objects, passable, size, rng, floors);
  }

  _ensureConnectivity(rooms, ground, objects, passable, size, rng, floors);

  if (rooms.length > 0) {
    const doorRoom = rooms[Math.floor(rng() * rooms.length)];
    const dx = doorRoom.x + Math.floor(doorRoom.w / 2);
    const dy = doorRoom.y - 1;
    if (dy >= 0 && dx < size) {
      const i = _idx(dx, dy, size);
      objects[i] = 'door_boarded';
      passable[i] = true;
      ground[i] = seededPick(floors, rng);
    }
  }

  const pois = _detectPois(objects, size);

  return {
    key: chunkKey(cx, cy),
    cx,
    cy,
    size,
    biome: profile.biome,
    mapMode: 'wnetrze',
    ground,
    objects,
    passable,
    pois,
  };
}

function _bspSplit(x, y, w, h, depth, rng) {
  const MIN_ROOM = 4;
  if (depth <= 0 || w < MIN_ROOM * 2 + 1 || h < MIN_ROOM * 2 + 1) {
    const rw = MIN_ROOM + Math.floor(rng() * Math.max(1, w - MIN_ROOM));
    const rh = MIN_ROOM + Math.floor(rng() * Math.max(1, h - MIN_ROOM));
    const rx = x + Math.floor(rng() * Math.max(1, w - rw));
    const ry = y + Math.floor(rng() * Math.max(1, h - rh));
    return [{ x: rx, y: ry, w: rw, h: rh }];
  }

  const splitH = w > h ? false : h > w ? true : rng() < 0.5;
  if (splitH) {
    const split = MIN_ROOM + 1 + Math.floor(rng() * (h - MIN_ROOM * 2 - 1));
    return [
      ..._bspSplit(x, y, w, split, depth - 1, rng),
      ..._bspSplit(x, y + split + 1, w, h - split - 1, depth - 1, rng),
    ];
  }
  const split = MIN_ROOM + 1 + Math.floor(rng() * (w - MIN_ROOM * 2 - 1));
  return [
    ..._bspSplit(x, y, split, h, depth - 1, rng),
    ..._bspSplit(x + split + 1, y, w - split - 1, h, depth - 1, rng),
  ];
}

function _carveCorridor(a, b, ground, objects, passable, size, rng, floors) {
  let ax = Math.floor(a.x + a.w / 2);
  let ay = Math.floor(a.y + a.h / 2);
  const bx = Math.floor(b.x + b.w / 2);
  const by = Math.floor(b.y + b.h / 2);

  const horizontalFirst = rng() < 0.5;
  if (horizontalFirst) {
    _carveH(ax, bx, ay, ground, objects, passable, size, floors);
    _carveV(ay, by, bx, ground, objects, passable, size, floors);
  } else {
    _carveV(ay, by, ax, ground, objects, passable, size, floors);
    _carveH(ax, bx, by, ground, objects, passable, size, floors);
  }
}

function _carveH(x1, x2, y, ground, objects, passable, size, floors) {
  const start = Math.min(x1, x2);
  const end = Math.max(x1, x2);
  for (let x = start; x <= end; x++) {
    if (x >= 0 && x < size && y >= 0 && y < size) {
      const i = _idx(x, y, size);
      ground[i] = floors[i % floors.length];
      objects[i] = null;
      passable[i] = true;
    }
  }
}

function _carveV(y1, y2, x, ground, objects, passable, size, floors) {
  const start = Math.min(y1, y2);
  const end = Math.max(y1, y2);
  for (let y = start; y <= end; y++) {
    if (x >= 0 && x < size && y >= 0 && y < size) {
      const i = _idx(x, y, size);
      ground[i] = floors[i % floors.length];
      objects[i] = null;
      passable[i] = true;
    }
  }
}

function _ensureConnectivity(rooms, ground, objects, passable, size, rng, floors) {
  if (rooms.length < 2) return;
  for (let r = 0; r < rooms.length; r++) {
    const room = rooms[r];
    const cx = Math.floor(room.x + room.w / 2);
    const cy = Math.floor(room.y + room.h / 2);
    if (cx >= 0 && cx < size && cy >= 0 && cy < size && !passable[_idx(cx, cy, size)]) {
      const i = _idx(cx, cy, size);
      ground[i] = floors[0];
      objects[i] = null;
      passable[i] = true;
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
          obj.startsWith('obelisk') || obj.startsWith('city_') ||
          obj === 'door_boarded' || obj.startsWith('campfire_'))) {
        pois.push({ x, y, tile: obj });
      }
    }
  }
  return pois;
}
