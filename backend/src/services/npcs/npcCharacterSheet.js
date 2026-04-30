/**
 * NPC Character Sheet — deterministic baseline generator for neutral heroes,
 * creatures, and every NPC that needs a stat block.
 *
 * Output shape mirrors the combatant / bestiary shape the FE combat engine
 * consumes (see src/services/combatEngine.js createCombatantFromCharacter and
 * src/hooks/sceneGeneration/applySceneStateChanges.js fillBestiaryStats):
 *   {
 *     race, creatureKind, level,
 *     attributes: { sila, inteligencja, charyzma, zrecznosc, wytrzymalosc, szczescie },
 *     wounds, maxWounds,
 *     mana: { current, max },
 *     skills: { [skillName]: level },
 *     weapons: string[],
 *     armourDR: number,
 *     traits: string[],
 *   }
 *
 * The module is pure — no Prisma, no I/O. Generation is name-seeded for
 * stability so regenerating the same NPC produces the same sheet.
 */

import { NPC_RACES, RACE_MODIFIERS } from '../../../../shared/domain/npcRaces.js';

// ── Role archetypes ──
//
// Keyword-match order matters — the first matching entry wins. Keywords
// are lowercased substrings of the NPC role / category / personality.
// Each archetype defines a build profile that gets scaled by `level`.

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
  // Fallback — commoner / villager / unknown role.
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

// ── Category → base level mapping ──
//
// CampaignNPC.category values: commoner | guard | merchant | priest | adventurer.
// `keyNpc` / category "boss" bumps the level. Tuned so ordinary NPCs sit at
// level 2-3, notable named figures 5-8, and bosses 10+.

const CATEGORY_LEVEL_BASE = {
  commoner: 2,
  merchant: 3,
  priest: 4,
  guard: 4,
  adventurer: 5,
  noble: 5,
  boss: 10,
};

// ── Helpers ──

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
  // Category fallbacks before generic commoner.
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
  // Start every attribute at 2 (average villager) and apply race mods.
  // Creatures (creatureKind set, no race) get a sturdier 3-base.
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
    // Tiny ±1 jitter so two dwarves aren't identical.
    attrs[key] += Math.floor(rand() * 3) - 1;
    if (attrs[key] < 1) attrs[key] = 1;
    if (attrs[key] > 25) attrs[key] = 25;
  }
  return attrs;
}

function scaleByLevel(attrs, archetype, level) {
  // Level adds points biased toward the archetype's primary attributes.
  // Every 2 levels above 1 = +1 to a primary attr (round-robin).
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

// ── Public API ──

/**
 * Deterministically generate a full NPC stat sheet.
 *
 * @param {object} opts
 * @param {string} opts.name — used as deterministic seed
 * @param {string|null} [opts.race] — one of NPC_RACES, or null for creatures
 * @param {string|null} [opts.creatureKind] — free-text tag when race is null
 * @param {string} [opts.role]
 * @param {string} [opts.category]
 * @param {string} [opts.personality]
 * @param {number} [opts.level] — 1-30, derived from category if absent
 * @param {boolean} [opts.keyNpc]
 */
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
    traits: [...archetype.traits],
    archetype: archetype.id,
  };
}

/**
 * Merge an AI-emitted partial override onto an existing sheet.
 *
 * Accepts `attributes`, `skills`, `weapons`, `traits`, `armourDR`, `level`,
 * `maxWounds`, `mana`. Unknown attribute keys are ignored. Values are
 * clamped to sane ranges.
 */
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
