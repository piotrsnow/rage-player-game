/**
 * RPGon combat constants and manoeuvres.
 */

export const MELEE_RANGE = 1;
export const BATTLEFIELD_WIDTH = 16;
export const BATTLEFIELD_HEIGHT = 9;
export const DEFAULT_MOVEMENT = 8;

export const MANOEUVRES = {
  attack: { name: 'Attack', type: 'offensive', skill: 'Melee (Basic)', opposed: 'Melee (Basic)', description: 'Standard melee attack using Weapon Skill', range: 'melee', modifiers: {} },
  rangedAttack: { name: 'Ranged Attack', type: 'offensive', skill: 'Ranged (Bow)', opposed: null, description: 'Ranged attack using Ballistic Skill', range: 'ranged', modifiers: {} },
  dodge: { name: 'Dodge', type: 'defensive', skill: 'Dodge', opposed: null, description: 'Attempt to dodge incoming attacks, gaining defensive bonus', range: 'self', modifiers: { defensive: true } },
  feint: { name: 'Feint', type: 'offensive', skill: 'Melee (Basic)', opposed: 'Melee (Basic)', description: 'Feint to wrong-foot opponent — next attack gains +1 Advantage', range: 'melee', modifiers: { feint: true } },
  charge: { name: 'Charge', type: 'offensive', skill: 'Melee (Basic)', opposed: 'Melee (Basic)', description: 'Move and attack — +1 Advantage on success', range: 'charge', closesDistance: true, modifiers: { chargeBonus: true } },
  flee: { name: 'Flee', type: 'movement', skill: 'Athletics', opposed: 'Athletics', description: 'Attempt to disengage and flee combat', range: 'self', modifiers: { flee: true } },
  castSpell: { name: 'Cast Spell', type: 'magic', skill: 'Channelling', opposed: null, description: 'Cast a prepared spell', range: 'ranged', modifiers: {} },
  defend: { name: 'Defend', type: 'defensive', skill: null, opposed: null, description: 'Full defensive stance — +20 to all defensive tests this round', range: 'self', modifiers: { defendBonus: 20 } },
  shove: { name: 'Shove', type: 'offensive', skill: 'Melee (Basic)', opposed: 'Melee (Basic)', description: 'Push an enemy up to two cells in the direction you face them (or adjacent diagonals). Strength vs Strength+Toughness test.', range: 'melee', modifiers: { shove: true } },
};

export const TERRAIN_TILES = {
  sureHit:         { name: 'Pole Pewnego Trafienia', emoji: '\u{1F3AF}', color: '#fbbf24', oneShot: true,  category: 'offensive' },
  fury:            { name: 'Pole Furii',             emoji: '\u{1F525}', color: '#ef4444', oneShot: false, category: 'offensive' },
  damageReduction: { name: 'Pole Ochrony',           emoji: '\u{1F6E1}\uFE0F', color: '#3b82f6', oneShot: false, category: 'defensive' },
  regeneration:    { name: 'Pole Regeneracji',        emoji: '\u{1F49A}', color: '#22c55e', oneShot: false, category: 'defensive' },
  extraTurn:       { name: 'Pole Dodatkowej Tury',    emoji: '\u26A1',    color: '#a855f7', oneShot: true,  category: 'tactical' },
  teleport:        { name: 'Pole Teleportacji',       emoji: '\u{1F300}', color: '#06b6d4', oneShot: false, category: 'tactical' },
  poison:          { name: 'Pole Trucizny',           emoji: '\u2620\uFE0F',    color: '#84cc16', oneShot: false, category: 'hazardous' },
  freeze:          { name: 'Pole Zamro\u017Cenia',    emoji: '\u2744\uFE0F',    color: '#93c5fd', oneShot: false, category: 'hazardous' },
};

export const TERRAIN_SPAWN_CONFIG = {
  minCount: 5,
  maxCount: 8,
  spawnMarginCols: 4,
};

export const HIT_LOCATIONS = [
  { range: [1, 9], location: 'head' },
  { range: [10, 24], location: 'head' },
  { range: [25, 44], location: 'body' },
  { range: [45, 79], location: 'body' },
  { range: [80, 84], location: 'arms' },
  { range: [85, 89], location: 'arms' },
  { range: [90, 94], location: 'legs' },
  { range: [95, 100], location: 'legs' },
];
