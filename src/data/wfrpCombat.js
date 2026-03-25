export const MELEE_RANGE = 2;
export const BATTLEFIELD_MAX = 20;
export const DEFAULT_MOVEMENT = 4;

export const MANOEUVRES = {
  attack: {
    name: 'Attack',
    type: 'offensive',
    skill: 'Melee (Basic)',
    opposed: 'Melee (Basic)',
    description: 'Standard melee attack using Weapon Skill',
    range: 'melee',
    modifiers: {},
  },
  rangedAttack: {
    name: 'Ranged Attack',
    type: 'offensive',
    skill: 'Ranged (Bow)',
    opposed: null,
    description: 'Ranged attack using Ballistic Skill',
    range: 'ranged',
    modifiers: {},
  },
  dodge: {
    name: 'Dodge',
    type: 'defensive',
    skill: 'Dodge',
    opposed: null,
    description: 'Attempt to dodge incoming attacks, gaining defensive bonus',
    range: 'self',
    modifiers: { defensive: true },
  },
  feint: {
    name: 'Feint',
    type: 'offensive',
    skill: 'Melee (Basic)',
    opposed: 'Melee (Basic)',
    description: 'Feint to wrong-foot opponent — next attack gains +1 Advantage',
    range: 'melee',
    modifiers: { feint: true },
  },
  charge: {
    name: 'Charge',
    type: 'offensive',
    skill: 'Melee (Basic)',
    opposed: 'Melee (Basic)',
    description: 'Move and attack — +1 Advantage on success',
    range: 'charge',
    closesDistance: true,
    modifiers: { chargeBonus: true },
  },
  flee: {
    name: 'Flee',
    type: 'movement',
    skill: 'Athletics',
    opposed: 'Athletics',
    description: 'Attempt to disengage and flee combat',
    range: 'self',
    modifiers: { flee: true },
  },
  castSpell: {
    name: 'Cast Spell',
    type: 'magic',
    skill: 'Channelling',
    opposed: null,
    description: 'Cast a prepared spell',
    range: 'ranged',
    modifiers: {},
  },
  defend: {
    name: 'Defend',
    type: 'defensive',
    skill: null,
    opposed: null,
    description: 'Full defensive stance — +20 to all defensive tests this round',
    range: 'self',
    modifiers: { defendBonus: 20 },
  },
};

export const WEAPONS = {
  'Hand Weapon': { damage: '+SB', qualities: [], group: 'Melee (Basic)', twoHanded: false },
  'Great Weapon': { damage: '+SB+1', qualities: ['Damaging', 'Slow'], group: 'Melee (Two-Handed)', twoHanded: true },
  'Dagger': { damage: '+SB-2', qualities: ['Undamaging'], group: 'Melee (Basic)', twoHanded: false },
  'Rapier': { damage: '+SB', qualities: ['Fast', 'Impale'], group: 'Melee (Fencing)', twoHanded: false },
  'Flail': { damage: '+SB+1', qualities: ['Distract', 'Wrap'], group: 'Melee (Flail)', twoHanded: false },
  'Halberd': { damage: '+SB+1', qualities: ['Hack', 'Impale'], group: 'Melee (Polearm)', twoHanded: true },
  'Spear': { damage: '+SB', qualities: ['Impale', 'Fast'], group: 'Melee (Polearm)', twoHanded: false },
  'Shield': { damage: '+SB-2', qualities: ['Defensive', 'Undamaging'], group: 'Melee (Basic)', twoHanded: false },
  'Shortbow': { damage: '+3', qualities: [], group: 'Ranged (Bow)', range: 20, twoHanded: true },
  'Longbow': { damage: '+4', qualities: ['Impale'], group: 'Ranged (Bow)', range: 30, twoHanded: true },
  'Crossbow': { damage: '+5', qualities: ['Impale', 'Slow'], group: 'Ranged (Crossbow)', range: 30, twoHanded: true },
  'Pistol': { damage: '+8', qualities: ['Impale'], group: 'Ranged (Blackpowder)', range: 8, twoHanded: false },
};

export const ARMOUR = {
  'Leather Jerkin': { locations: { body: 1 }, penalty: 0, type: 'light' },
  'Leather Skullcap': { locations: { head: 1 }, penalty: 0, type: 'light' },
  'Leather Leggings': { locations: { legs: 1 }, penalty: 0, type: 'light' },
  'Mail Coif': { locations: { head: 2 }, penalty: 0, type: 'medium' },
  'Mail Shirt': { locations: { body: 2, arms: 2 }, penalty: 0, type: 'medium' },
  'Breastplate': { locations: { body: 3 }, penalty: 0, type: 'heavy' },
  'Plate Helm': { locations: { head: 3 }, penalty: -5, type: 'heavy' },
  'Plate Arms': { locations: { arms: 3 }, penalty: 0, type: 'heavy' },
  'Plate Legs': { locations: { legs: 3 }, penalty: 0, type: 'heavy' },
  'Full Plate': { locations: { body: 4, head: 3, arms: 3, legs: 3 }, penalty: -10, type: 'heavy' },
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

export function getHitLocation(roll) {
  const reversed = parseInt(roll.toString().split('').reverse().join(''), 10) || roll;
  const locRoll = ((reversed - 1) % 100) + 1;
  for (const entry of HIT_LOCATIONS) {
    if (locRoll >= entry.range[0] && locRoll <= entry.range[1]) {
      return entry.location;
    }
  }
  return 'body';
}

export function getWeaponData(weaponName) {
  return WEAPONS[weaponName] || WEAPONS['Hand Weapon'];
}

export function getArmourAP(armourItems, location) {
  let total = 0;
  for (const itemName of armourItems) {
    const armour = ARMOUR[itemName];
    if (armour && armour.locations[location]) {
      total += armour.locations[location];
    }
  }
  return total;
}
