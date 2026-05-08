import { describe, it, expect } from 'vitest';
import { sanitizeMana } from './mana.js';

describe('sanitizeMana', () => {
  it('replaces NaN with 0', () => {
    expect(sanitizeMana({ current: NaN, max: 10 })).toEqual({ current: 0, max: 10 });
    expect(sanitizeMana({ current: 5, max: NaN })).toEqual({ current: 5, max: 0 });
  });

  it('returns zeros for missing input', () => {
    expect(sanitizeMana(null)).toEqual({ current: 0, max: 0 });
    expect(sanitizeMana(undefined)).toEqual({ current: 0, max: 0 });
  });

  it('preserves finite numbers', () => {
    expect(sanitizeMana({ current: 3, max: 12 })).toEqual({ current: 3, max: 12 });
  });
});
