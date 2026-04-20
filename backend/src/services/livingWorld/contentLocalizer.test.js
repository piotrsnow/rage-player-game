import { describe, it, expect } from 'vitest';
import {
  normalizeLanguage, localize, localizeContentEntry, localizeRoomMetadata,
} from './contentLocalizer.js';

describe('contentLocalizer — normalizeLanguage', () => {
  it('accepts supported languages', () => {
    expect(normalizeLanguage('pl')).toBe('pl');
    expect(normalizeLanguage('en')).toBe('en');
    expect(normalizeLanguage('EN')).toBe('en');
  });
  it('falls back to pl on unsupported / missing', () => {
    expect(normalizeLanguage('de')).toBe('pl');
    expect(normalizeLanguage('')).toBe('pl');
    expect(normalizeLanguage(null)).toBe('pl');
    expect(normalizeLanguage(undefined)).toBe('pl');
  });
});

describe('contentLocalizer — localize', () => {
  it('picks by language', () => {
    expect(localize({ pl: 'Cześć', en: 'Hello' }, 'pl')).toBe('Cześć');
    expect(localize({ pl: 'Cześć', en: 'Hello' }, 'en')).toBe('Hello');
  });
  it('falls back to pl when target missing', () => {
    expect(localize({ pl: 'Cześć' }, 'en')).toBe('Cześć');
  });
  it('returns plain strings unchanged (backward compat)', () => {
    expect(localize('plain string', 'en')).toBe('plain string');
  });
  it('returns null for null/undefined', () => {
    expect(localize(null, 'en')).toBeNull();
    expect(localize(undefined, 'en')).toBeNull();
  });
  it('falls back to first available value when pl missing and target missing', () => {
    expect(localize({ de: 'Hallo' }, 'en')).toBe('Hallo');
  });
});

describe('contentLocalizer — localizeContentEntry', () => {
  it('localizes label + effect, passes through numeric fields', () => {
    const entry = {
      id: 'floor_pit',
      dc: 12,
      damage: '1d6',
      label: { pl: 'Dziura', en: 'Pit' },
      effect: { pl: 'Zapada się', en: 'Gives way' },
    };
    const out = localizeContentEntry(entry, 'en');
    expect(out.label).toBe('Pit');
    expect(out.effect).toBe('Gives way');
    expect(out.dc).toBe(12);
    expect(out.damage).toBe('1d6');
    expect(out.id).toBe('floor_pit');
  });
  it('localizes loot name + puzzle solutionHint', () => {
    const lootEntry = { id: 'coins', name: { pl: 'Srebro', en: 'Silver' }, rarity: 'common' };
    const puzzleEntry = { id: 'riddle', label: { pl: 'Zag', en: 'Rid' }, solutionHint: { pl: 'pl hint', en: 'en hint' } };
    expect(localizeContentEntry(lootEntry, 'en').name).toBe('Silver');
    expect(localizeContentEntry(puzzleEntry, 'pl').solutionHint).toBe('pl hint');
  });
  it('handles null / non-object', () => {
    expect(localizeContentEntry(null, 'en')).toBeNull();
    expect(localizeContentEntry('str', 'en')).toBe('str');
  });
});

describe('contentLocalizer — localizeRoomMetadata', () => {
  it('localizes trap + puzzle + loot array + flavorSeed, passes flags through', () => {
    const meta = {
      role: 'boss',
      entryCleared: false,
      trapSprung: true,
      trap: { id: 't1', label: { pl: 'Pułapka', en: 'Trap' } },
      puzzle: { id: 'p1', label: { pl: 'Zagadka', en: 'Puzzle' } },
      loot: [
        { id: 'l1', name: { pl: 'Srebro', en: 'Silver' } },
        { id: 'l2', name: { pl: 'Złoto', en: 'Gold' } },
      ],
      flavorSeed: { pl: 'Zimna sala', en: 'Cold hall' },
    };
    const out = localizeRoomMetadata(meta, 'en');
    expect(out.trap.label).toBe('Trap');
    expect(out.puzzle.label).toBe('Puzzle');
    expect(out.loot.map((l) => l.name)).toEqual(['Silver', 'Gold']);
    expect(out.flavorSeed).toBe('Cold hall');
    expect(out.entryCleared).toBe(false);
    expect(out.trapSprung).toBe(true);
    expect(out.role).toBe('boss');
  });
  it('safe on empty meta', () => {
    expect(localizeRoomMetadata(null, 'en')).toBeNull();
    expect(localizeRoomMetadata({}, 'en')).toEqual({});
  });
});
