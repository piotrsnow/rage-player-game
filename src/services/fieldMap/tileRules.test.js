import { describe, it, expect } from 'vitest';
import {
  getBiomeGround, getBiomeTrees, getBiomeWater, getBiomeBuildings,
  getBiomeProps, getBiomeMountains, getBiomeFarms,
  getRoadTile, getWallTile, ALL_BIOMES,
} from './tileRules';

describe('biome tile rules', () => {
  it('returns ground tiles for all biomes', () => {
    for (const biome of ALL_BIOMES) {
      const ground = getBiomeGround(biome);
      expect(ground.ground.length).toBeGreaterThan(0);
      expect(ground.accent.length).toBeGreaterThan(0);
    }
  });

  it('returns trees for all biomes', () => {
    for (const biome of ALL_BIOMES) {
      const trees = getBiomeTrees(biome);
      expect(trees.length).toBeGreaterThan(0);
    }
  });

  it('returns water tile for all biomes', () => {
    for (const biome of ALL_BIOMES) {
      const water = getBiomeWater(biome);
      expect(typeof water).toBe('string');
    }
  });

  it('returns buildings for all biomes', () => {
    for (const biome of ALL_BIOMES) {
      const buildings = getBiomeBuildings(biome);
      expect(buildings.length).toBeGreaterThan(0);
    }
  });

  it('returns props for all biomes', () => {
    for (const biome of ALL_BIOMES) {
      const props = getBiomeProps(biome);
      expect(props.length).toBeGreaterThan(0);
    }
  });

  it('falls back to plains for unknown biome', () => {
    const ground = getBiomeGround('alien');
    expect(ground).toEqual(getBiomeGround('plains'));
  });
});

describe('getRoadTile', () => {
  it('returns cross for all neighbors', () => {
    expect(getRoadTile({ n: true, s: true, e: true, w: true })).toBe('road_cross');
  });

  it('returns horizontal for east-west', () => {
    expect(getRoadTile({ n: false, s: false, e: true, w: true })).toBe('road_horizontal');
  });

  it('returns vertical for north-south', () => {
    expect(getRoadTile({ n: true, s: true, e: false, w: false })).toBe('road_vertical');
  });

  it('returns turn for corners', () => {
    expect(getRoadTile({ n: false, s: true, e: true, w: false })).toBe('road_turn_dr');
    expect(getRoadTile({ n: true, s: false, e: true, w: false })).toBe('road_turn_ur');
  });

  it('returns t-junction for 3 neighbors', () => {
    expect(getRoadTile({ n: false, s: true, e: true, w: true })).toBe('road_t_down');
    expect(getRoadTile({ n: true, s: false, e: true, w: true })).toBe('road_t_up');
  });
});

describe('getWallTile', () => {
  it('returns vertical for north-south', () => {
    expect(getWallTile({ n: true, s: true, e: false, w: false })).toBe('wall_vertical');
  });

  it('returns top for east-west', () => {
    expect(getWallTile({ n: false, s: false, e: true, w: true })).toBe('wall_top');
  });

  it('returns cap for only north neighbor', () => {
    expect(getWallTile({ n: true, s: false, e: false, w: false })).toBe('wall_cap_bottom');
  });
});
