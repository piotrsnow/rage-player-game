import { hasNamedSpeaker } from '../../shared/domain/dialogueSpeaker.js';

const RECENT_SCENE_WINDOW = 3;
export const MIN_DISPOSITION_TO_RECRUIT = 10;

/** Extract distinct named NPC speaker names from a single scene's dialogue. */
function getNpcNamesInScene(scene) {
  const names = new Set();
  const segs = scene?.dialogueSegments;
  if (!Array.isArray(segs)) return [];
  for (const seg of segs) {
    const raw = seg?.character || seg?.speaker;
    if (typeof raw !== 'string') continue;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (!hasNamedSpeaker(trimmed)) continue;
    names.add(trimmed);
  }
  return [...names];
}

/**
 * Returns NPC objects (from `world.npcs`) eligible to be recruited:
 *  - appeared as a named speaker in any of the last 3 scenes
 *  - alive
 *  - disposition >= 10
 *  - not already in party (by recruitedFromNpcId or matching id)
 *  - not under post-rejection cooldown
 */
export function getRecentNpcsForRecruitment(scenes, world, party) {
  const sceneList = Array.isArray(scenes) ? scenes : [];
  const npcList = world?.npcs;
  if (!Array.isArray(npcList) || npcList.length === 0) return [];

  const partyList = Array.isArray(party) ? party : [];
  const partyNpcIds = new Set(
    partyList.map((m) => m?.recruitedFromNpcId || m?.id).filter(Boolean),
  );

  const recent = sceneList.slice(-RECENT_SCENE_WINDOW);
  const recentNames = new Set();
  for (const scene of recent) {
    for (const name of getNpcNamesInScene(scene)) {
      recentNames.add(name.toLowerCase());
    }
  }
  if (recentNames.size === 0) return [];

  const currentSceneIndex = sceneList.length;
  const result = [];
  const seen = new Set();
  for (const npc of npcList) {
    if (!npc?.name) continue;
    const key = npc.name.toLowerCase();
    if (seen.has(key)) continue;
    if (!recentNames.has(key)) continue;
    if (npc.alive === false) continue;
    if (npc.inParty) continue;
    if (partyNpcIds.has(npc.id)) continue;
    if ((npc.disposition || 0) < MIN_DISPOSITION_TO_RECRUIT) continue;
    if (
      typeof npc.recruitCooldownUntilSceneIndex === 'number' &&
      currentSceneIndex < npc.recruitCooldownUntilSceneIndex
    ) {
      continue;
    }
    seen.add(key);
    result.push(npc);
  }
  return result;
}

/** chance% = clamp(30 + disposition × 1.4, 5, 100). */
export function calculateRecruitChance(disposition) {
  const d = typeof disposition === 'number' ? disposition : 0;
  const raw = 30 + d * 1.4;
  return Math.max(5, Math.min(100, Math.round(raw)));
}

/** Inclusive 1-100 roll. */
export function rollD100() {
  return Math.floor(Math.random() * 100) + 1;
}

const DEFAULT_ATTRIBUTES = {
  sila: 10,
  inteligencja: 10,
  charyzma: 10,
  zrecznosc: 10,
  wytrzymalosc: 10,
  szczescie: 5,
};

const DEFAULT_SKILLS = {
  'Walka bronia jednoręczna': { level: 5, progress: 0, cap: 10 },
  'Atletyka': { level: 3, progress: 0, cap: 10 },
};

function attributesFromStats(stats) {
  const a = stats?.attributes;
  if (!a || typeof a !== 'object') return { ...DEFAULT_ATTRIBUTES };
  return {
    sila: typeof a.sila === 'number' ? a.sila : DEFAULT_ATTRIBUTES.sila,
    inteligencja: typeof a.inteligencja === 'number' ? a.inteligencja : DEFAULT_ATTRIBUTES.inteligencja,
    charyzma: typeof a.charyzma === 'number' ? a.charyzma : DEFAULT_ATTRIBUTES.charyzma,
    zrecznosc: typeof a.zrecznosc === 'number' ? a.zrecznosc : DEFAULT_ATTRIBUTES.zrecznosc,
    wytrzymalosc: typeof a.wytrzymalosc === 'number' ? a.wytrzymalosc : DEFAULT_ATTRIBUTES.wytrzymalosc,
    szczescie: typeof a.szczescie === 'number' ? a.szczescie : DEFAULT_ATTRIBUTES.szczescie,
  };
}

function skillsFromStats(stats) {
  const s = stats?.skills;
  if (!s || typeof s !== 'object') return { ...DEFAULT_SKILLS };
  const out = {};
  for (const [name, value] of Object.entries(s)) {
    const lvl = typeof value === 'number' ? value : (typeof value?.level === 'number' ? value.level : 0);
    if (lvl > 0) out[name] = { level: lvl, progress: 0, cap: Math.max(10, lvl) };
  }
  return Object.keys(out).length > 0 ? out : { ...DEFAULT_SKILLS };
}

function inventoryFromWeapons(weapons) {
  if (!Array.isArray(weapons) || weapons.length === 0) return [];
  return weapons.map((w, i) => ({
    name: typeof w === 'string' ? w : (w?.name || `Weapon ${i + 1}`),
    quantity: 1,
    equipped: i === 0,
  }));
}

/**
 * Convert an NPC into a companion party member. The id is reused so dismiss/recruit
 * round-trips line up; recruitedFromNpcId is the canonical pointer back.
 */
export function npcToCompanion(npc) {
  const stats = npc?.stats && typeof npc.stats === 'object' ? npc.stats : null;
  const attrs = attributesFromStats(stats);
  const maxWounds = typeof stats?.maxWounds === 'number' ? stats.maxWounds : 10;
  const wounds = typeof stats?.wounds === 'number' ? stats.wounds : maxWounds;
  const mana = stats?.mana && typeof stats.mana === 'object'
    ? { current: stats.mana.current ?? stats.mana.max ?? 0, max: stats.mana.max ?? 0 }
    : { current: 0, max: 0 };

  return {
    id: npc.id,
    type: 'companion',
    recruitedFromNpcId: npc.id,
    name: npc.name,
    species: npc.race || npc.creatureKind || 'Human',
    characterLevel: typeof stats?.level === 'number' ? stats.level : (npc.level ?? 1),
    characterXp: 0,
    attributePoints: 0,
    attributes: attrs,
    wounds,
    maxWounds,
    movement: 4,
    mana,
    skills: skillsFromStats(stats),
    spells: { known: [], usageCounts: {}, scrolls: [] },
    inventory: inventoryFromWeapons(stats?.weapons),
    statuses: [],
    backstory: npc.personality || '',
    companionBehavior: 'defensive',
    combatStance: 'attack',
  };
}
