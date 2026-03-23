export const BESTIARY = {
  // --- Skaven ---
  'Skaven Clanrat': {
    name: 'Skaven Clanrat',
    type: 'Skaven',
    description: 'Weak but numerous rat-men foot soldiers',
    characteristics: { ws: 30, bs: 20, s: 25, t: 25, i: 35, ag: 35, dex: 25, int: 20, wp: 20, fel: 10 },
    wounds: 8,
    maxWounds: 8,
    skills: { 'Melee (Basic)': 5, 'Dodge': 5, 'Stealth (Underground)': 10 },
    talents: ['Night Vision'],
    traits: ['Weapon +6', 'Armour 1', 'Infected'],
    armour: { body: 1 },
    weapons: ['Hand Weapon'],
    threat: 'low',
  },
  'Skaven Stormvermin': {
    name: 'Skaven Stormvermin',
    type: 'Skaven',
    description: 'Elite Skaven warriors, disciplined and well-equipped',
    characteristics: { ws: 40, bs: 25, s: 35, t: 30, i: 40, ag: 40, dex: 30, int: 25, wp: 30, fel: 15 },
    wounds: 14,
    maxWounds: 14,
    skills: { 'Melee (Basic)': 10, 'Dodge': 10, 'Intimidate': 5 },
    talents: ['Night Vision', 'Combat Reflexes'],
    traits: ['Weapon +7', 'Armour 2'],
    armour: { body: 2, head: 1 },
    weapons: ['Halberd'],
    threat: 'medium',
  },

  // --- Beastmen ---
  'Ungor': {
    name: 'Ungor',
    type: 'Beastmen',
    description: 'Lesser beastmen, used as scouts and skirmishers',
    characteristics: { ws: 25, bs: 20, s: 30, t: 30, i: 25, ag: 30, dex: 20, int: 15, wp: 20, fel: 10 },
    wounds: 9,
    maxWounds: 9,
    skills: { 'Melee (Basic)': 5, 'Dodge': 3, 'Outdoor Survival': 10, 'Track': 5 },
    talents: ['Night Vision'],
    traits: ['Horns +5', 'Weapon +5'],
    armour: {},
    weapons: ['Spear'],
    threat: 'low',
  },
  'Gor': {
    name: 'Gor',
    type: 'Beastmen',
    description: 'True beastmen — savage, powerful warriors of the dark woods',
    characteristics: { ws: 40, bs: 25, s: 35, t: 35, i: 30, ag: 35, dex: 25, int: 20, wp: 30, fel: 15 },
    wounds: 14,
    maxWounds: 14,
    skills: { 'Melee (Basic)': 10, 'Dodge': 8, 'Intimidate': 10 },
    talents: ['Night Vision', 'Fearsome'],
    traits: ['Horns +7', 'Weapon +7', 'Armour 1'],
    armour: { body: 1 },
    weapons: ['Hand Weapon'],
    threat: 'medium',
  },
  'Bestigor': {
    name: 'Bestigor',
    type: 'Beastmen',
    description: 'Elite beastmen warriors, heavily armed and fanatical',
    characteristics: { ws: 50, bs: 25, s: 45, t: 40, i: 35, ag: 35, dex: 25, int: 20, wp: 40, fel: 20 },
    wounds: 20,
    maxWounds: 20,
    skills: { 'Melee (Two-Handed)': 15, 'Dodge': 10, 'Intimidate': 15 },
    talents: ['Night Vision', 'Fearsome', 'Strike Mighty Blow'],
    traits: ['Horns +8', 'Weapon +9', 'Armour 2'],
    armour: { body: 2, head: 1 },
    weapons: ['Great Weapon'],
    threat: 'high',
  },

  // --- Greenskins ---
  'Goblin': {
    name: 'Goblin',
    type: 'Greenskins',
    description: 'Small, cowardly but cunning green-skinned creatures',
    characteristics: { ws: 25, bs: 25, s: 20, t: 20, i: 30, ag: 35, dex: 30, int: 20, wp: 20, fel: 15 },
    wounds: 6,
    maxWounds: 6,
    skills: { 'Melee (Basic)': 5, 'Dodge': 8, 'Stealth (Any)': 10 },
    talents: ['Night Vision'],
    traits: ['Weapon +4', 'Afraid (Elves)'],
    armour: {},
    weapons: ['Dagger'],
    threat: 'trivial',
  },
  'Orc Boy': {
    name: 'Orc Boy',
    type: 'Greenskins',
    description: 'Strong, aggressive greenskin warriors',
    characteristics: { ws: 35, bs: 20, s: 40, t: 40, i: 20, ag: 20, dex: 15, int: 15, wp: 25, fel: 10 },
    wounds: 16,
    maxWounds: 16,
    skills: { 'Melee (Basic)': 10, 'Intimidate': 10 },
    talents: ['Night Vision', 'Hardy'],
    traits: ['Weapon +8', 'Armour 1', 'Animosity'],
    armour: { body: 1 },
    weapons: ['Hand Weapon'],
    threat: 'medium',
  },
  'Black Orc': {
    name: 'Black Orc',
    type: 'Greenskins',
    description: 'Massive, disciplined orc elite — the deadliest of their kind',
    characteristics: { ws: 50, bs: 20, s: 50, t: 50, i: 25, ag: 20, dex: 15, int: 20, wp: 35, fel: 15 },
    wounds: 25,
    maxWounds: 25,
    skills: { 'Melee (Two-Handed)': 15, 'Intimidate': 20, 'Dodge': 5 },
    talents: ['Night Vision', 'Fearsome', 'Strike Mighty Blow', 'Hardy'],
    traits: ['Weapon +10', 'Armour 3', 'Size (Large)'],
    armour: { body: 3, head: 2, arms: 2, legs: 2 },
    weapons: ['Great Weapon'],
    threat: 'deadly',
  },

  // --- Undead ---
  'Zombie': {
    name: 'Zombie',
    type: 'Undead',
    description: 'Shambling corpse animated by dark magic',
    characteristics: { ws: 15, bs: 0, s: 25, t: 35, i: 5, ag: 10, dex: 5, int: 5, wp: 10, fel: 0 },
    wounds: 12,
    maxWounds: 12,
    skills: { 'Melee (Basic)': 5 },
    talents: [],
    traits: ['Undead', 'Fear 1', 'Weapon +5', 'Infected'],
    armour: {},
    weapons: ['Hand Weapon'],
    threat: 'low',
  },
  'Skeleton Warrior': {
    name: 'Skeleton Warrior',
    type: 'Undead',
    description: 'Animated skeleton armed with rusted weapons',
    characteristics: { ws: 30, bs: 15, s: 25, t: 25, i: 20, ag: 20, dex: 15, int: 10, wp: 15, fel: 0 },
    wounds: 8,
    maxWounds: 8,
    skills: { 'Melee (Basic)': 10, 'Dodge': 5 },
    talents: [],
    traits: ['Undead', 'Fear 1', 'Weapon +6', 'Armour 1'],
    armour: { body: 1 },
    weapons: ['Hand Weapon', 'Shield'],
    threat: 'low',
  },
  'Wight': {
    name: 'Wight',
    type: 'Undead',
    description: 'Powerful undead warriors bound by ancient oaths, radiating dread',
    characteristics: { ws: 55, bs: 20, s: 45, t: 45, i: 40, ag: 30, dex: 20, int: 30, wp: 45, fel: 10 },
    wounds: 25,
    maxWounds: 25,
    skills: { 'Melee (Basic)': 20, 'Dodge': 10, 'Intimidate': 20 },
    talents: ['Combat Reflexes', 'Strike Mighty Blow'],
    traits: ['Undead', 'Fear 3', 'Terror 1', 'Weapon +9', 'Armour 3', 'Ward 9+'],
    armour: { body: 3, head: 3, arms: 2, legs: 2 },
    weapons: ['Hand Weapon'],
    threat: 'deadly',
  },

  // --- Daemons ---
  'Nurgling Swarm': {
    name: 'Nurgling Swarm',
    type: 'Daemons',
    description: 'Giggling, infectious tiny daemons of Nurgle',
    characteristics: { ws: 25, bs: 0, s: 15, t: 20, i: 30, ag: 30, dex: 10, int: 10, wp: 25, fel: 10 },
    wounds: 6,
    maxWounds: 6,
    skills: {},
    talents: [],
    traits: ['Daemonic', 'Swarm', 'Infected', 'Weapon +3', 'Fear 1'],
    armour: {},
    weapons: [],
    threat: 'low',
  },
  'Bloodletter': {
    name: 'Bloodletter',
    type: 'Daemons',
    description: 'Savage daemon of Khorne, living blade of bloody vengeance',
    characteristics: { ws: 55, bs: 0, s: 50, t: 40, i: 45, ag: 40, dex: 30, int: 25, wp: 45, fel: 10 },
    wounds: 22,
    maxWounds: 22,
    skills: { 'Melee (Basic)': 20, 'Dodge': 10 },
    talents: ['Strike Mighty Blow', 'Combat Reflexes'],
    traits: ['Daemonic', 'Fear 3', 'Terror 2', 'Weapon +10', 'Ward 6+', 'Unstable'],
    armour: {},
    weapons: ['Hellblade'],
    threat: 'deadly',
  },

  // --- Animals ---
  'Giant Rat': {
    name: 'Giant Rat',
    type: 'Animals',
    description: 'Unusually large and aggressive rats found in sewers and ruins',
    characteristics: { ws: 25, bs: 0, s: 15, t: 15, i: 35, ag: 35, dex: 10, int: 5, wp: 15, fel: 0 },
    wounds: 4,
    maxWounds: 4,
    skills: { 'Melee (Basic)': 5 },
    talents: ['Night Vision'],
    traits: ['Weapon +3', 'Infected', 'Bestial'],
    armour: {},
    weapons: [],
    threat: 'trivial',
  },
  'Wild Boar': {
    name: 'Wild Boar',
    type: 'Animals',
    description: 'Aggressive tusked boar found in forests',
    characteristics: { ws: 35, bs: 0, s: 35, t: 35, i: 30, ag: 25, dex: 0, int: 10, wp: 25, fel: 0 },
    wounds: 12,
    maxWounds: 12,
    skills: {},
    talents: [],
    traits: ['Bestial', 'Weapon +6', 'Armour 1', 'Charge'],
    armour: { body: 1 },
    weapons: [],
    threat: 'low',
  },
  'Wolf': {
    name: 'Wolf',
    type: 'Animals',
    description: 'Hungry predator hunting in packs',
    characteristics: { ws: 35, bs: 0, s: 30, t: 25, i: 40, ag: 40, dex: 0, int: 15, wp: 25, fel: 0 },
    wounds: 10,
    maxWounds: 10,
    skills: { 'Melee (Basic)': 10, 'Track': 15, 'Perception': 10 },
    talents: ['Night Vision'],
    traits: ['Bestial', 'Weapon +5', 'Stride'],
    armour: {},
    weapons: [],
    threat: 'low',
  },
  'Bear': {
    name: 'Bear',
    type: 'Animals',
    description: 'Massive forest predator, territorial and deadly',
    characteristics: { ws: 40, bs: 0, s: 50, t: 45, i: 25, ag: 20, dex: 0, int: 10, wp: 30, fel: 0 },
    wounds: 24,
    maxWounds: 24,
    skills: { 'Melee (Basic)': 15 },
    talents: [],
    traits: ['Bestial', 'Weapon +8', 'Armour 2', 'Size (Large)', 'Territorial'],
    armour: { body: 2 },
    weapons: [],
    threat: 'high',
  },

  // --- Chaos Cultists / Humans ---
  'Bandit': {
    name: 'Bandit',
    type: 'Humans',
    description: 'Common highway robber',
    characteristics: { ws: 30, bs: 30, s: 30, t: 30, i: 30, ag: 30, dex: 25, int: 20, wp: 25, fel: 20 },
    wounds: 10,
    maxWounds: 10,
    skills: { 'Melee (Basic)': 5, 'Ranged (Bow)': 5, 'Dodge': 5, 'Stealth (Rural)': 5 },
    talents: [],
    traits: [],
    armour: { body: 1 },
    weapons: ['Hand Weapon', 'Shortbow'],
    threat: 'low',
  },
  'Chaos Cultist': {
    name: 'Chaos Cultist',
    type: 'Chaos',
    description: 'Fanatical worshipper of the Dark Gods',
    characteristics: { ws: 30, bs: 20, s: 30, t: 30, i: 25, ag: 25, dex: 20, int: 25, wp: 35, fel: 25 },
    wounds: 10,
    maxWounds: 10,
    skills: { 'Melee (Basic)': 5, 'Pray': 10 },
    talents: [],
    traits: ['Mutation (random minor)'],
    armour: {},
    weapons: ['Dagger'],
    threat: 'low',
  },
  'Chaos Warrior': {
    name: 'Chaos Warrior',
    type: 'Chaos',
    description: 'Elite armoured servant of the Ruinous Powers',
    characteristics: { ws: 55, bs: 25, s: 50, t: 50, i: 35, ag: 30, dex: 25, int: 25, wp: 50, fel: 15 },
    wounds: 28,
    maxWounds: 28,
    skills: { 'Melee (Basic)': 20, 'Dodge': 10, 'Intimidate': 15 },
    talents: ['Strike Mighty Blow', 'Fearsome', 'Combat Reflexes'],
    traits: ['Fear 2', 'Weapon +10', 'Armour 4'],
    armour: { body: 4, head: 3, arms: 3, legs: 3 },
    weapons: ['Great Weapon'],
    threat: 'deadly',
  },

  // --- Spirits ---
  'Ghost': {
    name: 'Ghost',
    type: 'Undead',
    description: 'Ethereal spirit of the restless dead',
    characteristics: { ws: 30, bs: 0, s: 20, t: 20, i: 40, ag: 35, dex: 0, int: 25, wp: 40, fel: 15 },
    wounds: 10,
    maxWounds: 10,
    skills: { 'Intimidate': 15 },
    talents: [],
    traits: ['Undead', 'Ethereal', 'Fear 2', 'Terror 1', 'Weapon +4'],
    armour: {},
    weapons: [],
    threat: 'medium',
  },
};

export function getBestiaryEntry(name) {
  return BESTIARY[name] || null;
}

export function getBestiaryByType(type) {
  return Object.values(BESTIARY).filter((b) => b.type === type);
}

export function getBestiaryByThreat(threat) {
  return Object.values(BESTIARY).filter((b) => b.threat === threat);
}

export function getRandomEnemy(threat = null) {
  const pool = threat
    ? Object.values(BESTIARY).filter((b) => b.threat === threat)
    : Object.values(BESTIARY);
  return pool[Math.floor(Math.random() * pool.length)] || null;
}

export function createEnemyInstance(bestiaryEntry) {
  return {
    ...bestiaryEntry,
    wounds: bestiaryEntry.maxWounds,
    id: `enemy_${bestiaryEntry.name.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
  };
}

export function formatBestiaryForPrompt(entries) {
  return entries.map((e) => {
    const chars = Object.entries(e.characteristics)
      .map(([k, v]) => `${k.toUpperCase()}:${v}`)
      .join(' ');
    return `- ${e.name} (${e.type}, ${e.threat}): ${chars}, W:${e.maxWounds}, Skills: ${Object.entries(e.skills || {}).map(([s, v]) => `${s}:${v}`).join(', ') || 'none'}, Traits: ${(e.traits || []).join(', ') || 'none'}`;
  }).join('\n');
}
