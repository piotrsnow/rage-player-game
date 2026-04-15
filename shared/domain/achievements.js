/**
 * Achievement definitions for RPGon.
 *
 * Achievement may optionally grant a title (`grantsTitle: { id, label, rarity }`).
 * When unlocked, the title is added to `character.titles` and AI prompts can
 * surface the top-N rarest titles for use in narration.
 *
 * Callers may maintain optional gameState.achievementStats for counters, e.g.:
 *   combatWins, enemiesDefeated, hagglesSucceeded, spellsCast,
 *   spellsByLore: { [loreName]: count }, visitedLocationIds: string[],
 *   itemsForged, potionsBrewed, dragonsKilled
 *
 * Events passed to checkAchievementCondition should use string `type` and a `payload` object.
 */

export const ACHIEVEMENTS = {
  // --- Milestone ---
  first_campaign: {
    name: 'Pierwsze kroki',
    description: 'Rozpocząłeś pierwszą kampanię.',
    icon: 'flag',
    category: 'milestone',
    condition: { type: 'campaign_active' },
    rarity: 'common',
    xpReward: 10,
  },
  first_scene: {
    name: 'Pierwsza scena',
    description: 'Ukończyłeś pierwszą scenę narracyjną.',
    icon: 'footprint',
    category: 'milestone',
    condition: { type: 'scene_count', min: 1 },
    rarity: 'common',
    xpReward: 15,
  },
  scenes_10: {
    name: 'Wytrwały podróżnik',
    description: 'Przetrwałeś 10 scen.',
    icon: 'history',
    category: 'milestone',
    condition: { type: 'scene_count', min: 10 },
    rarity: 'common',
    xpReward: 25,
  },
  scenes_50: {
    name: 'Doświadczony bohater',
    description: 'Przetrwałeś 50 scen.',
    icon: 'route',
    category: 'milestone',
    condition: { type: 'scene_count', min: 50 },
    rarity: 'uncommon',
    xpReward: 50,
    grantsTitle: { id: 'wedrowiec', label: 'Wędrowiec', rarity: 'uncommon' },
  },
  scenes_100: {
    name: 'Legenda',
    description: 'Przetrwałeś 100 scen.',
    icon: 'emoji_events',
    category: 'milestone',
    condition: { type: 'scene_count', min: 100 },
    rarity: 'rare',
    xpReward: 100,
    grantsTitle: { id: 'legenda', label: 'Legenda', rarity: 'rare' },
  },
  first_death: {
    name: 'Otarcie się o śmierć',
    description: 'Twoja postać spadła do zera ran.',
    icon: 'skull',
    category: 'milestone',
    condition: { type: 'wounds_depleted' },
    rarity: 'uncommon',
  },

  // --- Combat ---
  first_combat_win: {
    name: 'Krew na ostrzu',
    description: 'Wygrałeś pierwszą walkę.',
    icon: 'swords',
    category: 'combat',
    condition: { type: 'combat_wins', min: 1 },
    rarity: 'common',
    xpReward: 20,
  },
  critical_hit: {
    name: 'Mistrzowski cios',
    description: 'Zadałeś krytyczne trafienie w walce.',
    icon: 'crisis_alert',
    category: 'combat',
    condition: { type: 'event', eventType: 'critical_hit' },
    rarity: 'common',
    xpReward: 15,
  },
  defeated_10_enemies: {
    name: 'Żniwiarz',
    description: 'Pokonałeś 10 wrogów w walce.',
    icon: 'swords',
    category: 'combat',
    condition: { type: 'enemies_defeated', min: 10 },
    rarity: 'uncommon',
    xpReward: 40,
  },
  defeated_50_enemies: {
    name: 'Weteran wielu bitew',
    description: 'Pokonałeś 50 wrogów w walce.',
    icon: 'shield',
    category: 'combat',
    condition: { type: 'enemies_defeated', min: 50 },
    rarity: 'rare',
    xpReward: 75,
    grantsTitle: { id: 'weteran', label: 'Weteran', rarity: 'rare' },
  },
  flawless_victory: {
    name: 'Bez zadrapania',
    description: 'Wygrałeś walkę bez otrzymania obrażeń.',
    icon: 'shield_person',
    category: 'combat',
    condition: { type: 'combat_victory_flawless' },
    rarity: 'rare',
    xpReward: 50,
  },
  killed_dragon: {
    name: 'Smokobójca',
    description: 'Pokonałeś smoka w walce.',
    icon: 'pets',
    category: 'combat',
    condition: { type: 'event', eventType: 'dragon_killed' },
    rarity: 'legendary',
    xpReward: 200,
    grantsTitle: { id: 'smokobojca', label: 'Smokobójca', rarity: 'legendary' },
  },

  // --- Exploration ---
  visited_5_locations: {
    name: 'Włóczęga',
    description: 'Odwiedziłeś 5 różnych lokacji.',
    icon: 'map',
    category: 'exploration',
    condition: { type: 'unique_locations_visited', min: 5 },
    rarity: 'common',
    xpReward: 20,
  },
  visited_15_locations: {
    name: 'Kartograf',
    description: 'Odwiedziłeś 15 różnych lokacji.',
    icon: 'explore',
    category: 'exploration',
    condition: { type: 'unique_locations_visited', min: 15 },
    rarity: 'uncommon',
    xpReward: 35,
    grantsTitle: { id: 'kartograf', label: 'Kartograf', rarity: 'uncommon' },
  },
  discovered_secret: {
    name: 'Ukryta prawda',
    description: 'Odkryłeś sekret lub ukryte miejsce.',
    icon: 'visibility_off',
    category: 'exploration',
    condition: { type: 'event', eventType: 'secret_discovered' },
    rarity: 'rare',
    xpReward: 40,
  },

  // --- Social ---
  befriended_npc: {
    name: 'Bliska więź',
    description: 'Nastawienie BN-a wzrosło powyżej 20.',
    icon: 'diversity_3',
    category: 'social',
    condition: { type: 'npc_disposition', op: 'gt', value: 20 },
    rarity: 'common',
    xpReward: 20,
  },
  made_enemy: {
    name: 'Wróg na zawsze',
    description: 'Nastawienie BN-a spadło poniżej -20.',
    icon: 'sentiment_very_dissatisfied',
    category: 'social',
    condition: { type: 'npc_disposition', op: 'lt', value: -20 },
    rarity: 'common',
  },
  joined_faction: {
    name: 'Pod sztandarem',
    description: 'Zdobyłeś ponad 50 reputacji u frakcji.',
    icon: 'flag_circle',
    category: 'social',
    condition: { type: 'faction_reputation', min: 51 },
    rarity: 'uncommon',
    xpReward: 35,
  },
  haggle_master: {
    name: 'Mistrz targowania',
    description: 'Wygrałeś pięć testów targowania.',
    icon: 'payments',
    category: 'social',
    condition: { type: 'haggles_succeeded', min: 5 },
    rarity: 'uncommon',
    xpReward: 30,
    grantsTitle: { id: 'kupiec', label: 'Kupiec', rarity: 'uncommon' },
  },

  // --- Survival ---
  survived_low_health: {
    name: 'O włos',
    description: 'Przetrwałeś scenę z 2 lub mniej ranami.',
    icon: 'favorite',
    category: 'survival',
    condition: { type: 'wounds_lte', max: 2 },
    rarity: 'uncommon',
    xpReward: 25,
  },
  all_needs_critical: {
    name: 'Na dnie',
    description: 'Wszystkie potrzeby spadły jednocześnie do poziomu krytycznego.',
    icon: 'warning',
    category: 'survival',
    condition: { type: 'all_needs_lte', threshold: 14 },
    rarity: 'rare',
    xpReward: 20,
  },
  night_survived: {
    name: 'Przebudzenie',
    description: 'Odzyskałeś siły z krytycznego poziomu po niebezpiecznej nocy.',
    icon: 'nights_stay',
    category: 'survival',
    condition: { type: 'event', eventType: 'rest_recovered_from_critical' },
    rarity: 'uncommon',
    xpReward: 25,
  },

  // --- Mistrzostwo (skills, magia, rzemiosło) ---
  master_combat_skill: {
    name: 'Mistrz miecza',
    description: 'Osiągnąłeś poziom mistrzowski (16+) w walce bronią.',
    icon: 'military_tech',
    category: 'mastery',
    condition: { type: 'skill_at_level', skills: ['Walka bronią jednoręczną', 'Walka bronią dwuręczną'], min: 16 },
    rarity: 'rare',
    xpReward: 60,
    grantsTitle: { id: 'mistrz_miecza', label: 'Mistrz Miecza', rarity: 'rare' },
  },
  master_stealth: {
    name: 'Cień',
    description: 'Osiągnąłeś poziom mistrzowski (16+) w skradaniu.',
    icon: 'visibility_off',
    category: 'mastery',
    condition: { type: 'skill_at_level', skills: ['Skradanie się'], min: 16 },
    rarity: 'rare',
    xpReward: 60,
    grantsTitle: { id: 'cien', label: 'Cień', rarity: 'rare' },
  },
  forged_50_items: {
    name: 'Kowal',
    description: 'Wykułeś 50 przedmiotów.',
    icon: 'construction',
    category: 'mastery',
    condition: { type: 'event', eventType: 'item_forged_count', min: 50 },
    rarity: 'rare',
    xpReward: 60,
    grantsTitle: { id: 'kowal', label: 'Kowal', rarity: 'rare' },
  },
  brewed_30_potions: {
    name: 'Alchemik',
    description: 'Uwarzyłeś 30 mikstur.',
    icon: 'science',
    category: 'mastery',
    condition: { type: 'event', eventType: 'potion_brewed_count', min: 30 },
    rarity: 'rare',
    xpReward: 60,
    grantsTitle: { id: 'alchemik', label: 'Alchemik', rarity: 'rare' },
  },
  learned_10_skills: {
    name: 'Erudyta',
    description: 'Wyszkoliłeś lub nauczyłeś się 10 różnych umiejętności.',
    icon: 'school',
    category: 'mastery',
    condition: { type: 'distinct_skills_trained', min: 10 },
    rarity: 'uncommon',
    xpReward: 35,
  },
  learned_magic: {
    name: 'Tknięty magią',
    description: 'Nauczyłeś się pierwszego zaklęcia.',
    icon: 'auto_fix_high',
    category: 'mastery',
    condition: { type: 'any', conditions: [{ type: 'event', eventType: 'magic_learned' }, { type: 'has_magic_training' }] },
    rarity: 'rare',
    xpReward: 45,
  },
  first_spell_cast: {
    name: 'Słowa mocy',
    description: 'Rzuciłeś pierwsze zaklęcie.',
    icon: 'bolt',
    category: 'mastery',
    condition: { type: 'any', conditions: [{ type: 'event', eventType: 'spell_cast' }, { type: 'spells_cast', min: 1 }] },
    rarity: 'uncommon',
    xpReward: 25,
  },
  mastered_spell_tree: {
    name: 'Mistrz drzewka zaklęć',
    description: 'Opanowałeś pięć lub więcej zaklęć z jednego drzewka.',
    icon: 'menu_book',
    category: 'mastery',
    condition: { type: 'spell_lore_depth', min: 5 },
    rarity: 'legendary',
    xpReward: 80,
    grantsTitle: { id: 'mag', label: 'Mag', rarity: 'legendary' },
  },

  // --- Główny wątek fabularny ---
  completed_main_quest: {
    name: 'Bohater',
    description: 'Ukończyłeś główny wątek kampanii.',
    icon: 'workspace_premium',
    category: 'milestone',
    condition: { type: 'event', eventType: 'main_quest_completed' },
    rarity: 'legendary',
    xpReward: 200,
    grantsTitle: { id: 'bohater', label: 'Bohater', rarity: 'legendary' },
  },
};

export const ACHIEVEMENT_CATEGORIES = {
  milestone: {
    name: 'Kamienie milowe',
    icon: 'stars',
    color: '#c9a227',
  },
  combat: {
    name: 'Walka',
    icon: 'swords',
    color: '#b91c1c',
  },
  exploration: {
    name: 'Eksploracja',
    icon: 'map',
    color: '#15803d',
  },
  social: {
    name: 'Społeczne',
    icon: 'groups',
    color: '#7c3aed',
  },
  survival: {
    name: 'Przetrwanie',
    icon: 'water_drop',
    color: '#0ea5e9',
  },
  mastery: {
    name: 'Mistrzostwo',
    icon: 'workspace_premium',
    color: '#ca8a04',
  },
};

const TITLE_RARITY_RANK = { common: 1, uncommon: 2, rare: 3, epic: 4, legendary: 5 };

export function compareTitleRarity(a, b) {
  const ra = TITLE_RARITY_RANK[a?.rarity] || 0;
  const rb = TITLE_RARITY_RANK[b?.rarity] || 0;
  if (ra !== rb) return rb - ra;
  const ta = a?.unlockedAt || 0;
  const tb = b?.unlockedAt || 0;
  return tb - ta;
}

/** Returns top-N titles for a character, ordered by rarity desc, then recency. */
export function getTopTitles(character, n = 3) {
  const titles = Array.isArray(character?.titles) ? character.titles : [];
  return [...titles].sort(compareTitleRarity).slice(0, n);
}

export function getActiveTitle(character) {
  const titles = Array.isArray(character?.titles) ? character.titles : [];
  if (!titles.length) return null;
  if (character?.activeTitleId) {
    const found = titles.find((t) => t.id === character.activeTitleId);
    if (found) return found;
  }
  return getTopTitles(character, 1)[0] || null;
}

function sceneCount(gameState) {
  const scenes = gameState?.scenes;
  return Array.isArray(scenes) ? scenes.length : 0;
}

function getCharacter(gameState) {
  return gameState?.character ?? null;
}

function getAchievementStats(gameState) {
  return gameState?.achievementStats ?? {};
}

function getWorld(gameState) {
  return gameState?.world ?? {};
}

function normalizeLocationToken(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}

function visitedLocationSet(gameState) {
  const stats = getAchievementStats(gameState);
  if (Array.isArray(stats.visitedLocationIds) && stats.visitedLocationIds.length > 0) {
    return new Set(stats.visitedLocationIds.map(normalizeLocationToken));
  }
  const world = getWorld(gameState);
  const fromWorld = world.visitedLocationIds ?? world.locationsVisited;
  if (Array.isArray(fromWorld) && fromWorld.length > 0) {
    return new Set(fromWorld.map(normalizeLocationToken));
  }
  const current = normalizeLocationToken(world.currentLocation);
  const set = new Set();
  if (current) set.add(current);
  return set;
}

function factionReputationValues(world) {
  const fac = world.factions ?? {};
  return Object.values(fac).map((v) => (typeof v === 'number' ? v : v?.reputation ?? v?.value ?? 0));
}

function countDistinctTrainedSkills(character) {
  if (!character?.skills || typeof character.skills !== 'object') return 0;
  return Object.values(character.skills).filter((v) => typeof v === 'number' && v > 0).length;
}

function hasMagicTraining(character) {
  if (!character) return false;
  if ((character.magic?.knownSpells?.length || 0) > 0) return true;
  return false;
}

function maxSpellsInOneLore(stats) {
  const by = stats.spellsByLore;
  if (!by || typeof by !== 'object') return 0;
  return Math.max(0, ...Object.values(by).map((n) => (typeof n === 'number' ? n : 0)));
}

function evaluateCondition(condition, gameState, event) {
  if (!condition || !condition.type) return false;

  switch (condition.type) {
    case 'any': {
      const list = condition.conditions;
      if (!Array.isArray(list)) return false;
      return list.some((c) => evaluateCondition(c, gameState, event));
    }
    case 'all': {
      const list = condition.conditions;
      if (!Array.isArray(list)) return false;
      return list.every((c) => evaluateCondition(c, gameState, event));
    }
    case 'event': {
      if (!event || event.type !== condition.eventType) return false;
      if (condition.eventType === 'rest_recovered_from_critical') {
        const prev = event.payload?.previousRest;
        return typeof prev === 'number' && prev < 15;
      }
      return true;
    }
    case 'combat_victory_flawless': {
      if (event?.type !== 'combat_victory') return false;
      const taken = event.payload?.damageTaken ?? event.payload?.woundsLost ?? 0;
      return taken === 0;
    }
    case 'campaign_active': {
      return gameState?.campaign != null;
    }
    case 'scene_count': {
      return sceneCount(gameState) >= (condition.min ?? 0);
    }
    case 'wounds_depleted': {
      if (event?.type === 'character_wounds_zero') return true;
      const w = getCharacter(gameState)?.wounds;
      return typeof w === 'number' && w <= 0;
    }
    case 'combat_wins': {
      const stats = getAchievementStats(gameState);
      return (stats.combatWins ?? 0) >= (condition.min ?? 1);
    }
    case 'enemies_defeated': {
      const stats = getAchievementStats(gameState);
      return (stats.enemiesDefeated ?? 0) >= (condition.min ?? 0);
    }
    case 'unique_locations_visited': {
      return visitedLocationSet(gameState).size >= (condition.min ?? 0);
    }
    case 'location_matches': {
      const patterns = (condition.patterns ?? []).map((p) => String(p).toLowerCase());
      if (patterns.length === 0) return false;
      const world = getWorld(gameState);
      const tokens = [
        normalizeLocationToken(world.currentLocation),
        ...Array.from(visitedLocationSet(gameState)),
      ];
      return tokens.some((t) => patterns.some((p) => t.includes(p) || p.includes(t)));
    }
    case 'npc_disposition': {
      if (event?.type === 'npc_disposition_changed' && event.payload) {
        const d = event.payload.disposition;
        if (typeof d !== 'number') return false;
        if (condition.op === 'gt') return d > (condition.value ?? 20);
        if (condition.op === 'lt') return d < (condition.value ?? -20);
      }
      const npcs = getWorld(gameState).npcs ?? [];
      return npcs.some((n) => {
        const d = n.disposition;
        if (typeof d !== 'number') return false;
        if (condition.op === 'gt') return d > (condition.value ?? 20);
        if (condition.op === 'lt') return d < (condition.value ?? -20);
        return false;
      });
    }
    case 'faction_reputation': {
      const vals = factionReputationValues(getWorld(gameState));
      const min = condition.min ?? 51;
      return vals.some((r) => r > min - 1);
    }
    case 'haggles_succeeded': {
      const stats = getAchievementStats(gameState);
      return (stats.hagglesSucceeded ?? 0) >= (condition.min ?? 5);
    }
    case 'wounds_lte': {
      const w = getCharacter(gameState)?.wounds;
      return typeof w === 'number' && w <= (condition.max ?? 2) && w > 0;
    }
    case 'all_needs_lte': {
      const needs = getCharacter(gameState)?.needs;
      if (!needs || typeof needs !== 'object') return false;
      const t = condition.threshold ?? 14;
      const keys = ['hunger', 'thirst', 'bladder', 'hygiene', 'rest'];
      return keys.every((k) => typeof needs[k] === 'number' && needs[k] <= t);
    }
    case 'skill_at_level': {
      const character = getCharacter(gameState);
      const skills = character?.skills || {};
      const watched = Array.isArray(condition.skills) ? condition.skills : [];
      const min = condition.min ?? 16;
      return watched.some((name) => {
        const v = skills[name];
        return typeof v === 'number' && v >= min;
      });
    }
    case 'distinct_skills_trained': {
      return countDistinctTrainedSkills(getCharacter(gameState)) >= (condition.min ?? 10);
    }
    case 'has_magic_training': {
      return hasMagicTraining(getCharacter(gameState));
    }
    case 'spells_cast': {
      const stats = getAchievementStats(gameState);
      return (stats.spellsCast ?? 0) >= (condition.min ?? 1);
    }
    case 'miscasts': {
      const stats = getAchievementStats(gameState);
      return (stats.miscasts ?? 0) >= (condition.min ?? 1);
    }
    case 'spell_lore_depth': {
      return maxSpellsInOneLore(getAchievementStats(gameState)) >= (condition.min ?? 5);
    }
    default:
      return false;
  }
}

export function getAchievementsByCategory(category) {
  return Object.entries(ACHIEVEMENTS)
    .filter(([, def]) => def.category === category)
    .map(([id, def]) => ({ id, ...def }));
}

export function checkAchievementCondition(achievementId, gameState, event) {
  const def = ACHIEVEMENTS[achievementId];
  if (!def) return false;
  return evaluateCondition(def.condition, gameState, event);
}
