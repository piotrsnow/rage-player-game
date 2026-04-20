import { describe, it, expect } from 'vitest';
import {
  SETTLEMENT_TEMPLATES,
  getTemplate,
  isGeneratedLocationType,
  classifySublocation,
} from './settlementTemplates.js';

describe('getTemplate', () => {
  it('returns the right template for known types', () => {
    expect(getTemplate('village').maxKeyNpcs).toBe(10);
    expect(getTemplate('capital').maxKeyNpcs).toBe(70);
  });
  it('falls back to a minimal default for unknown types', () => {
    const t = getTemplate('atlantis');
    expect(t.maxKeyNpcs).toBe(5);
    expect(t.required).toEqual([]);
  });
});

describe('isGeneratedLocationType', () => {
  it('flags dungeons', () => {
    expect(isGeneratedLocationType('dungeon')).toBe(true);
  });
  it('does not flag settlements', () => {
    expect(isGeneratedLocationType('village')).toBe(false);
    expect(isGeneratedLocationType('capital')).toBe(false);
    expect(isGeneratedLocationType('unknown')).toBe(false);
  });
});

describe('classifySublocation', () => {
  it('recognizes required slot', () => {
    const r = classifySublocation({ slotType: 'tavern', name: 'Pod Dębem', parentLocationType: 'village' });
    expect(r).toEqual({ kind: 'required', slotType: 'tavern' });
  });

  it('recognizes optional slot', () => {
    const r = classifySublocation({ slotType: 'church', name: 'Kościół Sigmara', parentLocationType: 'village' });
    expect(r).toEqual({ kind: 'optional', slotType: 'church' });
  });

  it('classifies distinctive name with unknown slotType as custom', () => {
    const r = classifySublocation({ slotType: null, name: 'Wieża Maga', parentLocationType: 'village' });
    expect(r.kind).toBe('custom');
  });

  it('classifies multi-word narrative name as custom', () => {
    const r = classifySublocation({ slotType: 'witch_hut', name: 'Chata Starej Wiedźmy', parentLocationType: 'village' });
    expect(r.kind).toBe('custom');
  });

  it('rejects generic single-word name', () => {
    const r = classifySublocation({ slotType: null, name: 'Dom', parentLocationType: 'village' });
    expect(r).toEqual({ kind: 'reject', reason: 'generic_name' });
  });

  it('rejects missing name', () => {
    const r = classifySublocation({ slotType: null, name: '', parentLocationType: 'village' });
    expect(r).toEqual({ kind: 'reject', reason: 'missing_name' });
  });

  it('rejects name with only short filler words', () => {
    // "w", "do", "na" all < 3 chars
    const r = classifySublocation({ slotType: null, name: 'w do na', parentLocationType: 'village' });
    expect(r).toEqual({ kind: 'reject', reason: 'generic_name' });
  });

  it('case-insensitive slot matching', () => {
    const r = classifySublocation({ slotType: 'TAVERN', name: 'X', parentLocationType: 'village' });
    expect(r.kind).toBe('required');
  });

  it('hamlet has no required slots', () => {
    expect(SETTLEMENT_TEMPLATES.hamlet.required).toEqual([]);
  });

  it('capital has palace + grand_temple required', () => {
    expect(SETTLEMENT_TEMPLATES.capital.required).toContain('palace');
    expect(SETTLEMENT_TEMPLATES.capital.required).toContain('grand_temple');
  });
});
