import { describe, it, expect } from 'vitest';
import {
  matchTileFilter,
  isEmptyPaletteFilter,
  paletteFilterToSpec,
  EMPTY_PALETTE_FILTER,
} from './tileFilter.js';

const wallEntry = {
  localId: 3,
  atoms: ['wall', 'solid'],
  traits: { biome: 'forest', material: 'stone' },
  tags: ['exterior'],
  autotileGroupId: 'g.stone_wall',
  autotileRole: 'edge_n',
  tilesetName: 'Dungeon',
};
const bareEntry = { localId: 7, atoms: [], traits: {}, tags: [] };

describe('matchTileFilter', () => {
  it('returns match when no spec is supplied', () => {
    expect(matchTileFilter(wallEntry).match).toBe(true);
    expect(matchTileFilter(wallEntry, null).match).toBe(true);
    expect(matchTileFilter(wallEntry, {}).match).toBe(true);
  });

  it('requires ALL atoms in the spec set', () => {
    expect(matchTileFilter(wallEntry, { atoms: new Set(['wall']) }).match).toBe(true);
    expect(matchTileFilter(wallEntry, { atoms: ['wall', 'solid'] }).match).toBe(true);
    expect(matchTileFilter(wallEntry, { atoms: ['wall', 'door'] }).match).toBe(false);
  });

  it('matches trait key/value pairs and ignores empty values', () => {
    expect(matchTileFilter(wallEntry, { traits: { biome: 'forest' } }).match).toBe(true);
    expect(matchTileFilter(wallEntry, { traits: { biome: 'desert' } }).match).toBe(false);
    expect(matchTileFilter(wallEntry, { traits: { biome: '' } }).match).toBe(true);
  });

  it('matches autotileGroupId exactly', () => {
    expect(matchTileFilter(wallEntry, { autotileGroupId: 'g.stone_wall' }).match).toBe(true);
    expect(matchTileFilter(wallEntry, { autotileGroupId: 'g.other' }).match).toBe(false);
  });

  it('untaggedOnly keeps only bare entries', () => {
    expect(matchTileFilter(bareEntry, { untaggedOnly: true }).match).toBe(true);
    expect(matchTileFilter(wallEntry, { untaggedOnly: true }).match).toBe(false);
  });

  it('search covers atoms, trait values, tags, #localId and tileset name', () => {
    expect(matchTileFilter(wallEntry, { search: 'stone' }).match).toBe(true);
    expect(matchTileFilter(wallEntry, { search: 'FOREST' }).match).toBe(true);
    expect(matchTileFilter(wallEntry, { search: 'exterior' }).match).toBe(true);
    expect(matchTileFilter(wallEntry, { search: '#3' }).match).toBe(true);
    expect(matchTileFilter(wallEntry, { search: 'dungeon' }).match).toBe(true);
    expect(matchTileFilter(wallEntry, { search: 'xyz' }).match).toBe(false);
  });

  it('score grows with the number of satisfied constraints', () => {
    const one = matchTileFilter(wallEntry, { atoms: ['wall'] }).score;
    const more = matchTileFilter(wallEntry, {
      atoms: ['wall', 'solid'],
      autotileGroupId: 'g.stone_wall',
    }).score;
    expect(more).toBeGreaterThan(one);
  });
});

describe('isEmptyPaletteFilter', () => {
  it('returns true for an untouched default filter', () => {
    expect(isEmptyPaletteFilter()).toBe(true);
    expect(isEmptyPaletteFilter({ ...EMPTY_PALETTE_FILTER })).toBe(true);
    // displayMode is a UI preference; switching it is still "empty".
    expect(isEmptyPaletteFilter({ ...EMPTY_PALETTE_FILTER, displayMode: 'hide' })).toBe(true);
  });

  it('returns false when any constraint is active', () => {
    expect(isEmptyPaletteFilter({ ...EMPTY_PALETTE_FILTER, search: 'wall' })).toBe(false);
    expect(isEmptyPaletteFilter({ ...EMPTY_PALETTE_FILTER, atoms: ['wall'] })).toBe(false);
    expect(isEmptyPaletteFilter({
      ...EMPTY_PALETTE_FILTER, traitKey: 'biome', traitValue: 'forest',
    })).toBe(false);
    expect(isEmptyPaletteFilter({ ...EMPTY_PALETTE_FILTER, autotileGroupId: 'g.x' })).toBe(false);
    expect(isEmptyPaletteFilter({ ...EMPTY_PALETTE_FILTER, untaggedOnly: true })).toBe(false);
  });

  it('treats lone traitKey or lone traitValue as empty (pair required)', () => {
    expect(isEmptyPaletteFilter({ ...EMPTY_PALETTE_FILTER, traitKey: 'biome' })).toBe(true);
    expect(isEmptyPaletteFilter({ ...EMPTY_PALETTE_FILTER, traitValue: 'forest' })).toBe(true);
  });
});

describe('paletteFilterToSpec', () => {
  it('drops displayMode and empty fields', () => {
    const spec = paletteFilterToSpec({ ...EMPTY_PALETTE_FILTER, displayMode: 'hide' });
    expect(spec).toEqual({});
  });

  it('collapses traitKey+traitValue into a single-entry traits map', () => {
    const spec = paletteFilterToSpec({
      ...EMPTY_PALETTE_FILTER,
      traitKey: 'biome',
      traitValue: 'forest',
    });
    expect(spec.traits).toEqual({ biome: 'forest' });
  });

  it('round-trips through matchTileFilter', () => {
    const f = {
      ...EMPTY_PALETTE_FILTER,
      search: 'stone',
      atoms: ['wall'],
      traitKey: 'biome',
      traitValue: 'forest',
      autotileGroupId: 'g.stone_wall',
    };
    const spec = paletteFilterToSpec(f);
    expect(matchTileFilter(wallEntry, spec).match).toBe(true);
    expect(matchTileFilter(bareEntry, spec).match).toBe(false);
  });
});
