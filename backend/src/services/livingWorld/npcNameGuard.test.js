import { describe, it, expect } from 'vitest';
import { isNpcName } from './npcNameGuard.js';
import { normalizeLocationName } from './worldStateService.js';

function buildNpcSet(names) {
  const s = new Set();
  for (const n of names) {
    const norm = normalizeLocationName(n);
    if (norm && norm.length >= 3) s.add(norm);
  }
  return s;
}

describe('isNpcName', () => {
  const npcNames = buildNpcSet([
    'Marta z Kamionki',
    'Bjorn Żelazna Pięść',
    'Elara',
  ]);

  it('blocks exact NPC name', () => {
    expect(isNpcName('Marta z Kamionki', npcNames)).toBe(true);
  });

  it('blocks case-insensitive match', () => {
    expect(isNpcName('marta z kamionki', npcNames)).toBe(true);
    expect(isNpcName('BJORN ŻELAZNA PIĘŚĆ', npcNames)).toBe(true);
  });

  it('blocks with extra whitespace', () => {
    expect(isNpcName('  Marta  z  Kamionki  ', npcNames)).toBe(true);
  });

  it('allows place names referencing NPC by possession', () => {
    expect(isNpcName('Dom Marty', npcNames)).toBe(false);
    expect(isNpcName('Kuźnia Bjorna', npcNames)).toBe(false);
  });

  it('allows legitimate place names', () => {
    expect(isNpcName('Kamionki', npcNames)).toBe(false);
    expect(isNpcName('Grossmarkt w Yeralden', npcNames)).toBe(false);
    expect(isNpcName('Czarda Pod Skowronkiem', npcNames)).toBe(false);
  });

  it('returns false for empty/null inputs', () => {
    expect(isNpcName('', npcNames)).toBe(false);
    expect(isNpcName(null, npcNames)).toBe(false);
    expect(isNpcName('Test', new Set())).toBe(false);
    expect(isNpcName('Test', null)).toBe(false);
  });

  it('blocks single-word NPC name', () => {
    expect(isNpcName('Elara', npcNames)).toBe(true);
  });

  it('does not block short names below 3-char threshold', () => {
    const tinySet = buildNpcSet(['Al']);
    expect(isNpcName('Al', tinySet)).toBe(false);
  });
});
