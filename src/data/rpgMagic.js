// RPGon — Magic System Data
// Based on RPG_SYSTEM.md §7

// ── SCROLL MECHANICS ──

export const SCROLL_BASE_CHANCE = 0.25; // 25% base chance to learn a spell from a scroll

// ── Spell ID helper ──

export function makeSpellId(treeId, spellName) {
  return `${treeId}_${spellName.toLowerCase().replace(/\s+/g, '_')}`;
}

// ── SPELL TREES ──

export const SPELL_TREES = {
  ogien: {
    id: 'ogien',
    name: 'Ogien',
    icon: 'local_fire_department',
    description: 'Sciezka ognia — od iskier po kule ognia',
    spells: [
      {
        name: 'Iskra',
        icon: 'local_fire_department',
        level: 1,
        manaCost: 1,
        unlockCondition: null, // starting spell
        unlockUses: 0,
        description: 'Tworzy maly impuls ognia do zapalania, aktywacji prostych obiektow albo zadania lekkich obrazen',
        combatStats: {
          type: 'offensive',
          damage: { intScale: 0.25, flat: 0 },
          damageComponents: [{ type: 'ogien', intScale: 0.25, flat: 0 }],
        },
      },
      {
        name: 'Ognisty Pocisk',
        icon: 'whatshot',
        level: 2,
        manaCost: 2,
        unlockCondition: 'Iskra',
        unlockUses: 10, // 2 * (5 * 1)
        description: 'Wystrzeliwuje skupiony pocisk ognia w jeden cel',
        combatStats: {
          type: 'offensive',
          damage: { intScale: 0.5, flat: 2 },
          damageComponents: [{ type: 'ogien', intScale: 0.5, flat: 2 }],
        },
      },
      {
        name: 'Kula Ognia',
        icon: 'flare',
        level: 3,
        manaCost: 4,
        unlockCondition: 'Ognisty Pocisk',
        unlockUses: 10, // 5 * 2
        description: 'Tworzy wybuch ognia raniacy wielu przeciwnikow na obszarze',
        combatStats: {
          type: 'offensive',
          damage: { intScale: 0.5, flat: 4 },
          damageComponents: [{ type: 'ogien', intScale: 0.5, flat: 4 }],
        },
      },
    ],
  },

  blyskawice: {
    id: 'blyskawice',
    name: 'Blyskawice',
    icon: 'bolt',
    description: 'Sciezka blyskawic — potezne wyladowania elektryczne',
    spells: [
      {
        name: 'Piorun',
        icon: 'bolt',
        level: 1,
        manaCost: 3,
        unlockCondition: null,
        unlockUses: 0,
        description: 'Uderza pojedynczy cel silnym wyladowaniem',
        combatStats: {
          type: 'offensive',
          damage: { intScale: 0.75, flat: 0 },
          damageComponents: [{ type: 'blyskawica', intScale: 0.75, flat: 0 }],
        },
      },
      {
        name: 'Lancuch Blyskawic',
        icon: 'electric_bolt',
        level: 2,
        manaCost: 5,
        unlockCondition: 'Piorun',
        unlockUses: 30, // 2 * (5 * 3)
        description: 'Wyladowanie przeskakuje miedzy kilkoma przeciwnikami',
        combatStats: {
          type: 'offensive',
          damage: { intScale: 0.5, flat: 3 },
          damageComponents: [{ type: 'blyskawica', intScale: 0.5, flat: 3 }],
        },
      },
    ],
  },

  ochrona: {
    id: 'ochrona',
    name: 'Ochrona',
    icon: 'shield',
    description: 'Sciezka ochrony — redukcja obrazen fizycznych i magicznych',
    spells: [
      {
        name: 'Ochrona',
        icon: 'shield',
        level: 1,
        manaCost: 3,
        unlockCondition: null,
        unlockUses: 0,
        description: 'Zmniejsza obrazenia fizyczne i magiczne otrzymywane przez jeden cel',
        combatStats: { type: 'buff' },
      },
      {
        name: 'Wielka Ochrona',
        icon: 'health_and_safety',
        level: 2,
        manaCost: 5,
        unlockCondition: 'Ochrona',
        unlockUses: 30,
        description: 'Znacznie silniejsza wersja zaklecia, dajaca wieksza redukcje obrazen albo dluzszy czas dzialania',
        combatStats: { type: 'buff' },
      },
    ],
  },

  niewidzialnosc: {
    id: 'niewidzialnosc',
    name: 'Niewidzialnosc',
    icon: 'visibility_off',
    description: 'Sciezka niewidzialnosci — ukrywanie siebie i sojusznikow',
    spells: [
      {
        name: 'Niewidzialnosc',
        icon: 'visibility_off',
        level: 1,
        manaCost: 4,
        unlockCondition: null,
        unlockUses: 0,
        description: 'Ukrywa jedna postac przed wzrokiem innych na krotki czas',
        combatStats: { type: 'utility' },
      },
      {
        name: 'Grupowa Niewidzialnosc',
        icon: 'group',
        level: 2,
        manaCost: 5,
        unlockCondition: 'Niewidzialnosc',
        unlockUses: 40,
        description: 'Ukrywa kilka bliskich sobie postaci jednoczesnie',
        combatStats: { type: 'utility' },
      },
    ],
  },

  lod: {
    id: 'lod',
    name: 'Lod',
    icon: 'ac_unit',
    description: 'Sciezka lodu — mrozne ataki i bariery',
    spells: [
      {
        name: 'Lodowy Dotyk',
        icon: 'ac_unit',
        level: 1,
        manaCost: 2,
        unlockCondition: null,
        unlockUses: 0,
        description: 'Zadaje obrazenia od zimna i lekko spowalnia cel',
        combatStats: {
          type: 'offensive',
          damage: { intScale: 0.33, flat: 1 },
          damageComponents: [{ type: 'lod', intScale: 0.33, flat: 1 }],
        },
      },
      {
        name: 'Lodowa Bariera',
        icon: 'severe_cold',
        level: 2,
        manaCost: 3,
        unlockCondition: 'Lodowy Dotyk',
        unlockUses: 20,
        description: 'Tworzy osłone z lodu absorbujaça obrazenia albo blokujaça przejscie',
        combatStats: { type: 'buff' },
      },
      {
        name: 'Zamiec',
        icon: 'weather_snowy',
        level: 3,
        manaCost: 5,
        unlockCondition: 'Lodowa Bariera',
        unlockUses: 15,
        description: 'Atakuje obszar lodem i mrozem, spowalniajac wielu przeciwnikow',
        combatStats: {
          type: 'offensive',
          damage: { intScale: 0.5, flat: 2 },
          damageComponents: [{ type: 'lod', intScale: 0.5, flat: 2 }],
        },
      },
    ],
  },

  leczenie: {
    id: 'leczenie',
    name: 'Leczenie',
    icon: 'healing',
    description: 'Sciezka leczenia — przywracanie zdrowia i ratowanie zycia',
    spells: [
      {
        name: 'Leczenie Ran',
        icon: 'healing',
        level: 1,
        manaCost: 2,
        unlockCondition: null,
        unlockUses: 0,
        description: 'Przywraca niewielka ilosc zdrowia jednej postaci',
        combatStats: {
          type: 'heal',
          heal: { intScale: 0.33, flat: 2 },
          healComponents: [{ type: 'magiczne', intScale: 0.33, flat: 2 }],
        },
      },
      {
        name: 'Regeneracja',
        icon: 'monitor_heart',
        level: 2,
        manaCost: 4,
        unlockCondition: 'Leczenie Ran',
        unlockUses: 20,
        description: 'Leczy mocniej i moze przywracac zdrowie przez kilka tur lub chwil',
        combatStats: {
          type: 'heal',
          healComponents: [{ type: 'magiczne', intScale: 0.25, flat: 1 }],
        },
      },
      {
        name: 'Wskrzeszenie Iskry Zycia',
        icon: 'favorite',
        level: 3,
        manaCost: 5,
        unlockCondition: 'Regeneracja',
        unlockUses: 20,
        description: 'Ratuje swiezo powalona postac przed smiercia albo przywraca ja do stanu krytycznego',
        combatStats: {
          type: 'heal',
          healComponents: [{ type: 'magiczne', intScale: 0.5, flat: 5 }],
        },
      },
    ],
  },

  przestrzen: {
    id: 'przestrzen',
    name: 'Przestrzen',
    icon: 'open_with',
    description: 'Sciezka przestrzeni — manipulacja obiektami i teleportacja',
    spells: [
      {
        name: 'Telekineza',
        icon: 'open_with',
        level: 1,
        manaCost: 3,
        unlockCondition: null,
        unlockUses: 0,
        description: 'Pozwala przesuwac przedmioty, manipulowac mechanizmami i lekko odpychac cele',
        combatStats: { type: 'utility' },
      },
      {
        name: 'Teleportacja',
        icon: 'move_up',
        level: 2,
        manaCost: 5,
        unlockCondition: 'Telekineza',
        unlockUses: 30,
        description: 'Natychmiast przenosi postac na niewielka lub srednia odleglosc',
        combatStats: { type: 'utility' },
      },
    ],
  },

  umysl: {
    id: 'umysl',
    name: 'Umysl',
    icon: 'psychology',
    description: 'Sciezka umyslu — strach, sen i kontrola mentalna',
    spells: [
      {
        name: 'Strach',
        icon: 'sentiment_very_dissatisfied',
        level: 1,
        manaCost: 2,
        unlockCondition: null,
        unlockUses: 0,
        description: 'Wywoluje lek, utrudniajac przeciwnikowi dzialanie',
        combatStats: { type: 'control' },
      },
      {
        name: 'Sen',
        icon: 'bedtime',
        level: 2,
        manaCost: 3,
        unlockCondition: 'Strach',
        unlockUses: 20,
        description: 'Usypia slabszy cel lub grupe drobnych przeciwnikow na krotki czas',
        combatStats: { type: 'control' },
      },
    ],
  },

  wiatr_percepcja: {
    id: 'wiatr_percepcja',
    name: 'Wiatr i percepcja',
    icon: 'air',
    description: 'Sciezka wiatru — wykrywanie magii, ochrona przed pociskami, rozpraszanie zakleç',
    spells: [
      {
        name: 'Wykrycie Magii',
        icon: 'travel_explore',
        level: 1,
        manaCost: 1,
        unlockCondition: null,
        unlockUses: 0,
        description: 'Pozwala wyczuc aktywna magie, artefakty i zaklocenia magiczne w poblizu',
        combatStats: { type: 'utility' },
      },
      {
        name: 'Tarcza Wiatru',
        icon: 'cyclone',
        level: 2,
        manaCost: 2,
        unlockCondition: 'Wykrycie Magii',
        unlockUses: 10,
        description: 'Tworzy wir ochronny utrudniajacy trafienie atakami dystansowymi',
        combatStats: { type: 'buff' },
      },
      {
        name: 'Rozproszenie Magii',
        icon: 'auto_fix_off',
        level: 3,
        manaCost: 4,
        unlockCondition: 'Tarcza Wiatru',
        unlockUses: 10,
        description: 'Probuje zdjac aktywny efekt magiczny albo oslabic zaklecie przeciwnika',
        combatStats: { type: 'utility' },
      },
    ],
  },
};

export const SPELL_TREE_LIST = Object.keys(SPELL_TREES);

// ── Auto-assign spell IDs + convert unlockCondition from name → spellId ──
// Runs once at module load. Every spell gets a stable deterministic ID:
//   makeSpellId(treeId, spellName) → e.g. "ogien_iskra"
// unlockCondition is converted from the prerequisite's display name to its ID.
for (const [treeId, tree] of Object.entries(SPELL_TREES)) {
  for (const spell of tree.spells) {
    spell.id = makeSpellId(treeId, spell.name);
  }
  for (const spell of tree.spells) {
    if (spell.unlockCondition) {
      spell.unlockCondition = makeSpellId(treeId, spell.unlockCondition);
    }
  }
}

// ── Reverse lookup: spellId → { spell, treeId } ──
const SPELL_BY_ID = new Map();
const SPELL_ID_BY_NAME = new Map();
for (const [treeId, tree] of Object.entries(SPELL_TREES)) {
  for (const spell of tree.spells) {
    SPELL_BY_ID.set(spell.id, { spell, treeId });
    SPELL_ID_BY_NAME.set(spell.name, spell.id);
  }
}

/**
 * Resolve a spell name (display) to its stable ID. Returns null for
 * custom/AI-invented spells not in the catalog.
 */
export function spellNameToId(name) {
  return SPELL_ID_BY_NAME.get(name) || null;
}

/**
 * Spell → status effect mapping. When a spell hits, the corresponding effect
 * is applied to the target (or caster for self-buffs). Only spells with
 * mechanical effects are listed; pure-damage spells rely on the combat engine
 * damage formula.
 *
 * Keyed by spellId (stable). Legacy name-based lookup supported via
 * `getSpellEffect()`.
 */
const SPELL_EFFECTS_BY_ID = {};
const SPELL_EFFECTS_RAW = {
  'Lodowy Dotyk': {
    target: 'enemy',
    effect: {
      name: 'Odmrożenie',
      source: 'spell',
      category: 'control',
      duration: { type: 'rounds', remaining: 2 },
      mechanics: { attributeMods: { zrecznosc: -3 }, movementMod: -1 },
      stackable: false,
      description: 'Mróz spowalnia ruchy i reakcje.',
    },
  },
  'Zamiec': {
    target: 'all_enemies',
    effect: {
      name: 'Zamrożenie',
      source: 'spell',
      category: 'control',
      duration: { type: 'rounds', remaining: 2 },
      mechanics: { attributeMods: { zrecznosc: -5 }, movementMod: -2, restrictions: ['no_movement'] },
      stackable: false,
      description: 'Silny mróz unieruchamia na krótki czas.',
    },
  },
  'Ochrona': {
    target: 'self',
    effect: {
      name: 'Magiczna ochrona',
      source: 'spell',
      category: 'buff',
      duration: { type: 'rounds', remaining: 3 },
      mechanics: { damageReduction: 3 },
      stackable: false,
      description: 'Magiczna tarcza pochłania część obrażeń.',
    },
  },
  'Wielka Ochrona': {
    target: 'self',
    effect: {
      name: 'Wielka magiczna ochrona',
      source: 'spell',
      category: 'buff',
      duration: { type: 'rounds', remaining: 5 },
      mechanics: { damageReduction: 6 },
      stackable: false,
      description: 'Potężna magiczna tarcza pochłania znaczną część obrażeń.',
    },
  },
  'Strach': {
    target: 'enemy',
    effect: {
      name: 'Przerażenie',
      source: 'spell',
      category: 'control',
      duration: { type: 'rounds', remaining: 2 },
      mechanics: { attributeMods: { charyzma: -5 }, testMod: -5, restrictions: ['no_attack'] },
      stackable: false,
      description: 'Strach paraliżuje — utrudnia działanie i uniemożliwia atak.',
    },
  },
  'Sen': {
    target: 'enemy',
    effect: {
      name: 'Uśpienie',
      source: 'spell',
      category: 'control',
      duration: { type: 'rounds', remaining: 3 },
      mechanics: { restrictions: ['skip_turn'], resistCheck: { attribute: 'wytrzymalosc', threshold: 20 } },
      stackable: false,
      description: 'Cel zasypia — pomija turę, chyba że uda mu się test odporności.',
    },
  },
  'Tarcza Wiatru': {
    target: 'self',
    effect: {
      name: 'Tarcza Wiatru',
      source: 'spell',
      category: 'buff',
      duration: { type: 'rounds', remaining: 3 },
      mechanics: { attributeMods: { zrecznosc: 3 } },
      stackable: false,
      description: 'Wir ochronny zwiększa zwinność.',
    },
  },
  'Regeneracja': {
    target: 'self',
    effect: {
      name: 'Regeneracja',
      source: 'spell',
      category: 'buff',
      duration: { type: 'rounds', remaining: 4 },
      mechanics: { dotHeal: 2 },
      stackable: false,
      description: 'Magiczna regeneracja przywraca zdrowie co rundę.',
    },
  },
  'Iskra': {
    target: 'enemy',
    effect: {
      name: 'Podpalenie',
      source: 'spell',
      category: 'dot',
      duration: { type: 'rounds', remaining: 2 },
      mechanics: { dotDamage: 1, dotDamageType: 'ogien' },
      stackable: false,
      description: 'Ogień pali lekko przez chwilę.',
    },
  },
  'Ognisty Pocisk': {
    target: 'enemy',
    effect: {
      name: 'Płomienie',
      source: 'spell',
      category: 'dot',
      duration: { type: 'rounds', remaining: 3 },
      mechanics: { dotDamage: 2, dotDamageType: 'ogien' },
      stackable: false,
      description: 'Intensywny ogień zadaje obrażenia co rundę.',
    },
  },
  'Kula Ognia': {
    target: 'all_enemies',
    effect: {
      name: 'Pożoga',
      source: 'spell',
      category: 'dot',
      duration: { type: 'rounds', remaining: 2 },
      mechanics: { dotDamage: 3, dotDamageType: 'ogien' },
      stackable: false,
      description: 'Eksplozja ognia podpala wszystkich w zasięgu.',
    },
  },
  'Piorun': {
    target: 'enemy',
    effect: {
      name: 'Porażenie',
      source: 'spell',
      category: 'control',
      duration: { type: 'rounds', remaining: 1 },
      mechanics: { attributeMods: { zrecznosc: -4 }, restrictions: ['no_movement'] },
      stackable: false,
      description: 'Porażenie elektryczne chwilowo unieruchamia i obniża zwinność.',
    },
  },
  'Lancuch Blyskawic': {
    target: 'all_enemies',
    effect: {
      name: 'Porażenie łańcuchowe',
      source: 'spell',
      category: 'control',
      duration: { type: 'rounds', remaining: 1 },
      mechanics: { attributeMods: { zrecznosc: -2 } },
      stackable: false,
      description: 'Wyładowania elektryczne lekko paraliżują trafione cele.',
    },
  },
  'Lodowa Bariera': {
    target: 'self',
    effect: {
      name: 'Lodowa Bariera',
      source: 'spell',
      category: 'buff',
      duration: { type: 'rounds', remaining: 3 },
      mechanics: { damageReduction: 4 },
      stackable: false,
      description: 'Osłona z lodu pochłania obrażenia fizyczne.',
    },
  },
  'Niewidzialnosc': {
    target: 'self',
    effect: {
      name: 'Niewidzialność',
      source: 'spell',
      category: 'buff',
      duration: { type: 'rounds', remaining: 3 },
      mechanics: { attributeMods: { zrecznosc: 5 }, stealth: true },
      stackable: false,
      description: 'Postać staje się niewidoczna — trudniejsza do trafienia.',
    },
  },
};

// Build ID-keyed SPELL_EFFECTS from name-keyed raw map
for (const [spellName, fx] of Object.entries(SPELL_EFFECTS_RAW)) {
  const id = spellNameToId(spellName);
  if (id) SPELL_EFFECTS_BY_ID[id] = fx;
}

// Public export: supports lookup by BOTH spellId and legacy name
export const SPELL_EFFECTS = new Proxy(SPELL_EFFECTS_BY_ID, {
  get(target, prop) {
    if (prop in target) return target[prop];
    const id = spellNameToId(prop);
    if (id && id in target) return target[id];
    return undefined;
  },
  has(target, prop) {
    if (prop in target) return true;
    const id = spellNameToId(prop);
    return id ? id in target : false;
  },
});

// ── MANA BALANCE NOTES ──

export const MANA_BALANCE = {
  cheapSpellsCost: '1 mana — uzyteczne, ale ograniczone w sile',
  mediumSpellsCost: '2-3 many — podstawa regularnego uzycia magii',
  expensiveSpellsCost: '4-5 many — rzadkie, bardzo silne albo fabularnie wyjatkowe',
  manaGrowth: 'Mana rosnie wylacznie przez magiczne kamienie (rzadki zasob)',
};

// ── MANA CRYSTALS ──

export const CRYSTAL_ITEM_TYPE = 'manaCrystal';

export const MANA_CRYSTAL = {
  type: CRYSTAL_ITEM_TYPE,
  name: 'Kryształ Many',
  rarity: 'rare',
  description: 'Pulsujący rzadki kryształ. Po skonsumowaniu trwale zwiększa jeden atrybut o 1 albo maksymalną manę o 1 — do wyboru.',
};

export function isManaCrystal(item) {
  return item?.type === CRYSTAL_ITEM_TYPE;
}

// ── HELPER FUNCTIONS ──

/**
 * Get all spells from a specific tree.
 */
export function getSpellsFromTree(treeId) {
  const tree = SPELL_TREES[treeId];
  return tree ? tree.spells : [];
}

/**
 * Find a spell by ID or name across all trees.
 * Tries spellId first, then falls back to name match.
 * Returns { spell, treeId } or null.
 */
export function findSpell(spellIdOrName) {
  const byId = SPELL_BY_ID.get(spellIdOrName);
  if (byId) return byId;
  for (const [treeId, tree] of Object.entries(SPELL_TREES)) {
    const spell = tree.spells.find((s) => s.name === spellIdOrName);
    if (spell) return { spell, treeId };
  }
  return null;
}

/**
 * Find a spell strictly by its stable ID.
 * Returns { spell, treeId } or null.
 */
export function findSpellById(spellId) {
  return SPELL_BY_ID.get(spellId) || null;
}

/**
 * Get all starting spells (level 1) from all trees.
 */
export function getStartingSpells() {
  const spells = [];
  for (const [treeId, tree] of Object.entries(SPELL_TREES)) {
    const starter = tree.spells.find((s) => s.level === 1);
    if (starter) spells.push({ ...starter, treeId });
  }
  return spells;
}

/**
 * Check if a spell is unlocked based on character's usage counts.
 * @param {string} spellName
 * @param {Object} usageCounts - { spellName: numberOfUses }
 * @returns {boolean}
 */
export function isSpellUnlocked(spellIdOrName, usageCounts = {}) {
  const found = findSpell(spellIdOrName);
  if (!found) return false;
  const { spell } = found;

  if (!spell.unlockCondition) return true;

  // unlockCondition is now a spellId; usageCounts may be keyed by ID or
  // legacy name — check both for backward compat during migration.
  const prereqEntry = SPELL_BY_ID.get(spell.unlockCondition);
  const prereqName = prereqEntry?.spell?.name;
  const previousUses = usageCounts[spell.unlockCondition]
    || (prereqName ? usageCounts[prereqName] : 0)
    || 0;
  return previousUses >= spell.unlockUses;
}

/**
 * Get all spells available to a character based on known trees and usage counts.
 * @param {string[]} knownTrees - tree IDs the character has access to
 * @param {Object} usageCounts - { spellName: numberOfUses }
 */
export function getAvailableSpells(knownTrees = [], usageCounts = {}) {
  const available = [];
  for (const treeId of knownTrees) {
    const tree = SPELL_TREES[treeId];
    if (!tree) continue;
    for (const spell of tree.spells) {
      if (isSpellUnlocked(spell.id, usageCounts)) {
        available.push({ ...spell, treeId });
      }
    }
  }
  return available;
}

/**
 * Compute spell damage for a given inteligencja value.
 * Returns 0 for spells without a damage formula.
 */
export function computeSpellDamage(spellName, inteligencja) {
  const found = findSpell(spellName);
  const dmg = found?.spell?.combatStats?.damage;
  if (!dmg) return 0;
  return Math.max(1, Math.floor(inteligencja * dmg.intScale) + dmg.flat);
}

/**
 * Compute spell heal for a given inteligencja value.
 * Returns 0 for spells without a heal formula.
 */
export function computeSpellHeal(spellName, inteligencja) {
  const found = findSpell(spellName);
  const h = found?.spell?.combatStats?.heal;
  if (!h) return 0;
  return Math.max(1, Math.floor(inteligencja * h.intScale) + h.flat);
}

function _formatScale(scale) {
  if (scale === 1) return 'INT';
  if (scale === 0.5) return 'INT/2';
  if (scale === 0.25) return 'INT/4';
  if (scale === 0.33) return 'INT/3';
  if (scale === 0.75) return '3/4 INT';
  return `${scale}×INT`;
}

/**
 * Build a human-readable stat label for a spell's combat stats.
 * Includes DoT/HoT info from SPELL_EFFECTS when present.
 * Returns null for spells with no displayable stats.
 */
export function formatSpellDamageLabel(spell) {
  const cs = spell?.combatStats;
  if (!cs) return null;

  const fx = SPELL_EFFECTS[spell.id || spell.name];
  const dotInfo = fx?.effect?.mechanics?.dotDamage;
  const dotDuration = fx?.effect?.duration?.remaining;
  const hotInfo = fx?.effect?.mechanics?.dotHeal;
  const hotDuration = fx?.effect?.duration?.remaining;

  if (cs.type === 'offensive') {
    if (cs.damageComponents?.length) {
      const parts = cs.damageComponents.map((c) => {
        const typeName = _DAMAGE_TYPE_LABELS[c.type] || c.type;
        const formula = c.intScale ? _formatScale(c.intScale) : '';
        const flat = (c.flat || 0) > 0 ? (formula ? ` + ${c.flat}` : `${c.flat}`) : '';
        const dice = c.dice ? (formula || flat ? ` + ${c.dice}` : c.dice) : '';
        return `${typeName}: ${formula}${flat}${dice} obrz.`;
      });
      let label = parts.join(' | ');
      if (dotInfo) label += ` | DoT: ${dotInfo}/rd (${dotDuration} rd)`;
      return label;
    }
    if (cs.damage) {
      const base = _formatScale(cs.damage.intScale);
      const flat = cs.damage.flat > 0 ? ` + ${cs.damage.flat}` : '';
      let label = `${base}${flat} obrz.`;
      if (dotInfo) label += ` | DoT: ${dotInfo}/rd (${dotDuration} rd)`;
      return label;
    }
  }

  if (cs.type === 'heal') {
    if (cs.healComponents?.length) {
      const c = cs.healComponents[0];
      const formula = c.intScale ? _formatScale(c.intScale) : '';
      const flat = (c.flat || 0) > 0 ? (formula ? ` + ${c.flat}` : `${c.flat}`) : '';
      let label = `Leczy ${formula}${flat} HP`;
      if (hotInfo) label += ` | HoT: ${hotInfo}/rd (${hotDuration} rd)`;
      return label;
    }
    if (cs.heal) {
      const base = _formatScale(cs.heal.intScale);
      const flat = cs.heal.flat > 0 ? ` + ${cs.heal.flat}` : '';
      let label = `Leczy ${base}${flat} HP`;
      if (hotInfo) label += ` | HoT: ${hotInfo}/rd (${hotDuration} rd)`;
      return label;
    }
    if (hotInfo) return `HoT: ${hotInfo}/rd (${hotDuration} rd)`;
    return null;
  }

  if (cs.type === 'control' && fx) {
    return fx.effect.description;
  }

  if (cs.type === 'buff' && fx) {
    return fx.effect.description;
  }

  return null;
}

const _DAMAGE_TYPE_LABELS = {
  fizyczne: 'Fiz.',
  ogien: 'Ogień',
  lod: 'Lód',
  blyskawica: 'Błysk.',
  magiczne: 'Mag.',
  trucizna: 'Truc.',
  psychiczne: 'Psych.',
};

/**
 * Format magic info for AI prompts.
 */
export function formatMagicForPrompt(character) {
  if (!character?.spells) return 'Brak zdolnosci magicznych.';

  const { known = [], usageCounts = {}, scrolls = [] } = character.spells;
  const mana = character.mana || { current: 0, max: 0 };

  const lines = [`Mana: ${mana.current}/${mana.max}`];

  if (known.length === 0 && scrolls.length === 0) {
    lines.push('Brak znanych zakleç ani scrolli.');
    return lines.join('\n');
  }

  if (known.length > 0) {
    lines.push('Znane zaklecia:');
    for (const spellRef of known) {
      const found = findSpell(spellRef);
      if (found) {
        const uses = usageCounts[found.spell.id] || usageCounts[spellRef] || 0;
        lines.push(`  ${found.spell.name} [id: ${found.spell.id}] (${found.spell.manaCost} many, uzycia: ${uses}) — ${found.spell.description}`);
      }
    }
  }

  if (scrolls.length > 0) {
    const scrollDisplay = scrolls.map((s) => {
      const f = findSpell(s);
      return f ? `${f.spell.name} [id: ${f.spell.id}]` : s;
    }).join(', ');
    lines.push(`Scrolle: ${scrollDisplay}`);
  }

  return lines.join('\n');
}

