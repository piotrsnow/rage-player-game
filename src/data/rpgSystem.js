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

// Skills organized by parent attribute
export const SKILLS = [
  // Sila
  { name: 'Atletyka', attribute: 'sila' },
  { name: 'Bijatyka', attribute: 'sila' },
  { name: 'Walka bronia jednoręczna', attribute: 'sila' },
  { name: 'Walka bronia dwureczna', attribute: 'sila' },
  { name: 'Zastraszanie', attribute: 'sila' },
  { name: 'Mocowanie', attribute: 'sila' },
  { name: 'Wspinaczka', attribute: 'sila' },
  { name: 'Dzwiganie', attribute: 'sila' },

  // Inteligencja
  { name: 'Alchemia', attribute: 'inteligencja' },
  { name: 'Medycyna', attribute: 'inteligencja' },
  { name: 'Rzemioslo', attribute: 'inteligencja' },
  { name: 'Wiedza ogolna', attribute: 'inteligencja' },
  { name: 'Wiedza o potworach', attribute: 'inteligencja' },
  { name: 'Wiedza o naturze', attribute: 'inteligencja' },
  { name: 'Wiedza o religiach i wierzeniach', attribute: 'inteligencja' },
  { name: 'Strategia', attribute: 'inteligencja' },
  { name: 'Taktyka', attribute: 'inteligencja' },
  { name: 'Tropienie', attribute: 'inteligencja' },
  { name: 'Spostrzegawczosc', attribute: 'inteligencja' },
  { name: 'Sledztwo', attribute: 'inteligencja' },
  { name: 'Wydobywanie informacji', attribute: 'inteligencja' },
  { name: 'Ocenianie wartosci', attribute: 'inteligencja' },
  { name: 'Czytanie i pisanie', attribute: 'inteligencja' },

  // Charyzma
  { name: 'Perswazja', attribute: 'charyzma' },
  { name: 'Blef', attribute: 'charyzma' },
  { name: 'Plotkowanie', attribute: 'charyzma' },
  { name: 'Targowanie', attribute: 'charyzma' },
  { name: 'Dowodzenie', attribute: 'charyzma' },
  { name: 'Uwodzenie', attribute: 'charyzma' },
  { name: 'Wystepy', attribute: 'charyzma' },
  { name: 'Etykieta', attribute: 'charyzma' },
  { name: 'Przekonywanie tlumu', attribute: 'charyzma' },
  { name: 'Negocjacje', attribute: 'charyzma' },

  // Zrecznosc
  { name: 'Akrobatyka', attribute: 'zrecznosc' },
  { name: 'Jezdziectwo', attribute: 'zrecznosc' },
  { name: 'Skradanie sie', attribute: 'zrecznosc' },
  { name: 'Otwieranie zamkow', attribute: 'zrecznosc' },
  { name: 'Kradziez kieszonkowa', attribute: 'zrecznosc' },
  { name: 'Uniki', attribute: 'zrecznosc' },
  { name: 'Refleks', attribute: 'zrecznosc' },
  { name: 'Celnosc', attribute: 'zrecznosc' },
  { name: 'Rzucanie', attribute: 'zrecznosc' },
  { name: 'Pulapki i mechanizmy', attribute: 'zrecznosc' },
  { name: 'Zonglerka i sztuczki', attribute: 'zrecznosc' },

  // Wytrzymalosc
  { name: 'Odpornosc na bol', attribute: 'wytrzymalosc' },
  { name: 'Odpornosc na trucizny', attribute: 'wytrzymalosc' },
  { name: 'Wytrwalosc', attribute: 'wytrzymalosc' },
  { name: 'Plywanie', attribute: 'wytrzymalosc' },
  { name: 'Przetrwanie', attribute: 'wytrzymalosc' },
  { name: 'Marsz dlugodystansowy', attribute: 'wytrzymalosc' },
  { name: 'Odpornosc na glod i pragnienie', attribute: 'wytrzymalosc' },
  { name: 'Hart ducha', attribute: 'wytrzymalosc' },

  // Szczescie
  { name: 'Fart', attribute: 'szczescie' },
  { name: 'Przeczucie', attribute: 'szczescie' },
  { name: 'Unik losu', attribute: 'szczescie' },
  { name: 'Hazard', attribute: 'szczescie' },
  { name: 'Szukanie okazji', attribute: 'szczescie' },
  { name: 'Wyczuc moment', attribute: 'szczescie' },
];

export const SKILL_NAMES = SKILLS.map((s) => s.name);

// ── DIFFICULTY THRESHOLDS ──

export const DIFFICULTY_THRESHOLDS = {
  easy: 30,
  medium: 40,
  hard: 55,
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
    attributes: { sila: 0, inteligencja: 0, charyzma: 0, zrecznosc: 0, wytrzymalosc: 0, szczescie: 0 },
    startingMana: 0,
    movement: 4,
    skills: ['Perswazja', 'Targowanie', 'Wiedza ogolna', 'Walka bronia jednoręczna'],
    description: 'Wszechstronni i adaptacyjni. Brak modyfikatorow cech, ale dodatkowa elastycznosc.',
  },
  Halfling: {
    name: 'Niziolek',
    nameEN: 'Halfling',
    attributes: { sila: -2, inteligencja: 0, charyzma: 2, zrecznosc: 2, wytrzymalosc: 0, szczescie: 3 },
    startingMana: 0,
    movement: 3,
    skills: ['Targowanie', 'Hazard', 'Skradanie sie', 'Plotkowanie'],
    description: 'Mali ale sprytni. Wysokie szczescie i zrecznosc, niska sila.',
  },
  Dwarf: {
    name: 'Krasnolud',
    nameEN: 'Dwarf',
    attributes: { sila: 2, inteligencja: 0, charyzma: -2, zrecznosc: -1, wytrzymalosc: 3, szczescie: 0 },
    startingMana: 0,
    movement: 3,
    skills: ['Rzemioslo', 'Odpornosc na trucizny', 'Walka bronia jednoręczna', 'Ocenianie wartosci'],
    description: 'Twardziele. Wysoka wytrzymalosc i sila, niska charyzma.',
  },
  Elf: {
    name: 'Elf',
    nameEN: 'Elf',
    attributes: { sila: -1, inteligencja: 2, charyzma: 1, zrecznosc: 2, wytrzymalosc: -2, szczescie: 0 },
    startingMana: 2,
    movement: 5,
    skills: ['Spostrzegawczosc', 'Celnosc', 'Wiedza o naturze', 'Etykieta'],
    description: 'Zwinni i inteligentni, z naturalna predyspozycja do magii. Niska wytrzymalosc.',
  },
};

export const SPECIES_LIST = Object.keys(SPECIES);

// ── CREATION LIMITS ──

export const CREATION_LIMITS = {
  baseAttributePoints: 75, // total points distributed across 6 attributes
  minAttribute: 3,
  maxAttributeAtCreation: 18,
  startingSkillPoints: 15, // points to distribute among starting skills
  maxPerSkillAtCreation: 5,
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
export function createSkillEntry(level = 0, progress = 0, cap = SKILL_CAPS.basic) {
  return { level, progress, cap };
}

/**
 * Generate initial skill map for a character with starting skills.
 */
export function createStartingSkills(speciesKey, extraSkillPoints = 0) {
  const species = SPECIES[speciesKey];
  const skillMap = {};

  // All skills start at 0
  for (const skill of SKILLS) {
    skillMap[skill.name] = createSkillEntry(0);
  }

  // Species starting skills get level 1
  if (species) {
    for (const skillName of species.skills) {
      if (skillMap[skillName]) {
        skillMap[skillName].level = 1;
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
- ~60 umiejetnosci, kazda powiazana z jedną cechą, poziom 0-25
- Umiejetnosci rosna przez uzywanie (progress), cap bazowy 10, max 25 (wymaga treningu)
- Trening mozliwy raz na 20 scen

TEST MECHANIKA:
- Rzut d50 + cecha + umiejetnosc + momentum (max ±10) + bonus za kreatywnosc (max +10)
- Progi trudnosci: Latwy=30, Sredni=40, Trudny=55, Bardzo trudny=65, Ekstremalny=80
- AI moze lekko modyfikowac prog w zaleznosci od sytuacji
- Margines = wynik - prog (dodatni = sukces, ujemny = porazka)
- Szczescie: przed kazdy rzutem X% szans na gwarantowany sukces (X = poziom Szczescia)

MAGIA:
- 9 drzewek zakleć, kazde z progresja przez uzycie
- Zaklecia kosztuja 1-5 many
- Nauka z scrolli (25% + bonus Inteligencji) lub jednorazowe uzycie scrolla
- Odblokowanie nastepnego zaklecia w drzewku: 5 * koszt_many poprzedniego zaklecia uzyc`;
}
