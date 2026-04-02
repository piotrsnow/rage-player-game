import { describe, it, expect } from 'vitest';
import { chunkKey, worldToChunk, chunkToWorld, createDefaultFieldMap, CHUNK_SIZE } from './constants';

describe('chunkKey', () => {
  it('creates a string key from coords', () => {
    expect(chunkKey(0, 0)).toBe('0,0');
    expect(chunkKey(-1, 3)).toBe('-1,3');
  });
});

describe('worldToChunk', () => {
  it('maps world coords to chunk + local coords', () => {
    const result = worldToChunk(32, 32);
    expect(result.cx).toBe(0);
    expect(result.cy).toBe(0);
    expect(result.lx).toBe(32);
    expect(result.ly).toBe(32);
  });

  it('handles negative world coords', () => {
    const result = worldToChunk(-1, -1);
    expect(result.cx).toBe(-1);
    expect(result.cy).toBe(-1);
    expect(result.lx).toBe(CHUNK_SIZE - 1);
    expect(result.ly).toBe(CHUNK_SIZE - 1);
  });

  it('handles chunk boundaries', () => {
    const result = worldToChunk(64, 0);
    expect(result.cx).toBe(1);
    expect(result.lx).toBe(0);
  });
});

describe('chunkToWorld', () => {
  it('converts chunk coords back to world coords', () => {
    const { wx, wy } = chunkToWorld(0, 0, 32, 32);
    expect(wx).toBe(32);
    expect(wy).toBe(32);
  });

  it('is inverse of worldToChunk', () => {
    const wx = 100, wy = -50;
    const { cx, cy, lx, ly } = worldToChunk(wx, wy);
    const back = chunkToWorld(cx, cy, lx, ly);
    expect(back.wx).toBe(wx);
    expect(back.wy).toBe(wy);
  });
});

describe('createDefaultFieldMap', () => {
  it('returns a valid default field map', () => {
    const fm = createDefaultFieldMap();
    expect(fm.seed).toBe(0);
    expect(fm.chunkSize).toBe(CHUNK_SIZE);
    expect(fm.chunks).toEqual({});
    expect(fm.playerPos).toEqual({ x: 32, y: 32 });
    expect(fm.activeBiome).toBe('plains');
    expect(fm.stepCounter).toBe(0);
    expect(fm.stepBuffer).toEqual([]);
    expect(fm.discoveredPoi).toEqual([]);
    expect(fm.interior).toBeNull();
  });
});
