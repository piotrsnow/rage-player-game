import { validateStateChanges } from '../../services/stateValidator';
import { generateStateChangeMessages } from '../../services/stateChangeMessages';
import { checkWorldConsistency, applyConsistencyPatches } from '../../services/worldConsistency';
import { detectCombatIntent } from '../../../shared/domain/combatIntent.js';
import { gameData } from '../../services/gameDataService';
import { getGameState } from '../../stores/gameStore';
import { shortId } from '../../utils/ids';

/**
 * Build a combat-enemy payload from a full NPC sheet (shape from
 * backend/src/services/npcs/npcCharacterSheet.js — race/creatureKind/level
 * /attributes/skills/weapons/armourDR/traits/maxWounds). Returns `null` when
 * the NPC doesn't have a populated sheet so the caller can fall back to the
 * bestiary.
 */
function enemyFromNpcSheet(npc) {
  const stats = npc?.stats;
  if (!stats || typeof stats !== 'object') return null;
  if (!stats.attributes || typeof stats.attributes !== 'object') return null;
  const maxWounds = typeof stats.maxWounds === 'number' && stats.maxWounds > 0 ? stats.maxWounds : 10;
  return {
    name: npc.name,
    attributes: { ...stats.attributes },
    wounds: maxWounds,
    maxWounds,
    skills: stats.skills && typeof stats.skills === 'object' ? { ...stats.skills } : {},
    traits: Array.isArray(stats.traits) ? [...stats.traits] : [],
    weapons: Array.isArray(stats.weapons) && stats.weapons.length > 0 ? [...stats.weapons] : ['Hand Weapon'],
    armourDR: typeof stats.armourDR === 'number' ? stats.armourDR : 0,
  };
}

function findNpcByName(npcs, name) {
  if (!name) return null;
  const q = String(name).trim().toLowerCase();
  return (npcs || []).find((n) => typeof n?.name === 'string' && n.name.trim().toLowerCase() === q) || null;
}

export function injectCombatFallback(result, state, playerAction, isFirstScene, isPassiveSceneAction, t) {
  if (isFirstScene || isPassiveSceneAction || !detectCombatIntent(playerAction)) return;
  const hasCombatUpdate = result.stateChanges?.combatUpdate?.active === true;
  if (hasCombatUpdate) return;

  const currentLocation = state.world?.currentLocation || '';
  const fallbackNpc = (state.world?.npcs || []).find((npc) => {
    if (!npc?.name || npc.alive === false) return false;
    if (!currentLocation) return true;
    return String(npc.lastLocation || '').trim().toLowerCase() === String(currentLocation).trim().toLowerCase();
  });

  // NPC-first: when the fallback opponent has a generated character sheet,
  // use it verbatim so combat respects the NPC's actual stats / level.
  const fromSheet = fallbackNpc ? enemyFromNpcSheet(fallbackNpc) : null;

  let enemy;
  if (fromSheet) {
    enemy = fromSheet;
  } else {
    const fallbackEnemyName = fallbackNpc?.name || t('gameplay.combatFallbackEnemyName', 'Hostile Foe');
    const bestiaryMatch = gameData.findClosestBestiaryEntry(fallbackEnemyName);
    const fallbackStats = bestiaryMatch || {
      characteristics: { ws: 30, bs: 30, s: 30, t: 30, i: 30, ag: 30, dex: 25, int: 20, wp: 25, fel: 20 },
      maxWounds: 10, skills: { 'Melee (Basic)': 5 }, traits: [], armour: { body: 1 }, weapons: ['Hand Weapon'],
    };
    enemy = {
      name: fallbackEnemyName,
      characteristics: fallbackStats.characteristics,
      wounds: fallbackStats.maxWounds,
      maxWounds: fallbackStats.maxWounds,
      skills: fallbackStats.skills,
      traits: fallbackStats.traits || [],
      armour: fallbackStats.armour || { body: 0 },
      weapons: fallbackStats.weapons || ['Hand Weapon'],
    };
  }

  result.stateChanges = {
    ...(result.stateChanges || {}),
    combatUpdate: {
      active: true,
      enemies: [enemy],
      reason: 'Combat intent fallback (AI omitted combatUpdate)',
    },
  };
  console.warn('[useAI] Injected fallback combatUpdate — AI omitted it despite combat intent');
}

export function fillBestiaryStats(result, state) {
  if (!result.stateChanges?.combatUpdate?.enemies?.length) return;
  const worldNpcs = state?.world?.npcs || [];

  result.stateChanges.combatUpdate.enemies = result.stateChanges.combatUpdate.enemies.map((enemy) => {
    // If the enemy already carries full stats from the LLM, keep them.
    if (enemy.attributes && typeof enemy.attributes === 'object') return enemy;

    // NPC-first: a named enemy that matches a world NPC should fight with
    // that NPC's character sheet, not a generic bestiary entry.
    const matchedNpc = findNpcByName(worldNpcs, enemy.name);
    const fromSheet = matchedNpc ? enemyFromNpcSheet(matchedNpc) : null;
    if (fromSheet) return fromSheet;

    if (!gameData.isLoaded) return enemy;
    const match = gameData.findClosestBestiaryEntry(enemy.name);
    if (!match) return enemy;
    return {
      name: enemy.name,
      characteristics: match.characteristics,
      wounds: match.maxWounds,
      maxWounds: match.maxWounds,
      skills: match.skills,
      traits: match.traits,
      armour: match.armour,
      weapons: match.weapons,
    };
  });
}

export function applyNeedsAndRest(result, resolved, needsSystemEnabled) {
  if (needsSystemEnabled) {
    if (!result.stateChanges) result.stateChanges = {};
    const rawTimeAdvance = result.stateChanges.timeAdvance;
    if (typeof rawTimeAdvance === 'number' && Number.isFinite(rawTimeAdvance)) {
      result.stateChanges.timeAdvance = { hoursElapsed: rawTimeAdvance };
    } else if (typeof rawTimeAdvance === 'string') {
      const parsedHours = Number(rawTimeAdvance);
      result.stateChanges.timeAdvance = Number.isFinite(parsedHours)
        ? { hoursElapsed: parsedHours }
        : {};
    } else if (!rawTimeAdvance || typeof rawTimeAdvance !== 'object' || Array.isArray(rawTimeAdvance)) {
      result.stateChanges.timeAdvance = {};
    }
    if (!result.stateChanges.timeAdvance) {
      result.stateChanges.timeAdvance = { hoursElapsed: 0.5 };
    } else if (result.stateChanges.timeAdvance.hoursElapsed == null) {
      result.stateChanges.timeAdvance.hoursElapsed = 0.5;
    }
  }

  if (resolved.isRest && resolved.restRecovery) {
    const mergedNeedsChanges = {
      ...(result.stateChanges?.needsChanges || {}),
      ...(resolved.restRecovery.needsChanges || {}),
    };
    result.stateChanges = {
      ...(result.stateChanges || {}),
      ...(resolved.restRecovery.woundsChange !== undefined
        ? { woundsChange: resolved.restRecovery.woundsChange }
        : {}),
      ...(Object.keys(mergedNeedsChanges).length > 0 ? { needsChanges: mergedNeedsChanges } : {}),
    };
  }
}

export function applySceneStateChanges({
  result, state, dispatch,
  authoritativeCharacterSnapshot, ensureMissingInventoryImages, ensureMissingNpcPortraits, t,
  newlyUnlockedAchievements = [], updatedAchievementState = null,
}) {
  if (!result.stateChanges || Object.keys(result.stateChanges).length === 0) return;

  const introducedNpcNames = new Set(
    (Array.isArray(result.stateChanges.npcs) ? result.stateChanges.npcs : [])
      .filter((n) => n?.action === 'introduce' && typeof n?.name === 'string')
      .map((n) => n.name.toLowerCase()),
  );
  const existingNpcNames = new Set(
    (state.world?.npcs || [])
      .map((n) => (typeof n?.name === 'string' ? n.name.toLowerCase() : null))
      .filter(Boolean),
  );
  const newlyIntroducedNames = [...introducedNpcNames].filter((name) => !existingNpcNames.has(name));

  const { validated, warnings, corrections } = validateStateChanges(result.stateChanges, state);
  result.stateChanges = validated;

  const previousFactions = { ...(state.world?.factions || {}) };

  dispatch({ type: 'APPLY_STATE_CHANGES', payload: validated });

  if (authoritativeCharacterSnapshot) {
    dispatch({ type: 'RECONCILE_CHARACTER_FROM_BACKEND', payload: authoritativeCharacterSnapshot });
  }
  if (Array.isArray(validated.newItems) && validated.newItems.length > 0) {
    void ensureMissingInventoryImages(validated.newItems, { emitWarning: false });
  }
  if (newlyIntroducedNames.length > 0 && typeof ensureMissingNpcPortraits === 'function') {
    setTimeout(() => {
      const nameSet = new Set(newlyIntroducedNames);
      const fresh = (getGameState()?.world?.npcs || [])
        .filter((n) => n?.name && nameSet.has(n.name.toLowerCase()) && !n.portraitUrl);
      if (fresh.length > 0) void ensureMissingNpcPortraits(fresh);
    }, 0);
  }

  const postState = {
    ...state,
    world: { ...state.world, factions: { ...(state.world?.factions || {}), ...(validated.factionChanges || {}) } },
  };
  const consistency = checkWorldConsistency(postState, previousFactions);
  const patches = applyConsistencyPatches(postState, consistency.statePatches);
  if (patches) {
    if (patches.npcs) dispatch({ type: 'UPDATE_WORLD', payload: { npcs: patches.npcs } });
    if (patches.newWorldFacts?.length > 0) dispatch({ type: 'APPLY_STATE_CHANGES', payload: { worldFacts: patches.newWorldFacts } });
  }

  for (const warn of [...warnings, ...corrections, ...consistency.corrections]) {
    dispatch({
      type: 'ADD_CHAT_MESSAGE',
      payload: {
        id: `msg_${Date.now()}_val_${shortId(3)}`,
        role: 'system',
        subtype: 'validation_warning',
        content: `⚠ ${warn}`,
        timestamp: Date.now(),
      },
    });
  }

  const scMessages = generateStateChangeMessages(validated, state, t);
  for (const msg of scMessages) {
    dispatch({ type: 'ADD_CHAT_MESSAGE', payload: msg });
  }

  // Achievement unlocks are computed server-side and arrive pre-resolved.
  // FE just reconciles the updated state and grants titles locally.
  if (updatedAchievementState) {
    dispatch({ type: 'UPDATE_ACHIEVEMENTS', payload: updatedAchievementState });
  }
  for (const ach of newlyUnlockedAchievements) {
    if (ach.grantsTitle && state.character) {
      dispatch({ type: 'ADD_TITLE', payload: { ...ach.grantsTitle, sourceAchievementId: ach.id } });
    }
  }
}
