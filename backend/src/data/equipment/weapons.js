/**
 * RPGon weapon definitions — unified attackModes schema.
 *
 * Every weapon defines combat capability via `attackModes: { melee, ranged, aoe }`.
 * Each mode contains `damageComponents` using the same shape as damageTypes.js.
 *
 * qualities: extensible array — 'Piercing' = blockReduction capped at 50%
 * enchantSlots: 0 (early) | 1 (mid) | 3 (late)
 * price: { gold, silver, copper } — 1 GC = 10 SS = 100 CP
 */

export const WEAPONS = {
  // ── EARLY (starter, 0 enchant slots) ──
  'Pałka': {
    attackModes: {
      melee: { damageComponents: [{ type: 'fizyczne', formula: 'str*2', bonus: 1 }] },
      ranged: null,
      aoe: null,
    },
    qualities: [],
    group: 'Melee (Two-Handed)', twoHanded: true,
    enchantSlots: 0, price: { gold: 0, silver: 2, copper: 0 },
  },
  'Kij Bojowy': {
    attackModes: {
      melee: { damageComponents: [{ type: 'fizyczne', formula: 'str*2', bonus: 2 }] },
      ranged: null,
      aoe: null,
    },
    qualities: [],
    group: 'Melee (Two-Handed)', twoHanded: true,
    enchantSlots: 0, price: { gold: 0, silver: 3, copper: 0 },
  },
  'Proca': {
    attackModes: {
      melee: { damageComponents: [{ type: 'fizyczne', formula: 'str', bonus: -2 }], qualities: ['Improvised'] },
      ranged: { damageComponents: [{ type: 'fizyczne', formula: 'dex', bonus: 0 }], range: 15 },
      aoe: null,
    },
    qualities: [],
    group: 'Ranged (Sling)', twoHanded: false,
    enchantSlots: 0, price: { gold: 0, silver: 1, copper: 0 },
  },
  'Dagger': {
    attackModes: {
      melee: { damageComponents: [{ type: 'fizyczne', formula: 'str', bonus: 2 }] },
      ranged: null,
      aoe: null,
    },
    qualities: ['Fast'],
    group: 'Melee (Basic)', twoHanded: false,
    enchantSlots: 0, price: { gold: 0, silver: 1, copper: 0 },
  },
  'Spear': {
    attackModes: {
      melee: { damageComponents: [{ type: 'fizyczne', formula: 'str', bonus: 3 }] },
      ranged: null,
      aoe: null,
    },
    qualities: ['Impale', 'Fast'],
    group: 'Melee (Polearm)', twoHanded: false,
    enchantSlots: 0, price: { gold: 0, silver: 4, copper: 0 },
  },
  'Shortbow': {
    attackModes: {
      melee: { damageComponents: [{ type: 'fizyczne', formula: 'str', bonus: -2 }], qualities: ['Improvised'] },
      ranged: { damageComponents: [{ type: 'fizyczne', formula: 'dex', bonus: 2 }], range: 20 },
      aoe: null,
    },
    qualities: [],
    group: 'Ranged (Bow)', twoHanded: true,
    enchantSlots: 0, price: { gold: 0, silver: 5, copper: 0 },
  },

  // ── MID (1 enchant slot) ──
  'Hand Weapon': {
    attackModes: {
      melee: { damageComponents: [{ type: 'fizyczne', formula: 'str', bonus: 3 }] },
      ranged: null,
      aoe: null,
    },
    qualities: [],
    group: 'Melee (Basic)', twoHanded: false,
    enchantSlots: 1, price: { gold: 1, silver: 0, copper: 0 },
  },
  'Rapier': {
    attackModes: {
      melee: { damageComponents: [{ type: 'fizyczne', formula: 'str', bonus: 2 }] },
      ranged: null,
      aoe: null,
    },
    qualities: ['Fast', 'Impale'],
    group: 'Melee (Fencing)', twoHanded: false,
    enchantSlots: 1, price: { gold: 1, silver: 5, copper: 0 },
  },
  'Flail': {
    attackModes: {
      melee: { damageComponents: [{ type: 'fizyczne', formula: 'str', bonus: 4 }] },
      ranged: null,
      aoe: null,
    },
    qualities: ['Distract', 'Wrap'],
    group: 'Melee (Flail)', twoHanded: false,
    enchantSlots: 1, price: { gold: 1, silver: 5, copper: 0 },
  },
  'Topór Bojowy': {
    attackModes: {
      melee: { damageComponents: [{ type: 'fizyczne', formula: 'str*2', bonus: 4 }] },
      ranged: null,
      aoe: null,
    },
    qualities: ['Hack'],
    group: 'Melee (Two-Handed)', twoHanded: true,
    enchantSlots: 1, price: { gold: 1, silver: 5, copper: 0 },
  },
  'Halberd': {
    attackModes: {
      melee: { damageComponents: [{ type: 'fizyczne', formula: 'str*2', bonus: 5 }] },
      ranged: null,
      aoe: null,
    },
    qualities: ['Hack', 'Impale'],
    group: 'Melee (Polearm)', twoHanded: true,
    enchantSlots: 1, price: { gold: 2, silver: 5, copper: 0 },
  },
  'Longbow': {
    attackModes: {
      melee: { damageComponents: [{ type: 'fizyczne', formula: 'str', bonus: -2 }], qualities: ['Improvised'] },
      ranged: { damageComponents: [{ type: 'fizyczne', formula: 'str+dex', bonus: 0 }], range: 30 },
      aoe: null,
    },
    qualities: ['Impale'],
    group: 'Ranged (Bow)', twoHanded: true,
    enchantSlots: 1, price: { gold: 2, silver: 0, copper: 0 },
  },
  'Lekka Kusza': {
    attackModes: {
      melee: { damageComponents: [{ type: 'fizyczne', formula: 'str', bonus: -3 }], qualities: ['Improvised'] },
      ranged: { damageComponents: [{ type: 'fizyczne', fixedDamage: 15 }], range: 25 },
      aoe: null,
    },
    qualities: ['Slow', 'Piercing'],
    group: 'Ranged (Crossbow)', twoHanded: true,
    enchantSlots: 1, price: { gold: 2, silver: 0, copper: 0 },
  },

  // ── LATE (3 enchant slots, buffed stats) ──
  'Młot Wojenny': {
    attackModes: {
      melee: { damageComponents: [{ type: 'fizyczne', formula: 'str', bonus: 7 }] },
      ranged: null,
      aoe: null,
    },
    qualities: ['Crush'],
    group: 'Melee (Basic)', twoHanded: false,
    enchantSlots: 3, price: { gold: 6, silver: 0, copper: 0 },
  },
  'Great Weapon': {
    attackModes: {
      melee: { damageComponents: [{ type: 'fizyczne', formula: 'str*2', bonus: 8 }] },
      ranged: null,
      aoe: null,
    },
    qualities: ['Slow'],
    group: 'Melee (Two-Handed)', twoHanded: true,
    enchantSlots: 3, price: { gold: 7, silver: 0, copper: 0 },
  },
  'Crossbow': {
    attackModes: {
      melee: { damageComponents: [{ type: 'fizyczne', formula: 'str', bonus: -3 }], qualities: ['Improvised'] },
      ranged: { damageComponents: [{ type: 'fizyczne', fixedDamage: 25 }], range: 30 },
      aoe: null,
    },
    qualities: ['Piercing', 'Slow'],
    group: 'Ranged (Crossbow)', twoHanded: true,
    enchantSlots: 3, price: { gold: 10, silver: 0, copper: 0 },
  },
  'Pistol': {
    attackModes: {
      melee: { damageComponents: [{ type: 'fizyczne', formula: 'str', bonus: -2 }], qualities: ['Improvised'] },
      ranged: { damageComponents: [{ type: 'fizyczne', fixedDamage: 20 }], range: 8 },
      aoe: null,
    },
    qualities: ['Piercing'],
    group: 'Ranged (Blackpowder)', twoHanded: false,
    enchantSlots: 3, price: { gold: 15, silver: 0, copper: 0 },
  },
};
