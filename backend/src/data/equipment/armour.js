/**
 * RPGon armour and shield definitions.
 *
 * Armour: flat damage reduction (DR), dodge penalty by tier.
 * Shields: passive block chance + block reduction, dodge penalty.
 *
 * Combat flow:
 *   1. Dodge check (Zręczność + Dodge + armour.dodgePenalty + shield.dodgePenalty vs difficulty)
 *   2. Shield block (d50 ≤ blockChance → rawDamage × (1 - blockReduction))
 *      - 'Piercing' quality caps blockReduction at 0.5
 *   3. Armour DR: finalDamage = max(0, rawDamage - damageReduction)
 */

export const ARMOUR = {
  // ── EARLY ──
  'Leather Jack': {
    type: 'light', damageReduction: 2, dodgePenalty: 0,
    price: { gold: 0, silver: 3, copper: 0 },
  },
  'Gambeson': {
    type: 'light', damageReduction: 3, dodgePenalty: 0,
    price: { gold: 0, silver: 5, copper: 0 },
  },

  // ── MID ──
  'Leather Jerkin': {
    type: 'light', damageReduction: 3, dodgePenalty: 0,
    price: { gold: 1, silver: 0, copper: 0 },
  },
  'Mail Shirt': {
    type: 'medium', damageReduction: 5, dodgePenalty: -25,
    price: { gold: 3, silver: 0, copper: 0 },
  },
  'Mail Coat': {
    type: 'medium', damageReduction: 6, dodgePenalty: -25,
    price: { gold: 5, silver: 0, copper: 0 },
  },

  // ── LATE ──
  'Breastplate': {
    type: 'medium', damageReduction: 7, dodgePenalty: -25,
    price: { gold: 8, silver: 0, copper: 0 },
  },
  'Full Plate': {
    type: 'heavy', damageReduction: 10, dodgePenalty: -50,
    price: { gold: 25, silver: 0, copper: 0 },
  },
};

export const SHIELDS = {
  // ── EARLY ──
  'Buckler': {
    type: 'light', dodgePenalty: 0,
    blockChance: 30, blockReduction: 0.4,
    price: { gold: 0, silver: 3, copper: 0 },
  },

  // ── MID ──
  'Shield': {
    type: 'medium', dodgePenalty: -10,
    blockChance: 45, blockReduction: 0.6,
    price: { gold: 1, silver: 0, copper: 0 },
  },

  // ── LATE ──
  'Tower Shield': {
    type: 'heavy', dodgePenalty: -25,
    blockChance: 60, blockReduction: 0.8,
    price: { gold: 5, silver: 0, copper: 0 },
  },
};
