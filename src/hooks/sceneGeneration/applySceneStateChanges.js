import { validateStateChanges } from '../../services/stateValidator';
import { generateStateChangeMessages } from '../../services/stateChangeMessages';
import { checkWorldConsistency, applyConsistencyPatches } from '../../services/worldConsistency';
import { detectCombatIntent } from '../../../shared/domain/combatIntent.js';
import { gameData } from '../../services/gameDataService';
import { shortId } from '../../utils/ids';

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
  const fallbackEnemyName = fallbackNpc?.name || t('gameplay.combatFallbackEnemyName', 'Hostile Foe');
  const bestiaryMatch = gameData.findClosestBestiaryEntry(fallbackEnemyName);
  const fallbackStats = bestiaryMatch || {
    characteristics: { ws: 30, bs: 30, s: 30, t: 30, i: 30, ag: 30, dex: 25, int: 20, wp: 25, fel: 20 },
    maxWounds: 10, skills: { 'Melee (Basic)': 5 }, traits: [], armour: { body: 1 }, weapons: ['Hand Weapon'],
  };
  result.stateChanges = {
    ...(result.stateChanges || {}),
    combatUpdate: {
      active: true,
      enemies: [{
        name: fallbackEnemyName,
        characteristics: fallbackStats.characteristics,
        wounds: fallbackStats.maxWounds,
        maxWounds: fallbackStats.maxWounds,
        skills: fallbackStats.skills,
        traits: fallbackStats.traits || [],
        armour: fallbackStats.armour || { body: 0 },
        weapons: fallbackStats.weapons || ['Hand Weapon'],
      }],
      reason: 'Combat intent fallback (AI omitted combatUpdate)',
    },
  };
  console.warn('[useAI] Injected fallback combatUpdate — AI omitted it despite combat intent');
}

export function fillBestiaryStats(result) {
  if (!result.stateChanges?.combatUpdate?.enemies?.length || !gameData.isLoaded) return;
  result.stateChanges.combatUpdate.enemies = result.stateChanges.combatUpdate.enemies.map((enemy) => {
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
  authoritativeCharacterSnapshot, ensureMissingInventoryImages, t,
  newlyUnlockedAchievements = [], updatedAchievementState = null,
}) {
  if (!result.stateChanges || Object.keys(result.stateChanges).length === 0) return;

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
