import { describe, it, expect } from 'vitest';
import {
  euclidean,
  sectorFromAnchor,
  rawPosition,
  enforceSectorSpacing,
  findMergeCandidate,
  computeNewPosition,
  DISTANCE_UNITS,
  MIN_SECTOR_SPACING,
  MAX_SINGLE_JUMP,
  MERGE_RADIUS,
} from './positionCalculator.js';

const loc = (x, y, extra = {}) => ({ regionX: x, regionY: y, ...extra });

describe('euclidean', () => {
  it('computes plain 2D distance', () => {
    expect(euclidean(loc(0, 0), loc(3, 4))).toBe(5);
    expect(euclidean(loc(5, 5), loc(5, 5))).toBe(0);
  });
});

describe('sectorFromAnchor', () => {
  const anchor = loc(0, 0);
  it.each([
    [loc(5, 0),    'E'],
    [loc(5, 5),    'NE'],
    [loc(0, 5),    'N'],
    [loc(-5, 5),   'NW'],
    [loc(-5, 0),   'W'],
    [loc(-5, -5),  'SW'],
    [loc(0, -5),   'S'],
    [loc(5, -5),   'SE'],
  ])('point %o → sector %s', (point, expected) => {
    expect(sectorFromAnchor(anchor, point)).toBe(expected);
  });

  it('returns null when points coincide', () => {
    expect(sectorFromAnchor(anchor, loc(0, 0))).toBeNull();
  });
});

describe('rawPosition', () => {
  const current = loc(0, 0);

  it('computes straight east for E/short (1 km)', () => {
    const p = rawPosition({ current, directionFromCurrent: 'E', travelDistance: 'short' });
    expect(p.regionX).toBeCloseTo(1);
    expect(p.regionY).toBeCloseTo(0);
  });

  it('applies 0.707 diagonal for NE/half_day (2 km)', () => {
    const p = rawPosition({ current, directionFromCurrent: 'NE', travelDistance: 'half_day' });
    expect(p.regionX).toBeCloseTo(1.414);
    expect(p.regionY).toBeCloseTo(1.414);
  });

  it('clamps at MAX_SINGLE_JUMP for multi_day', () => {
    const p = rawPosition({ current, directionFromCurrent: 'E', travelDistance: 'multi_day' });
    expect(p.regionX).toBeCloseTo(MAX_SINGLE_JUMP);
  });

  it('returns null for invalid direction', () => {
    expect(rawPosition({ current, directionFromCurrent: 'NNE', travelDistance: 'short' })).toBeNull();
  });

  it('returns null for invalid distance', () => {
    expect(rawPosition({ current, directionFromCurrent: 'E', travelDistance: 'eternity' })).toBeNull();
  });
});

describe('enforceSectorSpacing', () => {
  const current = loc(0, 0);

  it('no existing in sector → raw unchanged', () => {
    const raw = loc(4, 1);
    const adjusted = enforceSectorSpacing({ current, raw, direction: 'E', existing: [] });
    expect(adjusted).toEqual(raw);
  });

  it('raw in fresh direction passes even when other sectors occupied', () => {
    const raw = loc(4, 0);
    const adjusted = enforceSectorSpacing({
      current,
      raw,
      direction: 'E',
      existing: [loc(0, 5), loc(-5, 0)], // N and W — E is clear
    });
    expect(adjusted).toEqual(raw);
  });

  it('pushes raw past farthest in same sector (user spec example)', () => {
    // Capital (0,0); existing town at (4,1) on E sector; new raw placed at (5,1)
    // → must push to ≥ (7,1) because farthest-in-sector is (4,1) and 5-4 < 3.
    const raw = loc(5, 1);
    const adjusted = enforceSectorSpacing({
      current,
      raw,
      direction: 'E',
      existing: [loc(4, 1)],
    });
    // After push: farthest (4,1) + vec_E * 3 = (7, 1)
    expect(adjusted.regionX).toBeCloseTo(7);
    expect(adjusted.regionY).toBeCloseTo(1);
  });

  it('ignores existing in a different sector', () => {
    const raw = loc(4, 0);
    const adjusted = enforceSectorSpacing({
      current,
      raw,
      direction: 'E',
      existing: [loc(0, 4)], // N sector — doesn't count for E spacing
    });
    expect(adjusted).toEqual(raw);
  });

  it('preserves raw when spacing already satisfied', () => {
    const raw = loc(8, 0);
    const adjusted = enforceSectorSpacing({
      current,
      raw,
      direction: 'E',
      existing: [loc(4, 0)], // 4 km apart from raw — fine (≥3)
    });
    expect(adjusted).toEqual(raw);
  });
});

describe('findMergeCandidate', () => {
  it('returns location inside MERGE_RADIUS', () => {
    const result = findMergeCandidate({
      raw: loc(4, 0),
      existing: [loc(4.5, 0)], // 0.5 km away
    });
    expect(result).not.toBeNull();
    expect(result.distance).toBeCloseTo(0.5);
  });

  it('returns null when nothing within radius', () => {
    const result = findMergeCandidate({
      raw: loc(4, 0),
      existing: [loc(8, 0)],
    });
    expect(result).toBeNull();
  });

  it('handles empty existing', () => {
    expect(findMergeCandidate({ raw: loc(4, 0), existing: [] })).toBeNull();
  });

  it('picks closest among multiple inside radius', () => {
    const near = loc(4.2, 0);
    const result = findMergeCandidate({
      raw: loc(4, 0),
      existing: [near, loc(4.8, 0)],
    });
    expect(result.location).toBe(near);
  });
});

describe('computeNewPosition — integration', () => {
  it('user-spec example: capital (0,0) + E/day → (3,0)', () => {
    const result = computeNewPosition({
      current: loc(0, 0),
      directionFromCurrent: 'E',
      travelDistance: 'day', // 3 km
      existing: [],
    });
    expect(result.position.regionX).toBeCloseTo(3);
    expect(result.position.regionY).toBeCloseTo(0);
    expect(result.mergeCandidate).toBeNull();
  });

  it('user-spec example: second E town after first town at (4,1) must land ≥(7,1)', () => {
    const result = computeNewPosition({
      current: loc(4, 1), // current = existing town
      directionFromCurrent: 'E',
      travelDistance: 'short', // 1 km raw → (5,1)
      existing: [loc(4, 1), loc(0, 0)], // capital + current town
    });
    // 5-4 < 3 → push to (7,1)
    expect(result.position.regionX).toBeCloseTo(7);
    expect(result.position.regionY).toBeCloseTo(1);
  });

  it('detects merge candidate when spacing lands near existing', () => {
    const result = computeNewPosition({
      current: loc(0, 0),
      directionFromCurrent: 'E',
      travelDistance: 'day', // raw (3,0)
      existing: [loc(3.3, 0)], // within merge radius of raw+spaced
    });
    expect(result.mergeCandidate).not.toBeNull();
  });

  it('returns null for bad inputs', () => {
    expect(computeNewPosition({
      current: loc(0, 0),
      directionFromCurrent: 'ZZZ',
      travelDistance: 'short',
      existing: [],
    })).toBeNull();
  });
});
