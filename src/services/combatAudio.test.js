import { describe, expect, it, vi } from 'vitest';

vi.mock('./gameDataService.js', () => ({
  gameData: {
    getWeaponData: (name) => {
      const weapons = {
        'Hand Weapon': { damageType: 'melee-1h', bonus: 3, group: 'Melee (Basic)' },
        'Long Bow': { damageType: 'ranged-dex', bonus: 4, group: 'Ranged' },
        'Flintlock Pistol': { damageType: 'ranged-fixed', fixedDamage: 8, group: 'Ranged (Blackpowder)' },
      };
      return weapons[name] || weapons['Hand Weapon'];
    },
  },
}));

import {
  getCombatResultCategory,
  getCombatReactionCategory,
  getCombatSfxVariants,
  getCombatPreloadCategories,
  getCombatBattleCryLine,
} from './combatAudio.js';

describe('getCombatResultCategory', () => {
  it('returns weapon category for melee attack', () => {
    expect(getCombatResultCategory({ manoeuvreKey: 'attack', weaponName: 'Hand Weapon' })).toBe('meleeAttack');
  });

  it('returns ranged category for ranged weapon', () => {
    expect(getCombatResultCategory({ manoeuvreKey: 'attack', weaponName: 'Long Bow' })).toBe('rangedAttack');
  });

  it('returns defend for defend manoeuvre', () => {
    expect(getCombatResultCategory({ manoeuvreKey: 'defend' })).toBe('defend');
  });

  it('returns dodge for dodge manoeuvre', () => {
    expect(getCombatResultCategory({ manoeuvreKey: 'dodge' })).toBe('dodge');
  });

  it('returns null for castSpell', () => {
    expect(getCombatResultCategory({ manoeuvreKey: 'castSpell' })).toBeNull();
  });

  it('returns null for null result', () => {
    expect(getCombatResultCategory(null)).toBeNull();
  });
});

describe('getCombatReactionCategory', () => {
  it('returns hurt when hit with damage', () => {
    expect(getCombatReactionCategory({ outcome: 'hit', damage: 5 })).toBe('hurt');
  });

  it('returns null when miss', () => {
    expect(getCombatReactionCategory({ outcome: 'miss', damage: 0 })).toBeNull();
  });

  it('returns null when hit with 0 damage', () => {
    expect(getCombatReactionCategory({ outcome: 'hit', damage: 0 })).toBeNull();
  });
});

describe('getCombatSfxVariants', () => {
  it('returns variants for known category', () => {
    const urls = getCombatSfxVariants('meleeAttack');
    expect(urls.length).toBeGreaterThan(0);
    expect(urls[0]).toMatch(/\.mp3$/);
  });

  it('returns empty array for unknown category', () => {
    expect(getCombatSfxVariants('nonExistent')).toEqual([]);
  });
});

describe('getCombatPreloadCategories', () => {
  it('includes base categories', () => {
    const cats = getCombatPreloadCategories({ combatants: [] });
    expect(cats).toContain('defend');
    expect(cats).toContain('dodge');
    expect(cats).toContain('hurt');
  });
});

describe('getCombatBattleCryLine', () => {
  it('returns a string for valid index', () => {
    const line = getCombatBattleCryLine('pl', 0);
    expect(typeof line).toBe('string');
    expect(line.length).toBeGreaterThan(0);
  });

  it('wraps around for large index', () => {
    const line = getCombatBattleCryLine('pl', 100);
    expect(typeof line).toBe('string');
    expect(line.length).toBeGreaterThan(0);
  });
});
