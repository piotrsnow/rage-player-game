/**
 * RPGon bestiary — enemy stat blocks.
 * armourDR = flat damage reduction (new system, replaces body-part AP).
 */

export const BESTIARY = {
  'Skaven Clanrat': {
    characteristics: { ws: 30, bs: 20, s: 25, t: 25, i: 35, ag: 35, dex: 25, int: 20, wp: 20, fel: 10 },
    wounds: 8, maxWounds: 8,
    skills: { 'Melee (Basic)': 5, 'Dodge': 5 },
    traits: ['Weapon +6', 'Infected'],
    armourDR: 1, weapons: ['Hand Weapon'], threat: 'low',
  },
  'Skaven Stormvermin': {
    characteristics: { ws: 40, bs: 25, s: 35, t: 30, i: 40, ag: 40, dex: 30, int: 25, wp: 30, fel: 15 },
    wounds: 14, maxWounds: 14,
    skills: { 'Melee (Basic)': 10, 'Dodge': 10 },
    traits: ['Weapon +7'],
    armourDR: 2, weapons: ['Halberd'], threat: 'medium',
  },
  'Ungor': {
    characteristics: { ws: 25, bs: 20, s: 30, t: 30, i: 25, ag: 30, dex: 20, int: 15, wp: 20, fel: 10 },
    wounds: 9, maxWounds: 9,
    skills: { 'Melee (Basic)': 5, 'Dodge': 3 },
    traits: ['Horns +5', 'Weapon +5'],
    armourDR: 0, weapons: ['Spear'], threat: 'low',
  },
  'Gor': {
    characteristics: { ws: 40, bs: 25, s: 35, t: 35, i: 30, ag: 35, dex: 25, int: 20, wp: 30, fel: 15 },
    wounds: 14, maxWounds: 14,
    skills: { 'Melee (Basic)': 10, 'Dodge': 8 },
    traits: ['Horns +7', 'Weapon +7'],
    armourDR: 1, weapons: ['Hand Weapon'], threat: 'medium',
  },
  'Bestigor': {
    characteristics: { ws: 50, bs: 25, s: 45, t: 40, i: 35, ag: 35, dex: 25, int: 20, wp: 40, fel: 20 },
    wounds: 20, maxWounds: 20,
    skills: { 'Melee (Two-Handed)': 15, 'Dodge': 10 },
    traits: ['Horns +8', 'Weapon +9'],
    armourDR: 2, weapons: ['Great Weapon'], threat: 'high',
  },
  'Goblin': {
    characteristics: { ws: 25, bs: 25, s: 20, t: 20, i: 30, ag: 35, dex: 30, int: 20, wp: 20, fel: 15 },
    wounds: 6, maxWounds: 6,
    skills: { 'Melee (Basic)': 5, 'Dodge': 8 },
    traits: ['Weapon +4'],
    armourDR: 0, weapons: ['Dagger'], threat: 'trivial',
  },
  'Orc Boy': {
    characteristics: { ws: 35, bs: 20, s: 40, t: 40, i: 20, ag: 20, dex: 15, int: 15, wp: 25, fel: 10 },
    wounds: 16, maxWounds: 16,
    skills: { 'Melee (Basic)': 10 },
    traits: ['Weapon +8'],
    armourDR: 1, weapons: ['Hand Weapon'], threat: 'medium',
  },
  'Black Orc': {
    characteristics: { ws: 50, bs: 20, s: 50, t: 50, i: 25, ag: 20, dex: 15, int: 20, wp: 35, fel: 15 },
    wounds: 25, maxWounds: 25,
    skills: { 'Melee (Two-Handed)': 15, 'Dodge': 5 },
    traits: ['Weapon +10', 'Size (Large)'],
    armourDR: 3, weapons: ['Great Weapon'], threat: 'deadly',
  },
  'Zombie': {
    characteristics: { ws: 15, bs: 0, s: 25, t: 35, i: 5, ag: 10, dex: 5, int: 5, wp: 10, fel: 0 },
    wounds: 12, maxWounds: 12,
    skills: { 'Melee (Basic)': 5 },
    traits: ['Undead', 'Fear 1', 'Weapon +5', 'Infected'],
    armourDR: 0, weapons: ['Hand Weapon'], threat: 'low',
  },
  'Skeleton Warrior': {
    characteristics: { ws: 30, bs: 15, s: 25, t: 25, i: 20, ag: 20, dex: 15, int: 10, wp: 15, fel: 0 },
    wounds: 8, maxWounds: 8,
    skills: { 'Melee (Basic)': 10, 'Dodge': 5 },
    traits: ['Undead', 'Fear 1', 'Weapon +6'],
    armourDR: 1, weapons: ['Hand Weapon', 'Shield'], threat: 'low',
  },
  'Wight': {
    characteristics: { ws: 55, bs: 20, s: 45, t: 45, i: 40, ag: 30, dex: 20, int: 30, wp: 45, fel: 10 },
    wounds: 25, maxWounds: 25,
    skills: { 'Melee (Basic)': 20, 'Dodge': 10 },
    traits: ['Undead', 'Fear 3', 'Terror 1', 'Weapon +9', 'Ward 9+'],
    armourDR: 3, weapons: ['Hand Weapon'], threat: 'deadly',
  },
  'Nurgling Swarm': {
    characteristics: { ws: 25, bs: 0, s: 15, t: 20, i: 30, ag: 30, dex: 10, int: 10, wp: 25, fel: 10 },
    wounds: 6, maxWounds: 6,
    skills: {},
    traits: ['Daemonic', 'Swarm', 'Infected', 'Weapon +3', 'Fear 1'],
    armourDR: 0, weapons: ['Hand Weapon'], threat: 'low',
  },
  'Bloodletter': {
    characteristics: { ws: 55, bs: 0, s: 50, t: 40, i: 45, ag: 40, dex: 30, int: 25, wp: 45, fel: 10 },
    wounds: 22, maxWounds: 22,
    skills: { 'Melee (Basic)': 20, 'Dodge': 10 },
    traits: ['Daemonic', 'Fear 3', 'Terror 2', 'Weapon +10', 'Ward 6+'],
    armourDR: 0, weapons: ['Great Weapon'], threat: 'deadly',
  },
  'Giant Rat': {
    characteristics: { ws: 25, bs: 0, s: 15, t: 15, i: 35, ag: 35, dex: 10, int: 5, wp: 15, fel: 0 },
    wounds: 4, maxWounds: 4,
    skills: { 'Melee (Basic)': 5 },
    traits: ['Weapon +3', 'Infected', 'Bestial'],
    armourDR: 0, weapons: ['Hand Weapon'], threat: 'trivial',
  },
  'Wild Boar': {
    characteristics: { ws: 35, bs: 0, s: 35, t: 35, i: 30, ag: 25, dex: 0, int: 10, wp: 25, fel: 0 },
    wounds: 12, maxWounds: 12,
    skills: {},
    traits: ['Bestial', 'Weapon +6', 'Charge'],
    armourDR: 1, weapons: ['Hand Weapon'], threat: 'low',
  },
  'Wolf': {
    characteristics: { ws: 35, bs: 0, s: 30, t: 25, i: 40, ag: 40, dex: 0, int: 15, wp: 25, fel: 0 },
    wounds: 10, maxWounds: 10,
    skills: { 'Melee (Basic)': 10 },
    traits: ['Bestial', 'Weapon +5', 'Stride'],
    armourDR: 0, weapons: ['Hand Weapon'], threat: 'low',
  },
  'Bear': {
    characteristics: { ws: 40, bs: 0, s: 50, t: 45, i: 25, ag: 20, dex: 0, int: 10, wp: 30, fel: 0 },
    wounds: 24, maxWounds: 24,
    skills: { 'Melee (Basic)': 15 },
    traits: ['Bestial', 'Weapon +8', 'Size (Large)'],
    armourDR: 2, weapons: ['Hand Weapon'], threat: 'high',
  },
  'Bandit': {
    characteristics: { ws: 30, bs: 30, s: 30, t: 30, i: 30, ag: 30, dex: 25, int: 20, wp: 25, fel: 20 },
    wounds: 10, maxWounds: 10,
    skills: { 'Melee (Basic)': 5, 'Ranged (Bow)': 5, 'Dodge': 5 },
    traits: [],
    armourDR: 1, weapons: ['Hand Weapon', 'Shortbow'], threat: 'low',
  },
  'Chaos Cultist': {
    characteristics: { ws: 30, bs: 20, s: 30, t: 30, i: 25, ag: 25, dex: 20, int: 25, wp: 35, fel: 25 },
    wounds: 10, maxWounds: 10,
    skills: { 'Melee (Basic)': 5 },
    traits: ['Mutation (random minor)'],
    armourDR: 0, weapons: ['Dagger'], threat: 'low',
  },
  'Chaos Warrior': {
    characteristics: { ws: 55, bs: 25, s: 50, t: 50, i: 35, ag: 30, dex: 25, int: 25, wp: 50, fel: 15 },
    wounds: 28, maxWounds: 28,
    skills: { 'Melee (Basic)': 20, 'Dodge': 10 },
    traits: ['Fear 2', 'Weapon +10'],
    armourDR: 4, weapons: ['Great Weapon'], threat: 'deadly',
  },
  'Ghost': {
    characteristics: { ws: 30, bs: 0, s: 20, t: 20, i: 40, ag: 35, dex: 0, int: 25, wp: 40, fel: 15 },
    wounds: 10, maxWounds: 10,
    skills: {},
    traits: ['Undead', 'Ethereal', 'Fear 2', 'Terror 1', 'Weapon +4'],
    armourDR: 0, weapons: ['Hand Weapon'], threat: 'medium',
  },
};

/**
 * Find the closest bestiary entry for an enemy name.
 * Returns the raw bestiary object (with .name attached) or null.
 * Matching order: exact name → partial name → threat-level fallback (Bandit).
 */
export function findClosestBestiaryEntry(enemyName) {
  if (!enemyName) return null;
  const q = enemyName.toLowerCase();
  const entries = Object.entries(BESTIARY);

  for (const [name, entry] of entries) {
    if (name.toLowerCase() === q) return { ...entry, name };
  }
  for (const [name, entry] of entries) {
    const bName = name.toLowerCase();
    if (q.includes(bName) || bName.includes(q)) return { ...entry, name };
  }
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
    return `${name} [${e.threat}]
  Stats: ${chars}
  Wounds: ${e.maxWounds} | Weapons: ${(e.weapons || ['Hand Weapon']).join(', ')} | Armour DR: ${e.armourDR ?? 0}
  Skills: ${skills}
  Traits: ${(e.traits || []).join(', ') || 'none'}`;
  }).join('\n\n');
}
