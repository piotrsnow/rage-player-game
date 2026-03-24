import { SPECIES, SPECIES_LIST, CHARACTERISTIC_KEYS, CAREERS, CAREER_CLASSES, CREATION_LIMITS } from '../data/wfrp';

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

export function randomizeCareer(careerClass) {
  const pool = careerClass
    ? CAREERS.filter((c) => c.class === careerClass)
    : CAREERS;
  return pool[Math.floor(Math.random() * pool.length)];
}

export function randomizeSkills(careerDef, speciesName) {
  const species = SPECIES[speciesName] || SPECIES.Human;
  const tier1 = careerDef?.tiers?.[0];
  const careerSkills = tier1?.skills || [];
  const speciesSkills = species.skills || [];
  const { skillPoints, maxPerSkill } = CREATION_LIMITS;

  const skills = {};
  let remaining = skillPoints;

  for (const skill of careerSkills) {
    if (remaining <= 0) break;
    const val = Math.min(maxPerSkill, remaining, Math.floor(Math.random() * 8) + 3);
    skills[skill] = val;
    remaining -= val;
  }
  for (const skill of speciesSkills) {
    if (remaining <= 0) break;
    if (!skills[skill]) {
      const val = Math.min(maxPerSkill, remaining, Math.floor(Math.random() * 6) + 3);
      skills[skill] = val;
      remaining -= val;
    }
  }
  return skills;
}

export function randomizeTalents(careerDef, speciesName) {
  const species = SPECIES[speciesName] || SPECIES.Human;
  const tier1 = careerDef?.tiers?.[0];
  const careerTalents = tier1?.talents || [];
  const speciesTalents = species.talents || [];

  const pool = [...new Set([...careerTalents, ...speciesTalents])];
  const count = Math.min(pool.length, CREATION_LIMITS.maxTalents, 2 + Math.floor(Math.random() * 2));
  const shuffled = pool.sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

export function randomizeFullCharacter(genre, careerClass) {
  const speciesName = randomizeSpecies();
  const species = SPECIES[speciesName] || SPECIES.Human;
  const careerDef = randomizeCareer(careerClass);
  const tier1 = careerDef?.tiers?.[0];
  const characteristics = generateCharacteristics(speciesName);
  const maxWounds = calculateWounds(characteristics);

  return {
    name: pickRandomName(genre),
    gender: Math.random() > 0.5 ? 'male' : 'female',
    species: speciesName,
    career: {
      class: careerDef.class,
      name: careerDef.name,
      tier: 1,
      tierName: tier1?.name || careerDef.name,
      status: tier1?.status || 'Silver 1',
    },
    characteristics,
    advances: Object.fromEntries(CHARACTERISTIC_KEYS.map((k) => [k, 0])),
    wounds: maxWounds,
    maxWounds,
    movement: species.movement,
    fate: species.fate,
    fortune: species.fate,
    resilience: species.resilience,
    resolve: species.resilience,
    skills: randomizeSkills(careerDef, speciesName),
    talents: randomizeTalents(careerDef, speciesName),
    inventory: [],
    money: generateStartingMoney(tier1?.status || 'Silver 1'),
    statuses: [],
    backstory: '',
    xp: 0,
    xpSpent: 0,
  };
}

export function createCampaignId() {
  return `campaign_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

export function createSceneId() {
  return `scene_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

export function createItemId() {
  return `item_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
}

export function createQuestId() {
  return `quest_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
}

// WFRP d100 roll (1-100)
export function rollD100() {
  return Math.floor(Math.random() * 100) + 1;
}

// Roll 2d10 (2-20)
export function roll2d10() {
  return Math.floor(Math.random() * 10) + 1 + Math.floor(Math.random() * 10) + 1;
}

// WFRP bonus = tens digit of a characteristic (e.g. 34 → 3)
export function getBonus(characteristicValue) {
  return Math.floor(characteristicValue / 10);
}

// Calculate Success Levels: (target - roll) / 10, rounded toward 0, clamped to [-10, +10]
export function calculateSL(roll, target) {
  const diff = target - roll;
  const raw = diff >= 0 ? Math.floor(diff / 10) : -Math.floor(Math.abs(diff) / 10);
  return Math.max(-10, Math.min(10, raw));
}

// WFRP Wounds = Strength Bonus + 2 × Toughness Bonus + Willpower Bonus
export function calculateWounds(characteristics) {
  const sb = getBonus(characteristics.s);
  const tb = getBonus(characteristics.t);
  const wpb = getBonus(characteristics.wp);
  return sb + 2 * tb + wpb;
}

// Generate random characteristics for a given species
export function generateCharacteristics(speciesName) {
  const species = SPECIES[speciesName];
  if (!species) return null;

  const characteristics = {};
  for (const key of CHARACTERISTIC_KEYS) {
    const base = species.characteristics[key];
    characteristics[key] = roll2d10() + base;
  }
  return characteristics;
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

export function generateStartingMoney(careerStatus) {
  const str = (careerStatus || 'Silver 1').toLowerCase();
  if (str.startsWith('gold')) {
    const roll = Math.floor(Math.random() * 10) + 1;
    return normalizeMoney({ gold: roll, silver: 0, copper: 0 });
  }
  if (str.startsWith('brass')) {
    const roll = Math.floor(Math.random() * 10) + 1 + Math.floor(Math.random() * 10) + 1;
    return normalizeMoney({ gold: 0, silver: 0, copper: roll });
  }
  const roll = Math.floor(Math.random() * 10) + 1;
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
    characterCareer: character?.career?.name || 'Unknown',
    characterTier: character?.career?.tier || 1,
    sceneCount: scenes?.length || 0,
    lastPlayed: gameState.lastSaved || Date.now(),
    totalCost: gameState.aiCosts?.total || 0,
  };
}
