import { describe, it, expect } from 'vitest';
import { hashSeed, mulberry32, seededPick, seededShuffle } from './prng';

describe('hashSeed', () => {
  it('returns consistent hashes', () => {
    expect(hashSeed(42, 0, 0)).toBe(hashSeed(42, 0, 0));
  });

  it('returns different hashes for different inputs', () => {
    expect(hashSeed(42, 0, 0)).not.toBe(hashSeed(42, 1, 0));
    expect(hashSeed(42, 0, 0)).not.toBe(hashSeed(43, 0, 0));
  });
});

describe('mulberry32', () => {
  it('produces deterministic sequences', () => {
    const a = mulberry32(12345);
    const b = mulberry32(12345);
    for (let i = 0; i < 20; i++) {
      expect(a()).toBe(b());
    }
  });

  it('produces values in [0, 1)', () => {
    const rng = mulberry32(999);
    for (let i = 0; i < 100; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('seededPick', () => {
  it('picks from array', () => {
    const rng = mulberry32(42);
    const arr = ['a', 'b', 'c'];
    const result = seededPick(arr, rng);
    expect(arr).toContain(result);
  });
});

describe('seededShuffle', () => {
  it('returns array of same length with same elements', () => {
    const rng = mulberry32(42);
    const arr = [1, 2, 3, 4, 5];
    const shuffled = seededShuffle(arr, rng);
    expect(shuffled.length).toBe(arr.length);
    expect(shuffled.sort()).toEqual(arr.sort());
  });

  it('does not mutate original array', () => {
    const rng = mulberry32(42);
    const arr = [1, 2, 3];
    const copy = [...arr];
    seededShuffle(arr, rng);
    expect(arr).toEqual(copy);
  });
});
