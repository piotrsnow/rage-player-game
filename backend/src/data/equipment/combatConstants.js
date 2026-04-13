/**
 * RPGon combat constants and manoeuvres.
 */

export const MELEE_RANGE = 2;
export const BATTLEFIELD_MAX = 20;
export const DEFAULT_MOVEMENT = 4;

export const MANOEUVRES = {
  attack: { name: 'Attack', type: 'offensive', skill: 'Melee (Basic)', opposed: 'Melee (Basic)', description: 'Standard melee attack using Weapon Skill', range: 'melee', modifiers: {} },
  rangedAttack: { name: 'Ranged Attack', type: 'offensive', skill: 'Ranged (Bow)', opposed: null, description: 'Ranged attack using Ballistic Skill', range: 'ranged', modifiers: {} },
  dodge: { name: 'Dodge', type: 'defensive', skill: 'Dodge', opposed: null, description: 'Attempt to dodge incoming attacks, gaining defensive bonus', range: 'self', modifiers: { defensive: true } },
  feint: { name: 'Feint', type: 'offensive', skill: 'Melee (Basic)', opposed: 'Melee (Basic)', description: 'Feint to wrong-foot opponent — next attack gains +1 Advantage', range: 'melee', modifiers: { feint: true } },
  charge: { name: 'Charge', type: 'offensive', skill: 'Melee (Basic)', opposed: 'Melee (Basic)', description: 'Move and attack — +1 Advantage on success', range: 'charge', closesDistance: true, modifiers: { chargeBonus: true } },
  flee: { name: 'Flee', type: 'movement', skill: 'Athletics', opposed: 'Athletics', description: 'Attempt to disengage and flee combat', range: 'self', modifiers: { flee: true } },
  castSpell: { name: 'Cast Spell', type: 'magic', skill: 'Channelling', opposed: null, description: 'Cast a prepared spell', range: 'ranged', modifiers: {} },
  defend: { name: 'Defend', type: 'defensive', skill: null, opposed: null, description: 'Full defensive stance — +20 to all defensive tests this round', range: 'self', modifiers: { defendBonus: 20 } },
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
