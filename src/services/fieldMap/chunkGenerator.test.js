import { describe, it, expect } from 'vitest';
import { generateChunk } from './chunkGenerator';
import { CHUNK_SIZE, CHUNK_SIZE_INTERIOR, chunkKey } from './constants';

describe('chunkGenerator', () => {
  it('generates a chunk with correct dimensions', () => {
    const chunk = generateChunk(12345, 0, 0, 'plains');
    expect(chunk.size).toBe(CHUNK_SIZE);
    expect(chunk.ground.length).toBe(CHUNK_SIZE * CHUNK_SIZE);
    expect(chunk.objects.length).toBe(CHUNK_SIZE * CHUNK_SIZE);
    expect(chunk.passable.length).toBe(CHUNK_SIZE * CHUNK_SIZE);
  });

  it('generates deterministic results for the same seed/coords', () => {
    const a = generateChunk(42, 1, 2, 'forest');
    const b = generateChunk(42, 1, 2, 'forest');
    expect(a.ground).toEqual(b.ground);
    expect(a.objects).toEqual(b.objects);
    expect(a.passable).toEqual(b.passable);
  });

  it('generates different results for different seeds', () => {
    const a = generateChunk(100, 0, 0, 'plains');
    const b = generateChunk(200, 0, 0, 'plains');
    const sameGround = a.ground.every((tile, i) => tile === b.ground[i]);
    expect(sameGround).toBe(false);
  });

  it('generates different results for different chunk coords', () => {
    const a = generateChunk(42, 0, 0, 'plains');
    const b = generateChunk(42, 1, 0, 'plains');
    const sameGround = a.ground.every((tile, i) => tile === b.ground[i]);
    expect(sameGround).toBe(false);
  });

  it('returns correct chunk key', () => {
    const chunk = generateChunk(1, 3, -2, 'swamp');
    expect(chunk.key).toBe(chunkKey(3, -2));
    expect(chunk.cx).toBe(3);
    expect(chunk.cy).toBe(-2);
  });

  it('all ground tiles are non-null strings', () => {
    const chunk = generateChunk(99, 0, 0, 'desert');
    for (const tile of chunk.ground) {
      expect(typeof tile).toBe('string');
      expect(tile.length).toBeGreaterThan(0);
    }
  });

  it('passable is false where blocking objects exist', () => {
    const chunk = generateChunk(42, 0, 0, 'forest');
    for (let i = 0; i < chunk.objects.length; i++) {
      const obj = chunk.objects[i];
      if (obj && (obj.startsWith('tree_') || obj.startsWith('mountain_') || obj.startsWith('water_') || obj.startsWith('rock_'))) {
        expect(chunk.passable[i]).toBe(false);
      }
    }
  });

  it('generates for all biomes without errors', () => {
    const biomes = ['plains', 'forest', 'swamp', 'desert', 'snow', 'ruins', 'mountain'];
    for (const biome of biomes) {
      const chunk = generateChunk(777, 0, 0, biome);
      expect(chunk.biome).toBe(biome);
      expect(chunk.ground.length).toBe(CHUNK_SIZE * CHUNK_SIZE);
    }
  });

  it('detects POIs in chunks with villages', () => {
    let foundPois = false;
    for (let seed = 0; seed < 50; seed++) {
      const chunk = generateChunk(seed, 0, 0, 'plains');
      if (chunk.pois.length > 0) {
        foundPois = true;
        for (const poi of chunk.pois) {
          expect(typeof poi.x).toBe('number');
          expect(typeof poi.y).toBe('number');
          expect(typeof poi.tile).toBe('string');
        }
        break;
      }
    }
    expect(foundPois).toBe(true);
  });
});

describe('mapMode profiles', () => {
  const SEED_RANGE = 20;

  it('pola mode produces chunks with low tree density', () => {
    for (let s = 0; s < SEED_RANGE; s++) {
      const chunk = generateChunk(s, 0, 0, 'plains', {}, 'pola', null);
      expect(chunk.mapMode).toBe('pola');
      const treeCount = chunk.objects.filter((o) => o && o.startsWith('tree_')).length;
      const density = treeCount / (chunk.size * chunk.size);
      expect(density).toBeLessThan(0.1);
    }
  });

  it('las mode produces chunks with high tree density', () => {
    let totalDensity = 0;
    for (let s = 0; s < SEED_RANGE; s++) {
      const chunk = generateChunk(s, 0, 0, 'forest', {}, 'las', null);
      expect(chunk.mapMode).toBe('las');
      const treeCount = chunk.objects.filter((o) => o && o.startsWith('tree_')).length;
      totalDensity += treeCount / (chunk.size * chunk.size);
    }
    expect(totalDensity / SEED_RANGE).toBeGreaterThan(0.05);
  });

  it('trakt mode places a central road', () => {
    for (const variant of ['pola', 'las', 'miasto']) {
      const chunk = generateChunk(42, 0, 0, 'plains', {}, 'trakt', variant);
      expect(chunk.mapMode).toBe('trakt');
      const roadCount = chunk.objects.filter((o) => o && o.startsWith('road_')).length;
      expect(roadCount).toBeGreaterThan(chunk.size - 5);
    }
  });

  it('wnetrze mode generates smaller chunks with rooms and corridors', () => {
    const chunk = generateChunk(42, 0, 0, 'ruins', {}, 'wnetrze', null);
    expect(chunk.mapMode).toBe('wnetrze');
    expect(chunk.size).toBe(CHUNK_SIZE_INTERIOR);
    expect(chunk.ground.length).toBe(CHUNK_SIZE_INTERIOR * CHUNK_SIZE_INTERIOR);

    const passableCount = chunk.passable.filter(Boolean).length;
    const total = chunk.size * chunk.size;
    expect(passableCount).toBeGreaterThan(total * 0.15);
    expect(passableCount).toBeLessThan(total * 0.85);
  });

  it('wnetrze has no soft-locks — at least 2 passable tiles connected', () => {
    for (let s = 0; s < 10; s++) {
      const chunk = generateChunk(s, 0, 0, 'ruins', {}, 'wnetrze', null);
      const passablePositions = [];
      for (let y = 0; y < chunk.size; y++) {
        for (let x = 0; x < chunk.size; x++) {
          if (chunk.passable[y * chunk.size + x]) {
            passablePositions.push({ x, y });
          }
        }
      }
      expect(passablePositions.length).toBeGreaterThan(5);
    }
  });
});

describe('quality metrics', () => {
  it('every outdoor chunk has at least 1 landmark (POI)', () => {
    let withPoi = 0;
    const total = 30;
    for (let s = 0; s < total; s++) {
      const chunk = generateChunk(s, 0, 0, 'plains', {}, 'pola', null);
      if (chunk.pois.length >= 1) withPoi++;
    }
    expect(withPoi / total).toBeGreaterThan(0.9);
  });

  it('ground tiles have at least 3 visual variants per mode', () => {
    for (const mode of ['pola', 'las']) {
      const chunk = generateChunk(42, 0, 0, 'plains', {}, mode, null);
      const uniqueGround = new Set(chunk.ground);
      expect(uniqueGround.size).toBeGreaterThanOrEqual(3);
    }
  });

  it('trakt/miasto chunks have road + building objects', () => {
    let hasRoad = false;
    let hasBuilding = false;
    for (let s = 0; s < 20; s++) {
      const chunk = generateChunk(s, 0, 0, 'plains', {}, 'trakt', 'miasto');
      if (chunk.objects.some((o) => o && o.startsWith('road_'))) hasRoad = true;
      if (chunk.objects.some((o) => o && (o.startsWith('house_') || o.startsWith('city_')))) hasBuilding = true;
    }
    expect(hasRoad).toBe(true);
    expect(hasBuilding).toBe(true);
  });

  it('interior chunks have walls, floors, and props', () => {
    const chunk = generateChunk(42, 0, 0, 'ruins', {}, 'wnetrze', null);
    const hasWall = chunk.objects.some((o) => o && o.startsWith('wall_'));
    const hasFloor = chunk.ground.some((g) => g && g.startsWith('ground_bricks_'));
    const hasProp = chunk.objects.some((o) => o && !o.startsWith('wall_') && !o.startsWith('door_') && o !== null);
    expect(hasWall).toBe(true);
    expect(hasFloor).toBe(true);
    expect(hasProp).toBe(true);
  });
});
