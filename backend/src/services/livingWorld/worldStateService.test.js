import { describe, it, expect } from 'vitest';
import { normalizeLocationName } from './worldStateService.js';

describe('normalizeLocationName', () => {
  it('lowercases and trims', () => {
    expect(normalizeLocationName('  Yeralden  ')).toBe('yeralden');
  });

  it('strips geo prepositions', () => {
    expect(normalizeLocationName('Karczma w Yeralden')).toBe('karczma');
  });

  it('preserves NPC-like names without geo prepositions', () => {
    expect(normalizeLocationName('Marta z Kamionki')).toBe('marta z kamionki');
  });

  it('returns empty for null/undefined', () => {
    expect(normalizeLocationName(null)).toBe('');
    expect(normalizeLocationName(undefined)).toBe('');
  });
});

describe('matchesByNormName substring bounds (integration via normalize)', () => {
  // The tightened substring check requires both sides >= 5 chars and
  // shorter/longer ratio >= 0.6. These tests validate the normalization
  // inputs that feed into that comparison.

  it('short tokens normalize correctly', () => {
    expect(normalizeLocationName('las')).toBe('las');
    expect(normalizeLocationName('las').length).toBeLessThan(5);
  });

  it('NPC-like names produce strings long enough for substring check', () => {
    const norm = normalizeLocationName('Bjorn Żelazna Pięść');
    expect(norm.length).toBeGreaterThanOrEqual(5);
  });

  it('place name referencing NPC differs from NPC name', () => {
    const npcNorm = normalizeLocationName('Marta z Kamionki');
    const placeNorm = normalizeLocationName('Dom Marty');
    expect(npcNorm).not.toBe(placeNorm);
    expect(npcNorm.includes(placeNorm)).toBe(false);
    expect(placeNorm.includes(npcNorm)).toBe(false);
  });
});
