import { describe, it, expect } from 'vitest';
import {
  unpackWorldBounds,
  packWorldBounds,
  liftCurrentLocationFromCoreState,
  injectCurrentLocationIntoCoreState,
} from './locationRefs.js';

describe('unpackWorldBounds', () => {
  it('returns null for missing campaign', () => {
    expect(unpackWorldBounds(null)).toBeNull();
    expect(unpackWorldBounds(undefined)).toBeNull();
  });

  it('returns null when any bound column is missing', () => {
    expect(unpackWorldBounds({ boundsMinX: -10, boundsMaxX: 10, boundsMinY: -10 })).toBeNull();
    expect(unpackWorldBounds({ boundsMinX: -10, boundsMaxX: null, boundsMinY: -10, boundsMaxY: 10 })).toBeNull();
  });

  it('returns the legacy shape when all four columns are set', () => {
    const out = unpackWorldBounds({ boundsMinX: -8, boundsMaxX: 8, boundsMinY: -6, boundsMaxY: 6 });
    expect(out).toEqual({ minX: -8, maxX: 8, minY: -6, maxY: 6 });
  });

  it('treats 0 as a valid coordinate (not falsy)', () => {
    const out = unpackWorldBounds({ boundsMinX: 0, boundsMaxX: 10, boundsMinY: 0, boundsMaxY: 10 });
    expect(out).toEqual({ minX: 0, maxX: 10, minY: 0, maxY: 10 });
  });
});

describe('packWorldBounds', () => {
  it('returns 4 nulls for missing input', () => {
    expect(packWorldBounds(null)).toEqual({
      boundsMinX: null, boundsMaxX: null, boundsMinY: null, boundsMaxY: null,
    });
    expect(packWorldBounds(undefined)).toEqual({
      boundsMinX: null, boundsMaxX: null, boundsMinY: null, boundsMaxY: null,
    });
  });

  it('round-trips with unpack', () => {
    const packed = packWorldBounds({ minX: -5, maxX: 5, minY: -3, maxY: 3 });
    expect(packed).toEqual({ boundsMinX: -5, boundsMaxX: 5, boundsMinY: -3, boundsMaxY: 3 });
    expect(unpackWorldBounds(packed)).toEqual({ minX: -5, maxX: 5, minY: -3, maxY: 3 });
  });

  it('clears partial bounds to null per column', () => {
    const packed = packWorldBounds({ minX: -5, maxX: 'oops', minY: null, maxY: 3 });
    expect(packed).toEqual({ boundsMinX: -5, boundsMaxX: null, boundsMinY: null, boundsMaxY: 3 });
  });
});

describe('liftCurrentLocationFromCoreState', () => {
  it('returns the input unchanged when not an object', () => {
    expect(liftCurrentLocationFromCoreState(null)).toEqual({ slim: null, currentLocationName: null });
    expect(liftCurrentLocationFromCoreState('x')).toEqual({ slim: 'x', currentLocationName: null });
  });

  it('returns null name when world.currentLocation is missing', () => {
    const out = liftCurrentLocationFromCoreState({ world: { weather: 'clear' } });
    expect(out.currentLocationName).toBeNull();
    expect(out.slim).toEqual({ world: { weather: 'clear' } });
  });

  it('strips world.currentLocation and returns the trimmed name', () => {
    const input = { world: { currentLocation: 'Krynsk ', npcs: [] }, character: { name: 'A' } };
    const out = liftCurrentLocationFromCoreState(input);
    expect(out.currentLocationName).toBe('Krynsk');
    expect(out.slim.world).toEqual({ npcs: [] });
    expect(out.slim.character).toEqual({ name: 'A' });
    // input not mutated
    expect(input.world.currentLocation).toBe('Krynsk ');
  });

  it('treats empty/whitespace string as null', () => {
    const out = liftCurrentLocationFromCoreState({ world: { currentLocation: '   ' } });
    expect(out.currentLocationName).toBeNull();
    expect(out.slim.world).toEqual({});
  });

  it('survives missing world object', () => {
    const out = liftCurrentLocationFromCoreState({ character: { name: 'A' } });
    expect(out.currentLocationName).toBeNull();
    expect(out.slim).toEqual({ character: { name: 'A' } });
  });
});

describe('injectCurrentLocationIntoCoreState', () => {
  it('no-ops on non-object input', () => {
    expect(() => injectCurrentLocationIntoCoreState(null, 'X')).not.toThrow();
  });

  it('no-ops when name is null/empty', () => {
    const cs = { world: {} };
    injectCurrentLocationIntoCoreState(cs, null);
    expect(cs.world.currentLocation).toBeUndefined();
    injectCurrentLocationIntoCoreState(cs, '');
    expect(cs.world.currentLocation).toBeUndefined();
  });

  it('creates world if missing and assigns name', () => {
    const cs = {};
    injectCurrentLocationIntoCoreState(cs, 'Krynsk');
    expect(cs.world).toEqual({ currentLocation: 'Krynsk' });
  });

  it('does not clobber an existing in-memory currentLocation', () => {
    const cs = { world: { currentLocation: 'OverridePath' } };
    injectCurrentLocationIntoCoreState(cs, 'ColumnPath');
    expect(cs.world.currentLocation).toBe('OverridePath');
  });
});
