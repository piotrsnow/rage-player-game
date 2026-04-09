// RPGon — Custom RPG System Data Definitions
// Based on RPG_SYSTEM.md

// ── STATE CHANGE LIMITS (single source of truth for stateValidator) ──

export const STATE_CHANGE_LIMITS = {
  maxXpPerScene: 50,
  maxItemsPerScene: 3,
  maxWoundsDelta: 20,
  needsDeltaMin: -30,
  needsDeltaMax: 100,
  maxMoneyGainCopper: 500, // 5 GC equivalent
  maxDispositionDelta: 10,
  maxCodexPerScene: 3,
  maxCodexFragmentLength: 1000,
};

// ── ATTRIBUTES ──

export const ATTRIBUTE_NAMES = {
  sila: 'Sila',
  inteligencja: 'Inteligencja',
  charyzma: 'Charyzma',
  zrecznosc: 'Zrecznosc',
  wytrzymalosc: 'Wytrzymalosc',
  szczescie: 'Szczescie',
};

export const ATTRIBUTE_DESCRIPTIONS = {
  sila: 'Fizyczna moc postaci, skutecznosc w walce wrecz, dzwiganie oraz dzialania wymagajace brutalnej sily',
  inteligencja: 'Wiedza, analiza, logiczne myslenie, pamiec oraz zdolnosc rozumienia zlozonych zjawisk',
  charyzma: 'Wplyw spoleczny, perswazja, blef, przywodztwo i ogolne wrazenie wywierane na innych',
  zrecznosc: 'Refleks, precyzja ruchow, skradanie, uniki oraz obsluga narzedzi i broni wymagajacych dokladnosci',
  wytrzymalosc: 'Odpornosc organizmu, kondycja, zdrowie, wytrwalosc i zdolnosc przetrwania trudnych warunkow',
  szczescie: 'Cecha specjalna dajaca kazdemu rzutowi X% szans na gwarantowany sukces, gdzie X = poziom Szczescia',
};

export const ATTRIBUTE_SHORT = {
  sila: 'SIL',
  inteligencja: 'INT',
  charyzma: 'CHA',
  zrecznosc: 'ZRC',
  wytrzymalosc: 'WYT',
  szczescie: 'SZC',
};

export const ATTRIBUTE_KEYS = ['sila', 'inteligencja', 'charyzma', 'zrecznosc', 'wytrzymalosc', 'szczescie'];

// ── ATTRIBUTE SCALE ──

export const ATTRIBUTE_SCALE = {
  min: 1,
  max: 25, // soft cap; 25+ is legendary/divine
  interpretations: [
    { min: 1, max: 5, label: 'Bardzo niski' },
    { min: 6, max: 10, label: 'Niski / ponizej przecietnej' },
    { min: 11, max: 15, label: 'Przecietny do dobrego' },
    { min: 16, max: 20, label: 'Bardzo wysoki' },
    { min: 21, max: 25, label: 'Wybitny / heroiczny' },
  ],
};

// ── SKILL SYSTEM ──

export const SKILL_CAPS = {
  basic: 10,
  max: 25,
};

export const TRAINING_COOLDOWN_SCENES = 20;

export const SKILL_LEVEL_INTERPRETATIONS = [
  { min: 0, max: 5, label: 'Poczatkujacy' },
  { min: 6, max: 10, label: 'Praktyk' },
  { min: 11, max: 15, label: 'Ekspert' },
  { min: 16, max: 20, label: 'Mistrz' },
  { min: 21, max: 25, label: 'Legendarny' },
];

// Skills organized by parent attribute (31 consolidated skills)
export const SKILLS = [
  // Walka
  { name: 'Walka wrecz', attribute: 'sila' },
  { name: 'Walka bronia jednoręczna', attribute: 'sila' },
  { name: 'Walka bronia dwureczna', attribute: 'sila' },
  { name: 'Strzelectwo', attribute: 'zrecznosc' },
  { name: 'Uniki', attribute: 'zrecznosc' },
  { name: 'Walka dwiema brońmi', attribute: 'zrecznosc' },
  { name: 'Zastraszanie', attribute: 'sila' },

  // Fizyczne
  { name: 'Atletyka', attribute: 'sila' },
  { name: 'Akrobatyka', attribute: 'zrecznosc' },
  { name: 'Jezdziectwo', attribute: 'zrecznosc' },

  // Spoleczne
  { name: 'Perswazja', attribute: 'charyzma' },
  { name: 'Blef', attribute: 'charyzma' },
  { name: 'Handel', attribute: 'charyzma' },
  { name: 'Przywodztwo', attribute: 'charyzma' },
  { name: 'Wystepy', attribute: 'charyzma' },

  // Wiedza
  { name: 'Wiedza ogolna', attribute: 'inteligencja' },
  { name: 'Wiedza o potworach', attribute: 'inteligencja' },
  { name: 'Wiedza o naturze', attribute: 'inteligencja' },
  { name: 'Medycyna', attribute: 'inteligencja' },
  { name: 'Alchemia', attribute: 'inteligencja' },
  { name: 'Rzemioslo', attribute: 'inteligencja' },

  // Skradanie i Precyzja
  { name: 'Skradanie', attribute: 'zrecznosc' },
  { name: 'Otwieranie zamkow', attribute: 'zrecznosc' },
  { name: 'Kradziez kieszonkowa', attribute: 'zrecznosc' },
  { name: 'Pulapki i mechanizmy', attribute: 'zrecznosc' },
  { name: 'Spostrzegawczosc', attribute: 'inteligencja' },

  // Przetrwanie
  { name: 'Przetrwanie', attribute: 'wytrzymalosc' },
  { name: 'Tropienie', attribute: 'inteligencja' },
  { name: 'Odpornosc', attribute: 'wytrzymalosc' },

  // Szczescie
  { name: 'Fart', attribute: 'szczescie' },
  { name: 'Hazard', attribute: 'szczescie' },
  { name: 'Przeczucie', attribute: 'szczescie' },
];

export const SKILL_NAMES = SKILLS.map((s) => s.name);

// ── DIFFICULTY THRESHOLDS ──

export const DIFFICULTY_THRESHOLDS = {
  easy: 20,
  medium: 35,
  hard: 50,
  veryHard: 65,
  extreme: 80,
};

export const DIFFICULTY_LABELS = {
  easy: 'Latwy',
  medium: 'Sredni',
  hard: 'Trudny',
  veryHard: 'Bardzo trudny',
  extreme: 'Ekstremalny',
};

// ── SKILL XP SYSTEM (Learn by Doing) ──

export const SKILL_XP_CONFIG = {
  base: 20,         // XP needed for level 2
  multiplier: 1.25, // each subsequent level costs ×1.25 more
};

/**
 * XP required to reach a given skill level.
 * Level 0→1 is free (starting), level 2 = 20, level 3 = 25, etc.
 */
export function xpForSkillLevel(level) {
  if (level <= 1) return 0;
  return Math.floor(SKILL_XP_CONFIG.base * Math.pow(SKILL_XP_CONFIG.multiplier, level - 2));
}

// ── DIFFICULTY-BASED SKILL XP (for dice rolls & freeform actions) ──

export const DIFFICULTY_SKILL_XP = {
  easy:     { success: 4,  failure: 2  },
  medium:   { success: 8,  failure: 4  },
  hard:     { success: 14, failure: 7  },
  veryHard: { success: 20, failure: 10 },
  extreme:  { success: 28, failure: 14 },
};

/**
 * Calculate skill XP from a dice roll or freeform action.
 */
export function calculateDiceRollSkillXP(difficulty, success) {
  const entry = DIFFICULTY_SKILL_XP[difficulty] || DIFFICULTY_SKILL_XP.medium;
  return success ? entry.success : entry.failure;
}

// ── COMBAT SKILL XP ──

export const COMBAT_SKILL_XP = {
  miss: 10,
  hit: 20,
  kill: {
    weak: 50,
    easy: 50,
    medium: 100,
    hard: 200,
    boss: 500,
    extreme: 500,
  },
};

/**
 * Calculate skill XP from a combat outcome.
 * @param {'miss'|'hit'|'kill'} outcome
 * @param {'weak'|'easy'|'medium'|'hard'|'boss'|'extreme'} enemyTier - only used for kills
 */
export function calculateCombatSkillXP(outcome, enemyTier = 'medium') {
  if (outcome === 'kill') {
    return COMBAT_SKILL_XP.kill[enemyTier] || COMBAT_SKILL_XP.kill.medium;
  }
  return COMBAT_SKILL_XP[outcome] || COMBAT_SKILL_XP.miss;
}

// ── COMBAT SKILL MAPPING (weapon type → skill name) ──

export const WEAPON_SKILL_MAP = {
  unarmed: 'Walka wrecz',
  melee_1h: 'Walka bronia jednoręczna',
  melee_2h: 'Walka bronia dwureczna',
  ranged: 'Strzelectwo',
};

// ── CHARACTER LEVEL (Oblivion-style) ──

/**
 * Character XP gained when a skill levels up to newLevel.
 * Higher skill levels give quadratically more char XP.
 */
export function charXpFromSkillLevelUp(newLevel) {
  return newLevel * newLevel;
}

/**
 * Character XP needed to reach a given character level.
 * Cost = 5 × targetLevel² (equivalent to 5 skill level-ups at that tier).
 */
export function charLevelCost(targetLevel) {
  if (targetLevel <= 1) return 0;
  return 5 * targetLevel * targetLevel;
}

// ── TEST RESOLUTION CONSTANTS ──

export const MOMENTUM_RANGE = { min: -10, max: 10 };
export const CREATIVITY_BONUS_MAX = 10;
export const D50_MIN = 1;
export const D50_MAX = 50;

// ── SPECIES ──

export const SPECIES = {
  Human: {
    name: 'Czlowiek',
    nameEN: 'Human',
    attributes: { sila: 1, inteligencja: 1, charyzma: 1, zrecznosc: 1, wytrzymalosc: 1, szczescie: 0 },
    startingMana: 0,
    movement: 4,
    skills: ['Perswazja', 'Handel', 'Wiedza ogolna', 'Walka bronia jednoręczna'],
    description: 'Wszechstronni i adaptacyjni. Bonus do wszystkich cech oprocz szczescia.',
  },
  Halfling: {
    name: 'Niziolek',
    nameEN: 'Halfling',
    attributes: { sila: 0, inteligencja: 0, charyzma: 2, zrecznosc: 3, wytrzymalosc: 0, szczescie: 0 },
    startingMana: 0,
    movement: 3,
    skills: ['Handel', 'Hazard', 'Skradanie', 'Wystepy'],
    description: 'Mali ale sprytni. Wysoka charyzma i zrecznosc.',
  },
  Dwarf: {
    name: 'Krasnolud',
    nameEN: 'Dwarf',
    attributes: { sila: 2, inteligencja: 0, charyzma: 0, zrecznosc: 0, wytrzymalosc: 3, szczescie: 0 },
    startingMana: 0,
    movement: 3,
    skills: ['Rzemioslo', 'Odpornosc', 'Walka bronia jednoręczna', 'Handel'],
    description: 'Twardziele. Wysoka wytrzymalosc i sila.',
  },
  Elf: {
    name: 'Elf',
    nameEN: 'Elf',
    attributes: { sila: 0, inteligencja: 2, charyzma: 1, zrecznosc: 2, wytrzymalosc: 0, szczescie: 0 },
    startingMana: 2,
    movement: 5,
    skills: ['Spostrzegawczosc', 'Strzelectwo', 'Wiedza o naturze', 'Wystepy'],
    description: 'Zwinni i inteligentni, z naturalna predyspozycja do magii.',
  },
};

export const SPECIES_LIST = Object.keys(SPECIES);

// ── SKILL CATEGORIES (UI grouping) ──

export const SKILL_CATEGORIES = [
  { key: 'walka', label: 'Walka', icon: 'swords', skills: ['Walka wrecz', 'Walka bronia jednoręczna', 'Walka bronia dwureczna', 'Walka dwiema brońmi', 'Strzelectwo', 'Uniki', 'Zastraszanie'] },
  { key: 'fizyczne', label: 'Fizyczne', icon: 'fitness_center', skills: ['Atletyka', 'Akrobatyka', 'Jezdziectwo'] },
  { key: 'spoleczne', label: 'Spoleczne', icon: 'groups', skills: ['Perswazja', 'Blef', 'Handel', 'Przywodztwo', 'Wystepy'] },
  { key: 'wiedza', label: 'Wiedza', icon: 'school', skills: ['Wiedza ogolna', 'Wiedza o potworach', 'Wiedza o naturze', 'Medycyna', 'Alchemia', 'Rzemioslo'] },
  { key: 'skradanie', label: 'Skradanie i Precyzja', icon: 'visibility_off', skills: ['Skradanie', 'Otwieranie zamkow', 'Kradziez kieszonkowa', 'Pulapki i mechanizmy', 'Spostrzegawczosc'] },
  { key: 'przetrwanie', label: 'Przetrwanie', icon: 'forest', skills: ['Przetrwanie', 'Tropienie', 'Odpornosc'] },
  { key: 'szczescie', label: 'Szczescie', icon: 'casino', skills: ['Fart', 'Hazard', 'Przeczucie'] },
];

// ── CREATION LIMITS ──

export const CREATION_LIMITS = {
  baseAttribute: 1, // every attribute starts at 1
  distributableAttributePoints: 10, // player distributes these freely
  maxPerAttributeAtCreation: 5, // max points added to a single attribute (base 1 + 5 = 6 before species mod)
  szczesciePointCost: 3, // each point of Szczescie costs 3 from the attribute pool
  startingSkillPoints: 15, // points to distribute among ANY skills
  racialSkillLevel: 5, // species skills start at this level (free, not from pool)
  // No maxPerSkillAtCreation — SKILL_CAPS.basic (10) is the only limit
};

// ── HELPER FUNCTIONS ──

export function getSkillsByAttribute(attributeKey) {
  return SKILLS.filter((s) => s.attribute === attributeKey);
}

export function getSkillAttribute(skillName) {
  const found = SKILLS.find((s) => s.name === skillName);
  return found?.attribute || 'inteligencja';
}

export function getSkillDefinition(skillName) {
  return SKILLS.find((s) => s.name === skillName) || null;
}

/**
 * Create a default skill entry for a character.
 */
export function createSkillEntry(level = 0, xp = 0, cap = SKILL_CAPS.basic) {
  return { level, xp, cap };
}

/**
 * Generate initial skill map for a character with starting skills.
 */
export function createStartingSkills(speciesKey) {
  const species = SPECIES[speciesKey];
  const skillMap = {};

  // All skills start at 0
  for (const skill of SKILLS) {
    skillMap[skill.name] = createSkillEntry(0);
  }

  // Species starting skills get racialSkillLevel (5)
  if (species) {
    for (const skillName of species.skills) {
      if (skillMap[skillName]) {
        skillMap[skillName].level = CREATION_LIMITS.racialSkillLevel;
      }
    }
  }

  return skillMap;
}

/**
 * Calculate max wounds from Wytrzymalosc.
 */
export function calculateMaxWounds(wytrzymalosc) {
  return wytrzymalosc * 2 + 10;
}

/**
 * Format all attributes for a prompt/display.
 */
export function formatAttributesForPrompt(attributes) {
  return ATTRIBUTE_KEYS
    .map((key) => `${ATTRIBUTE_SHORT[key]}:${attributes[key] ?? 0}`)
    .join(' ');
}

/**
 * Format skills for prompt (only non-zero skills).
 */
export function formatSkillsForPrompt(skills) {
  if (!skills) return 'none';
  const entries = Object.entries(skills)
    .filter(([, v]) => {
      const level = typeof v === 'object' ? v.level : v;
      return level > 0;
    })
    .map(([name, v]) => {
      const level = typeof v === 'object' ? v.level : v;
      return `${name}: ${level}`;
    });
  return entries.length ? entries.join(', ') : 'none';
}

/**
 * Format the RPG system rules summary for AI prompts.
 */
export function formatSystemRulesForPrompt() {
  return `SYSTEM RPG:
- 6 cech bazowych (skala 1-25): Sila, Inteligencja, Charyzma, Zrecznosc, Wytrzymalosc, Szczescie
- Mana: zasob magiczny, rosnie tylko przez magiczne kamienie
- ~31 umiejetnosci, kazda powiazana z jedną cechą, poziom 0-25
- Umiejetnosci rosna przez uzywanie (XP), cap bazowy 10, max 25 (wymaga treningu)
- Levele postaci rosna w stylu Oblivion: level-up skilla daje XP postaci, level-up postaci daje +1 atrybut

TEST MECHANIKA:
- Rzut d50 + cecha + umiejetnosc + momentum (max ±10) + bonus za kreatywnosc (max +10)
- Progi trudnosci: Latwy=20, Sredni=35, Trudny=50, Bardzo trudny=65, Ekstremalny=80
- AI moze lekko modyfikowac prog w zaleznosci od sytuacji
- Margines = wynik - prog (dodatni = sukces, ujemny = porazka)
- Szczescie: przed kazdy rzutem X% szans na gwarantowany sukces (X = poziom Szczescia)

MAGIA:
- 9 drzewek zakleć, kazde z progresja przez uzycie
- Zaklecia kosztuja 1-5 many
- Nauka z scrolli (25% + bonus Inteligencji) lub jednorazowe uzycie scrolla
- Odblokowanie nastepnego zaklecia w drzewku: 5 * koszt_many poprzedniego zaklecia uzyc`;
}
