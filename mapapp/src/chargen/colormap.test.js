// Unit tests for colormap.js — buildPalette interpolation, sampleSwatch,
// packedRgbaToCss. (loadCm depends on fetch and is not unit-tested here.)

import { describe, it, expect, beforeEach } from 'vitest';
import {
  buildPalette,
  sampleSwatch,
  packedRgbaToCss,
  clearColormapCache,
} from './colormap.js';

function packRgba(r, g, b, a) {
  return (((r & 0xff) << 24) | ((g & 0xff) << 16) | ((b & 0xff) << 8) | (a & 0xff)) >>> 0;
}

function makeCm(id, itemsObj) {
  const items = new Map();
  for (const [k, v] of Object.entries(itemsObj)) items.set(k, v);
  return { id, name: id, items };
}

beforeEach(() => {
  clearColormapCache();
});

describe('buildPalette', () => {
  it('returns an all-zero Uint32Array when the item is missing', () => {
    const cm = makeCm('skin', {});
    const pal = buildPalette(cm, 'pink');
    expect(pal).toBeInstanceOf(Uint32Array);
    expect(pal).toHaveLength(256);
    for (let i = 0; i < 256; i++) expect(pal[i]).toBe(0);
  });

  it('returns zero palette when the item has empty colors', () => {
    const cm = makeCm('skin', { pink: { color: 0, colors: [] } });
    const pal = buildPalette(cm, 'pink');
    expect(pal[0]).toBe(0);
    expect(pal[255]).toBe(0);
  });

  it('clamps indices below the first pair to the first color', () => {
    const first = packRgba(10, 20, 30, 255);
    const last = packRgba(100, 200, 250, 255);
    const cm = makeCm('skin', {
      pink: { color: 0, colors: [[10, first], [20, last]] },
    });
    const pal = buildPalette(cm, 'pink');
    // Indices 0..9 should all equal `first` (clamped left of first pair).
    for (let i = 0; i < 10; i++) expect(pal[i]).toBe(first);
  });

  it('clamps indices above the last pair to the last color', () => {
    const first = packRgba(10, 20, 30, 255);
    const last = packRgba(100, 200, 250, 255);
    const cm = makeCm('skin', {
      pink: { color: 0, colors: [[10, first], [20, last]] },
    });
    const pal = buildPalette(cm, 'pink');
    for (let i = 21; i < 256; i++) expect(pal[i]).toBe(last);
  });

  it('places the exact end colours at the pair indices', () => {
    const a = packRgba(0, 0, 0, 255);
    const b = packRgba(255, 255, 255, 255);
    const cm = makeCm('skin', {
      pink: { color: 0, colors: [[50, a], [150, b]] },
    });
    const pal = buildPalette(cm, 'pink');
    expect(pal[50]).toBe(a);
    expect(pal[150]).toBe(b);
  });

  it('linearly interpolates between two pairs', () => {
    const a = packRgba(0, 0, 0, 255);
    const b = packRgba(100, 200, 250, 255);
    const cm = makeCm('skin', {
      pink: { color: 0, colors: [[0, a], [100, b]] },
    });
    const pal = buildPalette(cm, 'pink');
    const mid = pal[50];
    const r = (mid >>> 24) & 0xff;
    const g = (mid >>> 16) & 0xff;
    const bCh = (mid >>> 8) & 0xff;
    expect(r).toBeCloseTo(50, -0.5);
    expect(g).toBeCloseTo(100, -0.5);
    expect(bCh).toBeCloseTo(125, -0.5);
  });

  it('caches palettes per (cm.id, colorId)', () => {
    const cm = makeCm('skin', {
      pink: { color: 0, colors: [[0, packRgba(1, 2, 3, 255)]] },
    });
    const pal1 = buildPalette(cm, 'pink');
    const pal2 = buildPalette(cm, 'pink');
    expect(pal1).toBe(pal2);
  });

  it('clearColormapCache invalidates cached palettes', () => {
    const cm = makeCm('skin', {
      pink: { color: 0, colors: [[0, packRgba(1, 2, 3, 255)]] },
    });
    const pal1 = buildPalette(cm, 'pink');
    clearColormapCache();
    const pal2 = buildPalette(cm, 'pink');
    expect(pal1).not.toBe(pal2);
  });

  it('handles single-pair palettes without crashing', () => {
    const only = packRgba(5, 6, 7, 255);
    const cm = makeCm('skin', {
      pink: { color: 0, colors: [[100, only]] },
    });
    const pal = buildPalette(cm, 'pink');
    // Left clamp (pre-first-pair) and right clamp (post-last-pair) both
    // use `only`. The exact index 100 is only filled when there are two
    // pairs to interpolate between — single-pair palettes leave it 0.
    expect(pal[0]).toBe(only);
    expect(pal[99]).toBe(only);
    expect(pal[101]).toBe(only);
    expect(pal[255]).toBe(only);
  });
});

describe('sampleSwatch', () => {
  it('returns 0 for empty / null palettes', () => {
    expect(sampleSwatch(null)).toBe(0);
    expect(sampleSwatch(new Uint32Array(0))).toBe(0);
  });

  it('returns the middle entry when it has non-zero alpha', () => {
    const pal = new Uint32Array(256);
    pal[128] = packRgba(10, 20, 30, 255);
    expect(sampleSwatch(pal)).toBe(pal[128]);
  });

  it('walks outward from the centre when pal[128] is transparent', () => {
    const pal = new Uint32Array(256);
    pal[130] = packRgba(200, 200, 200, 255);
    expect(sampleSwatch(pal)).toBe(pal[130]);
  });

  it('returns 0 when no entry has a non-zero alpha', () => {
    const pal = new Uint32Array(256);
    expect(sampleSwatch(pal)).toBe(0);
  });
});

describe('packedRgbaToCss', () => {
  it('formats RGB components and normalises alpha to 0..1', () => {
    const rgba = packRgba(255, 128, 64, 128);
    expect(packedRgbaToCss(rgba)).toBe('rgba(255,128,64,0.5019607843137255)');
  });

  it('handles fully opaque and fully transparent values', () => {
    expect(packedRgbaToCss(packRgba(0, 0, 0, 255))).toBe('rgba(0,0,0,1)');
    expect(packedRgbaToCss(packRgba(255, 255, 255, 0))).toBe('rgba(255,255,255,0)');
  });
});
