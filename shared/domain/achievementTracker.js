import { ACHIEVEMENTS, checkAchievementCondition } from './achievements.js';

function cloneStats(stats) {
  return {
    scenesPlayed: stats.scenesPlayed,
    combatWins: stats.combatWins,
    enemiesDefeated: stats.enemiesDefeated,
    locationsVisited: [...(stats.locationsVisited || [])],
    hagglesSucceeded: stats.hagglesSucceeded,
    spellsCast: stats.spellsCast,
    miscasts: stats.miscasts,
    spellsByLore: { ...(stats.spellsByLore || {}) },
    lowestWounds: stats.lowestWounds,
    npcDispositions: { ...(stats.npcDispositions || {}) },
  };
}

function cloneAchievementState(achievementState) {
  return {
    unlocked: [...(achievementState.unlocked || [])],
    stats: cloneStats(achievementState.stats),
  };
}

function normalizeLocationId(loc) {
  return String(loc ?? '')
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}

/** Merges tracker stats into gameState so checkAchievementCondition sees counters and visit list. */
function buildGameStateForAchievementChecks(gameState, achievementState) {
  const s = achievementState.stats;
  const baseScenes = Array.isArray(gameState?.scenes) ? gameState.scenes : [];
  const targetLen = Math.max(baseScenes.length, s.scenesPlayed || 0);
  const pad = Math.max(0, targetLen - baseScenes.length);
  const scenes =
    pad > 0 ? [...baseScenes, ...Array(pad).fill({ _achievementScenePad: true })] : baseScenes;

  const visitedIds = [...(s.locationsVisited || [])];

  return {
    ...gameState,
    scenes,
    achievementStats: {
      ...(gameState?.achievementStats || {}),
      combatWins: s.combatWins ?? 0,
      enemiesDefeated: s.enemiesDefeated ?? 0,
      hagglesSucceeded: s.hagglesSucceeded ?? 0,
      spellsCast: s.spellsCast ?? 0,
      miscasts: s.miscasts ?? 0,
      spellsByLore: { ...(gameState?.achievementStats?.spellsByLore || {}), ...(s.spellsByLore || {}) },
      visitedLocationIds: visitedIds.length > 0 ? visitedIds : gameState?.achievementStats?.visitedLocationIds,
    },
  };
}

export function createAchievementState() {
  return {
    unlocked: [],
    stats: {
      scenesPlayed: 0,
      combatWins: 0,
      enemiesDefeated: 0,
      locationsVisited: [],
      hagglesSucceeded: 0,
      spellsCast: 0,
      miscasts: 0,
      spellsByLore: {},
      lowestWounds: Infinity,
      npcDispositions: {},
    },
  };
}

function achievementToUnlockPayload(id, def) {
  return {
    id,
    name: def.name,
    description: def.description,
    icon: def.icon,
    rarity: def.rarity,
    ...(def.xpReward !== undefined ? { xpReward: def.xpReward } : {}),
    ...(def.grantsTitle ? { grantsTitle: def.grantsTitle } : {}),
  };
}

export function checkAllAchievements(achievementState, gameState, event = null) {
  const updatedState = cloneAchievementState(achievementState);
  const unlockedSet = new Set(updatedState.unlocked);
  const mergedGameState = buildGameStateForAchievementChecks(gameState, updatedState);
  const newlyUnlocked = [];

  for (const id of Object.keys(ACHIEVEMENTS)) {
    if (unlockedSet.has(id)) continue;
    if (!checkAchievementCondition(id, mergedGameState, event)) continue;
    unlockedSet.add(id);
    newlyUnlocked.push(achievementToUnlockPayload(id, ACHIEVEMENTS[id]));
  }

  updatedState.unlocked = [...unlockedSet];
  return { newlyUnlocked, updatedState };
}

export function updateStats(achievementState, event) {
  if (!event || typeof event.type !== 'string') return cloneAchievementState(achievementState);

  const next = cloneAchievementState(achievementState);
  const { stats } = next;
  const payload = event.payload && typeof event.payload === 'object' ? event.payload : {};

  switch (event.type) {
    case 'scene_completed':
      stats.scenesPlayed += 1;
      break;
    case 'combat_victory':
      stats.combatWins += 1;
      break;
    case 'enemy_defeated': {
      const n = typeof payload.count === 'number' ? payload.count : 1;
      stats.enemiesDefeated += Math.max(0, n);
      break;
    }
    case 'location_visited': {
      const raw = payload.locationId ?? payload.location ?? payload.id ?? '';
      const token = normalizeLocationId(raw);
      if (token && !stats.locationsVisited.includes(token)) {
        stats.locationsVisited.push(token);
      }
      break;
    }
    case 'haggle_success':
      stats.hagglesSucceeded += 1;
      break;
    case 'spell_cast': {
      stats.spellsCast += 1;
      const lore = payload.lore != null ? String(payload.lore) : '';
      if (lore) {
        stats.spellsByLore[lore] = (stats.spellsByLore[lore] || 0) + 1;
      }
      break;
    }
    case 'miscast':
      stats.miscasts += 1;
      break;
    case 'npc_disposition_changed': {
      const key = payload.npcId != null ? String(payload.npcId) : normalizeLocationId(payload.npcName ?? payload.name ?? '');
      if (key && typeof payload.disposition === 'number') {
        stats.npcDispositions[key] = payload.disposition;
      }
      break;
    }
    case 'career_changed':
      break;
    case 'wounds_changed': {
      const w = payload.wounds;
      if (typeof w === 'number' && w >= 0) {
        stats.lowestWounds = Math.min(stats.lowestWounds, w);
      }
      break;
    }
    case 'skill_learned':
    case 'talent_learned':
      break;
    default:
      break;
  }

  return next;
}

function npcEntryDisposition(npc) {
  if (typeof npc.disposition === 'number') return npc.disposition;
  return null;
}

/**
 * Derives achievement events from AI stateChanges. Pass gameState after changes are applied
 * so NPC dispositions and wounds reflect the new values.
 */
function extractAchievementEventsFromStateChanges(stateChanges, gameState) {
  if (!stateChanges || typeof stateChanges !== 'object') return [];

  const events = [];

  if (Array.isArray(stateChanges.achievementEvents)) {
    for (const ev of stateChanges.achievementEvents) {
      if (ev && typeof ev.type === 'string') {
        events.push({ type: ev.type, payload: ev.payload ?? {} });
      }
    }
  }

  const shouldCountScene =
    stateChanges.sceneCompleted === true ||
    (stateChanges.skipSceneAchievement !== true &&
      (stateChanges.timeAdvance != null ||
        stateChanges.xp != null ||
        (Array.isArray(stateChanges.journalEntries) && stateChanges.journalEntries.length > 0)));

  if (shouldCountScene) {
    events.push({ type: 'scene_completed', payload: {} });
  }

  if (stateChanges.currentLocation) {
    events.push({ type: 'location_visited', payload: { location: stateChanges.currentLocation } });
  }

  if (stateChanges.careerAdvance && typeof stateChanges.careerAdvance === 'object') {
    events.push({ type: 'career_changed', payload: { ...stateChanges.careerAdvance } });
  }

  if (typeof stateChanges.woundsChange === 'number' && gameState?.character) {
    events.push({
      type: 'wounds_changed',
      payload: { wounds: gameState.character.wounds, delta: stateChanges.woundsChange },
    });
  }

  if (stateChanges.skillAdvances && typeof stateChanges.skillAdvances === 'object') {
    for (const skillName of Object.keys(stateChanges.skillAdvances)) {
      events.push({
        type: 'skill_learned',
        payload: { skillName, amount: stateChanges.skillAdvances[skillName] },
      });
    }
  }

  if (Array.isArray(stateChanges.newTalents)) {
    for (const t of stateChanges.newTalents) {
      events.push({ type: 'talent_learned', payload: { talent: t } });
    }
  }

  if (Array.isArray(stateChanges.npcs)) {
    const worldNpcs = gameState?.world?.npcs || [];
    for (const npc of stateChanges.npcs) {
      if (typeof npc?.dispositionChange !== 'number' || !npc.name) continue;
      const idx = worldNpcs.findIndex((n) => n.name?.toLowerCase() === npc.name.toLowerCase());
      const disposition = idx >= 0 ? npcEntryDisposition(worldNpcs[idx]) : null;
      if (typeof disposition === 'number') {
        events.push({
          type: 'npc_disposition_changed',
          payload: { npcName: npc.name, disposition },
        });
      }
    }
  }

  if (stateChanges.haggleSuccess === true || stateChanges.haggleSucceeded === true) {
    events.push({ type: 'haggle_success', payload: {} });
  }

  const cv = stateChanges.combatVictory;
  if (cv && typeof cv === 'object') {
    events.push({
      type: 'combat_victory',
      payload: {
        damageTaken: cv.damageTaken ?? cv.woundsLost ?? 0,
        flawless: cv.flawless === true,
      },
    });
    const defeated = cv.enemiesDefeated ?? cv.defeatedCount;
    if (typeof defeated === 'number' && defeated > 0) {
      events.push({ type: 'enemy_defeated', payload: { count: defeated } });
    }
  }

  if (typeof stateChanges.enemiesDefeated === 'number' && stateChanges.enemiesDefeated > 0) {
    events.push({ type: 'enemy_defeated', payload: { count: stateChanges.enemiesDefeated } });
  }

  if (stateChanges.spellCast && typeof stateChanges.spellCast === 'object') {
    events.push({
      type: 'spell_cast',
      payload: {
        lore: stateChanges.spellCast.lore ?? stateChanges.spellCast.loreName,
        spell: stateChanges.spellCast.spell ?? stateChanges.spellCast.name,
      },
    });
  }

  if (stateChanges.miscast === true || stateChanges.miscastOccurred === true) {
    events.push({ type: 'miscast', payload: stateChanges.miscastDetails || {} });
  }

  const extra = stateChanges.achievementEvent;
  if (extra && typeof extra.type === 'string') {
    events.push({ type: extra.type, payload: extra.payload ?? {} });
  }

  return events;
}

export function processStateChanges(achievementState, stateChanges, gameState) {
  const events = extractAchievementEventsFromStateChanges(stateChanges, gameState);
  let state = cloneAchievementState(achievementState);
  const newlyUnlocked = [];
  const seen = new Set();

  for (const event of events) {
    state = updateStats(state, event);
    const { newlyUnlocked: batch, updatedState } = checkAllAchievements(state, gameState, event);
    state = updatedState;
    for (const u of batch) {
      if (!seen.has(u.id)) {
        seen.add(u.id);
        newlyUnlocked.push(u);
      }
    }
  }

  const { newlyUnlocked: finalBatch, updatedState: finalState } = checkAllAchievements(
    state,
    gameState,
    null
  );
  state = finalState;
  for (const u of finalBatch) {
    if (!seen.has(u.id)) {
      seen.add(u.id);
      newlyUnlocked.push(u);
    }
  }

  return { newlyUnlocked, updatedAchievementState: state };
}

export function getAchievementProgress(achievementState) {
  const ids = Object.keys(ACHIEVEMENTS);
  const total = ids.length;
  const unlockedSet = new Set(achievementState.unlocked || []);
  const unlocked = unlockedSet.size;
  const percentage = total === 0 ? 0 : Math.round((unlocked / total) * 1000) / 10;

  const byCategory = {};
  for (const id of ids) {
    const def = ACHIEVEMENTS[id];
    const cat = def.category || 'other';
    if (!byCategory[cat]) {
      byCategory[cat] = { total: 0, unlocked: 0 };
    }
    byCategory[cat].total += 1;
    if (unlockedSet.has(id)) byCategory[cat].unlocked += 1;
  }

  return { total, unlocked, percentage, byCategory };
}
