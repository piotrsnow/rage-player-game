import { describe, expect, it } from 'vitest';
import { BIOME_REGIONS, biomeLabel, getBiomeForCoords } from './biomeMap.js';

describe('getBiomeForCoords', () => {
  it('capital at origin is plains (no overlay covers (0,0))', () => {
    const r = getBiomeForCoords(0, 0);
    expect(r.biome).toBe('plains');
  });

  it('Świetłogaj (2.5, 2.0) lands in Czarnobór forest', () => {
    const r = getBiomeForCoords(2.5, 2.0);
    expect(r.biome).toBe('forest');
    expect(r.name).toBe('Czarnobór');
  });

  it('Smocze Zapadlisko (-4.5, -4.5) lands in mountains (SW pocket)', () => {
    const r = getBiomeForCoords(-4.5, -4.5);
    expect(r.biome).toBe('mountains');
  });

  it('Szeptające Trzęsawiska (4.0, -3.0) lands in named swamp', () => {
    const r = getBiomeForCoords(4.0, -3.0);
    expect(r.biome).toBe('swamp');
    expect(r.name).toBe('Szeptające Trzęsawiska');
  });

  it('Wilcze Pustkowia (0.5, 4.2) lands in named wasteland island (overlay wins over forest)', () => {
    const r = getBiomeForCoords(0.5, 4.2);
    expect(r.biome).toBe('wasteland');
    expect(r.name).toBe('Wilcze Pustkowia');
  });

  it('point just outside Wilcze ellipse stays in surrounding forest', () => {
    const r = getBiomeForCoords(2.5, 4.2); // 2.0 east of cx, well outside rx=1.4
    expect(r.biome).toBe('forest');
  });

  it('Słoneczne Łany (-3.0, -0.8) lands in plains (heart farmland)', () => {
    const r = getBiomeForCoords(-3.0, -0.8);
    expect(r.biome).toBe('plains');
  });

  it('Zapadły Szyb (-3.6, 1.4) lands in hills bridge between mountains and forest', () => {
    const r = getBiomeForCoords(-3.6, 1.4);
    expect(r.biome).toBe('hills');
  });

  it('Krypta Ferathonitów (3.4, -4.2) lands in swamp', () => {
    const r = getBiomeForCoords(3.4, -4.2);
    expect(r.biome).toBe('swamp');
  });

  it('far-west edge (-10, 0) is mountains', () => {
    const r = getBiomeForCoords(-10, 0);
    expect(r.biome).toBe('mountains');
  });

  it('far-north edge (0, 10) is wasteland strip', () => {
    const r = getBiomeForCoords(0, 10);
    expect(r.biome).toBe('wasteland');
  });

  it('far-south edge (0, -10) is wasteland strip', () => {
    const r = getBiomeForCoords(0, -10);
    expect(r.biome).toBe('wasteland');
  });

  it('point well outside the world falls through to plains background', () => {
    const r = getBiomeForCoords(50, 50);
    expect(r.biome).toBe('plains');
  });

  it('quarter-tile resolution: (2.25, 1.75) and (2.75, 2.25) both land in Czarnobór', () => {
    expect(getBiomeForCoords(2.25, 1.75).name).toBe('Czarnobór');
    expect(getBiomeForCoords(2.75, 2.25).name).toBe('Czarnobór');
  });
});

describe('biomeLabel', () => {
  it('uses custom name when present', () => {
    const region = BIOME_REGIONS.find((r) => r.name === 'Czarnobór');
    expect(biomeLabel(region)).toBe('Czarnobór');
  });

  it('falls back to biome enum when no name', () => {
    const region = BIOME_REGIONS.find((r) => r.biome === 'mountains' && !r.name);
    expect(biomeLabel(region)).toBe('mountains');
  });
});
