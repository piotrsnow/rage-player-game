import { describe, it, expect, vi } from 'vitest';
import {
  unpackWorldBounds,
  packWorldBounds,
  liftCurrentLocationFromCoreState,
  injectCurrentLocationIntoCoreState,
  packLocationRef,
  readLocationRef,
  lookupLocationByKindId,
  slugifyLocationName,
  LOCATION_KIND_WORLD,
  LOCATION_KIND_CAMPAIGN,
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

describe('packLocationRef', () => {
  it('returns nulls for missing input', () => {
    expect(packLocationRef(null)).toEqual({ kind: null, id: null });
    expect(packLocationRef(undefined)).toEqual({ kind: null, id: null });
  });

  it('passes through a literal {kind,id} ref', () => {
    expect(packLocationRef({ kind: 'world', id: 'abc' })).toEqual({ kind: 'world', id: 'abc' });
    expect(packLocationRef({ kind: 'campaign', id: 'xyz' })).toEqual({ kind: 'campaign', id: 'xyz' });
  });

  it('rejects unknown kinds', () => {
    expect(packLocationRef({ kind: 'galaxy', id: 'abc' })).toEqual({ kind: null, id: null });
  });

  it('packs a row using defaultKind', () => {
    expect(packLocationRef({ id: 'wl1', canonicalName: 'Krynsk' }, LOCATION_KIND_WORLD))
      .toEqual({ kind: 'world', id: 'wl1' });
    expect(packLocationRef({ id: 'cl1', name: 'Karczma' }, LOCATION_KIND_CAMPAIGN))
      .toEqual({ kind: 'campaign', id: 'cl1' });
  });

  it('returns nulls when row has no id', () => {
    expect(packLocationRef({ name: 'no-id' }, LOCATION_KIND_WORLD)).toEqual({ kind: null, id: null });
  });

  it('returns nulls when defaultKind is unknown', () => {
    expect(packLocationRef({ id: 'x' }, 'galaxy')).toEqual({ kind: null, id: null });
  });
});

describe('readLocationRef', () => {
  it('returns null when columns are missing', () => {
    expect(readLocationRef(null)).toBeNull();
    expect(readLocationRef({})).toBeNull();
    expect(readLocationRef({ currentLocationKind: 'world' })).toBeNull();
    expect(readLocationRef({ currentLocationId: 'abc' })).toBeNull();
  });

  it('reads the default currentLocation prefix', () => {
    expect(readLocationRef({ currentLocationKind: 'world', currentLocationId: 'abc' }))
      .toEqual({ kind: 'world', id: 'abc' });
  });

  it('honours custom prefixes', () => {
    expect(readLocationRef({ lastLocationKind: 'campaign', lastLocationId: 'xyz' }, 'lastLocation'))
      .toEqual({ kind: 'campaign', id: 'xyz' });
  });

  it('rejects unknown kind values', () => {
    expect(readLocationRef({ currentLocationKind: 'galaxy', currentLocationId: 'abc' })).toBeNull();
  });
});

describe('lookupLocationByKindId', () => {
  function makePrisma() {
    return {
      worldLocation: { findUnique: vi.fn().mockResolvedValue({ id: 'w1', canonicalName: 'Krynsk' }) },
      campaignLocation: { findUnique: vi.fn().mockResolvedValue({ id: 'c1', name: 'Karczma' }) },
    };
  }

  it('returns null on bad input', async () => {
    const prisma = makePrisma();
    expect(await lookupLocationByKindId({ prisma, kind: 'galaxy', id: 'a' })).toBeNull();
    expect(await lookupLocationByKindId({ prisma, kind: null, id: 'a' })).toBeNull();
    expect(await lookupLocationByKindId({ prisma, kind: 'world', id: null })).toBeNull();
  });

  it('routes world kind to worldLocation', async () => {
    const prisma = makePrisma();
    const out = await lookupLocationByKindId({ prisma, kind: LOCATION_KIND_WORLD, id: 'w1' });
    expect(out).toEqual({ id: 'w1', canonicalName: 'Krynsk' });
    expect(prisma.worldLocation.findUnique).toHaveBeenCalledWith({ where: { id: 'w1' } });
    expect(prisma.campaignLocation.findUnique).not.toHaveBeenCalled();
  });

  it('routes campaign kind to campaignLocation', async () => {
    const prisma = makePrisma();
    const out = await lookupLocationByKindId({ prisma, kind: LOCATION_KIND_CAMPAIGN, id: 'c1' });
    expect(out).toEqual({ id: 'c1', name: 'Karczma' });
    expect(prisma.campaignLocation.findUnique).toHaveBeenCalledWith({ where: { id: 'c1' } });
    expect(prisma.worldLocation.findUnique).not.toHaveBeenCalled();
  });

  it('forwards select to Prisma', async () => {
    const prisma = makePrisma();
    await lookupLocationByKindId({
      prisma, kind: 'world', id: 'w1', select: { id: true, canonicalName: true },
    });
    expect(prisma.worldLocation.findUnique).toHaveBeenCalledWith({
      where: { id: 'w1' }, select: { id: true, canonicalName: true },
    });
  });
});

describe('slugifyLocationName', () => {
  it('lowercases + collapses non-alphanum to dashes', () => {
    expect(slugifyLocationName('Karczma Pod Skowronkiem')).toBe('karczma-pod-skowronkiem');
  });

  it('strips leading/trailing dashes', () => {
    expect(slugifyLocationName('  --Bandit Camp!--  ')).toBe('bandit-camp');
  });

  it('transliterates polish letters', () => {
    expect(slugifyLocationName('Łąka Świętego Józefa')).toBe('laka-swietego-jozefa');
  });

  it('handles non-string input', () => {
    expect(slugifyLocationName(null)).toBe('');
    expect(slugifyLocationName(undefined)).toBe('');
    expect(slugifyLocationName(42)).toBe('');
  });

  it('returns empty for blank/whitespace', () => {
    expect(slugifyLocationName('   ')).toBe('');
    expect(slugifyLocationName('')).toBe('');
  });
});
