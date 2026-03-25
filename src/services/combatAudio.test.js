import { describe, expect, it } from 'vitest';
import {
  getCombatBattleCryLine,
  getCombatBattleCryLines,
  getCombatPreloadCategories,
  getCombatReactionCategory,
  getCombatResultCategory,
  getCombatSfxVariants,
} from './combatAudio.js';

describe('combatAudio', () => {
  it('provides static file variants for mapped combat categories', () => {
    expect(getCombatSfxVariants('meleeAttack')).toHaveLength(3);
    expect(getCombatSfxVariants('rangedAttack')).toHaveLength(2);
    expect(getCombatSfxVariants('hurt')).toHaveLength(3);
  });

  it('provides ten battle cry lines per supported language', () => {
    expect(getCombatBattleCryLines('pl')).toHaveLength(10);
    expect(getCombatBattleCryLines('en')).toHaveLength(10);
  });

  it('falls back to polish battle cries for unsupported languages', () => {
    expect(getCombatBattleCryLines('de')).toEqual(getCombatBattleCryLines('pl'));
    expect(getCombatBattleCryLine('de', 2)).toBe(getCombatBattleCryLine('pl', 2));
  });

  it('maps sword-like attacks to melee attack category', () => {
    expect(getCombatResultCategory({
      manoeuvreKey: 'attack',
      weaponName: 'Rapier',
    })).toBe('meleeAttack');
  });

  it('maps ranged attacks to shared ranged category', () => {
    expect(getCombatResultCategory({
      manoeuvreKey: 'rangedAttack',
      weaponName: 'Pistol',
    })).toBe('rangedAttack');
  });

  it('maps action-specific manoeuvres to dedicated categories', () => {
    expect(getCombatResultCategory({ manoeuvreKey: 'charge', weaponName: 'Spear' })).toBe('charge');
    expect(getCombatResultCategory({ manoeuvreKey: 'defend' })).toBe('defend');
    expect(getCombatResultCategory({ manoeuvreKey: 'dodge' })).toBe('dodge');
    expect(getCombatResultCategory({ manoeuvreKey: 'feint', weaponName: 'Hand Weapon' })).toBe('feint');
  });

  it('adds hurt reaction only when a damaging hit lands', () => {
    expect(getCombatReactionCategory({ outcome: 'hit', damage: 4 })).toBe('hurt');
    expect(getCombatReactionCategory({ outcome: 'hit', damage: 0 })).toBeNull();
    expect(getCombatReactionCategory({ outcome: 'miss', damage: 4 })).toBeNull();
  });

  it('preloads core combat categories from participants', () => {
    const categories = getCombatPreloadCategories({
      combatants: [
        { weapons: ['Pistol'] },
        { weapons: ['Halberd'] },
        { inventory: ['Hand Weapon'], knownSpells: [{ name: 'Magic Dart' }] },
      ],
    });

    expect(categories).toContain('rangedAttack');
    expect(categories).toContain('meleeAttack');
    expect(categories).toContain('hurt');
    expect(categories).toContain('charge');
    expect(categories).toContain('feint');
  });
});
