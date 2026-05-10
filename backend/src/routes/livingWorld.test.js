import { describe, it, expect } from 'vitest';
import { buildWorldLocationPatch } from './livingWorld.js';

describe('buildWorldLocationPatch', () => {
  it('maps shape/icon/nodeImageUrl to Prisma column names', () => {
    const patch = buildWorldLocationPatch({
      shape: 'hexagon',
      icon: 'castle',
      nodeImageUrl: 'https://cdn.example.com/img.png',
    });
    expect(patch).toEqual({
      nodeShape: 'hexagon',
      nodeIcon: 'castle',
      nodeImageUrl: 'https://cdn.example.com/img.png',
    });
  });

  it('maps regionX/regionY', () => {
    const patch = buildWorldLocationPatch({ regionX: 3.5, regionY: -1.2 });
    expect(patch).toEqual({ regionX: 3.5, regionY: -1.2 });
  });

  it('normalises falsy strings to null', () => {
    const patch = buildWorldLocationPatch({ shape: '', icon: '', nodeImageUrl: '' });
    expect(patch).toEqual({ nodeShape: null, nodeIcon: null, nodeImageUrl: null });
  });

  it('passes through explicit null', () => {
    const patch = buildWorldLocationPatch({ shape: null, icon: null, nodeImageUrl: null });
    expect(patch).toEqual({ nodeShape: null, nodeIcon: null, nodeImageUrl: null });
  });

  it('returns empty object when body has no relevant fields', () => {
    expect(buildWorldLocationPatch({})).toEqual({});
    expect(buildWorldLocationPatch({ name: 'Foo', tags: ['a'] })).toEqual({});
  });

  it('ignores fields not allowed on WorldLocation', () => {
    const patch = buildWorldLocationPatch({
      name: 'Nowa Wieś',
      description: 'Opis',
      atmosphere: 'mroczna',
      dangerLevel: 'dangerous',
      biome: 'forest',
      shape: 'diamond',
    });
    expect(patch).toEqual({ nodeShape: 'diamond' });
    expect(patch).not.toHaveProperty('name');
    expect(patch).not.toHaveProperty('biome');
  });
});
