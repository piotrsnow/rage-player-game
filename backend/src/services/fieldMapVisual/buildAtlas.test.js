import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { buildAtlas } from './buildAtlas.js';

async function solidPng(w, h, r, g, b) {
  return sharp({
    create: { width: w, height: h, channels: 4, background: { r, g, b, alpha: 1 } },
  }).png().toBuffer();
}

describe('buildAtlas', () => {
  it('lays out 1×1 tiles with sequential localIds', async () => {
    const baseTilePx = 32;
    const assets = [
      { id: 'a', footprint: { w: 1, h: 1 } },
      { id: 'b', footprint: { w: 1, h: 1 } },
      { id: 'c', footprint: { w: 1, h: 1 } },
    ];
    const buffers = new Map([
      ['a', await solidPng(baseTilePx, baseTilePx, 200, 0, 0)],
      ['b', await solidPng(baseTilePx, baseTilePx, 0, 200, 0)],
      ['c', await solidPng(baseTilePx, baseTilePx, 0, 0, 200)],
    ]);

    const out = await buildAtlas({ assets, buffers, baseTilePx });
    expect(out.nativeTilesize).toBe(baseTilePx);
    expect(out.tiles).toHaveLength(3);
    expect(out.palette.a).toEqual(expect.objectContaining({ w: 1, h: 1 }));
    expect(out.palette.b.localId).not.toBe(out.palette.a.localId);
    // localIds should be unique
    const ids = new Set(Object.values(out.palette).map((p) => p.localId));
    expect(ids.size).toBe(3);
    expect(out.width).toBeGreaterThanOrEqual(baseTilePx);
    expect(out.height).toBeGreaterThanOrEqual(baseTilePx);
  });

  it('places a 2×2 stamp in a single contiguous block', async () => {
    const baseTilePx = 16;
    const assets = [
      { id: 'tile', footprint: { w: 1, h: 1 } },
      { id: 'house', footprint: { w: 2, h: 2 } },
    ];
    const buffers = new Map([
      ['tile', await solidPng(baseTilePx, baseTilePx, 80, 80, 80)],
      ['house', await solidPng(baseTilePx * 2, baseTilePx * 2, 150, 100, 50)],
    ]);

    const out = await buildAtlas({ assets, buffers, baseTilePx });
    expect(out.palette.house.w).toBe(2);
    expect(out.palette.house.h).toBe(2);
    // The 2×2 stamp goes first (sorted by area) so it sits at row=0.
    expect(out.palette.house.row).toBe(0);
  });

  it('rejects when no assets provided', async () => {
    await expect(buildAtlas({ assets: [], buffers: new Map(), baseTilePx: 32 }))
      .rejects.toThrow(/no assets/i);
  });

  it('throws if a buffer is missing for an asset', async () => {
    const assets = [{ id: 'x', footprint: { w: 1, h: 1 } }];
    await expect(buildAtlas({ assets, buffers: new Map(), baseTilePx: 32 }))
      .rejects.toThrow(/missing buffer/i);
  });
});
