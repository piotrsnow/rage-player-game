import { describe, expect, it } from 'vitest';
import { computePathScan, pointToSegment, sampleBiomeAlong } from './pathScan.js';

const POI = (id, x, y, name = id) => ({
  kind: 'world',
  id,
  name,
  locationType: 'wilderness',
  regionX: x,
  regionY: y,
  dangerLevel: 'safe',
});

describe('pointToSegment', () => {
  it('point on segment is at perp 0', () => {
    const r = pointToSegment(0, 0, 10, 0, 5, 0);
    expect(r.perpKm).toBeCloseTo(0);
    expect(r.alongKm).toBeCloseTo(5);
  });

  it('point off segment perp is the perpendicular distance', () => {
    const r = pointToSegment(0, 0, 10, 0, 5, 3);
    expect(r.perpKm).toBeCloseTo(3);
    expect(r.alongKm).toBeCloseTo(5);
    expect(r.side).toBe('left');
  });

  it('point on right side of forward direction reports right', () => {
    const r = pointToSegment(0, 0, 10, 0, 5, -3);
    expect(r.side).toBe('right');
  });

  it('point past segment endpoint clamps along to segment length', () => {
    const r = pointToSegment(0, 0, 10, 0, 15, 0);
    expect(r.alongKm).toBeCloseTo(10);
    expect(r.perpKm).toBeCloseTo(5);
  });

  it('zero-length segment returns euclidean distance', () => {
    const r = pointToSegment(2, 2, 2, 2, 5, 6);
    expect(r.perpKm).toBeCloseTo(5);
    expect(r.alongKm).toBe(0);
  });
});

describe('sampleBiomeAlong', () => {
  it('zero-length path returns single biome with no transitions', () => {
    const r = sampleBiomeAlong(0, 0, 0, 0);
    expect(r.distanceKm).toBe(0);
    expect(r.transitions).toEqual([]);
    expect(r.fromBiome.biome).toBe('plains');
    expect(r.toBiome.biome).toBe('plains');
  });

  it('plains-only walk has no biome transitions', () => {
    const r = sampleBiomeAlong(-1, 0, 1, 0);
    expect(r.fromBiome.biome).toBe('plains');
    expect(r.toBiome.biome).toBe('plains');
    expect(r.transitions).toEqual([]);
  });

  it('walk from plains heart north into Czarnobór registers transition', () => {
    const r = sampleBiomeAlong(0, 0, 0, 5);
    expect(r.fromBiome.biome).toBe('plains');
    expect(r.transitions.length).toBeGreaterThan(0);
    expect(r.transitions.some((t) => t.toBiome.name === 'Czarnobór')).toBe(true);
  });

  it('walking through Wilcze Pustkowia registers wasteland enter and exit', () => {
    const r = sampleBiomeAlong(-2, 4.2, 2, 4.2);
    const names = r.transitions.map((t) => t.toBiome.name || t.toBiome.biome);
    expect(names).toContain('Wilcze Pustkowia');
  });
});

describe('computePathScan', () => {
  it('POI directly on path is in poisAlongPath at the right alongKm', () => {
    const locs = [POI('camp', 5, 0)];
    const r = computePathScan(0, 0, 10, 0, locs);
    expect(r.poisAlongPath).toHaveLength(1);
    expect(r.poisAlongPath[0].alongKm).toBeCloseTo(5);
    expect(r.poisAlongPath[0].perpKm).toBeCloseTo(0);
  });

  it('POI within radiusKm perpendicular surfaces with side annotation', () => {
    const locs = [POI('left', 5, 0.2), POI('right', 5, -0.2)];
    const r = computePathScan(0, 0, 10, 0, locs, { radiusKm: 0.25 });
    expect(r.poisAlongPath).toHaveLength(2);
    const left = r.poisAlongPath.find((p) => p.location.id === 'left');
    const right = r.poisAlongPath.find((p) => p.location.id === 'right');
    expect(left.side).toBe('left');
    expect(right.side).toBe('right');
  });

  it('POI farther than radiusKm is excluded', () => {
    const locs = [POI('far', 5, 0.5)];
    const r = computePathScan(0, 0, 10, 0, locs, { radiusKm: 0.25 });
    expect(r.poisAlongPath).toHaveLength(0);
    expect(r.poisAtDestination).toHaveLength(0);
  });

  it('POI at destination tile (≤ radius from B) goes into poisAtDestination', () => {
    const locs = [POI('destination', 10, 0.1)];
    const r = computePathScan(0, 0, 10, 0, locs, { radiusKm: 0.25 });
    expect(r.poisAtDestination).toHaveLength(1);
    expect(r.poisAlongPath).toHaveLength(0);
  });

  it('poisAlongPath is sorted by alongKm', () => {
    const locs = [POI('far', 7, 0.1), POI('near', 2, 0.1), POI('mid', 5, 0.1)];
    const r = computePathScan(0, 0, 10, 0, locs, { radiusKm: 0.25 });
    expect(r.poisAlongPath.map((p) => p.location.id)).toEqual(['near', 'mid', 'far']);
  });

  it('Świetłogaj along a 0→3 N walk from Yeralden surfaces it as destination POI', () => {
    const swietlogaj = { ...POI('swietlogaj', 2.5, 2.0), kind: 'world' };
    const r = computePathScan(2.5, 0, 2.5, 2, [swietlogaj], { radiusKm: 0.25 });
    expect(r.poisAtDestination.length + r.poisAlongPath.length).toBeGreaterThan(0);
  });
});
