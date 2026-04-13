/**
 * RPGon weapon definitions.
 *
 * damageType: 'melee-1h' | 'melee-2h' | 'ranged-dex' | 'ranged-str-dex' | 'ranged-fixed'
 * bonus: flat modifier added to attribute-based formula
 * fixedDamage: used only for 'ranged-fixed' type
 * qualities: extensible array — 'Piercing' = blockReduction capped at 50%
 * enchantSlots: 0 (early) | 1 (mid) | 3 (late)
 * price: { gold, silver, copper } — 1 GC = 10 SS = 100 CP
 */

export const WEAPONS = {
  // ── EARLY (starter, 0 enchant slots) ──
  'Pałka': {
    damageType: 'melee-2h', bonus: 1, qualities: [],
    group: 'Melee (Two-Handed)', twoHanded: true,
    enchantSlots: 0, price: { gold: 0, silver: 2, copper: 0 },
  },
  'Kij Bojowy': {
    damageType: 'melee-2h', bonus: 2, qualities: [],
    group: 'Melee (Two-Handed)', twoHanded: true,
    enchantSlots: 0, price: { gold: 0, silver: 3, copper: 0 },
  },
  'Proca': {
    damageType: 'ranged-dex', bonus: 0, qualities: [],
    group: 'Ranged (Sling)', range: 15, twoHanded: false,
    enchantSlots: 0, price: { gold: 0, silver: 1, copper: 0 },
  },
  'Dagger': {
    damageType: 'melee-1h', bonus: 2, qualities: ['Fast'],
    group: 'Melee (Basic)', twoHanded: false,
    enchantSlots: 0, price: { gold: 0, silver: 1, copper: 0 },
  },
  'Spear': {
    damageType: 'melee-1h', bonus: 3, qualities: ['Impale', 'Fast'],
    group: 'Melee (Polearm)', twoHanded: false,
    enchantSlots: 0, price: { gold: 0, silver: 4, copper: 0 },
  },
  'Shortbow': {
    damageType: 'ranged-dex', bonus: 2, qualities: [],
    group: 'Ranged (Bow)', range: 20, twoHanded: true,
    enchantSlots: 0, price: { gold: 0, silver: 5, copper: 0 },
  },

  // ── MID (1 enchant slot) ──
  'Hand Weapon': {
    damageType: 'melee-1h', bonus: 3, qualities: [],
    group: 'Melee (Basic)', twoHanded: false,
    enchantSlots: 1, price: { gold: 1, silver: 0, copper: 0 },
  },
  'Rapier': {
    damageType: 'melee-1h', bonus: 2, qualities: ['Fast', 'Impale'],
    group: 'Melee (Fencing)', twoHanded: false,
    enchantSlots: 1, price: { gold: 1, silver: 5, copper: 0 },
  },
  'Flail': {
    damageType: 'melee-1h', bonus: 4, qualities: ['Distract', 'Wrap'],
    group: 'Melee (Flail)', twoHanded: false,
    enchantSlots: 1, price: { gold: 1, silver: 5, copper: 0 },
  },
  'Topór Bojowy': {
    damageType: 'melee-2h', bonus: 4, qualities: ['Hack'],
    group: 'Melee (Two-Handed)', twoHanded: true,
    enchantSlots: 1, price: { gold: 1, silver: 5, copper: 0 },
  },
  'Halberd': {
    damageType: 'melee-2h', bonus: 5, qualities: ['Hack', 'Impale'],
    group: 'Melee (Polearm)', twoHanded: true,
    enchantSlots: 1, price: { gold: 2, silver: 5, copper: 0 },
  },
  'Longbow': {
    damageType: 'ranged-str-dex', bonus: 0, qualities: ['Impale'],
    group: 'Ranged (Bow)', range: 30, twoHanded: true,
    enchantSlots: 1, price: { gold: 2, silver: 0, copper: 0 },
  },
  'Lekka Kusza': {
    damageType: 'ranged-fixed', fixedDamage: 15, qualities: ['Slow', 'Piercing'],
    group: 'Ranged (Crossbow)', range: 25, twoHanded: true,
    enchantSlots: 1, price: { gold: 2, silver: 0, copper: 0 },
  },

  // ── LATE (3 enchant slots, buffed stats) ──
  'Młot Wojenny': {
    damageType: 'melee-1h', bonus: 7, qualities: ['Crush'],
    group: 'Melee (Basic)', twoHanded: false,
    enchantSlots: 3, price: { gold: 6, silver: 0, copper: 0 },
  },
  'Great Weapon': {
    damageType: 'melee-2h', bonus: 8, qualities: ['Slow'],
    group: 'Melee (Two-Handed)', twoHanded: true,
    enchantSlots: 3, price: { gold: 7, silver: 0, copper: 0 },
  },
  'Crossbow': {
    damageType: 'ranged-fixed', fixedDamage: 25, qualities: ['Piercing', 'Slow'],
    group: 'Ranged (Crossbow)', range: 30, twoHanded: true,
    enchantSlots: 3, price: { gold: 10, silver: 0, copper: 0 },
  },
  'Pistol': {
    damageType: 'ranged-fixed', fixedDamage: 20, qualities: ['Piercing'],
    group: 'Ranged (Blackpowder)', range: 8, twoHanded: false,
    enchantSlots: 3, price: { gold: 15, silver: 0, copper: 0 },
  },
};
