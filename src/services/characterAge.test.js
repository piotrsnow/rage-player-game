import { describe, expect, it } from 'vitest';
import { DEFAULT_CHARACTER_AGE, normalizeCharacterAge } from './characterAge';

describe('characterAge', () => {
  it('uses default age when value is missing', () => {
    expect(normalizeCharacterAge(undefined)).toBe(DEFAULT_CHARACTER_AGE);
    expect(normalizeCharacterAge(null)).toBe(DEFAULT_CHARACTER_AGE);
  });

  it('normalizes numeric input to a positive integer', () => {
    expect(normalizeCharacterAge('27')).toBe(27);
    expect(normalizeCharacterAge(18.6)).toBe(19);
    expect(normalizeCharacterAge(-5)).toBe(1);
  });
});
