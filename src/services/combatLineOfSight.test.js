import { describe, it, expect } from 'vitest';
import { hasLineOfSight, isBlockedByDirectionalCover, checkRangedPath } from './combatLineOfSight.js';

const W = 16, H = 9;

function emptyGrid(fill = 'grass') {
  const grid = [];
  for (let x = 0; x < W; x++) {
    grid[x] = [];
    for (let y = 0; y < H; y++) grid[x][y] = fill;
  }
  return grid;
}

describe('hasLineOfSight', () => {
  it('returns true on an open field', () => {
    const grid = emptyGrid();
    expect(hasLineOfSight(grid, {}, { x: 0, y: 4 }, { x: 15, y: 4 })).toBe(true);
  });

  it('returns false when a wall blocks the line', () => {
    const grid = emptyGrid();
    grid[7][4] = 'stone_wall';
    expect(hasLineOfSight(grid, {}, { x: 0, y: 4 }, { x: 15, y: 4 })).toBe(false);
  });

  it('returns true when a destroyed destructible is in the way', () => {
    const grid = emptyGrid();
    grid[7][4] = 'crate';
    const hp = { '7:4': 0 };
    expect(hasLineOfSight(grid, hp, { x: 0, y: 4 }, { x: 15, y: 4 })).toBe(true);
  });

  it('returns false when a non-destroyed destructible blocks', () => {
    const grid = emptyGrid();
    grid[7][4] = 'crate';
    const hp = { '7:4': 2 };
    expect(hasLineOfSight(grid, hp, { x: 0, y: 4 }, { x: 15, y: 4 })).toBe(false);
  });

  it('deep_water does not block sight', () => {
    const grid = emptyGrid();
    grid[7][4] = 'deep_water';
    expect(hasLineOfSight(grid, {}, { x: 0, y: 4 }, { x: 15, y: 4 })).toBe(true);
  });

  it('returns true when no battlefield exists', () => {
    expect(hasLineOfSight(null, {}, { x: 0, y: 0 }, { x: 15, y: 8 })).toBe(true);
  });
});

describe('isBlockedByDirectionalCover', () => {
  it('south cover blocks attack from below', () => {
    const grid = emptyGrid();
    grid[5][5] = 'fence'; // directionalCover: 'south'
    expect(isBlockedByDirectionalCover(grid, { x: 5, y: 8 }, { x: 5, y: 5 })).toBe(true);
  });

  it('south cover does not block attack from above', () => {
    const grid = emptyGrid();
    grid[5][5] = 'fence';
    expect(isBlockedByDirectionalCover(grid, { x: 5, y: 0 }, { x: 5, y: 5 })).toBe(false);
  });
});

describe('checkRangedPath', () => {
  it('returns clear for open field', () => {
    const grid = emptyGrid();
    const result = checkRangedPath(grid, {}, { x: 0, y: 4 }, { x: 10, y: 4 });
    expect(result.clear).toBe(true);
  });

  it('returns blocked_by_obstacle when wall is in the way', () => {
    const grid = emptyGrid();
    grid[5][4] = 'stone_wall';
    const result = checkRangedPath(grid, {}, { x: 0, y: 4 }, { x: 10, y: 4 });
    expect(result.clear).toBe(false);
    expect(result.reason).toBe('blocked_by_obstacle');
  });
});
