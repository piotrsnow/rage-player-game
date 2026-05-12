import { describe, expect, it } from 'vitest';
import {
  generateNpcSheet,
  npcStatsNeedsBaseline,
} from './npcCharacterSheet.js';

describe('npcStatsNeedsBaseline', () => {
  it('returns true for empty object', () => {
    expect(npcStatsNeedsBaseline({})).toBe(true);
  });

  it('returns true when only traits present (partial row)', () => {
    expect(npcStatsNeedsBaseline({ traits: [] })).toBe(true);
  });

  it('returns false for full attributes block', () => {
    expect(npcStatsNeedsBaseline({
      attributes: {
        sila: 2,
        inteligencja: 2,
        charyzma: 2,
        zrecznosc: 2,
        wytrzymalosc: 2,
        szczescie: 0,
      },
    })).toBe(false);
  });

  it('returns true when one attribute is missing', () => {
    expect(npcStatsNeedsBaseline({
      attributes: {
        sila: 2,
        inteligencja: 2,
        charyzma: 2,
        zrecznosc: 2,
        wytrzymalosc: 2,
      },
    })).toBe(true);
  });
});

describe('generateNpcSheet', () => {
  it('adds a deterministic flavor trait when archetype has none', () => {
    const a = generateNpcSheet({
      name: 'Jan Kowalski',
      race: 'Human',
      role: 'mieszkaniec',
      category: 'commoner',
    });
    expect(Array.isArray(a.traits)).toBe(true);
    expect(a.traits.length).toBeGreaterThan(0);
    const b = generateNpcSheet({
      name: 'Jan Kowalski',
      race: 'Human',
      role: 'mieszkaniec',
      category: 'commoner',
    });
    expect(a.traits).toEqual(b.traits);
  });

  it('keeps archetype-defined traits without duplicating flavor', () => {
    const g = generateNpcSheet({
      name: 'Kapitan Straży',
      race: 'Human',
      role: 'kapitan straży',
      category: 'guard',
    });
    expect(g.traits).toContain('Wyszkolony');
    expect(g.traits.length).toBe(1);
  });
});
