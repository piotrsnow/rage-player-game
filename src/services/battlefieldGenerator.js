/**
 * Procedural battlefield generation — 8 biome-themed generators.
 * Returns a string[][] grid (indexed [col][row]) of tile type IDs.
 *
 * All generators guarantee:
 * (a) Spawn zones at left (cols 0-1) and right (cols W-2..W-1) edges are passable floor
 * (b) A valid path exists between the two spawn zones (BFS verification, retry on failure)
 * (c) No more than ~35% impassable cells
 */

import {
  TILE_TYPES,
  isTilePassable,
  isPushable,
  passableTilesForBiome,
  obstacleTilesForBiome,
  getDestructibleHp,
} from '../../shared/domain/battlefieldTiles.js';

const W = 16;
const H = 9;
const MAX_IMPASSABLE_RATIO = 0.35;
const MAX_RETRIES = 12;
const SPAWN_COLS = 2;

function emptyGrid(fillTile) {
  const grid = [];
  for (let x = 0; x < W; x++) {
    grid[x] = [];
    for (let y = 0; y < H; y++) grid[x][y] = fillTile;
  }
  return grid;
}

function rand(max) { return Math.floor(Math.random() * max); }
function pick(arr) { return arr[rand(arr.length)]; }
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = rand(i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

function clearSpawnZones(grid, floorTile) {
  for (let x = 0; x < SPAWN_COLS; x++)
    for (let y = 0; y < H; y++) grid[x][y] = floorTile;
  for (let x = W - SPAWN_COLS; x < W; x++)
    for (let y = 0; y < H; y++) grid[x][y] = floorTile;
}

function countImpassable(grid) {
  let n = 0;
  for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) if (!isTilePassable(grid[x][y])) n++;
  return n;
}

function bfsConnected(grid) {
  const start = { x: 0, y: Math.floor(H / 2) };
  const goal = { x: W - 1, y: Math.floor(H / 2) };
  const visited = new Set();
  const queue = [start];
  visited.add(`${start.x}:${start.y}`);
  while (queue.length > 0) {
    const { x, y } = queue.shift();
    if (x === goal.x && y === goal.y) return true;
    for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
      const key = `${nx}:${ny}`;
      if (visited.has(key)) continue;
      if (!isTilePassable(grid[nx][ny])) continue;
      visited.add(key);
      queue.push({ x: nx, y: ny });
    }
  }
  return false;
}

function validate(grid) {
  const ratio = countImpassable(grid) / (W * H);
  if (ratio > MAX_IMPASSABLE_RATIO) return false;
  return bfsConnected(grid);
}

function initDestructibleHp(grid) {
  const hp = {};
  for (let x = 0; x < W; x++) {
    for (let y = 0; y < H; y++) {
      const tileHp = getDestructibleHp(grid[x][y]);
      if (tileHp > 0) hp[`${x}:${y}`] = tileHp;
    }
  }
  return hp;
}

function initPushesLeft(grid) {
  const pushes = {};
  for (let x = 0; x < W; x++) {
    for (let y = 0; y < H; y++) {
      if (isPushable(grid[x][y])) {
        pushes[`${x}:${y}`] = 1 + Math.floor(Math.random() * 8);
      }
    }
  }
  return pushes;
}

function pickFloor(biome) {
  const floors = passableTilesForBiome(biome).filter(t => !t.directionalCover);
  return floors.length > 0 ? floors[0].id : 'grass';
}

function pickFloors(biome) {
  return passableTilesForBiome(biome).filter(t => !t.directionalCover).map(t => t.id);
}

function pickObstacles(biome) {
  return obstacleTilesForBiome(biome).map(t => t.id);
}

// ── Biome generators ──

function genDungeon() {
  const floor = 'stone_floor';
  const grid = emptyGrid('stone_wall');

  // BSP: 2-3 rooms
  const rooms = [];
  const roomCount = 2 + rand(2);
  const minW = 4, maxW = 6, minH = 3, maxH = 5;

  for (let i = 0; i < roomCount * 10 && rooms.length < roomCount; i++) {
    const rw = minW + rand(maxW - minW + 1);
    const rh = minH + rand(maxH - minH + 1);
    const rx = SPAWN_COLS + rand(W - SPAWN_COLS * 2 - rw);
    const ry = 1 + rand(H - 2 - rh);
    const overlap = rooms.some(r =>
      rx < r.x + r.w + 1 && rx + rw > r.x - 1 && ry < r.y + r.h + 1 && ry + rh > r.y - 1
    );
    if (!overlap) rooms.push({ x: rx, y: ry, w: rw, h: rh });
  }

  for (const r of rooms) {
    for (let x = r.x; x < r.x + r.w; x++)
      for (let y = r.y; y < r.y + r.h; y++) grid[x][y] = floor;
  }

  // Connect rooms with corridors
  for (let i = 1; i < rooms.length; i++) {
    const a = rooms[i - 1], b = rooms[i];
    const ax = a.x + Math.floor(a.w / 2), ay = a.y + Math.floor(a.h / 2);
    const bx = b.x + Math.floor(b.w / 2), by = b.y + Math.floor(b.h / 2);
    let cx = ax, cy = ay;
    while (cx !== bx) { grid[cx][cy] = floor; cx += cx < bx ? 1 : -1; }
    while (cy !== by) { grid[cx][cy] = floor; cy += cy < by ? 1 : -1; }
    grid[cx][cy] = floor;
    // Place door at corridor entrance
    grid[ax][ay] = rand(3) === 0 ? 'door' : floor;
  }

  // Scatter props
  const props = shuffle(['crate', 'barrel', 'pillar', 'bookshelf']);
  let placed = 0;
  for (let i = 0; i < 60 && placed < 5; i++) {
    const x = SPAWN_COLS + rand(W - SPAWN_COLS * 2);
    const y = rand(H);
    if (grid[x][y] === floor && rand(4) === 0) {
      grid[x][y] = props[placed % props.length];
      placed++;
    }
  }

  clearSpawnZones(grid, floor);
  return grid;
}

function genForest() {
  const floors = ['grass', 'dirt', 'moss'];
  const grid = emptyGrid('grass');

  // Random floor variety
  for (let x = 0; x < W; x++)
    for (let y = 0; y < H; y++) if (rand(5) === 0) grid[x][y] = pick(floors);

  // Tree clusters via noise-like grouping
  const clusterCount = 3 + rand(3);
  for (let c = 0; c < clusterCount; c++) {
    const cx = SPAWN_COLS + 1 + rand(W - SPAWN_COLS * 2 - 2);
    const cy = 1 + rand(H - 2);
    const radius = 1 + rand(2);
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < SPAWN_COLS || nx >= W - SPAWN_COLS || ny < 0 || ny >= H) continue;
        if (Math.abs(dx) + Math.abs(dy) > radius + 1) continue;
        if (rand(3) > 0) grid[nx][ny] = rand(4) === 0 ? 'dense_bush' : 'tree';
      }
    }
  }

  // Scatter rocks
  for (let i = 0; i < 3; i++) {
    const x = SPAWN_COLS + rand(W - SPAWN_COLS * 2);
    const y = rand(H);
    if (isTilePassable(grid[x][y])) grid[x][y] = 'rock';
  }

  clearSpawnZones(grid, 'grass');
  return grid;
}

function genVillage() {
  const grid = emptyGrid('grass');

  // 1-2 buildings
  const bCount = 1 + rand(2);
  const buildings = [];
  for (let b = 0; b < bCount; b++) {
    const bw = 3 + rand(3);
    const bh = 3 + rand(2);
    const bx = SPAWN_COLS + 1 + rand(W - SPAWN_COLS * 2 - bw - 2);
    const by = 1 + rand(H - bh - 2);
    buildings.push({ x: bx, y: by, w: bw, h: bh });

    for (let x = bx; x < bx + bw; x++) {
      for (let y = by; y < by + bh; y++) {
        if (x === bx || x === bx + bw - 1 || y === by || y === by + bh - 1) {
          grid[x][y] = 'wooden_wall';
        } else {
          grid[x][y] = 'wooden_floor';
        }
      }
    }
    // Door on a random wall
    const doorSide = rand(4);
    if (doorSide === 0) grid[bx + Math.floor(bw / 2)][by] = 'door';
    else if (doorSide === 1) grid[bx + Math.floor(bw / 2)][by + bh - 1] = 'door';
    else if (doorSide === 2) grid[bx][by + Math.floor(bh / 2)] = 'door';
    else grid[bx + bw - 1][by + Math.floor(bh / 2)] = 'door';
  }

  // Cobblestone road
  const roadY = Math.floor(H / 2);
  for (let x = 0; x < W; x++) {
    if (grid[x][roadY] === 'grass') grid[x][roadY] = 'cobblestone';
    if (grid[x][roadY - 1] === 'grass' && rand(2) === 0) grid[x][roadY - 1] = 'cobblestone';
  }

  // Scatter village props
  const props = shuffle(['fence', 'market_stall', 'well', 'hay_bale', 'overturned_table']);
  let placed = 0;
  for (let i = 0; i < 40 && placed < 4; i++) {
    const x = SPAWN_COLS + rand(W - SPAWN_COLS * 2);
    const y = rand(H);
    if (grid[x][y] === 'grass') {
      grid[x][y] = props[placed % props.length];
      placed++;
    }
  }

  clearSpawnZones(grid, 'grass');
  return grid;
}

function genCave() {
  const grid = emptyGrid('rock');

  // Cellular automata
  let cells = [];
  for (let x = 0; x < W; x++) {
    cells[x] = [];
    for (let y = 0; y < H; y++) cells[x][y] = Math.random() < 0.55;
  }

  for (let iter = 0; iter < 4; iter++) {
    const next = [];
    for (let x = 0; x < W; x++) {
      next[x] = [];
      for (let y = 0; y < H; y++) {
        let walls = 0;
        for (let dx = -1; dx <= 1; dx++) {
          for (let dy = -1; dy <= 1; dy++) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || nx >= W || ny < 0 || ny >= H) { walls++; continue; }
            if (!cells[nx][ny]) walls++;
          }
        }
        next[x][y] = walls < 4;
      }
    }
    cells = next;
  }

  const caveFloors = ['stone_floor', 'moss', 'gravel'];
  for (let x = 0; x < W; x++) {
    for (let y = 0; y < H; y++) {
      if (cells[x][y]) {
        grid[x][y] = pick(caveFloors);
      } else {
        grid[x][y] = rand(6) === 0 ? 'stalagmite' : 'rock';
      }
    }
  }

  // Water pools
  for (let p = 0; p < 2; p++) {
    const px = 3 + rand(W - 6);
    const py = 1 + rand(H - 2);
    if (isTilePassable(grid[px][py])) grid[px][py] = 'shallow_water';
    if (rand(2) === 0 && isTilePassable(grid[px + 1]?.[py])) grid[px + 1][py] = 'deep_water';
  }

  // Crystals
  for (let i = 0; i < 2; i++) {
    const x = SPAWN_COLS + rand(W - SPAWN_COLS * 2);
    const y = rand(H);
    if (grid[x][y] === 'rock') grid[x][y] = 'crystal';
  }

  clearSpawnZones(grid, 'stone_floor');
  return grid;
}

function genField() {
  const floors = ['grass', 'dirt', 'grass', 'grass'];
  const grid = emptyGrid('grass');

  for (let x = 0; x < W; x++)
    for (let y = 0; y < H; y++) if (rand(4) === 0) grid[x][y] = pick(floors);

  // Scatter light obstacles
  const obstacles = ['rock', 'dense_bush', 'fence', 'hay_bale'];
  let placed = 0;
  for (let i = 0; i < 40 && placed < 6; i++) {
    const x = SPAWN_COLS + rand(W - SPAWN_COLS * 2);
    const y = rand(H);
    if (grid[x][y] === 'grass' || grid[x][y] === 'dirt') {
      grid[x][y] = pick(obstacles);
      placed++;
    }
  }

  clearSpawnZones(grid, 'grass');
  return grid;
}

function genRuins() {
  const grid = emptyGrid('gravel');
  const floors = ['gravel', 'stone_floor', 'dirt'];

  for (let x = 0; x < W; x++)
    for (let y = 0; y < H; y++) grid[x][y] = pick(floors);

  // Partial walls
  const wallSegments = 4 + rand(4);
  for (let s = 0; s < wallSegments; s++) {
    const x = SPAWN_COLS + rand(W - SPAWN_COLS * 2);
    const y = rand(H);
    const horiz = rand(2) === 0;
    const len = 2 + rand(3);
    for (let i = 0; i < len; i++) {
      const wx = horiz ? x + i : x;
      const wy = horiz ? y : y + i;
      if (wx >= SPAWN_COLS && wx < W - SPAWN_COLS && wy >= 0 && wy < H) {
        grid[wx][wy] = rand(3) === 0 ? 'cracked_wall' : 'stone_wall';
      }
    }
  }

  // Scatter pillars and rubble
  for (let i = 0; i < 4; i++) {
    const x = SPAWN_COLS + rand(W - SPAWN_COLS * 2);
    const y = rand(H);
    if (isTilePassable(grid[x][y])) grid[x][y] = rand(2) === 0 ? 'pillar' : 'rock';
  }

  clearSpawnZones(grid, 'stone_floor');
  return grid;
}

function genSwamp() {
  const grid = emptyGrid('mud');
  const floors = ['mud', 'shallow_water', 'moss', 'grass'];

  for (let x = 0; x < W; x++)
    for (let y = 0; y < H; y++) grid[x][y] = pick(floors);

  // Deep water pools
  const poolCount = 2 + rand(2);
  for (let p = 0; p < poolCount; p++) {
    const px = SPAWN_COLS + 1 + rand(W - SPAWN_COLS * 2 - 2);
    const py = 1 + rand(H - 2);
    const r = 1 + rand(2);
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        const nx = px + dx, ny = py + dy;
        if (nx < SPAWN_COLS || nx >= W - SPAWN_COLS || ny < 0 || ny >= H) continue;
        if (Math.abs(dx) + Math.abs(dy) > r + 1) continue;
        grid[nx][ny] = rand(3) === 0 ? 'deep_water' : 'shallow_water';
      }
    }
  }

  // Tree islands
  for (let i = 0; i < 4; i++) {
    const x = SPAWN_COLS + rand(W - SPAWN_COLS * 2);
    const y = rand(H);
    if (grid[x][y] !== 'deep_water') grid[x][y] = 'tree';
  }

  clearSpawnZones(grid, 'mud');
  return grid;
}

function genCastle() {
  const grid = emptyGrid('stone_floor');

  // Main room walls
  const wallY1 = 1, wallY2 = H - 2;
  const wallX1 = 3, wallX2 = W - 4;
  for (let x = wallX1; x <= wallX2; x++) {
    grid[x][wallY1] = 'stone_wall';
    grid[x][wallY2] = 'stone_wall';
  }
  for (let y = wallY1; y <= wallY2; y++) {
    grid[wallX1][y] = 'stone_wall';
    grid[wallX2][y] = 'stone_wall';
  }
  // Interior floor
  for (let x = wallX1 + 1; x < wallX2; x++)
    for (let y = wallY1 + 1; y < wallY2; y++)
      grid[x][y] = rand(4) === 0 ? 'carpet' : 'stone_floor';

  // Doors
  grid[wallX1][Math.floor(H / 2)] = 'door';
  grid[wallX2][Math.floor(H / 2)] = 'door';
  if (rand(2) === 0) grid[Math.floor((wallX1 + wallX2) / 2)][wallY1] = 'door';

  // Interior props
  const props = shuffle(['pillar', 'bookshelf', 'iron_gate', 'stairs', 'altar']);
  let placed = 0;
  for (let i = 0; i < 30 && placed < 4; i++) {
    const x = wallX1 + 1 + rand(wallX2 - wallX1 - 2);
    const y = wallY1 + 1 + rand(wallY2 - wallY1 - 2);
    if (isTilePassable(grid[x][y])) {
      grid[x][y] = props[placed % props.length];
      placed++;
    }
  }

  clearSpawnZones(grid, 'stone_floor');
  return grid;
}

const GENERATORS = {
  dungeon: genDungeon,
  forest: genForest,
  village: genVillage,
  cave: genCave,
  field: genField,
  ruins: genRuins,
  swamp: genSwamp,
  castle: genCastle,
};

/**
 * Generate a battlefield grid for the given biome.
 * Returns { battlefield: string[][], destructibleHp: Record<string,number> }.
 */
export function generateBattlefield(biome = 'field') {
  const gen = GENERATORS[biome] || GENERATORS.field;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const grid = gen();
    if (validate(grid)) {
      return { battlefield: grid, destructibleHp: initDestructibleHp(grid), pushesLeft: initPushesLeft(grid) };
    }
  }

  // Fallback: safe field
  const grid = emptyGrid('grass');
  clearSpawnZones(grid, 'grass');
  return { battlefield: grid, destructibleHp: {}, pushesLeft: {} };
}
