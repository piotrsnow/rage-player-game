import { describe, it, expect } from 'vitest';
import { applyCharacterStateChanges } from './characterMutations.js';

// Baseline RPGon character: all attributes at 1, szczęście at 0 — the
// absolute floor a fresh character starts at. Individual tests override
// specific fields when they need higher values.
function baseCharacter(overrides = {}) {
  return {
    name: 'Hero',
    wounds: 10,
    maxWounds: 20,
    characterXp: 0,
    characterLevel: 1,
    attributePoints: 0,
    attributes: {
      sila: 1, inteligencja: 1, charyzma: 1,
      zrecznosc: 1, wytrzymalosc: 1, szczescie: 0,
    },
    skills: {},
    mana: { current: 0, max: 0 },
    money: { gold: 0, silver: 0, copper: 0 },
    inventory: [],
    materialBag: [],
    statuses: [],
    ...overrides,
  };
}

describe('applyCharacterStateChanges', () => {
  it('returns input unchanged when changes is null/undefined', () => {
    const c = baseCharacter();
    expect(applyCharacterStateChanges(c, null)).toBe(c);
    expect(applyCharacterStateChanges(c, undefined)).toBe(c);
  });

  it('does not mutate the input character', () => {
    const c = baseCharacter({ wounds: 5 });
    const result = applyCharacterStateChanges(c, { woundsChange: -2 });
    expect(c.wounds).toBe(5);
    expect(result.wounds).toBe(3);
    expect(result).not.toBe(c);
  });

  describe('wounds', () => {
    it('reduces wounds within maxWounds bound', () => {
      const c = baseCharacter({ wounds: 15, maxWounds: 20 });
      const result = applyCharacterStateChanges(c, { woundsChange: -5 });
      expect(result.wounds).toBe(10);
    });

    it('clamps healing at maxWounds', () => {
      const c = baseCharacter({ wounds: 18, maxWounds: 20 });
      const result = applyCharacterStateChanges(c, { woundsChange: 10 });
      expect(result.wounds).toBe(20);
    });

    it('clamps damage at zero and marks dead', () => {
      const c = baseCharacter({ wounds: 3 });
      const result = applyCharacterStateChanges(c, { woundsChange: -10 });
      expect(result.wounds).toBe(0);
      expect(result.status).toBe('dead');
    });

    it('does not mark dead on healing to zero', () => {
      const c = baseCharacter({ wounds: 5 });
      const result = applyCharacterStateChanges(c, { woundsChange: 0 });
      expect(result.status).not.toBe('dead');
    });
  });

  describe('forceStatus', () => {
    it('sets status verbatim', () => {
      const c = baseCharacter();
      const result = applyCharacterStateChanges(c, { forceStatus: 'unconscious' });
      expect(result.status).toBe('unconscious');
    });
  });

  describe('character XP + level', () => {
    it('adds xp without level-up when below threshold', () => {
      // charLevelCost(2) = 5 * 2 * 2 = 20
      const c = baseCharacter({ characterXp: 0, characterLevel: 1 });
      const result = applyCharacterStateChanges(c, { xp: 15 });
      expect(result.characterLevel).toBe(1);
      expect(result.characterXp).toBe(15);
      expect(result.attributePoints).toBe(0);
    });

    it('levels up and grants an attribute point when crossing threshold', () => {
      const c = baseCharacter({ characterXp: 0, characterLevel: 1, attributePoints: 0 });
      const result = applyCharacterStateChanges(c, { xp: 25 });
      expect(result.characterLevel).toBe(2);
      expect(result.characterXp).toBe(5); // 25 - 20
      expect(result.attributePoints).toBe(1);
    });

    it('cascades multiple level-ups in one delta', () => {
      // costs: L2=20, L3=45, L4=80 — total 145 → should reach L4 with 0 leftover
      const c = baseCharacter({ characterXp: 0, characterLevel: 1 });
      const result = applyCharacterStateChanges(c, { xp: 145 });
      expect(result.characterLevel).toBe(4);
      expect(result.characterXp).toBe(0);
      expect(result.attributePoints).toBe(3);
    });

    it('accepts xpDelta alias', () => {
      const c = baseCharacter({ characterXp: 10, characterLevel: 1 });
      const result = applyCharacterStateChanges(c, { xpDelta: 5 });
      expect(result.characterXp).toBe(15);
    });
  });

  describe('mana', () => {
    it('reduces mana within max bound', () => {
      const c = baseCharacter({ mana: { current: 10, max: 20 } });
      const result = applyCharacterStateChanges(c, { manaChange: -3 });
      expect(result.mana).toEqual({ current: 7, max: 20 });
    });

    it('clamps mana current at max on heal', () => {
      const c = baseCharacter({ mana: { current: 18, max: 20 } });
      const result = applyCharacterStateChanges(c, { manaChange: 10 });
      expect(result.mana.current).toBe(20);
    });

    it('clamps mana current at zero on overdraw', () => {
      const c = baseCharacter({ mana: { current: 5, max: 20 } });
      const result = applyCharacterStateChanges(c, { manaChange: -20 });
      expect(result.mana.current).toBe(0);
    });

    it('expands mana max and keeps current', () => {
      const c = baseCharacter({ mana: { current: 10, max: 20 } });
      const result = applyCharacterStateChanges(c, { manaMaxChange: 5 });
      expect(result.mana).toEqual({ current: 10, max: 25 });
    });
  });

  describe('attributes', () => {
    it('adds delta per attribute and recalculates maxWounds from wytrzymalosc', () => {
      const c = baseCharacter({
        wounds: 10, maxWounds: 20,
        attributes: { sila: 10, inteligencja: 10, charyzma: 10, zrecznosc: 10, wytrzymalosc: 10, szczescie: 5 },
      });
      const result = applyCharacterStateChanges(c, {
        attributeChanges: { sila: 2, wytrzymalosc: 3 },
      });
      expect(result.attributes.sila).toBe(12);
      expect(result.attributes.wytrzymalosc).toBe(13);
      // maxWounds = wytrzymalosc*2 + 10 = 13*2 + 10 = 36
      expect(result.maxWounds).toBe(36);
    });

    it('clamps new attribute value at minimum of 1', () => {
      // Floor character: sila=1, applying -10 should clamp at 1.
      const c = baseCharacter();
      const result = applyCharacterStateChanges(c, { attributeChanges: { sila: -10 } });
      expect(result.attributes.sila).toBe(1);
    });

    it('clamps szczescie at minimum of 1 (same floor applies to luck)', () => {
      // Baseline has szczescie: 0; the mutation clamps at 1, so a +0 delta
      // would lift it to 1. Verify clamp direction by applying a negative.
      const c = baseCharacter();
      const result = applyCharacterStateChanges(c, { attributeChanges: { szczescie: -5 } });
      expect(result.attributes.szczescie).toBe(1);
    });

    it('clamps wounds to new maxWounds when wytrzymalosc drops', () => {
      const c = baseCharacter({
        wounds: 29, maxWounds: 30,
        attributes: { sila: 10, inteligencja: 10, charyzma: 10, zrecznosc: 10, wytrzymalosc: 10, szczescie: 5 },
      });
      const result = applyCharacterStateChanges(c, { attributeChanges: { wytrzymalosc: -3 } });
      // wytrzymalosc = 7, maxWounds = 7*2 + 10 = 24
      expect(result.maxWounds).toBe(24);
      expect(result.wounds).toBe(24);
    });
  });
});
