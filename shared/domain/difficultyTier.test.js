import { describe, it, expect } from 'vitest';
import {
  DIFFICULTY_TIERS,
  allowedTiersForLevel,
  isTierAllowedForLevel,
  clampTier,
} from './difficultyTier.js';

describe('DIFFICULTY_TIERS', () => {
  it('orders tiers from easiest to hardest', () => {
    expect(DIFFICULTY_TIERS).toEqual(['low', 'medium', 'high', 'deadly']);
  });
});

describe('allowedTiersForLevel', () => {
  it('level 1-5 gets only low', () => {
    for (const lv of [1, 2, 5]) {
      expect(allowedTiersForLevel(lv)).toEqual(['low']);
    }
  });

  it('level 6-10 gets low/medium/high', () => {
    for (const lv of [6, 8, 10]) {
      expect(allowedTiersForLevel(lv)).toEqual(['low', 'medium', 'high']);
    }
  });

  it('level 11+ unlocks deadly', () => {
    for (const lv of [11, 15, 99]) {
      expect(allowedTiersForLevel(lv)).toEqual(['low', 'medium', 'high', 'deadly']);
    }
  });

  it('non-numeric level defaults to 1 (low only)', () => {
    expect(allowedTiersForLevel(undefined)).toEqual(['low']);
    expect(allowedTiersForLevel(null)).toEqual(['low']);
    expect(allowedTiersForLevel('nonsense')).toEqual(['low']);
  });
});

describe('isTierAllowedForLevel', () => {
  it('rejects deadly at level 1 (user requirement: no dragons at lv 1)', () => {
    expect(isTierAllowedForLevel('deadly', 1)).toBe(false);
  });

  it('allows low at any level', () => {
    expect(isTierAllowedForLevel('low', 1)).toBe(true);
    expect(isTierAllowedForLevel('low', 50)).toBe(true);
  });

  it('allows deadly at level 11', () => {
    expect(isTierAllowedForLevel('deadly', 11)).toBe(true);
  });

  it('rejects unknown tier string', () => {
    expect(isTierAllowedForLevel('catastrophic', 50)).toBe(false);
  });
});

describe('clampTier', () => {
  it('passes through when requested is at or below cap', () => {
    expect(clampTier('low', 'high')).toBe('low');
    expect(clampTier('medium', 'medium')).toBe('medium');
  });

  it('clamps down to cap when requested exceeds it', () => {
    expect(clampTier('deadly', 'low')).toBe('low');
    expect(clampTier('high', 'medium')).toBe('medium');
  });

  it('unknown requested tier falls back to cap', () => {
    expect(clampTier('xxx', 'medium')).toBe('medium');
  });

  it('unknown cap returns requested (passthrough)', () => {
    expect(clampTier('medium', 'xxx')).toBe('medium');
  });
});
