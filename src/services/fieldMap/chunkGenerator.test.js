import { describe, it, expect } from 'vitest';
import { generateChunk } from './chunkGenerator';
import { CHUNK_SIZE, chunkKey } from './constants';

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
