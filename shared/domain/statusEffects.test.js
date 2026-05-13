import { describe, it, expect } from 'vitest';
import {
  computeEffectiveMods,
  tickEffects,
  isRestricted,
  addEffect,
  removeEffect,
  removeEffectsByName,
  migrateStatusStrings,
  deriveStatusNames,
  StatusEffectSchema,
} from './statusEffects.js';

const makeEffect = (overrides = {}) => ({
  id: 'fx_1',
  name: 'Zatrucie',
  source: 'combat',
  category: 'dot',
  duration: { type: 'rounds', remaining: 3 },
  mechanics: { dotDamage: 2, attributeMods: { sila: -3 } },
  stackable: false,
  description: 'Test poison',
  ...overrides,
});

describe('StatusEffectSchema', () => {
  it('validates a well-formed effect', () => {
    const result = StatusEffectSchema.safeParse(makeEffect());
    expect(result.success).toBe(true);
  });

  it('rejects missing id', () => {
    const result = StatusEffectSchema.safeParse({ ...makeEffect(), id: '' });
    expect(result.success).toBe(false);
  });
});

describe('computeEffectiveMods', () => {
  it('returns zeroes for empty array', () => {
    const mods = computeEffectiveMods([]);
    expect(mods.testMod).toBe(0);
    expect(mods.damageReduction).toBe(0);
    expect(mods.attributeMods).toEqual({});
  });

  it('sums attribute mods from multiple effects', () => {
    const effects = [
      makeEffect({ mechanics: { attributeMods: { sila: -3, zrecznosc: 2 } } }),
      makeEffect({ id: 'fx_2', mechanics: { attributeMods: { sila: -2 } } }),
    ];
    const mods = computeEffectiveMods(effects);
    expect(mods.attributeMods.sila).toBe(-5);
    expect(mods.attributeMods.zrecznosc).toBe(2);
  });

  it('sums skill mods and testMod', () => {
    const effects = [
      makeEffect({ mechanics: { skillMods: { 'Walka Wręcz': -5 }, testMod: -3 } }),
      makeEffect({ id: 'fx_2', mechanics: { skillMods: { 'Walka Wręcz': 2 }, testMod: -1 } }),
    ];
    const mods = computeEffectiveMods(effects);
    expect(mods.skillMods['Walka Wręcz']).toBe(-3);
    expect(mods.testMod).toBe(-4);
  });

  it('handles null/undefined gracefully', () => {
    expect(computeEffectiveMods(null)).toEqual({
      attributeMods: {}, skillMods: {}, testMod: 0, damageReduction: 0, movementMod: 0,
    });
  });
});

describe('tickEffects', () => {
  it('decrements round-based effects', () => {
    const effects = [makeEffect({ duration: { type: 'rounds', remaining: 2 } })];
    const result = tickEffects(effects, 'rounds');
    expect(result.remaining).toHaveLength(1);
    expect(result.remaining[0].duration.remaining).toBe(1);
    expect(result.expired).toHaveLength(0);
    expect(result.dotDamage).toBe(2);
  });

  it('expires effects at remaining=1', () => {
    const effects = [makeEffect({ duration: { type: 'rounds', remaining: 1 } })];
    const result = tickEffects(effects, 'rounds');
    expect(result.remaining).toHaveLength(0);
    expect(result.expired).toHaveLength(1);
    expect(result.dotDamage).toBe(2);
  });

  it('does not tick mismatched duration types', () => {
    const effects = [makeEffect({ duration: { type: 'scenes', remaining: 5 } })];
    const result = tickEffects(effects, 'rounds');
    expect(result.remaining).toHaveLength(1);
    expect(result.remaining[0].duration.remaining).toBe(5);
  });

  it('removes until_rest effects on rest tick', () => {
    const effects = [makeEffect({ duration: { type: 'until_rest', remaining: null } })];
    const result = tickEffects(effects, 'until_rest');
    expect(result.remaining).toHaveLength(0);
    expect(result.expired).toHaveLength(1);
  });

  it('applies resist check and removes on save', () => {
    const effects = [makeEffect({
      duration: { type: 'rounds', remaining: 5 },
      mechanics: { dotDamage: 1, resistCheck: { attribute: 'wytrzymalosc', threshold: 25 } },
    })];
    const result = tickEffects(effects, 'rounds', { resistRoll: () => true });
    expect(result.remaining).toHaveLength(0);
    expect(result.expired).toHaveLength(1);
  });

  it('keeps effect when resist check fails', () => {
    const effects = [makeEffect({
      duration: { type: 'rounds', remaining: 5 },
      mechanics: { dotDamage: 1, resistCheck: { attribute: 'wytrzymalosc', threshold: 25 } },
    })];
    const result = tickEffects(effects, 'rounds', { resistRoll: () => false });
    expect(result.remaining).toHaveLength(1);
    expect(result.dotDamage).toBe(1);
  });
});

describe('isRestricted', () => {
  it('returns true when action is blocked', () => {
    const effects = [makeEffect({ mechanics: { restrictions: ['no_attack', 'no_movement'] } })];
    expect(isRestricted(effects, 'no_attack')).toBe(true);
    expect(isRestricted(effects, 'no_movement')).toBe(true);
  });

  it('returns false when action not blocked', () => {
    const effects = [makeEffect({ mechanics: { restrictions: ['no_magic'] } })];
    expect(isRestricted(effects, 'no_attack')).toBe(false);
  });

  it('handles empty/null', () => {
    expect(isRestricted([], 'no_attack')).toBe(false);
    expect(isRestricted(null, 'no_attack')).toBe(false);
  });
});

describe('addEffect', () => {
  it('replaces non-stackable same-name effect', () => {
    const existing = [makeEffect({ duration: { type: 'rounds', remaining: 1 } })];
    const newFx = makeEffect({ id: 'fx_new', duration: { type: 'rounds', remaining: 5 } });
    const result = addEffect(existing, newFx);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('fx_new');
    expect(result[0].duration.remaining).toBe(5);
  });

  it('allows stacking up to 5', () => {
    let effects = [];
    for (let i = 0; i < 6; i++) {
      effects = addEffect(effects, makeEffect({ id: `fx_${i}`, stackable: true }));
    }
    expect(effects).toHaveLength(5);
  });

  it('adds new effect normally', () => {
    const result = addEffect([], makeEffect());
    expect(result).toHaveLength(1);
  });
});

describe('removeEffect', () => {
  it('removes by id', () => {
    const effects = [makeEffect({ id: 'a' }), makeEffect({ id: 'b', name: 'Inne' })];
    expect(removeEffect(effects, 'a')).toHaveLength(1);
    expect(removeEffect(effects, 'a')[0].id).toBe('b');
  });
});

describe('removeEffectsByName', () => {
  it('removes all effects with matching name', () => {
    const effects = [
      makeEffect({ id: 'a', name: 'Poison', stackable: true }),
      makeEffect({ id: 'b', name: 'Poison', stackable: true }),
      makeEffect({ id: 'c', name: 'Shield' }),
    ];
    const result = removeEffectsByName(effects, 'Poison');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Shield');
  });
});

describe('migrateStatusStrings', () => {
  it('converts string array to minimal effects', () => {
    const result = migrateStatusStrings(['zatruty', 'oslabiony']);
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('zatruty');
    expect(result[0].source).toBe('ai');
    expect(result[0].duration.type).toBe('scenes');
  });

  it('filters empty strings', () => {
    expect(migrateStatusStrings(['', '  ', 'valid'])).toHaveLength(1);
  });

  it('handles null', () => {
    expect(migrateStatusStrings(null)).toEqual([]);
  });
});

describe('deriveStatusNames', () => {
  it('extracts names from effects', () => {
    const effects = [makeEffect({ name: 'A' }), makeEffect({ id: 'b', name: 'B' })];
    expect(deriveStatusNames(effects)).toEqual(['A', 'B']);
  });
});
