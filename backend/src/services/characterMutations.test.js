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
      // characterXp is a monotonic lifetime total — crossing the cumulative
      // threshold for level 2 (20) promotes level but leaves XP untouched.
      const c = baseCharacter({ characterXp: 0, characterLevel: 1, attributePoints: 0 });
      const result = applyCharacterStateChanges(c, { xp: 25 });
      expect(result.characterLevel).toBe(2);
      expect(result.characterXp).toBe(25);
      expect(result.attributePoints).toBe(1);
    });

    it('cascades multiple level-ups in one delta', () => {
      // cumulative thresholds: L2=20, L3=65, L4=145 — 145 XP lifts the
      // character to L4 and the xp stays at the lifetime total (145).
      const c = baseCharacter({ characterXp: 0, characterLevel: 1 });
      const result = applyCharacterStateChanges(c, { xp: 145 });
      expect(result.characterLevel).toBe(4);
      expect(result.characterXp).toBe(145);
      expect(result.attributePoints).toBe(3);
    });

    it('never decrements characterXp when levelling up from existing total', () => {
      // Starting with characterXp=145 at L4 (the exact cumulative threshold)
      // and feeding another +100 lifts them past L5's cumulative (270) to L5
      // with xp preserved at 245 — never rewound.
      const c = baseCharacter({ characterXp: 145, characterLevel: 4, attributePoints: 0 });
      const result = applyCharacterStateChanges(c, { xp: 100 });
      expect(result.characterLevel).toBe(4);
      expect(result.characterXp).toBe(245);
      expect(result.attributePoints).toBe(0);
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

  describe('inventory stacking (F4 — name-keyed)', () => {
    it('stacks newItems with the same slugified name into one row with summed qty', () => {
      const c = baseCharacter({
        inventory: [{ id: 'mikstura_zycia', name: 'Mikstura Życia', quantity: 1 }],
      });
      const result = applyCharacterStateChanges(c, {
        newItems: [
          { name: 'Mikstura Życia', quantity: 2 },
          { name: 'mikstura zycia', quantity: 1 },
        ],
      });
      expect(result.inventory).toHaveLength(1);
      expect(result.inventory[0]).toMatchObject({
        id: 'mikstura_zycia',
        name: 'Mikstura Życia',
        quantity: 4,
      });
    });

    it('keeps materials separate from items even when names collide', () => {
      const c = baseCharacter();
      const result = applyCharacterStateChanges(c, {
        newItems: [
          { name: 'Skóra', quantity: 3, type: 'material' },
          { name: 'Skóra', quantity: 1 },
        ],
      });
      expect(result.materialBag).toEqual([{ name: 'Skóra', quantity: 3 }]);
      expect(result.inventory).toHaveLength(1);
      expect(result.inventory[0]).toMatchObject({ name: 'Skóra', quantity: 1 });
    });

    it('removeItemsByName drains the materialBag first, then spills into inventory', () => {
      const c = baseCharacter({
        materialBag: [{ name: 'Skóra', quantity: 2 }],
        inventory: [{ id: 'skora', name: 'Skóra', quantity: 5 }],
      });
      const result = applyCharacterStateChanges(c, {
        removeItemsByName: [{ name: 'Skóra', quantity: 4 }],
      });
      // bag drained completely (-2), inventory loses the remaining 2
      expect(result.materialBag).toEqual([]);
      expect(result.inventory[0].quantity).toBe(3);
    });

    it('matches removeItemsByName regardless of accent/case', () => {
      const c = baseCharacter({
        materialBag: [{ name: 'mikstura zycia', quantity: 5 }],
      });
      const result = applyCharacterStateChanges(c, {
        removeItemsByName: [{ name: 'Mikstura Życia', quantity: 2 }],
      });
      expect(result.materialBag[0].quantity).toBe(3);
    });
  });
});
