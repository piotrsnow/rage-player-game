import { detectCombatIntent } from '../../../../shared/domain/combatIntent.js';
import { isNpcAtLocation } from '../../../../shared/domain/npcLocation.js';
import { findClosestBestiaryEntry } from '../../data/equipment/index.js';
import { childLogger } from '../../lib/logger.js';

const log = childLogger({ module: 'combatFallback' });

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

/**
 * If the player's action expresses combat intent but the LLM omitted
 * a combatUpdate, inject a fallback enemy from the NPC at the current
 * location (using its character sheet or the bestiary).
 *
 * Runs BEFORE fillEnemiesFromBestiary so the injected combatUpdate
 * gets the same bestiary fill / tier scaling as model-emitted combat.
 */
export function injectCombatFallback(sceneResult, {
  playerAction,
  isFirstScene = false,
  dbNpcs = [],
  currentRef = null,
  currentLocationName = '',
}) {
  if (isFirstScene || !detectCombatIntent(playerAction)) return;

  const hasCombatUpdate = sceneResult.stateChanges?.combatUpdate?.active === true;
  if (hasCombatUpdate) return;

  const fallbackNpc = dbNpcs.find((npc) => {
    if (!npc?.name || npc.alive === false) return false;
    if (!currentLocationName && !currentRef) return true;
    return isNpcAtLocation(npc, currentRef, currentLocationName);
  });

  const fromSheet = fallbackNpc ? enemyFromNpcSheet(fallbackNpc) : null;

  let enemy;
  if (fromSheet) {
    enemy = fromSheet;
  } else {
    const fallbackEnemyName = fallbackNpc?.name || 'Hostile Foe';
    const bestiaryMatch = findClosestBestiaryEntry(fallbackEnemyName);
    if (bestiaryMatch) {
      enemy = {
        name: fallbackEnemyName,
        attributes: bestiaryMatch.attributes ? { ...bestiaryMatch.attributes } : undefined,
        wounds: bestiaryMatch.maxWounds,
        maxWounds: bestiaryMatch.maxWounds,
        skills: bestiaryMatch.skills,
        traits: bestiaryMatch.traits || [],
        armourDR: bestiaryMatch.armourDR ?? 0,
        weapons: bestiaryMatch.weapons || ['Hand Weapon'],
      };
    } else {
      enemy = {
        name: fallbackEnemyName,
        attributes: { sila: 5, zrecznosc: 5, wytrzymalosc: 5, inteligencja: 3, charyzma: 3, szczescie: 0 },
        wounds: 10,
        maxWounds: 10,
        skills: {},
        traits: [],
        weapons: ['Hand Weapon'],
        armourDR: 0,
      };
    }
  }

  sceneResult.stateChanges = {
    ...(sceneResult.stateChanges || {}),
    combatUpdate: {
      active: true,
      enemies: [enemy],
      reason: 'Combat intent fallback (AI omitted combatUpdate)',
    },
  };
  log.info({ enemy: enemy.name, playerAction: playerAction?.slice(0, 80) }, 'Injected combat fallback');
}
