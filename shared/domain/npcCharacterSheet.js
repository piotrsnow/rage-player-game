/**
 * NPC Character Sheet — deterministic baseline generator (shared FE + BE).
 *
 * Output shape matches combat / bestiary consumption:
 *   { race, creatureKind, level, attributes, wounds, maxWounds, mana,
 *     skills, weapons, armourDR, traits, archetype }
 */

import { NPC_RACES, RACE_MODIFIERS } from './npcRaces.js';

/** Six RPG attributes + luck — used for structural completeness checks. */
export const NPC_SHEET_ATTRIBUTE_KEYS = [
  'sila', 'inteligencja', 'charyzma', 'zrecznosc', 'wytrzymalosc', 'szczescie',
];

/**
 * True when the sheet JSON is missing or lacks a usable `attributes` block
 * (fixes partial `{}` / `{ traits: [] }` rows that blocked DB backfill).
 */
export function npcStatsNeedsBaseline(stats) {
  if (!stats || typeof stats !== 'object') return true;
  const a = stats.attributes;
  if (!a || typeof a !== 'object') return true;
  for (const k of NPC_SHEET_ATTRIBUTE_KEYS) {
    const v = a[k];
    if (typeof v !== 'number' || !Number.isFinite(v)) return true;
  }
  return false;
}

// When an archetype defines no mechanical traits, pick one deterministically
// so the player UI always has a “traits” line for ordinary NPCs.
const FLAVOR_TRAITS_FOR_EMPTY_ARCHETYPE = [
  'Pracowity',
  'Ostrożny',
  'Towarzyski',
  'Mrukliwy',
  'Ciekawski',
  'Cierpliwy',
  'Nerwowy',
  'Dumny',
  'Uprzejmy',
  'Złośliwy',
  'Zamyślony',
  'Żwawy',
];

// ── Role archetypes ──

const ARCHETYPES = [
  {
    id: 'mage',
    keywords: ['mag', 'czarodziej', 'wiedźma', 'wiedzma', 'czarnoksiężnik', 'czarnoksieznik', 'kapłanka magii', 'arcymag', 'alchemik'],
    primaryAttrs: ['inteligencja', 'charyzma'],
    skills: { 'Wiedza ogolna': 4, 'Alchemia': 3, 'Walka wrecz': 1 },
    weapons: ['Laska'],
    armourDR: 0,
    woundsBase: 8,
    manaBase: 10,
    traits: ['Czarujący'],
  },
  {
    id: 'priest',
    keywords: ['kapłan', 'kaplan', 'duchowny', 'zakonnik', 'mnich', 'święty', 'swiety'],
    primaryAttrs: ['charyzma', 'inteligencja'],
    skills: { 'Perswazja': 4, 'Medycyna': 3, 'Wiedza ogolna': 3, 'Walka bronia jednoręczna': 2 },
    weapons: ['Maczuga'],
    armourDR: 1,
    woundsBase: 10,
    manaBase: 4,
    traits: [],
  },
  {
    id: 'guard',
    keywords: ['strażnik', 'straznik', 'żołnierz', 'zolnierz', 'gwardzista', 'kapitan straży', 'kapitan strazy', 'rycerz', 'paladyn'],
    primaryAttrs: ['sila', 'wytrzymalosc'],
    skills: { 'Walka bronia jednoręczna': 5, 'Uniki': 3, 'Zastraszanie': 2, 'Spostrzegawczosc': 2 },
    weapons: ['Miecz jednoręczny'],
    armourDR: 3,
    woundsBase: 14,
    manaBase: 0,
    traits: ['Wyszkolony'],
  },
  {
    id: 'bandit',
    keywords: ['bandyta', 'zbój', 'zboj', 'rabuś', 'rabus', 'złodziej', 'zlodziej', 'przemytnik', 'najemnik'],
    primaryAttrs: ['zrecznosc', 'sila'],
    skills: { 'Walka bronia jednoręczna': 4, 'Skradanie': 3, 'Zastraszanie': 2, 'Uniki': 2 },
    weapons: ['Sztylet', 'Miecz jednoręczny'],
    armourDR: 1,
    woundsBase: 11,
    manaBase: 0,
    traits: [],
  },
  {
    id: 'scout',
    keywords: ['zwiadowca', 'łowca', 'lowca', 'tropiciel', 'myśliwy', 'mysliwy', 'łucznik', 'lucznik', 'strzelec'],
    primaryAttrs: ['zrecznosc', 'wytrzymalosc'],
    skills: { 'Strzelectwo': 5, 'Skradanie': 3, 'Tropienie': 3, 'Spostrzegawczosc': 3 },
    weapons: ['Łuk'],
    armourDR: 1,
    woundsBase: 10,
    manaBase: 0,
    traits: ['Szybki'],
  },
  {
    id: 'noble',
    keywords: ['szlachcic', 'baron', 'hrabia', 'książę', 'ksiaze', 'lord', 'królowa', 'krolowa', 'król', 'krol', 'dworzanin'],
    primaryAttrs: ['charyzma', 'inteligencja'],
    skills: { 'Perswazja': 5, 'Przywodztwo': 4, 'Wiedza ogolna': 3, 'Walka bronia jednoręczna': 2 },
    weapons: ['Miecz jednoręczny'],
    armourDR: 1,
    woundsBase: 9,
    manaBase: 0,
    traits: [],
  },
  {
    id: 'merchant',
    keywords: ['kupiec', 'handlarz', 'sklepikarz', 'karczmarz', 'barman', 'bankier', 'rzemieślnik', 'rzemieslnik'],
    primaryAttrs: ['charyzma', 'inteligencja'],
    skills: { 'Handel': 5, 'Perswazja': 3, 'Blef': 2, 'Spostrzegawczosc': 2 },
    weapons: ['Sztylet'],
    armourDR: 0,
    woundsBase: 8,
    manaBase: 0,
    traits: [],
  },
  {
    id: 'child',
    keywords: ['dziecko', 'chłopiec', 'chlopiec', 'dziewczynka', 'niemowlę', 'niemowle'],
    primaryAttrs: ['zrecznosc'],
    skills: { 'Skradanie': 2, 'Uniki': 2 },
    weapons: [],
    armourDR: 0,
    woundsBase: 3,
    manaBase: 0,
    traits: ['Kruchy'],
  },
  {
    id: 'elder',
    keywords: ['starzec', 'starucha', 'babcia', 'dziadek', 'mędrzec', 'medrzec'],
    primaryAttrs: ['inteligencja', 'charyzma'],
    skills: { 'Wiedza ogolna': 5, 'Medycyna': 2, 'Perswazja': 2 },
    weapons: ['Laska'],
    armourDR: 0,
    woundsBase: 6,
    manaBase: 0,
    traits: ['Kruchy'],
  },
  {
    id: 'creature',
    keywords: ['potwór', 'potwor', 'bestia', 'demon', 'zjawa', 'duch', 'upiór', 'upior', 'sfinks', 'smok', 'trol', 'troll', 'ogr', 'ghul', 'wilkołak', 'wilkolak'],
    primaryAttrs: ['sila', 'wytrzymalosc'],
    skills: { 'Walka wrecz': 5, 'Zastraszanie': 4, 'Uniki': 2 },
    weapons: ['Pazury i kły'],
    armourDR: 2,
    woundsBase: 18,
    manaBase: 0,
    traits: ['Potwór'],
  },
  {
    id: 'commoner',
    keywords: [],
    primaryAttrs: ['wytrzymalosc'],
    skills: { 'Rzemioslo': 3, 'Walka wrecz': 1, 'Spostrzegawczosc': 1 },
    weapons: ['Pałka'],
    armourDR: 0,
    woundsBase: 8,
    manaBase: 0,
    traits: [],
  },
];

const CATEGORY_LEVEL_BASE = {
  commoner: 2,
  merchant: 3,
  priest: 4,
  guard: 4,
  adventurer: 5,
  noble: 5,
  boss: 10,
};

function hashString(input) {
  let h = 2166136261 >>> 0;
  const str = String(input || '');
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

function pickArchetype(role, category, personality) {
  const hay = `${role || ''} ${category || ''} ${personality || ''}`.toLowerCase();
  for (const arch of ARCHETYPES) {
    if (arch.keywords.some((k) => hay.includes(k))) return arch;
  }
  if (category === 'guard') return ARCHETYPES.find((a) => a.id === 'guard');
  if (category === 'merchant') return ARCHETYPES.find((a) => a.id === 'merchant');
  if (category === 'priest') return ARCHETYPES.find((a) => a.id === 'priest');
  if (category === 'adventurer') return ARCHETYPES.find((a) => a.id === 'bandit');
  return ARCHETYPES.find((a) => a.id === 'commoner');
}

function resolveLevel({ level, category, keyNpc }) {
  if (typeof level === 'number' && level >= 1 && level <= 30) return Math.floor(level);
  const base = CATEGORY_LEVEL_BASE[category] ?? 2;
  const bump = keyNpc ? 2 : 0;
  return base + bump;
}

function baseAttributes(race, creatureKind, rand) {
  const isCreature = !race && !!creatureKind;
  const base = isCreature ? 3 : 2;
  const attrs = {
    sila: base,
    inteligencja: base,
    charyzma: base,
    zrecznosc: base,
    wytrzymalosc: base,
    szczescie: 0,
  };
  const mods = race ? (RACE_MODIFIERS[race] || {}) : {};
  for (const key of Object.keys(attrs)) {
    attrs[key] += mods[key] || 0;
    attrs[key] += Math.floor(rand() * 3) - 1;
    if (attrs[key] < 1) attrs[key] = 1;
    if (attrs[key] > 25) attrs[key] = 25;
  }
  return attrs;
}

function scaleByLevel(attrs, archetype, level) {
  const bonusPoints = Math.max(0, Math.floor((level - 1) * 1.5));
  const primaries = archetype.primaryAttrs.length > 0 ? archetype.primaryAttrs : ['wytrzymalosc'];
  for (let i = 0; i < bonusPoints; i += 1) {
    const key = primaries[i % primaries.length];
    if (attrs[key] < 25) attrs[key] += 1;
  }
  return attrs;
}

function scaleSkills(archetype, level) {
  const bonus = Math.floor((level - 1) / 2);
  const out = {};
  for (const [name, lvl] of Object.entries(archetype.skills)) {
    out[name] = Math.min(25, lvl + bonus);
  }
  return out;
}

function calcMaxWounds(attrs, woundsBase, level) {
  return woundsBase + attrs.wytrzymalosc * 2 + Math.floor(level / 2);
}

function calcMana(attrs, manaBase, level) {
  if (manaBase <= 0) return { current: 0, max: 0 };
  const max = manaBase + Math.floor(attrs.inteligencja / 2) + Math.floor(level / 2);
  return { current: max, max };
}

function resolveTraits(archetype, name) {
  const base = [...archetype.traits];
  if (base.length > 0) return base;
  const h = hashString(`${name || 'anon'}|${archetype.id}|flavor_trait`);
  const pick = FLAVOR_TRAITS_FOR_EMPTY_ARCHETYPE[h % FLAVOR_TRAITS_FOR_EMPTY_ARCHETYPE.length];
  return [pick];
}

export function generateNpcSheet({
  name,
  race = null,
  creatureKind = null,
  role = '',
  category = 'commoner',
  personality = '',
  level = null,
  keyNpc = false,
} = {}) {
  const seed = hashString(`${name || 'anon'}|${race || ''}|${creatureKind || ''}|${role || ''}`);
  const rand = seededRandom(seed);
  const archetype = pickArchetype(role, category, personality);
  const resolvedLevel = resolveLevel({ level, category, keyNpc });

  const attrs = baseAttributes(race, creatureKind, rand);
  scaleByLevel(attrs, archetype, resolvedLevel);

  const skills = scaleSkills(archetype, resolvedLevel);
  const maxWounds = calcMaxWounds(attrs, archetype.woundsBase, resolvedLevel);
  const mana = calcMana(attrs, archetype.manaBase, resolvedLevel);
  const traits = resolveTraits(archetype, name);

  return {
    race: race && NPC_RACES.includes(race) ? race : null,
    creatureKind: creatureKind || null,
    level: resolvedLevel,
    attributes: attrs,
    wounds: maxWounds,
    maxWounds,
    mana,
    skills,
    weapons: [...archetype.weapons],
    armourDR: archetype.armourDR,
    traits,
    archetype: archetype.id,
  };
}

export function mergeSheetOverride(existing, override) {
  if (!existing || typeof existing !== 'object') return existing;
  if (!override || typeof override !== 'object') return existing;
  const out = { ...existing };

  if (override.attributes && typeof override.attributes === 'object') {
    const attrs = { ...(existing.attributes || {}) };
    for (const key of Object.keys(attrs)) {
      const v = override.attributes[key];
      if (typeof v === 'number' && Number.isFinite(v)) {
        attrs[key] = Math.max(1, Math.min(25, Math.floor(v)));
      }
    }
    out.attributes = attrs;
  }

  if (override.skills && typeof override.skills === 'object') {
    const skills = { ...(existing.skills || {}) };
    for (const [name, v] of Object.entries(override.skills)) {
      if (typeof v === 'number' && Number.isFinite(v)) {
        skills[name] = Math.max(0, Math.min(25, Math.floor(v)));
      }
    }
    out.skills = skills;
  }

  if (Array.isArray(override.weapons)) {
    out.weapons = override.weapons.filter((w) => typeof w === 'string' && w.trim()).slice(0, 4);
  }
  if (Array.isArray(override.traits)) {
    out.traits = override.traits.filter((t) => typeof t === 'string' && t.trim()).slice(0, 8);
  }
  if (typeof override.armourDR === 'number' && Number.isFinite(override.armourDR)) {
    out.armourDR = Math.max(0, Math.min(10, Math.floor(override.armourDR)));
  }
  if (typeof override.maxWounds === 'number' && override.maxWounds > 0) {
    out.maxWounds = Math.floor(override.maxWounds);
    if (!Number.isFinite(out.wounds) || out.wounds > out.maxWounds) out.wounds = out.maxWounds;
  }
  if (override.mana && typeof override.mana === 'object') {
    const max = typeof override.mana.max === 'number' ? Math.max(0, Math.floor(override.mana.max)) : existing.mana?.max ?? 0;
    const current = typeof override.mana.current === 'number' ? Math.max(0, Math.floor(override.mana.current)) : max;
    out.mana = { current: Math.min(current, max), max };
  }

  return out;
}

export { NPC_RACES };
