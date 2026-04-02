/**
 * WFRP 4e game data — single source of truth.
 * Frontend fetches this via GET /game-data/combat on startup.
 * Backend AI tools use it directly.
 */

// ── COMBAT CONSTANTS ──

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

// ── WEAPONS & ARMOUR ──

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

export const BESTIARY = {
  'Skaven Clanrat': {
    characteristics: { ws: 30, bs: 20, s: 25, t: 25, i: 35, ag: 35, dex: 25, int: 20, wp: 20, fel: 10 },
    wounds: 8, maxWounds: 8,
    skills: { 'Melee (Basic)': 5, 'Dodge': 5 },
    traits: ['Weapon +6', 'Armour 1', 'Infected'],
    armour: { body: 1 }, weapons: ['Hand Weapon'], threat: 'low',
  },
  'Skaven Stormvermin': {
    characteristics: { ws: 40, bs: 25, s: 35, t: 30, i: 40, ag: 40, dex: 30, int: 25, wp: 30, fel: 15 },
    wounds: 14, maxWounds: 14,
    skills: { 'Melee (Basic)': 10, 'Dodge': 10 },
    traits: ['Weapon +7', 'Armour 2'],
    armour: { body: 2, head: 1 }, weapons: ['Halberd'], threat: 'medium',
  },
  'Ungor': {
    characteristics: { ws: 25, bs: 20, s: 30, t: 30, i: 25, ag: 30, dex: 20, int: 15, wp: 20, fel: 10 },
    wounds: 9, maxWounds: 9,
    skills: { 'Melee (Basic)': 5, 'Dodge': 3 },
    traits: ['Horns +5', 'Weapon +5'],
    armour: {}, weapons: ['Spear'], threat: 'low',
  },
  'Gor': {
    characteristics: { ws: 40, bs: 25, s: 35, t: 35, i: 30, ag: 35, dex: 25, int: 20, wp: 30, fel: 15 },
    wounds: 14, maxWounds: 14,
    skills: { 'Melee (Basic)': 10, 'Dodge': 8 },
    traits: ['Horns +7', 'Weapon +7', 'Armour 1'],
    armour: { body: 1 }, weapons: ['Hand Weapon'], threat: 'medium',
  },
  'Bestigor': {
    characteristics: { ws: 50, bs: 25, s: 45, t: 40, i: 35, ag: 35, dex: 25, int: 20, wp: 40, fel: 20 },
    wounds: 20, maxWounds: 20,
    skills: { 'Melee (Two-Handed)': 15, 'Dodge': 10 },
    traits: ['Horns +8', 'Weapon +9', 'Armour 2'],
    armour: { body: 2, head: 1 }, weapons: ['Great Weapon'], threat: 'high',
  },
  'Goblin': {
    characteristics: { ws: 25, bs: 25, s: 20, t: 20, i: 30, ag: 35, dex: 30, int: 20, wp: 20, fel: 15 },
    wounds: 6, maxWounds: 6,
    skills: { 'Melee (Basic)': 5, 'Dodge': 8 },
    traits: ['Weapon +4'],
    armour: {}, weapons: ['Dagger'], threat: 'trivial',
  },
  'Orc Boy': {
    characteristics: { ws: 35, bs: 20, s: 40, t: 40, i: 20, ag: 20, dex: 15, int: 15, wp: 25, fel: 10 },
    wounds: 16, maxWounds: 16,
    skills: { 'Melee (Basic)': 10 },
    traits: ['Weapon +8', 'Armour 1'],
    armour: { body: 1 }, weapons: ['Hand Weapon'], threat: 'medium',
  },
  'Black Orc': {
    characteristics: { ws: 50, bs: 20, s: 50, t: 50, i: 25, ag: 20, dex: 15, int: 20, wp: 35, fel: 15 },
    wounds: 25, maxWounds: 25,
    skills: { 'Melee (Two-Handed)': 15, 'Dodge': 5 },
    traits: ['Weapon +10', 'Armour 3', 'Size (Large)'],
    armour: { body: 3, head: 2, arms: 2, legs: 2 }, weapons: ['Great Weapon'], threat: 'deadly',
  },
  'Zombie': {
    characteristics: { ws: 15, bs: 0, s: 25, t: 35, i: 5, ag: 10, dex: 5, int: 5, wp: 10, fel: 0 },
    wounds: 12, maxWounds: 12,
    skills: { 'Melee (Basic)': 5 },
    traits: ['Undead', 'Fear 1', 'Weapon +5', 'Infected'],
    armour: {}, weapons: ['Hand Weapon'], threat: 'low',
  },
  'Skeleton Warrior': {
    characteristics: { ws: 30, bs: 15, s: 25, t: 25, i: 20, ag: 20, dex: 15, int: 10, wp: 15, fel: 0 },
    wounds: 8, maxWounds: 8,
    skills: { 'Melee (Basic)': 10, 'Dodge': 5 },
    traits: ['Undead', 'Fear 1', 'Weapon +6', 'Armour 1'],
    armour: { body: 1 }, weapons: ['Hand Weapon', 'Shield'], threat: 'low',
  },
  'Wight': {
    characteristics: { ws: 55, bs: 20, s: 45, t: 45, i: 40, ag: 30, dex: 20, int: 30, wp: 45, fel: 10 },
    wounds: 25, maxWounds: 25,
    skills: { 'Melee (Basic)': 20, 'Dodge': 10 },
    traits: ['Undead', 'Fear 3', 'Terror 1', 'Weapon +9', 'Armour 3', 'Ward 9+'],
    armour: { body: 3, head: 3, arms: 2, legs: 2 }, weapons: ['Hand Weapon'], threat: 'deadly',
  },
  'Nurgling Swarm': {
    characteristics: { ws: 25, bs: 0, s: 15, t: 20, i: 30, ag: 30, dex: 10, int: 10, wp: 25, fel: 10 },
    wounds: 6, maxWounds: 6,
    skills: {},
    traits: ['Daemonic', 'Swarm', 'Infected', 'Weapon +3', 'Fear 1'],
    armour: {}, weapons: ['Hand Weapon'], threat: 'low',
  },
  'Bloodletter': {
    characteristics: { ws: 55, bs: 0, s: 50, t: 40, i: 45, ag: 40, dex: 30, int: 25, wp: 45, fel: 10 },
    wounds: 22, maxWounds: 22,
    skills: { 'Melee (Basic)': 20, 'Dodge': 10 },
    traits: ['Daemonic', 'Fear 3', 'Terror 2', 'Weapon +10', 'Ward 6+'],
    armour: {}, weapons: ['Great Weapon'], threat: 'deadly',
  },
  'Giant Rat': {
    characteristics: { ws: 25, bs: 0, s: 15, t: 15, i: 35, ag: 35, dex: 10, int: 5, wp: 15, fel: 0 },
    wounds: 4, maxWounds: 4,
    skills: { 'Melee (Basic)': 5 },
    traits: ['Weapon +3', 'Infected', 'Bestial'],
    armour: {}, weapons: ['Hand Weapon'], threat: 'trivial',
  },
  'Wild Boar': {
    characteristics: { ws: 35, bs: 0, s: 35, t: 35, i: 30, ag: 25, dex: 0, int: 10, wp: 25, fel: 0 },
    wounds: 12, maxWounds: 12,
    skills: {},
    traits: ['Bestial', 'Weapon +6', 'Armour 1', 'Charge'],
    armour: { body: 1 }, weapons: ['Hand Weapon'], threat: 'low',
  },
  'Wolf': {
    characteristics: { ws: 35, bs: 0, s: 30, t: 25, i: 40, ag: 40, dex: 0, int: 15, wp: 25, fel: 0 },
    wounds: 10, maxWounds: 10,
    skills: { 'Melee (Basic)': 10 },
    traits: ['Bestial', 'Weapon +5', 'Stride'],
    armour: {}, weapons: ['Hand Weapon'], threat: 'low',
  },
  'Bear': {
    characteristics: { ws: 40, bs: 0, s: 50, t: 45, i: 25, ag: 20, dex: 0, int: 10, wp: 30, fel: 0 },
    wounds: 24, maxWounds: 24,
    skills: { 'Melee (Basic)': 15 },
    traits: ['Bestial', 'Weapon +8', 'Armour 2', 'Size (Large)'],
    armour: { body: 2 }, weapons: ['Hand Weapon'], threat: 'high',
  },
  'Bandit': {
    characteristics: { ws: 30, bs: 30, s: 30, t: 30, i: 30, ag: 30, dex: 25, int: 20, wp: 25, fel: 20 },
    wounds: 10, maxWounds: 10,
    skills: { 'Melee (Basic)': 5, 'Ranged (Bow)': 5, 'Dodge': 5 },
    traits: [],
    armour: { body: 1 }, weapons: ['Hand Weapon', 'Shortbow'], threat: 'low',
  },
  'Chaos Cultist': {
    characteristics: { ws: 30, bs: 20, s: 30, t: 30, i: 25, ag: 25, dex: 20, int: 25, wp: 35, fel: 25 },
    wounds: 10, maxWounds: 10,
    skills: { 'Melee (Basic)': 5 },
    traits: ['Mutation (random minor)'],
    armour: {}, weapons: ['Dagger'], threat: 'low',
  },
  'Chaos Warrior': {
    characteristics: { ws: 55, bs: 25, s: 50, t: 50, i: 35, ag: 30, dex: 25, int: 25, wp: 50, fel: 15 },
    wounds: 28, maxWounds: 28,
    skills: { 'Melee (Basic)': 20, 'Dodge': 10 },
    traits: ['Fear 2', 'Weapon +10', 'Armour 4'],
    armour: { body: 4, head: 3, arms: 3, legs: 3 }, weapons: ['Great Weapon'], threat: 'deadly',
  },
  'Ghost': {
    characteristics: { ws: 30, bs: 0, s: 20, t: 20, i: 40, ag: 35, dex: 0, int: 25, wp: 40, fel: 15 },
    wounds: 10, maxWounds: 10,
    skills: {},
    traits: ['Undead', 'Ethereal', 'Fear 2', 'Terror 1', 'Weapon +4'],
    armour: {}, weapons: ['Hand Weapon'], threat: 'medium',
  },
};

export function formatWeaponCatalog(category = 'all') {
  const lines = [];
  if (category === 'all' || category === 'weapons') {
    lines.push('WEAPONS (use exact names in enemies[].weapons and newItems):');
    for (const [name, w] of Object.entries(WEAPONS)) {
      const quals = w.qualities.length ? ` [${w.qualities.join(', ')}]` : '';
      const range = w.range ? `, range: ${w.range}` : '';
      lines.push(`  ${name}: damage=${w.damage}, group=${w.group}${quals}${range}${w.twoHanded ? ', two-handed' : ''}`);
    }
  }
  if (category === 'all' || category === 'armor') {
    lines.push('');
    lines.push('ARMOUR (use exact names in enemies[].armour items or newItems):');
    for (const [name, a] of Object.entries(ARMOUR)) {
      const locs = Object.entries(a.locations).map(([loc, ap]) => `${loc}:${ap}`).join(', ');
      lines.push(`  ${name}: AP [${locs}], type=${a.type}${a.penalty ? `, penalty=${a.penalty}` : ''}`);
    }
  }
  return lines.join('\n');
}

/**
 * Find the closest bestiary entry for an enemy name.
 * Returns the raw bestiary object (with .name attached) or null.
 * Matching order: exact name → partial name → threat-level fallback (Bandit).
 */
export function findClosestBestiaryEntry(enemyName) {
  if (!enemyName) return null;
  const q = enemyName.toLowerCase();
  const entries = Object.entries(BESTIARY);

  // Exact match
  for (const [name, entry] of entries) {
    if (name.toLowerCase() === q) return { ...entry, name };
  }

  // Partial match (enemy name contains bestiary name or vice versa)
  for (const [name, entry] of entries) {
    const bName = name.toLowerCase();
    if (q.includes(bName) || bName.includes(q)) return { ...entry, name };
  }

  // Fallback: use Bandit as generic humanoid template
  if (BESTIARY['Bandit']) return { ...BESTIARY['Bandit'], name: 'Bandit' };

  return null;
}

export function searchBestiary(query) {
  const q = query.toLowerCase();
  const matches = Object.entries(BESTIARY).filter(([name, entry]) => {
    return name.toLowerCase().includes(q)
      || (entry.traits || []).some(t => t.toLowerCase().includes(q))
      || q.includes(entry.threat);
  });
  if (matches.length === 0) return null;
  return matches.map(([name, e]) => {
    const chars = Object.entries(e.characteristics).map(([k, v]) => `${k.toUpperCase()}:${v}`).join(' ');
    const skills = Object.entries(e.skills || {}).map(([s, v]) => `${s}+${v}`).join(', ') || 'none';
    const locs = Object.entries(e.armour || {}).map(([loc, ap]) => `${loc}:${ap}`).join(', ') || 'none';
    return `${name} [${e.threat}]
  Stats: ${chars}
  Wounds: ${e.maxWounds} | Weapons: ${(e.weapons || ['Hand Weapon']).join(', ')} | Armour AP: ${locs}
  Skills: ${skills}
  Traits: ${(e.traits || []).join(', ') || 'none'}`;
  }).join('\n\n');
}
