import {
  SPECIES, SPECIES_LIST, ATTRIBUTE_KEYS, CREATION_LIMITS,
  createStartingSkills, calculateMaxWounds as calcMaxWounds,
} from '../data/rpgSystem';
import { DEFAULT_CHARACTER_AGE } from './characterAge';

const RANDOM_NAMES = {
  Fantasy: [
    'Aldric', 'Seraphina', 'Thorn', 'Isolde', 'Kael', 'Miriel', 'Fenris',
    'Lyra', 'Darian', 'Elowen', 'Grimwald', 'Astrid', 'Rowan', 'Zephyra',
    'Valen', 'Elara', 'Corvus', 'Nerissa', 'Theron', 'Brynn', 'Oberon',
    'Ravenna', 'Cedric', 'Fiora', 'Magnus', 'Selene', 'Gareth', 'Ysolde',
  ],
  'Sci-Fi': [
    'Vex', 'Nova', 'Kai-7', 'Orion', 'Lyris', 'Zane', 'Astra', 'Rex',
    'Ember', 'Cyrus', 'Nyx', 'Jett', 'Solara', 'Axel', 'Io', 'Sable',
    'Rho', 'Vesper', 'Talon', 'Celeste', 'Dex', 'Mira', 'Kova', 'Zero',
  ],
  Horror: [
    'Ezra', 'Morrigan', 'Silas', 'Lenore', 'Dorian', 'Raven', 'Cassius',
    'Lilith', 'Ambrose', 'Isolde', 'Damien', 'Vesper', 'Alaric', 'Salem',
    'Cain', 'Ophelia', 'Lucius', 'Nyx', 'Thane', 'Elspeth', 'Draven',
    'Carmilla', 'Malachi', 'Rowena', 'Viktor', 'Perdita', 'Alistair',
  ],
};

export function pickRandomName(genre, currentName) {
  const pool = RANDOM_NAMES[genre] || RANDOM_NAMES.Fantasy;
  const filtered = pool.filter((n) => n !== currentName);
  return filtered[Math.floor(Math.random() * filtered.length)];
}

export function randomizeSpecies() {
  return SPECIES_LIST[Math.floor(Math.random() * SPECIES_LIST.length)];
}

/**
 * Randomize skills for a species, distributing starting skill points.
 */
export function randomizeSkills(speciesName) {
  const skills = createStartingSkills(speciesName);
  const species = SPECIES[speciesName] || SPECIES.Human;
  let remaining = CREATION_LIMITS.startingSkillPoints;

  // Distribute points among species starting skills first
  const startingSkillNames = species.skills || [];
  for (const skillName of startingSkillNames) {
    if (remaining <= 0) break;
    if (skills[skillName]) {
      const add = Math.min(CREATION_LIMITS.maxPerSkillAtCreation - skills[skillName].level, remaining, Math.floor(Math.random() * 4) + 1);
      skills[skillName] = { ...skills[skillName], level: skills[skillName].level + add };
      remaining -= add;
    }
  }

  // Spread remaining points randomly among all skills
  const allSkillNames = Object.keys(skills);
  while (remaining > 0) {
    const name = allSkillNames[Math.floor(Math.random() * allSkillNames.length)];
    if (skills[name].level < CREATION_LIMITS.maxPerSkillAtCreation) {
      skills[name] = { ...skills[name], level: skills[name].level + 1 };
      remaining--;
    }
  }

  return skills;
}

/**
 * Generate random attributes for a species (1-25 scale).
 */
export function generateAttributes(speciesName) {
  const species = SPECIES[speciesName] || SPECIES.Human;
  const attrs = {};

  // Distribute baseAttributePoints across 6 attributes
  const { baseAttributePoints, minAttribute, maxAttributeAtCreation } = CREATION_LIMITS;
  let remaining = baseAttributePoints;

  // First pass: assign minimum
  for (const key of ATTRIBUTE_KEYS) {
    attrs[key] = minAttribute;
    remaining -= minAttribute;
  }

  // Second pass: randomly distribute remaining points
  const keys = [...ATTRIBUTE_KEYS];
  while (remaining > 0) {
    const key = keys[Math.floor(Math.random() * keys.length)];
    if (attrs[key] < maxAttributeAtCreation) {
      attrs[key]++;
      remaining--;
    }
  }

  // Apply species modifiers
  for (const key of ATTRIBUTE_KEYS) {
    const mod = species.attributes[key] || 0;
    attrs[key] = Math.max(1, attrs[key] + mod);
  }

  return attrs;
}

export function randomizeFullCharacter(genre) {
  const speciesName = randomizeSpecies();
  const species = SPECIES[speciesName] || SPECIES.Human;
  const attributes = generateAttributes(speciesName);
  const maxWounds = calcMaxWounds(attributes.wytrzymalosc);

  return {
    name: pickRandomName(genre),
    age: DEFAULT_CHARACTER_AGE,
    gender: Math.random() > 0.5 ? 'male' : 'female',
    species: speciesName,
    attributes,
    mana: { current: species.startingMana || 0, max: species.startingMana || 0 },
    wounds: maxWounds,
    maxWounds,
    movement: species.movement,
    skills: randomizeSkills(speciesName),
    spells: { known: [], usageCounts: {}, scrolls: [] },
    inventory: [],
    money: generateStartingMoney(),
    statuses: [],
    backstory: '',
    xp: 0,
    xpSpent: 0,
    lastTrainingScene: -10,
  };
}

export function createCampaignId() {
  return `campaign_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

export function createSceneId() {
  return `scene_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

export { createItemId } from '../../shared/domain/stateValidation.js';

export function createQuestId() {
  return `quest_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
}

// d50 roll (1-50)
export function rollD50() {
  return Math.floor(Math.random() * 50) + 1;
}

// Percentage roll (1-100) — used for luck checks, scroll learning, idle triggers
export function rollPercentage() {
  return Math.floor(Math.random() * 100) + 1;
}

// Calculate max wounds from Wytrzymalosc attribute
export function calculateMaxWounds(wytrzymalosc) {
  return calcMaxWounds(wytrzymalosc);
}

export function normalizeMoney(money) {
  let total = (money.gold || 0) * 100 + (money.silver || 0) * 10 + (money.copper || 0);
  if (total < 0) total = 0;
  return {
    gold: Math.floor(total / 100),
    silver: Math.floor((total % 100) / 10),
    copper: total % 10,
  };
}

export function generateStartingMoney() {
  // Simple starting money: 1-5 silver
  const roll = Math.floor(Math.random() * 5) + 1;
  return normalizeMoney({ gold: 0, silver: roll, copper: 0 });
}

export function formatMoney(money) {
  const parts = [];
  if (money.gold) parts.push(`${money.gold} GC`);
  if (money.silver) parts.push(`${money.silver} SS`);
  if (money.copper) parts.push(`${money.copper} CP`);
  return parts.length > 0 ? parts.join(' ') : '0 CP';
}

export function formatTimestamp(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function getCampaignSummary(gameState) {
  const { campaign, character, scenes } = gameState;
  return {
    name: campaign?.name || 'Untitled',
    genre: campaign?.genre || 'Unknown',
    tone: campaign?.tone || 'Unknown',
    characterName: character?.name || 'Unknown',
    sceneCount: scenes?.length || 0,
    lastPlayed: gameState.lastSaved || Date.now(),
    totalCost: gameState.aiCosts?.total || 0,
  };
}
