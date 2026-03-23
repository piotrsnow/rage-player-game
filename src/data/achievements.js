/**
 * WFRP achievement definitions and condition helpers.
 *
 * Callers may maintain optional gameState.achievementStats for counters, e.g.:
 *   combatWins, enemiesDefeated, hagglesSucceeded, spellsCast, miscasts,
 *   spellsByLore: { [loreName]: count }, visitedLocationIds: string[],
 *   damageTakenThisCombat (reset when combat starts)
 *
 * Events passed to checkAchievementCondition should use string `type` and a `payload` object.
 */

export const ACHIEVEMENTS = {
  // --- Milestone ---
  first_campaign: {
    name: 'Into the Old World',
    description: 'Started your first campaign.',
    icon: 'flag',
    category: 'milestone',
    condition: { type: 'campaign_active' },
    rarity: 'common',
    xpReward: 10,
  },
  first_scene: {
    name: 'First Steps',
    description: 'Completed your first narrative scene.',
    icon: 'footprint',
    category: 'milestone',
    condition: { type: 'scene_count', min: 1 },
    rarity: 'common',
    xpReward: 15,
  },
  scenes_10: {
    name: 'Seasoned Traveller',
    description: 'Survived 10 scenes.',
    icon: 'history',
    category: 'milestone',
    condition: { type: 'scene_count', min: 10 },
    rarity: 'common',
    xpReward: 25,
  },
  scenes_50: {
    name: 'Road-Worn',
    description: 'Survived 50 scenes.',
    icon: 'route',
    category: 'milestone',
    condition: { type: 'scene_count', min: 50 },
    rarity: 'uncommon',
    xpReward: 50,
  },
  scenes_100: {
    name: 'Legend of the Reik',
    description: 'Survived 100 scenes.',
    icon: 'emoji_events',
    category: 'milestone',
    condition: { type: 'scene_count', min: 100 },
    rarity: 'rare',
    xpReward: 100,
  },
  first_death: {
    name: 'Morr Calls',
    description: 'Your character reached zero wounds.',
    icon: 'skull',
    category: 'milestone',
    condition: { type: 'wounds_depleted' },
    rarity: 'uncommon',
  },

  // --- Combat ---
  first_combat_win: {
    name: 'Blooded',
    description: 'Won your first combat.',
    icon: 'swords',
    category: 'combat',
    condition: { type: 'combat_wins', min: 1 },
    rarity: 'common',
    xpReward: 20,
  },
  critical_hit: {
    name: 'Between the Ribs',
    description: 'Scored a critical hit in combat.',
    icon: 'crisis_alert',
    category: 'combat',
    condition: { type: 'event', eventType: 'critical_hit' },
    rarity: 'common',
    xpReward: 15,
  },
  survived_critical_wound: {
    name: 'Still Standing',
    description: 'Suffered a critical wound and lived to tell the tale.',
    icon: 'healing',
    category: 'combat',
    condition: { type: 'event', eventType: 'survived_critical_wound' },
    rarity: 'uncommon',
    xpReward: 30,
  },
  defeated_10_enemies: {
    name: 'Reaper',
    description: 'Defeated 10 enemies in combat.',
    icon: 'swords',
    category: 'combat',
    condition: { type: 'enemies_defeated', min: 10 },
    rarity: 'uncommon',
    xpReward: 40,
  },
  defeated_50_enemies: {
    name: 'Veteran Slayer',
    description: 'Defeated 50 enemies in combat.',
    icon: 'shield',
    category: 'combat',
    condition: { type: 'enemies_defeated', min: 50 },
    rarity: 'rare',
    xpReward: 75,
  },
  flawless_victory: {
    name: 'Untouched',
    description: 'Won a combat without taking any damage.',
    icon: 'shield_person',
    category: 'combat',
    condition: { type: 'combat_victory_flawless' },
    rarity: 'rare',
    xpReward: 50,
  },

  // --- Exploration ---
  visited_5_locations: {
    name: 'Wanderer',
    description: 'Visited 5 distinct locations.',
    icon: 'map',
    category: 'exploration',
    condition: { type: 'unique_locations_visited', min: 5 },
    rarity: 'common',
    xpReward: 20,
  },
  visited_15_locations: {
    name: 'Cartographer',
    description: 'Visited 15 distinct locations.',
    icon: 'explore',
    category: 'exploration',
    condition: { type: 'unique_locations_visited', min: 15 },
    rarity: 'uncommon',
    xpReward: 35,
  },
  visited_altdorf: {
    name: 'Crown of the Empire',
    description: 'Set foot in Altdorf.',
    icon: 'location_city',
    category: 'exploration',
    condition: { type: 'location_matches', patterns: ['altdorf'] },
    rarity: 'uncommon',
    xpReward: 25,
  },
  discovered_secret: {
    name: 'Hidden Truth',
    description: 'Uncovered a secret or hidden area.',
    icon: 'visibility_off',
    category: 'exploration',
    condition: { type: 'event', eventType: 'secret_discovered' },
    rarity: 'rare',
    xpReward: 40,
  },

  // --- Social ---
  befriended_npc: {
    name: 'Fast Friends',
    description: 'An NPC’s disposition rose above 20.',
    icon: 'diversity_3',
    category: 'social',
    condition: { type: 'npc_disposition', op: 'gt', value: 20 },
    rarity: 'common',
    xpReward: 20,
  },
  made_enemy: {
    name: 'Bad Blood',
    description: 'An NPC’s disposition fell below -20.',
    icon: 'sentiment_very_dissatisfied',
    category: 'social',
    condition: { type: 'npc_disposition', op: 'lt', value: -20 },
    rarity: 'common',
  },
  joined_faction: {
    name: 'Banner Sworn',
    description: 'Earned over 50 reputation with a faction.',
    icon: 'flag_circle',
    category: 'social',
    condition: { type: 'faction_reputation', min: 51 },
    rarity: 'uncommon',
    xpReward: 35,
  },
  haggle_master: {
    name: 'Haggle Master',
    description: 'Succeeded at five haggle tests.',
    icon: 'payments',
    category: 'social',
    condition: { type: 'haggles_succeeded', min: 5 },
    rarity: 'uncommon',
    xpReward: 30,
  },

  // --- Survival ---
  survived_low_health: {
    name: 'By a Thread',
    description: 'Survived a scene with 2 or fewer wounds remaining.',
    icon: 'favorite',
    category: 'survival',
    condition: { type: 'wounds_lte', max: 2 },
    rarity: 'uncommon',
    xpReward: 25,
  },
  all_needs_critical: {
    name: 'Rock Bottom',
    description: 'All survival needs dropped to critical at once.',
    icon: 'warning',
    category: 'survival',
    condition: { type: 'all_needs_lte', threshold: 14 },
    rarity: 'rare',
    xpReward: 20,
  },
  night_survived: {
    name: 'Dawn Breaks',
    description: 'Recovered rest from a critically low level after a dangerous night.',
    icon: 'nights_stay',
    category: 'survival',
    condition: { type: 'event', eventType: 'rest_recovered_from_critical' },
    rarity: 'uncommon',
    xpReward: 25,
  },

  // --- Career ---
  advanced_tier_2: {
    name: 'Journeyman',
    description: 'Advanced to career tier 2.',
    icon: 'trending_up',
    category: 'career',
    condition: { type: 'career_tier', min: 2 },
    rarity: 'uncommon',
    xpReward: 40,
  },
  advanced_tier_3: {
    name: 'Master of the Trade',
    description: 'Advanced to career tier 3.',
    icon: 'workspace_premium',
    category: 'career',
    condition: { type: 'career_tier', min: 3 },
    rarity: 'rare',
    xpReward: 60,
  },
  advanced_tier_4: {
    name: 'Peak of the Profession',
    description: 'Advanced to career tier 4.',
    icon: 'military_tech',
    category: 'career',
    condition: { type: 'career_tier', min: 4 },
    rarity: 'legendary',
    xpReward: 100,
  },
  changed_career: {
    name: 'New Path',
    description: 'Changed to a different career.',
    icon: 'swap_horiz',
    category: 'career',
    condition: { type: 'event', eventType: 'career_changed' },
    rarity: 'uncommon',
    xpReward: 50,
  },
  learned_10_skills: {
    name: 'Polymath',
    description: 'Advanced or learned 10 different skills.',
    icon: 'school',
    category: 'career',
    condition: { type: 'distinct_skills_trained', min: 10 },
    rarity: 'uncommon',
    xpReward: 35,
  },
  learned_magic: {
    name: 'Touch of Azyr',
    description: 'Learned your first spell or magical talent.',
    icon: 'auto_fix_high',
    category: 'career',
    condition: { type: 'any', conditions: [{ type: 'event', eventType: 'magic_learned' }, { type: 'has_magic_training' }] },
    rarity: 'rare',
    xpReward: 45,
  },

  // --- Magic (grouped under career per schema) ---
  first_spell_cast: {
    name: 'Words of Power',
    description: 'Cast your first spell.',
    icon: 'bolt',
    category: 'career',
    condition: { type: 'any', conditions: [{ type: 'event', eventType: 'spell_cast' }, { type: 'spells_cast', min: 1 }] },
    rarity: 'uncommon',
    xpReward: 25,
  },
  first_miscast: {
    name: 'Winds Unchained',
    description: 'Suffered your first miscast.',
    icon: 'error',
    category: 'career',
    condition: { type: 'any', conditions: [{ type: 'event', eventType: 'miscast' }, { type: 'miscasts', min: 1 }] },
    rarity: 'uncommon',
    xpReward: 15,
  },
  mastered_lore: {
    name: 'Loremaster',
    description: 'Learned five or more spells from a single lore.',
    icon: 'menu_book',
    category: 'career',
    condition: { type: 'spell_lore_depth', min: 5 },
    rarity: 'legendary',
    xpReward: 80,
  },
};

export const ACHIEVEMENT_CATEGORIES = {
  milestone: {
    name: 'Milestones',
    icon: 'stars',
    color: '#c9a227',
  },
  combat: {
    name: 'Combat',
    icon: 'swords',
    color: '#b91c1c',
  },
  exploration: {
    name: 'Exploration',
    icon: 'map',
    color: '#15803d',
  },
  social: {
    name: 'Social',
    icon: 'groups',
    color: '#7c3aed',
  },
  survival: {
    name: 'Survival',
    icon: 'water_drop',
    color: '#0ea5e9',
  },
  career: {
    name: 'Career & Magic',
    icon: 'work',
    color: '#ca8a04',
  },
};

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
  const talents = character.talents;
  if (Array.isArray(talents)) {
    const magicish = talents.some((t) => {
      const s = String(typeof t === 'string' ? t : t?.name ?? '').toLowerCase();
      return s.includes('spell') || s.includes('lore') || s.includes('channel') || s.includes('witch') || s.includes('wizard');
    });
    if (magicish) return true;
  }
  if (Array.isArray(character.spells) && character.spells.length > 0) return true;
  if (character.arcane?.spells && Object.keys(character.arcane.spells).length > 0) return true;
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
    case 'career_tier': {
      const tier = getCharacter(gameState)?.career?.tier;
      return typeof tier === 'number' && tier >= (condition.min ?? 1);
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
