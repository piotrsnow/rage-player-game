// Bestiary - Creature database for WFRP 4e encounters
// Each creature has characteristics, combat stats, and encounter metadata

import { WEAPONS, ARMOUR } from './economy.js';
import { SPELLS } from './magic.js';

// Lookup helpers
const W = name => WEAPONS.find(w => w.name === name);
const A = name => ARMOUR.find(a => a.name === name);
const S = name => SPELLS.find(s => s.name === name);

export const LOCATION_CREATURE_WEIGHTS = {
  forest: { beasts: 3, greenskins: 1 },
  ruins: { undead: 3, chaos: 1 },
  city: { human: 3, skaven: 1 },
  road: { human: 2, beasts: 1 },
  swamp: { undead: 2, chaos: 1, beasts: 1 },
  mountain: { greenskins: 2, beasts: 2, chaos: 1 },
  cave: { skaven: 3, greenskins: 2 },
  village: { human: 2, beasts: 1 },
  wasteland: { chaos: 3, undead: 1 },
  underground: { skaven: 3, undead: 1 },
};

export const TIME_MODIFIERS = {
  day: {},
  dawn: { undead: 1, beasts: 1 },
  dusk: { undead: 1, beasts: 1 },
  night: { undead: 3, chaos: 1 },
};

export const BESTIARY = [
  // ── BEASTS ──────────────────────────────────────────────
  {
    name: 'Giant Rat',
    category: 'beasts',
    description: 'Enormous, disease-ridden rodents found in sewers, ruins, and underground lairs. They attack in swarms and carry numerous infections.',
    characteristics: { ws: 25, bs: 0, s: 15, t: 15, i: 35, ag: 35, dex: 10, int: 10, wp: 15, fel: 2 },
    wounds: 4,
    movement: 6,
    traits: ['Weapon (Teeth)', 'Night Vision', 'Bestial', 'Size (Small)'],
    skills: { 'Dodge': 20, 'Stealth (Underground)': 30, 'Perception': 25 },
    armourPoints: { head: 0, body: 0, arms: 0, legs: 0 },
    weapons: [{ name: 'Teeth', damage: 1, qualities: ['Infected'] }],
    dangerLevel: 1,
    encounterWeight: 10,
  },
  {
    name: 'Wolf',
    category: 'beasts',
    description: 'Lean, grey predators that hunt in packs across the forests and wilds of the Old World. Cunning and relentless once they pick up a scent.',
    characteristics: { ws: 35, bs: 0, s: 30, t: 30, i: 35, ag: 35, dex: 10, int: 15, wp: 25, fel: 5 },
    wounds: 14,
    movement: 9,
    traits: ['Weapon (Bite)', 'Night Vision', 'Bestial', 'Tracker', 'Stride'],
    skills: { 'Dodge': 20, 'Perception': 30, 'Track': 40, 'Stealth (Rural)': 25 },
    armourPoints: { head: 0, body: 0, arms: 0, legs: 0 },
    weapons: [{ name: 'Bite', damage: 3, qualities: [] }],
    dangerLevel: 2,
    encounterWeight: 7,
  },
  {
    name: 'Wild Boar',
    category: 'beasts',
    description: 'Aggressive, tusked beasts that charge without warning. Found in forests and farmlands, they are surprisingly dangerous when cornered.',
    characteristics: { ws: 35, bs: 0, s: 35, t: 40, i: 30, ag: 30, dex: 5, int: 10, wp: 30, fel: 3 },
    wounds: 16,
    movement: 7,
    traits: ['Weapon (Tusks)', 'Armour (1)', 'Bestial', 'Charge'],
    skills: { 'Endurance': 30, 'Perception': 20 },
    armourPoints: { head: 0, body: 1, arms: 0, legs: 0 },
    weapons: [{ name: 'Tusks', damage: 4, qualities: ['Impale'] }],
    dangerLevel: 2,
    encounterWeight: 5,
  },
  {
    name: 'Giant Spider',
    category: 'beasts',
    description: 'Monstrous arachnids lurking in dark forests and caves. They spin webs to trap prey and inject paralysing venom through massive fangs.',
    characteristics: { ws: 40, bs: 0, s: 35, t: 35, i: 30, ag: 35, dex: 10, int: 5, wp: 30, fel: 2 },
    wounds: 20,
    movement: 6,
    traits: ['Weapon (Fangs)', 'Armour (Chitin)', 'Bestial', 'Night Vision', 'Web', 'Venom', 'Size (Large)'],
    skills: { 'Climb': 50, 'Stealth (Any)': 30, 'Perception': 35 },
    armourPoints: { head: 1, body: 2, arms: 1, legs: 1 },
    weapons: [{ name: 'Fangs', damage: 4, qualities: ['Poisoned'] }],
    dangerLevel: 3,
    encounterWeight: 4,
  },
  {
    name: 'Griffon',
    category: 'beasts',
    description: 'Majestic and terrifying predators with the body of a great lion and the head and wings of an eagle. Fiercely territorial apex hunters of the mountains.',
    characteristics: { ws: 55, bs: 0, s: 55, t: 50, i: 40, ag: 45, dex: 10, int: 18, wp: 40, fel: 5 },
    wounds: 38,
    movement: 6,
    traits: ['Weapon (Beak)', 'Weapon (Claws)', 'Fly (12)', 'Bestial', 'Territorial', 'Size (Enormous)'],
    skills: { 'Perception': 50, 'Intimidate': 40 },
    armourPoints: { head: 0, body: 1, arms: 0, legs: 0 },
    weapons: [
      { name: 'Beak', damage: 6, qualities: [] },
      { name: 'Claws', damage: 7, qualities: [] },
    ],
    dangerLevel: 5,
    encounterWeight: 1,
  },

  // ── GREENSKINS ──────────────────────────────────────────
  {
    name: 'Goblin',
    category: 'greenskins',
    description: 'Small, cowardly greenskins that rely on numbers and dirty tricks. They favour ambushes, traps, and attacking from the shadows.',
    characteristics: { ws: 25, bs: 20, s: 20, t: 20, i: 25, ag: 30, dex: 20, int: 15, wp: 20, fel: 10 },
    wounds: 8,
    movement: 4,
    traits: ['Animosity (Greenskins)', 'Afraid (Elves)', 'Night Vision', 'Size (Small)'],
    skills: { 'Dodge': 15, 'Stealth (Any)': 30, 'Perception': 20, 'Melee (Basic)': 15, 'Ranged (Bow)': 15 },
    armour: [A('Gambeson')],
    weapons: [
      { name: 'Shortsword', damage: 3, qualities: [] },
      W('Shortbow'),
    ],
    dangerLevel: 1,
    encounterWeight: 9,
  },
  {
    name: 'Night Goblin',
    category: 'greenskins',
    description: 'Cave-dwelling goblins who shun daylight and cultivate deadly fungi. Masters of ambush in underground environments.',
    characteristics: { ws: 25, bs: 20, s: 20, t: 25, i: 30, ag: 35, dex: 20, int: 15, wp: 25, fel: 8 },
    wounds: 9,
    movement: 4,
    traits: ['Animosity (Greenskins)', 'Night Vision', 'Afraid (Daylight)', 'Stealthy', 'Size (Small)'],
    skills: { 'Dodge': 20, 'Stealth (Underground)': 40, 'Perception': 25, 'Set Trap': 25, 'Melee (Basic)': 20 },
    armour: [A('Leather Skullcap'), A('Gambeson')],
    weapons: [
      W('Spear'),
      { name: 'Net', damage: 0, qualities: ['Entangle'] },
    ],
    dangerLevel: 2,
    encounterWeight: 6,
  },
  {
    name: 'Orc Boy',
    category: 'greenskins',
    description: 'Brutal, muscular greenskins that live for fighting. Orc Boyz form the backbone of any Waaagh!, hacking apart foes with crude but effective choppas.',
    characteristics: { ws: 40, bs: 25, s: 35, t: 35, i: 20, ag: 20, dex: 15, int: 15, wp: 25, fel: 10 },
    wounds: 16,
    movement: 4,
    traits: ['Animosity (Greenskins)', 'Night Vision', 'Frenzy', 'Weapon (Choppa)'],
    skills: { 'Endurance': 20, 'Intimidate': 25, 'Melee (Basic)': 25, 'Cool': 15 },
    armour: [A('Leather Skullcap'), A('Gambeson'), A('Leather Jack'), A('Leather Leggings')],
    weapons: [{ name: 'Choppa', damage: 5, qualities: ['Hack'] }],
    dangerLevel: 3,
    encounterWeight: 6,
  },
  {
    name: 'Black Orc',
    category: 'greenskins',
    description: 'The largest, strongest, and most disciplined of all Orcs. Clad in heavy black iron armour, they are the elite warriors of the greenskin hordes.',
    characteristics: { ws: 55, bs: 20, s: 50, t: 50, i: 25, ag: 20, dex: 15, int: 20, wp: 40, fel: 15 },
    wounds: 28,
    movement: 4,
    traits: ['Night Vision', 'Frenzy', 'Weapon (Great Choppa)', 'Size (Large)', 'Elite'],
    skills: { 'Endurance': 35, 'Intimidate': 45, 'Melee (Two-Handed)': 40, 'Cool': 30, 'Leadership': 25 },
    armour: [A('Plate Helm'), A('Plate Breastplate'), A('Shield'), A('Plate Bracers'), A('Plate Leggings')],
    weapons: [{ name: 'Great Choppa', damage: 8, qualities: ['Hack', 'Slow'] }],
    dangerLevel: 5,
    encounterWeight: 2,
  },
  {
    name: 'Troll',
    category: 'greenskins',
    description: 'Towering, dim-witted monsters with incredible regenerative abilities. Their acidic vomit can melt through armour, and only fire stops them from healing.',
    characteristics: { ws: 35, bs: 10, s: 45, t: 50, i: 10, ag: 15, dex: 10, int: 5, wp: 15, fel: 5 },
    wounds: 30,
    movement: 5,
    traits: ['Weapon (Fist)', 'Weapon (Vomit)', 'Regeneration', 'Afraid (Fire)', 'Stupid', 'Size (Large)'],
    skills: { 'Endurance': 30, 'Intimidate': 35, 'Melee (Brawling)': 20 },
    armourPoints: { head: 0, body: 2, arms: 0, legs: 0 },
    weapons: [
      { name: 'Fist', damage: 6, qualities: [] },
      { name: 'Vomit', damage: 4, qualities: ['Corrosive'] },
    ],
    dangerLevel: 4,
    encounterWeight: 3,
  },

  // ── UNDEAD ──────────────────────────────────────────────
  {
    name: 'Zombie',
    category: 'undead',
    description: 'Shambling corpses animated by dark necromancy. Slow and mindless, but relentless and terrifying in large numbers.',
    characteristics: { ws: 20, bs: 0, s: 25, t: 35, i: 10, ag: 10, dex: 10, int: 5, wp: 15, fel: 5 },
    wounds: 15,
    movement: 3,
    traits: ['Undead', 'Unstable', 'Fear (2)', 'The Newly Dead', 'Stupid'],
    skills: { 'Melee (Brawling)': 10, 'Endurance': 20 },
    armourPoints: { head: 0, body: 0, arms: 0, legs: 0 },
    weapons: [{ name: 'Fists and Teeth', damage: 3, qualities: ['Infected'] }],
    dangerLevel: 2,
    encounterWeight: 8,
  },
  {
    name: 'Skeleton Warrior',
    category: 'undead',
    description: 'Ancient warriors raised from their graves, still bearing rusted weapons and corroded armour. They fight with an echo of their former martial skill.',
    characteristics: { ws: 30, bs: 15, s: 25, t: 30, i: 20, ag: 20, dex: 20, int: 10, wp: 15, fel: 5 },
    wounds: 12,
    movement: 4,
    traits: ['Undead', 'Unstable', 'Fear (1)', 'Dark Vision', 'Construct'],
    skills: { 'Melee (Basic)': 20, 'Dodge': 10 },
    armour: [A('Leather Skullcap'), A('Gambeson'), A('Leather Jack'), A('Leather Leggings')],
    weapons: [{ name: 'Rusty Sword', damage: 4, qualities: ['Infected'] }],
    dangerLevel: 3,
    encounterWeight: 7,
  },
  {
    name: 'Ghoul',
    category: 'undead',
    description: 'Degenerate, cannibalistic creatures that haunt graveyards and battlefields. Once human, they have devolved into feral predators craving dead flesh.',
    characteristics: { ws: 35, bs: 0, s: 35, t: 35, i: 30, ag: 35, dex: 20, int: 10, wp: 25, fel: 5 },
    wounds: 18,
    movement: 5,
    traits: ['Fear (1)', 'Night Vision', 'Frenzy', 'Tracker'],
    skills: { 'Dodge': 20, 'Stealth (Any)': 25, 'Track': 30, 'Melee (Brawling)': 25 },
    armourPoints: { head: 0, body: 1, arms: 0, legs: 0 },
    weapons: [{ name: 'Claws', damage: 4, qualities: ['Infected'] }],
    dangerLevel: 3,
    encounterWeight: 5,
  },
  {
    name: 'Wight',
    category: 'undead',
    description: 'Powerful undead warriors entombed in ancient barrows. They retain their combat prowess from life and are clad in enchanted armour of ages past.',
    characteristics: { ws: 50, bs: 20, s: 40, t: 45, i: 35, ag: 30, dex: 25, int: 25, wp: 45, fel: 10 },
    wounds: 25,
    movement: 4,
    traits: ['Undead', 'Unstable', 'Fear (3)', 'Dark Vision', 'Armour (Ancient)', 'Weapon (Ancient Blade)'],
    skills: { 'Melee (Basic)': 35, 'Dodge': 20, 'Cool': 30, 'Intimidate': 35 },
    armour: [A('Mail Coif'), A('Gambeson'), A('Mail Shirt'), A('Mail Chausses')],
    weapons: [{ name: 'Ancient Blade', damage: 6, qualities: ['Magical'] }],
    dangerLevel: 4,
    encounterWeight: 3,
  },
  {
    name: 'Vampire',
    category: 'undead',
    description: 'Lords of the undead, cursed with immortality and an insatiable thirst for blood. Immensely powerful, cunning, and charismatic masters of dark magic.',
    characteristics: { ws: 60, bs: 30, s: 50, t: 50, i: 55, ag: 50, dex: 40, int: 45, wp: 55, fel: 50 },
    wounds: 35,
    movement: 6,
    traits: ['Undead', 'Fear (3)', 'Terror (1)', 'Dark Vision', 'Night Vision', 'Regeneration', 'Vampiric', 'Hungry', 'Weakness (Sigmar)', 'Weakness (Garlic)'],
    skills: { 'Melee (Basic)': 40, 'Dodge': 35, 'Cool': 40, 'Charm': 45, 'Intimidate': 50, 'Leadership': 35, 'Perception': 40, 'Channelling (Shyish)': 35, 'Language (Magick)': 40 },
    armourPoints: { head: 0, body: 2, arms: 0, legs: 0 },
    weapons: [
      { name: 'Claws', damage: 6, qualities: [] },
      { name: 'Bite', damage: 5, qualities: ['Draining'] },
    ],
    spellcasting: {
      lores: ['death'],
      spells: [S('Life Drain'), S('Doom and Darkness'), S('Spirit Leech')],
      castingSkill: 45,
    },
    dangerLevel: 5,
    encounterWeight: 1,
  },

  // ── CHAOS ───────────────────────────────────────────────
  {
    name: 'Nurgling',
    category: 'chaos',
    description: 'Tiny, giggling daemons of Nurgle that swarm over victims in a tide of infectious filth. Individually weak, but their diseases are deadly.',
    characteristics: { ws: 20, bs: 0, s: 10, t: 25, i: 15, ag: 25, dex: 15, int: 5, wp: 10, fel: 15 },
    wounds: 6,
    movement: 4,
    traits: ['Daemonic', 'Fear (1)', 'Size (Small)', 'Swarm', 'Disease'],
    skills: { 'Dodge': 15 },
    armourPoints: { head: 0, body: 0, arms: 0, legs: 0 },
    weapons: [{ name: 'Tiny Claws', damage: 1, qualities: ['Infected', 'Poisoned'] }],
    dangerLevel: 1,
    encounterWeight: 6,
  },
  {
    name: 'Chaos Hound',
    category: 'chaos',
    description: 'Mutated hunting beasts warped by Chaos energy. Once ordinary dogs, they now sport unnatural fangs, extra eyes, or tentacles.',
    characteristics: { ws: 35, bs: 0, s: 30, t: 30, i: 30, ag: 35, dex: 5, int: 10, wp: 20, fel: 2 },
    wounds: 14,
    movement: 8,
    traits: ['Bestial', 'Night Vision', 'Mutation (Random)', 'Tracker'],
    skills: { 'Perception': 30, 'Track': 35, 'Dodge': 15 },
    armourPoints: { head: 0, body: 1, arms: 0, legs: 0 },
    weapons: [{ name: 'Bite', damage: 4, qualities: [] }],
    dangerLevel: 2,
    encounterWeight: 5,
  },
  {
    name: 'Beastman (Gor)',
    category: 'chaos',
    description: 'Twisted half-human, half-beast creatures born from Chaos corruption. Gors are the warriors of the beastmen warherds, savage and filled with hatred for civilisation.',
    characteristics: { ws: 40, bs: 20, s: 35, t: 35, i: 30, ag: 30, dex: 20, int: 15, wp: 30, fel: 10 },
    wounds: 18,
    movement: 5,
    traits: ['Weapon (Horns)', 'Night Vision', 'Frenzy', 'Charge'],
    skills: { 'Melee (Basic)': 25, 'Dodge': 15, 'Outdoor Survival': 30, 'Intimidate': 20, 'Perception': 20 },
    armourPoints: { head: 0, body: 1, arms: 0, legs: 0 },
    weapons: [
      { name: 'Man-Ripper', damage: 5, qualities: [] },
      { name: 'Horns', damage: 3, qualities: [] },
    ],
    dangerLevel: 3,
    encounterWeight: 6,
  },
  {
    name: 'Chaos Warrior',
    category: 'chaos',
    description: 'Former men who have pledged themselves to the Dark Gods and been rewarded with superhuman strength and enchanted armour. Among the most feared fighters in the Old World.',
    characteristics: { ws: 55, bs: 25, s: 45, t: 50, i: 35, ag: 25, dex: 20, int: 25, wp: 45, fel: 15 },
    wounds: 26,
    movement: 4,
    traits: ['Fear (2)', 'Mutation (Random)', 'Champion', 'Night Vision'],
    skills: { 'Melee (Basic)': 35, 'Dodge': 20, 'Cool': 35, 'Endurance': 35, 'Intimidate': 40 },
    armourPoints: { head: 4, body: 5, arms: 4, legs: 4 },
    weapons: [{ name: 'Chaos Hand Weapon', damage: 7, qualities: ['Magical'] }],
    dangerLevel: 4,
    encounterWeight: 2,
  },
  {
    name: 'Chaos Spawn',
    category: 'chaos',
    description: 'Wretched masses of mutated flesh — former champions who received too many "gifts" from their patron gods. Mindless, writhing horrors that attack anything nearby.',
    characteristics: { ws: 40, bs: 0, s: 50, t: 45, i: 15, ag: 20, dex: 5, int: 5, wp: 30, fel: 2 },
    wounds: 30,
    movement: 5,
    traits: ['Fear (3)', 'Mutation (Multiple)', 'Stupid', 'Regeneration', 'Size (Large)'],
    skills: { 'Melee (Brawling)': 25, 'Endurance': 30 },
    armourPoints: { head: 1, body: 2, arms: 1, legs: 1 },
    weapons: [{ name: 'Tentacles/Claws', damage: 6, qualities: ['Wrap'] }],
    dangerLevel: 4,
    encounterWeight: 2,
  },

  // ── SKAVEN ──────────────────────────────────────────────
  {
    name: 'Clanrat',
    category: 'skaven',
    description: 'The rank-and-file warriors of the Skaven Under-Empire. Individually cowardly, they overwhelm foes through sheer weight of numbers and fight viciously when cornered.',
    characteristics: { ws: 30, bs: 20, s: 25, t: 25, i: 30, ag: 35, dex: 25, int: 20, wp: 20, fel: 10 },
    wounds: 10,
    movement: 5,
    traits: ['Night Vision', 'Afraid (Bright Light)', 'Weapon (Rusty Blade)', 'Skaven'],
    skills: { 'Dodge': 20, 'Stealth (Underground)': 30, 'Melee (Basic)': 20, 'Perception': 25 },
    armour: [A('Gambeson')],
    weapons: [{ name: 'Rusty Blade', damage: 4, qualities: ['Infected'] }],
    dangerLevel: 2,
    encounterWeight: 8,
  },
  {
    name: 'Stormvermin',
    category: 'skaven',
    description: 'Elite Skaven warriors, larger and stronger than common Clanrats. They serve as bodyguards to Warlords and form the shock troops of the Under-Empire.',
    characteristics: { ws: 45, bs: 25, s: 35, t: 35, i: 35, ag: 35, dex: 25, int: 20, wp: 30, fel: 10 },
    wounds: 16,
    movement: 5,
    traits: ['Night Vision', 'Elite', 'Drilled', 'Skaven'],
    skills: { 'Dodge': 25, 'Melee (Polearm)': 30, 'Cool': 20, 'Intimidate': 20, 'Perception': 25 },
    armour: [A('Mail Coif'), A('Gambeson'), A('Mail Shirt'), A('Mail Chausses')],
    weapons: [W('Halberd')],
    dangerLevel: 3,
    encounterWeight: 4,
  },
  {
    name: 'Plague Monk',
    category: 'skaven',
    description: 'Fanatical devotees of Clan Pestilens, consumed by their worship of disease and decay. They fight with reckless abandon, spreading plague wherever they go.',
    characteristics: { ws: 35, bs: 15, s: 30, t: 40, i: 25, ag: 25, dex: 20, int: 20, wp: 35, fel: 5 },
    wounds: 18,
    movement: 5,
    traits: ['Night Vision', 'Disease', 'Frenzy', 'Plague', 'Skaven'],
    skills: { 'Melee (Flail)': 25, 'Endurance': 35, 'Pray': 20 },
    armour: [A('Gambeson')],
    weapons: [{ name: 'Plague Censer Flail', damage: 5, qualities: ['Infected', 'Poisoned'] }],
    dangerLevel: 3,
    encounterWeight: 4,
  },
  {
    name: 'Gutter Runner',
    category: 'skaven',
    description: 'Deadly assassins of Clan Eshin, trained in the arts of stealth and murder. They strike from the shadows with poisoned blades and vanish before anyone can react.',
    characteristics: { ws: 40, bs: 35, s: 25, t: 25, i: 45, ag: 50, dex: 40, int: 25, wp: 30, fel: 10 },
    wounds: 12,
    movement: 6,
    traits: ['Night Vision', 'Stealthy', 'Assassin', 'Skaven'],
    skills: { 'Dodge': 40, 'Stealth (Any)': 45, 'Melee (Basic)': 30, 'Ranged (Throwing)': 30, 'Climb': 35, 'Perception': 35 },
    armour: [A('Gambeson')],
    weapons: [
      { name: 'Weeping Blade', damage: 4, qualities: ['Poisoned'] },
      { name: 'Throwing Stars', damage: 3, qualities: ['Poisoned'] },
    ],
    dangerLevel: 3,
    encounterWeight: 3,
  },
  {
    name: 'Rat Ogre',
    category: 'skaven',
    description: 'Monstrous creations of Clan Moulder — hulking brutes stitched together from rat and ogre parts. Mindless killing machines driven by their Packmasters.',
    characteristics: { ws: 45, bs: 0, s: 55, t: 50, i: 15, ag: 25, dex: 5, int: 5, wp: 20, fel: 2 },
    wounds: 32,
    movement: 6,
    traits: ['Night Vision', 'Stupid', 'Frenzy', 'Size (Large)', 'Fear (2)', 'Skaven'],
    skills: { 'Melee (Brawling)': 30, 'Intimidate': 35, 'Endurance': 30 },
    armourPoints: { head: 0, body: 2, arms: 0, legs: 0 },
    weapons: [{ name: 'Massive Fists', damage: 7, qualities: [] }],
    dangerLevel: 4,
    encounterWeight: 2,
  },

  // ── HUMAN ───────────────────────────────────────────────
  {
    name: 'Bandit',
    category: 'human',
    description: 'Desperate outlaws who prey on travellers along the roads of the Empire. Poorly equipped but dangerous in numbers, especially when setting ambushes.',
    characteristics: { ws: 30, bs: 25, s: 30, t: 30, i: 25, ag: 25, dex: 25, int: 20, wp: 25, fel: 20 },
    wounds: 12,
    movement: 4,
    traits: [],
    skills: { 'Melee (Basic)': 20, 'Ranged (Crossbow)': 15, 'Dodge': 15, 'Cool': 10, 'Outdoor Survival': 20, 'Stealth (Rural)': 20, 'Intimidate': 15 },
    armour: [A('Gambeson'), A('Leather Jack'), A('Leather Leggings')],
    weapons: [
      { name: 'Hand Weapon', damage: 4, qualities: [] },
      { ...W('Light Crossbow'), name: 'Crossbow' },
    ],
    dangerLevel: 2,
    encounterWeight: 8,
  },
  {
    name: 'Cultist',
    category: 'human',
    description: 'Secret worshippers of the Ruinous Powers hiding within Imperial society. They scheme in the shadows, performing dark rituals and spreading corruption.',
    characteristics: { ws: 25, bs: 20, s: 25, t: 25, i: 25, ag: 25, dex: 25, int: 25, wp: 30, fel: 25 },
    wounds: 11,
    movement: 4,
    traits: ['Corruption (Minor)'],
    skills: { 'Melee (Basic)': 10, 'Cool': 15, 'Dodge': 10, 'Pray': 15, 'Lore (Chaos)': 15, 'Stealth (Urban)': 15, 'Language (Magick)': 15 },
    armour: [A('Gambeson')],
    weapons: [W('Dagger')],
    spellcasting: {
      lores: ['petty'],
      spells: [S('Dart'), S('Drop')],
      castingSkill: 20,
    },
    dangerLevel: 2,
    encounterWeight: 5,
  },
  {
    name: 'Mercenary',
    category: 'human',
    description: 'Professional soldiers for hire, common throughout the Empire and the Border Princes. Well-armed and experienced, they fight for coin rather than cause.',
    characteristics: { ws: 40, bs: 35, s: 35, t: 35, i: 30, ag: 30, dex: 25, int: 20, wp: 30, fel: 20 },
    wounds: 15,
    movement: 4,
    traits: ['Drilled'],
    skills: { 'Melee (Basic)': 25, 'Ranged (Blackpowder)': 20, 'Dodge': 20, 'Cool': 20, 'Endurance': 20, 'Gamble': 15, 'Consume Alcohol': 15 },
    armour: [A('Mail Coif'), A('Gambeson'), A('Mail Shirt'), A('Mail Chausses')],
    weapons: [
      W('Sword'),
      W('Handgun'),
    ],
    dangerLevel: 3,
    encounterWeight: 5,
  },
  {
    name: 'Outlaw Chief',
    category: 'human',
    description: 'Charismatic and ruthless leaders of bandit gangs. Veterans of many fights, they command loyalty through strength, cunning, and a share of the spoils.',
    characteristics: { ws: 45, bs: 35, s: 35, t: 35, i: 35, ag: 30, dex: 30, int: 30, wp: 35, fel: 35 },
    wounds: 20,
    movement: 4,
    traits: ['Leader'],
    skills: { 'Melee (Basic)': 30, 'Ranged (Blackpowder)': 25, 'Dodge': 25, 'Cool': 25, 'Leadership': 30, 'Intimidate': 25, 'Charm': 20 },
    armour: [A('Leather Skullcap'), A('Gambeson'), A('Mail Shirt'), A('Mail Chausses')],
    weapons: [
      { name: 'Quality Hand Weapon', damage: 5, qualities: ['Fine'] },
      W('Pistol'),
    ],
    dangerLevel: 4,
    encounterWeight: 2,
  },
  {
    name: 'Witch Hunter',
    category: 'human',
    description: 'Agents of the Order of Sigmar, fanatically dedicated to rooting out heresy, witchcraft, and Chaos corruption. Feared by the innocent and guilty alike.',
    characteristics: { ws: 45, bs: 40, s: 35, t: 35, i: 40, ag: 35, dex: 30, int: 35, wp: 45, fel: 30 },
    wounds: 18,
    movement: 4,
    traits: ['Fearless (Witches)', 'Hatred (Chaos)'],
    skills: { 'Melee (Fencing)': 30, 'Ranged (Blackpowder)': 25, 'Dodge': 25, 'Cool': 35, 'Intimidate': 35, 'Perception': 30, 'Lore (Chaos)': 25, 'Intuition': 25 },
    armour: [A('Leather Skullcap'), A('Gambeson'), A('Mail Shirt'), A('Mail Chausses')],
    weapons: [
      W('Rapier'),
      W('Pistol'),
    ],
    dangerLevel: 4,
    encounterWeight: 2,
  },
];

export function getCreaturesByCategory(category) {
  return BESTIARY.filter(c => c.category === category);
}

export function getCreaturesByDangerLevel(min, max) {
  return BESTIARY.filter(c => c.dangerLevel >= min && c.dangerLevel <= max);
}

export function rollRandomEncounter(location = 'road', timeOfDay = 'day', dangerLevel = 2) {
  const isNight = timeOfDay === 'night';
  const minDanger = Math.max(1, dangerLevel - 1);
  const maxDanger = Math.min(5, dangerLevel + (isNight ? 2 : 1));

  const eligible = getCreaturesByDangerLevel(minDanger, maxDanger);
  if (eligible.length === 0) return null;

  const locKey = location.toLowerCase();
  const matchedKey = Object.keys(LOCATION_CREATURE_WEIGHTS).find(key => locKey.includes(key));
  const locWeights = matchedKey ? LOCATION_CREATURE_WEIGHTS[matchedKey] : {};
  const timeWeights = TIME_MODIFIERS[timeOfDay] || {};

  const weighted = eligible.map(creature => {
    let weight = creature.encounterWeight;
    weight += (locWeights[creature.category] || 0);
    weight += (timeWeights[creature.category] || 0);
    return { creature, weight: Math.max(weight, 1) };
  });

  const totalWeight = weighted.reduce((sum, w) => sum + w.weight, 0);
  let roll = Math.random() * totalWeight;

  for (const { creature, weight } of weighted) {
    roll -= weight;
    if (roll <= 0) return creature;
  }

  return weighted[weighted.length - 1].creature;
}

/**
 * Get creature's effective AP per location.
 * Stacks from armour pieces + optional baseArmourPoints (for traits/features).
 * Falls back to armourPoints for creatures with natural/no armour.
 */
export function getCreatureAP(creature) {
  if (creature.armour) {
    const base = creature.baseArmourPoints || {};
    const ap = {
      head: base.head || 0,
      body: base.body || 0,
      arms: base.arms || 0,
      legs: base.legs || 0,
    };
    for (const piece of creature.armour) {
      for (const loc of piece.locations) {
        ap[loc] += piece.ap;
      }
    }
    return ap;
  }
  return creature.armourPoints || { head: 0, body: 0, arms: 0, legs: 0 };
}

/**
 * Check if a weapon is natural (no economy data) vs equipped (has price/category from economy).
 */
export function isNaturalWeapon(weapon) {
  return !weapon.price;
}
