import { describe, it, expect } from 'vitest';
import { generateBattlefield } from './battlefieldGenerator.js';
import { isTilePassable, BIOME_LIST } from '../../shared/domain/battlefieldTiles.js';

const W = 16;
const H = 9;

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

describe('battlefieldGenerator', () => {
  for (const biome of BIOME_LIST) {
    it(`generates a valid ${biome} battlefield`, () => {
      const { battlefield, destructibleHp } = generateBattlefield(biome);
      expect(battlefield).toBeDefined();
      expect(battlefield.length).toBe(W);
      expect(battlefield[0].length).toBe(H);

      // All cells have a tile ID
      for (let x = 0; x < W; x++) {
        for (let y = 0; y < H; y++) {
          expect(typeof battlefield[x][y]).toBe('string');
        }
      }

      // Spawn zones are passable
      for (let x = 0; x < 2; x++) {
        for (let y = 0; y < H; y++) {
          expect(isTilePassable(battlefield[x][y])).toBe(true);
        }
      }
      for (let x = W - 2; x < W; x++) {
        for (let y = 0; y < H; y++) {
          expect(isTilePassable(battlefield[x][y])).toBe(true);
        }
      }

      // Path exists between spawn zones
      expect(bfsConnected(battlefield)).toBe(true);

      // Impassable ratio ≤ 35%
      let impassable = 0;
      for (let x = 0; x < W; x++) {
        for (let y = 0; y < H; y++) {
          if (!isTilePassable(battlefield[x][y])) impassable++;
        }
      }
      expect(impassable / (W * H)).toBeLessThanOrEqual(0.35);

      // destructibleHp is a valid object
      expect(typeof destructibleHp).toBe('object');
    });
  }

  it('defaults to field for unknown biome', () => {
    const { battlefield } = generateBattlefield('unknown_biome');
    expect(battlefield).toBeDefined();
    expect(battlefield.length).toBe(W);
  });
});
