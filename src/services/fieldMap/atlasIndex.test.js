import { describe, it, expect, beforeAll } from 'vitest';
import { setAtlas, getTileById, getTilesBySection, getTilesByTag, isPassable, isLiquid, isRoad, getAllSections, getMeta } from './atlasIndex';

const MOCK_ATLAS = {
  meta: { image: 'fantasy_tileset.png', tileWidth: 16, tileHeight: 16 },
  sections: {
    trees: [
      { id: 'tree_round_green', name: 'tree_round_green', col: 0, row: 0, x: 0, y: 0, tags: ['nature', 'blocking', 'tree'] },
    ],
    grass: [
      { id: 'grass_tuft_green', name: 'grass_tuft_green', col: 0, row: 1, x: 0, y: 16, tags: ['nature'] },
    ],
    roads: [
      { id: 'road_horizontal', name: 'road_horizontal', col: 0, row: 2, x: 0, y: 32, tags: ['road', 'autotile'] },
    ],
    liquids: [
      { id: 'water_blue', name: 'water_blue', col: 0, row: 3, x: 0, y: 48, tags: ['liquid'] },
    ],
    walls: [
      { id: 'wall_vertical', name: 'wall_vertical', col: 0, row: 4, x: 0, y: 64, tags: ['wall', 'blocking'] },
    ],
  },
};

beforeAll(() => {
  setAtlas(MOCK_ATLAS);
});

describe('atlasIndex', () => {
  it('indexes tiles by id', () => {
    const tile = getTileById('tree_round_green');
    expect(tile).not.toBeNull();
    expect(tile.id).toBe('tree_round_green');
    expect(tile.section).toBe('trees');
  });

  it('returns null for unknown id', () => {
    expect(getTileById('nonexistent')).toBeNull();
  });

  it('indexes tiles by section', () => {
    const treeTiles = getTilesBySection('trees');
    expect(treeTiles.length).toBe(1);
    expect(treeTiles[0].id).toBe('tree_round_green');
  });

  it('indexes tiles by tag', () => {
    const blocking = getTilesByTag('blocking');
    expect(blocking.length).toBe(2);
  });

  it('marks trees as not passable', () => {
    expect(isPassable('tree_round_green')).toBe(false);
  });

  it('marks grass as passable', () => {
    expect(isPassable('grass_tuft_green')).toBe(true);
  });

  it('marks liquids correctly', () => {
    expect(isLiquid('water_blue')).toBe(true);
    expect(isLiquid('grass_tuft_green')).toBe(false);
  });

  it('marks roads correctly', () => {
    expect(isRoad('road_horizontal')).toBe(true);
    expect(isRoad('grass_tuft_green')).toBe(false);
  });

  it('returns all sections', () => {
    const sections = getAllSections();
    expect(sections).toContain('trees');
    expect(sections).toContain('grass');
    expect(sections).toContain('roads');
  });

  it('returns meta', () => {
    const meta = getMeta();
    expect(meta.tileWidth).toBe(16);
    expect(meta.image).toBe('fantasy_tileset.png');
  });
});
