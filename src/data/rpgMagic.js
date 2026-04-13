// RPGon — Magic System Data
// Based on RPG_SYSTEM.md §7

// ── SCROLL MECHANICS ──

export const SCROLL_BASE_CHANCE = 0.25; // 25% base chance to learn a spell from a scroll

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
        level: 1,
        manaCost: 1,
        unlockCondition: null, // starting spell
        unlockUses: 0,
        description: 'Tworzy maly impuls ognia do zapalania, aktywacji prostych obiektow albo zadania lekkich obrazen',
      },
      {
        name: 'Ognisty Pocisk',
        level: 2,
        manaCost: 2,
        unlockCondition: 'Iskra',
        unlockUses: 10, // 2 * (5 * 1)
        description: 'Wystrzeliwuje skupiony pocisk ognia w jeden cel',
      },
      {
        name: 'Kula Ognia',
        level: 3,
        manaCost: 4,
        unlockCondition: 'Ognisty Pocisk',
        unlockUses: 10, // 5 * 2
        description: 'Tworzy wybuch ognia raniacy wielu przeciwnikow na obszarze',
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
        level: 1,
        manaCost: 3,
        unlockCondition: null,
        unlockUses: 0,
        description: 'Uderza pojedynczy cel silnym wyladowaniem',
      },
      {
        name: 'Lancuch Blyskawic',
        level: 2,
        manaCost: 5,
        unlockCondition: 'Piorun',
        unlockUses: 30, // 2 * (5 * 3)
        description: 'Wyladowanie przeskakuje miedzy kilkoma przeciwnikami',
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
        level: 1,
        manaCost: 3,
        unlockCondition: null,
        unlockUses: 0,
        description: 'Zmniejsza obrazenia fizyczne i magiczne otrzymywane przez jeden cel',
      },
      {
        name: 'Wielka Ochrona',
        level: 2,
        manaCost: 5,
        unlockCondition: 'Ochrona',
        unlockUses: 30,
        description: 'Znacznie silniejsza wersja zaklecia, dajaca wieksza redukcje obrazen albo dluzszy czas dzialania',
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
        level: 1,
        manaCost: 4,
        unlockCondition: null,
        unlockUses: 0,
        description: 'Ukrywa jedna postac przed wzrokiem innych na krotki czas',
      },
      {
        name: 'Grupowa Niewidzialnosc',
        level: 2,
        manaCost: 5,
        unlockCondition: 'Niewidzialnosc',
        unlockUses: 40,
        description: 'Ukrywa kilka bliskich sobie postaci jednoczesnie',
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
        level: 1,
        manaCost: 2,
        unlockCondition: null,
        unlockUses: 0,
        description: 'Zadaje obrazenia od zimna i lekko spowalnia cel',
      },
      {
        name: 'Lodowa Bariera',
        level: 2,
        manaCost: 3,
        unlockCondition: 'Lodowy Dotyk',
        unlockUses: 20,
        description: 'Tworzy osłone z lodu absorbujaça obrazenia albo blokujaça przejscie',
      },
      {
        name: 'Zamiec',
        level: 3,
        manaCost: 5,
        unlockCondition: 'Lodowa Bariera',
        unlockUses: 15,
        description: 'Atakuje obszar lodem i mrozem, spowalniajac wielu przeciwnikow',
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
        level: 1,
        manaCost: 2,
        unlockCondition: null,
        unlockUses: 0,
        description: 'Przywraca niewielka ilosc zdrowia jednej postaci',
      },
      {
        name: 'Regeneracja',
        level: 2,
        manaCost: 4,
        unlockCondition: 'Leczenie Ran',
        unlockUses: 20,
        description: 'Leczy mocniej i moze przywracac zdrowie przez kilka tur lub chwil',
      },
      {
        name: 'Wskrzeszenie Iskry Zycia',
        level: 3,
        manaCost: 5,
        unlockCondition: 'Regeneracja',
        unlockUses: 20,
        description: 'Ratuje swiezo powalona postac przed smiercia albo przywraca ja do stanu krytycznego',
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
        level: 1,
        manaCost: 3,
        unlockCondition: null,
        unlockUses: 0,
        description: 'Pozwala przesuwac przedmioty, manipulowac mechanizmami i lekko odpychac cele',
      },
      {
        name: 'Teleportacja',
        level: 2,
        manaCost: 5,
        unlockCondition: 'Telekineza',
        unlockUses: 30,
        description: 'Natychmiast przenosi postac na niewielka lub srednia odleglosc',
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
        level: 1,
        manaCost: 2,
        unlockCondition: null,
        unlockUses: 0,
        description: 'Wywoluje lek, utrudniajac przeciwnikowi dzialanie',
      },
      {
        name: 'Sen',
        level: 2,
        manaCost: 3,
        unlockCondition: 'Strach',
        unlockUses: 20,
        description: 'Usypia slabszy cel lub grupe drobnych przeciwnikow na krotki czas',
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
        level: 1,
        manaCost: 1,
        unlockCondition: null,
        unlockUses: 0,
        description: 'Pozwala wyczuc aktywna magie, artefakty i zaklocenia magiczne w poblizu',
      },
      {
        name: 'Tarcza Wiatru',
        level: 2,
        manaCost: 2,
        unlockCondition: 'Wykrycie Magii',
        unlockUses: 10,
        description: 'Tworzy wir ochronny utrudniajacy trafienie atakami dystansowymi',
      },
      {
        name: 'Rozproszenie Magii',
        level: 3,
        manaCost: 4,
        unlockCondition: 'Tarcza Wiatru',
        unlockUses: 10,
        description: 'Probuje zdjac aktywny efekt magiczny albo oslabic zaklecie przeciwnika',
      },
    ],
  },
};

export const SPELL_TREE_LIST = Object.keys(SPELL_TREES);

// ── MANA BALANCE NOTES ──

export const MANA_BALANCE = {
  cheapSpellsCost: '1 mana — uzyteczne, ale ograniczone w sile',
  mediumSpellsCost: '2-3 many — podstawa regularnego uzycia magii',
  expensiveSpellsCost: '4-5 many — rzadkie, bardzo silne albo fabularnie wyjatkowe',
  manaGrowth: 'Mana rosnie wylacznie przez magiczne kamienie (rzadki zasob)',
};

// ── HELPER FUNCTIONS ──

/**
 * Get all spells from a specific tree.
 */
export function getSpellsFromTree(treeId) {
  const tree = SPELL_TREES[treeId];
  return tree ? tree.spells : [];
}

/**
 * Find a spell by name across all trees.
 * Returns { spell, treeId } or null.
 */
export function findSpell(spellName) {
  for (const [treeId, tree] of Object.entries(SPELL_TREES)) {
    const spell = tree.spells.find((s) => s.name === spellName);
    if (spell) return { spell, treeId };
  }
  return null;
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
export function isSpellUnlocked(spellName, usageCounts = {}) {
  const found = findSpell(spellName);
  if (!found) return false;
  const { spell } = found;

  // Level 1 spells are always available once the tree is known
  if (!spell.unlockCondition) return true;

  const previousUses = usageCounts[spell.unlockCondition] || 0;
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
      if (isSpellUnlocked(spell.name, usageCounts)) {
        available.push({ ...spell, treeId });
      }
    }
  }
  return available;
}

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
    for (const spellName of known) {
      const found = findSpell(spellName);
      if (found) {
        const uses = usageCounts[spellName] || 0;
        lines.push(`  ${spellName} (${found.spell.manaCost} many, uzycia: ${uses}) — ${found.spell.description}`);
      }
    }
  }

  if (scrolls.length > 0) {
    lines.push(`Scrolle: ${scrolls.join(', ')}`);
  }

  return lines.join('\n');
}

