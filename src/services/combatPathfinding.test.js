import { describe, it, expect, vi, beforeAll } from 'vitest';
import { findPath, getReachableCells, isCellPassableOnBattlefield } from './combatEngine.js';

// Mock gameData before import
vi.mock('./gameDataService', () => ({
  gameData: {
    BATTLEFIELD_WIDTH: 16,
    BATTLEFIELD_HEIGHT: 9,
    MELEE_RANGE: 1,
    DEFAULT_MOVEMENT: 8,
    terrainTiles: {},
    terrainSpawnConfig: { minCount: 5, maxCount: 8, spawnMarginCols: 4 },
    manoeuvres: {},
    getWeaponData: () => null,
  },
}));

const W = 16, H = 9;

function emptyGrid(fill = 'grass') {
  const grid = [];
  for (let x = 0; x < W; x++) {
    grid[x] = [];
    for (let y = 0; y < H; y++) grid[x][y] = fill;
  }
  return grid;
}

describe('isCellPassableOnBattlefield', () => {
  it('returns true for passable tiles', () => {
    const grid = emptyGrid();
    expect(isCellPassableOnBattlefield(grid, {}, 0, 0)).toBe(true);
  });

  it('returns false for impassable tiles', () => {
    const grid = emptyGrid();
    grid[5][5] = 'stone_wall';
    expect(isCellPassableOnBattlefield(grid, {}, 5, 5)).toBe(false);
  });

  it('returns true for destroyed destructible', () => {
    const grid = emptyGrid();
    grid[3][3] = 'crate';
    expect(isCellPassableOnBattlefield(grid, { '3:3': 0 }, 3, 3)).toBe(true);
  });

  it('returns true when no battlefield', () => {
    expect(isCellPassableOnBattlefield(null, {}, 5, 5)).toBe(true);
  });
});

describe('findPath', () => {
  it('finds a direct path on open grid', () => {
    const grid = emptyGrid();
    const path = findPath(grid, {}, { x: 0, y: 4 }, { x: 5, y: 4 }, new Set());
    expect(path).not.toBeNull();
    expect(path[0]).toEqual({ x: 0, y: 4 });
    expect(path[path.length - 1]).toEqual({ x: 5, y: 4 });
    expect(path.length).toBe(6); // 0→5 = 5 steps + start
  });

  it('routes around a wall', () => {
    const grid = emptyGrid();
    // Place a wall across the path
    for (let y = 0; y < H; y++) grid[5][y] = 'stone_wall';
    // Leave a gap
    grid[5][0] = 'grass';

    const path = findPath(grid, {}, { x: 3, y: 4 }, { x: 7, y: 4 }, new Set());
    expect(path).not.toBeNull();
    expect(path[path.length - 1]).toEqual({ x: 7, y: 4 });
    // Path should not go through column 5 (except row 0)
    for (const cell of path) {
      if (cell.x === 5) expect(cell.y).toBe(0);
    }
  });

  it('returns null when completely blocked', () => {
    const grid = emptyGrid();
    for (let y = 0; y < H; y++) grid[5][y] = 'stone_wall';
    const path = findPath(grid, {}, { x: 0, y: 4 }, { x: 10, y: 4 }, new Set());
    expect(path).toBeNull();
  });

  it('avoids occupied cells', () => {
    const grid = emptyGrid();
    const occupied = new Set(['2:4', '3:4', '4:4']);
    const path = findPath(grid, {}, { x: 0, y: 4 }, { x: 5, y: 4 }, occupied);
    expect(path).not.toBeNull();
    for (const cell of path) {
      if (cell.x >= 2 && cell.x <= 4) expect(cell.y).not.toBe(4);
    }
  });
});

describe('getReachableCells', () => {
  it('returns all cells within range on open grid', () => {
    const grid = emptyGrid();
    const reachable = getReachableCells(grid, {}, { x: 8, y: 4 }, 2, new Set());
    expect(reachable.has('8:4')).toBe(true);
    expect(reachable.has('9:4')).toBe(true);
    expect(reachable.has('10:4')).toBe(true);
    expect(reachable.has('11:4')).toBe(false); // out of range
  });

  it('does not include cells behind walls', () => {
    const grid = emptyGrid();
    for (let y = 0; y < H; y++) grid[9][y] = 'stone_wall';
    const reachable = getReachableCells(grid, {}, { x: 8, y: 4 }, 3, new Set());
    expect(reachable.has('10:4')).toBe(false);
  });
});
