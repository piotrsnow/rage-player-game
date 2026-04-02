import { describe, it, expect } from 'vitest';
import { findPath } from './pathfinding';
import { CHUNK_SIZE, chunkKey } from './constants';

function makeChunk(cx, cy, blocked = []) {
  const size = CHUNK_SIZE;
  const passable = new Array(size * size).fill(true);
  for (const [x, y] of blocked) {
    passable[y * size + x] = false;
  }
  return {
    key: chunkKey(cx, cy),
    cx, cy, size,
    ground: new Array(size * size).fill('ground_pebbles_light'),
    objects: new Array(size * size).fill(null),
    passable,
  };
}

describe('findPath', () => {
  it('returns empty array for same start and end', () => {
    const chunks = { [chunkKey(0, 0)]: makeChunk(0, 0) };
    const path = findPath(5, 5, 5, 5, chunks);
    expect(path).toEqual([]);
  });

  it('finds a straight horizontal path', () => {
    const chunks = { [chunkKey(0, 0)]: makeChunk(0, 0) };
    const path = findPath(0, 0, 5, 0, chunks);
    expect(path).not.toBeNull();
    expect(path.length).toBe(5);
    expect(path[path.length - 1]).toEqual({ x: 5, y: 0 });
  });

  it('finds a straight vertical path', () => {
    const chunks = { [chunkKey(0, 0)]: makeChunk(0, 0) };
    const path = findPath(3, 0, 3, 4, chunks);
    expect(path).not.toBeNull();
    expect(path.length).toBe(4);
    expect(path[path.length - 1]).toEqual({ x: 3, y: 4 });
  });

  it('navigates around obstacles', () => {
    const blocked = [[2, 0], [2, 1], [2, 2]];
    const chunks = { [chunkKey(0, 0)]: makeChunk(0, 0, blocked) };
    const path = findPath(0, 1, 4, 1, chunks);
    expect(path).not.toBeNull();
    expect(path.length).toBeGreaterThan(4);
    for (const step of path) {
      expect(blocked.some(([bx, by]) => step.x === bx && step.y === by)).toBe(false);
    }
  });

  it('returns null when destination is blocked', () => {
    const blocked = [[5, 5]];
    const chunks = { [chunkKey(0, 0)]: makeChunk(0, 0, blocked) };
    const path = findPath(0, 0, 5, 5, chunks);
    expect(path).toBeNull();
  });

  it('returns null when path is completely blocked', () => {
    const blocked = [];
    for (let y = 0; y < CHUNK_SIZE; y++) blocked.push([3, y]);
    const chunks = { [chunkKey(0, 0)]: makeChunk(0, 0, blocked) };
    const path = findPath(0, 0, 5, 0, chunks);
    expect(path).toBeNull();
  });

  it('respects maxSteps limit', () => {
    const chunks = { [chunkKey(0, 0)]: makeChunk(0, 0) };
    const path = findPath(0, 0, 50, 50, chunks, 10);
    expect(path).toBeNull();
  });
});
