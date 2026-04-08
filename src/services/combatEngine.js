import { rollD50, rollPercentage } from './gameState';
import { gameData } from './gameDataService';
import { DIFFICULTY_THRESHOLDS } from '../data/rpgSystem';
import { calculateCreativityBonus } from './mechanics/creativityBonus';
import { resolveD50Test } from './mechanics/d50Test';
import { castSpell } from './magicEngine.js';

const getWeaponData = (name) => gameData.getWeaponData(name);
const getArmourAP = (items, loc) => gameData.getArmourAP(items, loc);

function getMainWeapon(actor) {
  if (actor.equippedWeapon && getWeaponData(actor.equippedWeapon)) {
    return actor.equippedWeapon;
  }
  return (actor.weapons || actor.inventory || [])
    .map((w) => (typeof w === 'string' ? w : w.name))
    .find((w) => getWeaponData(w)) || 'Hand Weapon';
}

function getMovementAllowance(combatant) {
  return combatant.movement || combatant.attributes?.zrecznosc
    ? Math.max(3, Math.floor((combatant.attributes?.zrecznosc || 10) / 3))
    : gameData.DEFAULT_MOVEMENT;
}

function assignInitialPositions(combatants) {
  const friendlies = combatants.filter((c) => c.type === 'player' || c.type === 'ally');
  const enemies = combatants.filter((c) => c.type === 'enemy');
  friendlies.forEach((c, i) => { c.position = 2 + i * 2; });
  enemies.forEach((c, i) => { c.position = gameData.BATTLEFIELD_MAX - 2 - i * 2; });
}

export function getDistance(a, b) {
  return Math.abs((a.position ?? 0) - (b.position ?? 0));
}

export function isInMeleeRange(a, b) {
  return getDistance(a, b) <= gameData.MELEE_RANGE;
}

const COMBAT_CREATIVITY_KEYWORDS = [
  'wall', 'table', 'chair', 'barrel', 'torch', 'rope', 'chain', 'sand', 'mud', 'stairs',
  'flank', 'spin', 'twist', 'leap', 'feint', 'shoulder', 'kick', 'pommel', 'shield',
  'scabbard', 'window', 'pillar', 'ground', 'helmet',
];

function sanitizeCombatDescription(description) {
  return typeof description === 'string' ? description.trim() : '';
}

function getCombatCreativityBonus(description) {
  return calculateCreativityBonus(description, COMBAT_CREATIVITY_KEYWORDS);
}

// --- New RPG system: attribute-based combat ---

function getAttackAttribute(actor) {
  // Melee uses Sila, ranged uses Zrecznosc
  return actor.attributes?.sila || actor.characteristics?.ws || 10;
}

function getDefenseAttribute(actor) {
  return actor.attributes?.zrecznosc || actor.characteristics?.ag || 10;
}

function getStrength(actor) {
  return actor.attributes?.sila || Math.floor((actor.characteristics?.s || 30) / 5);
}

function getToughness(actor) {
  return actor.attributes?.wytrzymalosc || Math.floor((actor.characteristics?.t || 30) / 5);
}

function getCombatSkillLevel(actor, skillName) {
  const entry = actor.skills?.[skillName];
  if (!entry) return 0;
  return typeof entry === 'object' ? (entry.level || 0) : entry;
}

function rollInitiative(combatant) {
  const zrecznosc = combatant.attributes?.zrecznosc || Math.floor((combatant.characteristics?.ag || combatant.characteristics?.i || 30) / 3);
  return rollD50() + zrecznosc;
}

function getLuck(actor) {
  return actor.attributes?.szczescie || 0;
}

function resolveCombatTest(actor, attribute, skillLevel, creativityBonus = 0, threshold = DIFFICULTY_THRESHOLDS.medium) {
  return resolveD50Test({ attribute, skillLevel, creativityBonus, threshold, luck: getLuck(actor) });
}

function getWeaponDamage(weaponData, strength) {
  const dmgStr = weaponData?.damage || '+SB';
  if (dmgStr.includes('SB')) {
    const match = dmgStr.match(/\+SB([+-]\d+)?/);
    const mod = match?.[1] ? parseInt(match[1], 10) : 0;
    return strength + mod;
  }
  const staticMod = parseInt(dmgStr.replace('+', ''), 10) || 0;
  return staticMod;
}

function getCombatantAP(combatant) {
  // Simple: sum all armour values, average across body
  if (combatant.armour && typeof combatant.armour === 'object' && !Array.isArray(combatant.armour)) {
    const values = Object.values(combatant.armour).filter((v) => typeof v === 'number');
    if (values.length > 0) return Math.round(values.reduce((s, v) => s + v, 0) / values.length);
  }
  return 0;
}

// --- Combat state creation ---

function createCombatantFromCharacter(character, id, type) {
  return {
    id,
    name: character.name,
    type,
    attributes: character.attributes ? { ...character.attributes } : null,
    characteristics: character.characteristics ? { ...character.characteristics } : null,
    wounds: character.wounds ?? character.maxWounds ?? 10,
    maxWounds: character.maxWounds ?? 10,
    skills: character.skills ? { ...character.skills } : {},
    mana: character.mana ? { ...character.mana } : null,
    spells: character.spells || null,
    inventory: [...(character.inventory || [])],
    equippedWeapon: character.equippedWeapon || '',
    weapons: character.weapons || [],
    armour: character.armour || {},
    traits: character.traits || [],
    initiative: 0,
    conditions: [],
    isDefeated: false,
    position: 0,
    movementUsed: 0,
    movementAllowance: getMovementAllowance(character),
  };
}

export function createCombatState(playerCharacter, enemies, allies = []) {
  const combatants = [];

  combatants.push(createCombatantFromCharacter(playerCharacter, 'player', 'player'));

  for (const ally of allies) {
    combatants.push(createCombatantFromCharacter(ally,
      `ally_${ally.name.toLowerCase().replace(/\s+/g, '_')}`, 'ally'));
  }

  for (const enemy of enemies) {
    combatants.push(createCombatantFromCharacter(enemy,
      `enemy_${enemy.name.toLowerCase().replace(/\s+/g, '_')}_${Math.random().toString(36).slice(2, 5)}`, 'enemy'));
  }

  assignInitialPositions(combatants);

  for (const c of combatants) {
    c.initiative = rollInitiative(c);
  }
  combatants.sort((a, b) => b.initiative - a.initiative);

  return {
    active: true,
    round: 1,
    turnIndex: 0,
    combatants,
    log: ['Combat begins! Round 1.'],
    resolved: false,
  };
}

export function moveCombatant(combat, actorId, targetPosition) {
  const state = { ...combat, combatants: combat.combatants.map((c) => ({ ...c })) };
  const actor = state.combatants.find((c) => c.id === actorId);
  if (!actor || actor.isDefeated) return { combat: state, moved: false };

  const clampedTarget = Math.max(0, Math.min(gameData.BATTLEFIELD_MAX, Math.round(targetPosition)));
  const dist = Math.abs(clampedTarget - (actor.position ?? 0));
  const remaining = actor.movementAllowance - (actor.movementUsed || 0);
  if (dist === 0 || dist > remaining) return { combat: state, moved: false };

  actor.movementUsed = (actor.movementUsed || 0) + dist;
  actor.position = clampedTarget;
  return { combat: state, moved: true, distance: dist };
}

// --- Manoeuvre resolution ---

export function resolveManoeuvre(combat, actorId, manoeuvreKey, targetId, options = {}) {
  const state = { ...combat, combatants: combat.combatants.map((c) => ({ ...c })) };
  const actor = state.combatants.find((c) => c.id === actorId);
  const target = targetId ? state.combatants.find((c) => c.id === targetId) : null;
  const manoeuvre = gameData.manoeuvres[manoeuvreKey];
  const customDescription = sanitizeCombatDescription(options.customDescription);

  if (!actor || !manoeuvre) return { combat: state, result: null };

  if (target && manoeuvre.range === 'melee' && !isInMeleeRange(actor, target)) {
    return {
      combat: state,
      result: {
        actor: actor.name, actorId: actor.id, actorType: actor.type,
        manoeuvre: manoeuvre.name, manoeuvreKey,
        targetId: target.id, targetName: target.name,
        outcome: 'out_of_range', distance: getDistance(actor, target), rolls: [],
      },
    };
  }

  if (target && manoeuvre.closesDistance) {
    const dir = target.position > actor.position ? 1 : -1;
    actor.position = target.position - dir;
    actor.position = Math.max(0, Math.min(gameData.BATTLEFIELD_MAX, actor.position));
  }

  const log = [];
  const result = {
    actor: actor.name, actorId: actor.id, actorType: actor.type,
    manoeuvre: manoeuvre.name, manoeuvreKey,
    targetId: target?.id || null, targetType: target?.type || null,
    rolls: [],
  };

  // Defensive manoeuvres
  if (manoeuvre.type === 'defensive') {
    if (manoeuvreKey === 'defend') {
      actor.conditions = [...actor.conditions.filter((c) => c !== 'defending'), 'defending'];
      log.push(`${actor.name} takes a defensive stance.`);
    } else if (manoeuvreKey === 'dodge') {
      actor.conditions = [...actor.conditions.filter((c) => c !== 'dodging'), 'dodging'];
      log.push(`${actor.name} prepares to dodge.`);
    }
    result.outcome = 'defensive';
    state.log = [...state.log, ...log];
    return { combat: state, result };
  }

  // Flee
  if (manoeuvre.modifiers.flee) {
    const zrecznosc = getDefenseAttribute(actor);
    const skillLevel = getCombatSkillLevel(actor, 'Atletyka');
    const test = resolveCombatTest(actor, zrecznosc, skillLevel, 0, DIFFICULTY_THRESHOLDS.medium);

    result.rolls.push({ skill: 'Atletyka', ...test, side: 'actor' });

    if (test.success) {
      actor.isDefeated = true;
      actor.conditions.push('fled');
      log.push(`${actor.name} flees combat! (${test.total} vs ${test.threshold}, margin ${test.margin})`);
      result.outcome = 'fled';
    } else {
      log.push(`${actor.name} fails to flee! (${test.total} vs ${test.threshold}, margin ${test.margin})`);
      result.outcome = 'failed_flee';
    }
    state.log = [...state.log, ...log];
    return { combat: state, result };
  }

  // Magic — delegate mana/usage to magicEngine, then resolve combat test
  if (manoeuvre.type === 'magic' && target) {
    result.targetName = target.name;
    const spellName = manoeuvre.spellName;

    // If a spell name is provided, use magicEngine for mana check + usage tracking
    if (spellName) {
      const castResult = castSpell(actor, spellName);
      result.castResult = castResult;
      if (!castResult.success) {
        log.push(`${actor.name} tries to cast "${spellName}" but fails: ${castResult.error}`);
        result.outcome = 'spell_failed';
        state.log = [...state.log, ...log];
        return { combat: state, result };
      }
      // Apply mana deduction + spell usage to actor
      if (actor.mana) actor.mana.current = Math.max(0, actor.mana.current + castResult.manaChange);
      if (!actor.spells) actor.spells = { known: [], usageCounts: {}, scrolls: [] };
      const counts = actor.spells.usageCounts || {};
      counts[spellName] = (counts[spellName] || 0) + 1;
      actor.spells.usageCounts = counts;
    }

    const inteligencja = actor.attributes?.inteligencja || 10;
    const magicSkillLevel = getCombatSkillLevel(actor, 'Magia');
    const test = resolveCombatTest(actor, inteligencja, magicSkillLevel, 0, DIFFICULTY_THRESHOLDS.medium);
    result.rolls.push({ skill: 'Magia', ...test, side: 'caster' });

    if (test.success) {
      const baseDamage = Math.max(1, Math.floor(inteligencja / 2));
      const toughness = getToughness(target);
      const totalDamage = Math.max(1, baseDamage - Math.floor(toughness / 3));
      target.wounds = Math.max(0, target.wounds - totalDamage);
      if (target.wounds <= 0) target.isDefeated = true;

      const spellLabel = spellName ? `"${spellName}"` : 'a spell';
      log.push(`${actor.name} casts ${spellLabel} at ${target.name}: ${test.total} vs ${test.threshold}. Damage: ${totalDamage}.${target.isDefeated ? ` ${target.name} is defeated!` : ''}`);
      result.outcome = 'hit';
      result.damage = totalDamage;
      result.targetDefeated = target.isDefeated;
    } else {
      log.push(`${actor.name} tries to cast a spell at ${target.name}: ${test.total} vs ${test.threshold}. Spell fizzles!`);
      result.outcome = 'miss';
    }
    state.log = [...state.log, ...log];
    return { combat: state, result };
  }

  // Offensive (attack/charge/feint)
  if (manoeuvre.type === 'offensive' && target) {
    result.targetName = target.name;
    const isRanged = manoeuvre.skill?.startsWith('Ranged');
    const attackAttr = isRanged ? getDefenseAttribute(actor) : getAttackAttribute(actor);
    const attackSkillName = isRanged ? 'Celnosc' : 'Walka bronia jednoręczna';
    const attackSkillLevel = getCombatSkillLevel(actor, attackSkillName);
    const creativityBonus = getCombatCreativityBonus(customDescription);

    // Defender raises threshold
    const defendBonus = target.conditions.includes('defending') ? 10 : 0;
    const dodging = target.conditions.includes('dodging');
    const defenseAttr = getDefenseAttribute(target);
    const defenseSkillLevel = dodging ? getCombatSkillLevel(target, 'Uniki') : 0;
    const effectiveThreshold = DIFFICULTY_THRESHOLDS.medium + defendBonus + defenseAttr + defenseSkillLevel;

    const test = resolveCombatTest(actor, attackAttr, attackSkillLevel, creativityBonus, effectiveThreshold);

    result.rolls.push({
      skill: attackSkillName, ...test, side: 'attacker',
    });
    result.customDescription = customDescription || null;
    result.creativityBonus = creativityBonus;
    result.attackBreakdown = { attribute: attackAttr, skillLevel: attackSkillLevel, creativityBonus, threshold: effectiveThreshold };
    result.defenseBreakdown = { attribute: defenseAttr, skillLevel: defenseSkillLevel, defendBonus };

    if (test.success) {
      // Damage = Strength + weapon bonus - Toughness - AP
      const strength = getStrength(actor);
      const mainWeapon = getMainWeapon(actor);
      const weaponData = getWeaponData(mainWeapon);
      result.weaponName = mainWeapon;
      const weaponDmg = getWeaponDamage(weaponData, strength);
      const marginBonus = Math.max(0, Math.floor(test.margin / 5));
      const rawDamage = weaponDmg + marginBonus;
      const toughness = getToughness(target);
      const ap = getCombatantAP(target);
      const totalDamage = Math.max(1, rawDamage - toughness - ap);

      target.wounds = Math.max(0, target.wounds - totalDamage);
      if (target.wounds <= 0) target.isDefeated = true;

      if (manoeuvre.modifiers.feint) {
        log.push(`${actor.name} feints ${target.name}! Next attack will be easier.`);
      }

      log.push(
        `${actor.name} attacks ${target.name}: ${test.total} vs ${effectiveThreshold} (margin ${test.margin}). ` +
        `${test.luckySuccess ? 'LUCKY HIT! ' : ''}` +
        `Damage: ${rawDamage} - ${toughness} tough - ${ap} AP = ${totalDamage}.` +
        `${target.isDefeated ? ` ${target.name} is defeated!` : ''}`
      );

      result.outcome = 'hit';
      result.damage = totalDamage;
      result.damageBreakdown = { weaponDmg, marginBonus, rawDamage, toughness, ap, totalDamage };
      result.targetDefeated = target.isDefeated;
    } else {
      const mainWeapon = getMainWeapon(actor);
      result.weaponName = mainWeapon;
      log.push(
        `${actor.name} attacks ${target.name}: ${test.total} vs ${effectiveThreshold} (margin ${test.margin}). Miss!`
      );
      result.outcome = 'miss';
    }

    target.conditions = target.conditions.filter((c) => c !== 'defending' && c !== 'dodging');
  }

  state.log = [...state.log, ...log];
  return { combat: state, result };
}

// --- Turn/round management ---

export function advanceRound(combat) {
  const state = { ...combat, combatants: combat.combatants.map((c) => ({ ...c })) };
  for (const c of state.combatants) {
    c.conditions = c.conditions.filter((cond) => cond !== 'defending' && cond !== 'dodging');
    c.movementUsed = 0;
  }
  state.round += 1;
  state.turnIndex = 0;
  state.log = [...state.log, `--- Round ${state.round} ---`];
  return state;
}

export function advanceTurn(combat) {
  const state = { ...combat };
  let nextIndex = state.turnIndex + 1;
  while (nextIndex < state.combatants.length && state.combatants[nextIndex].isDefeated) {
    nextIndex++;
  }
  if (nextIndex >= state.combatants.length) {
    return advanceRound(state);
  }
  return { ...state, turnIndex: nextIndex };
}

export function getCurrentTurnCombatant(combat) {
  if (!combat || !combat.combatants) return null;
  return combat.combatants[combat.turnIndex] || null;
}

export function isCombatOver(combat) {
  if (!combat?.combatants) return true;
  const activeEnemies = combat.combatants.filter((c) => c.type === 'enemy' && !c.isDefeated);
  const activeFriendly = combat.combatants.filter((c) => (c.type === 'player' || c.type === 'ally') && !c.isDefeated);
  return activeEnemies.length === 0 || activeFriendly.length === 0;
}

export function isPlayerWinning(combat) {
  if (!combat?.combatants) return false;
  const activeFriendly = combat.combatants.filter((c) => (c.type === 'player' || c.type === 'ally') && !c.isDefeated);
  if (activeFriendly.length === 0) return false;
  const enemies = combat.combatants.filter((c) => c.type === 'enemy');
  if (enemies.length === 0) return false;
  const anyEnemyDefeated = enemies.some((c) => c.isDefeated);
  const totalEnemyHp = enemies.reduce((sum, c) => sum + c.maxWounds, 0);
  const currentEnemyHp = enemies.reduce((sum, c) => sum + Math.max(0, c.wounds), 0);
  const enemyHpBelow50 = totalEnemyHp > 0 && currentEnemyHp / totalEnemyHp < 0.5;
  return anyEnemyDefeated || enemyHpBelow50;
}

// --- Enemy AI ---

export function getEnemyAction(combat, enemyId) {
  const enemy = combat.combatants.find((c) => c.id === enemyId);
  if (!enemy || enemy.isDefeated) return null;

  const playerTargets = combat.combatants.filter(
    (c) => (c.type === 'player' || c.type === 'ally') && !c.isDefeated
  );
  if (playerTargets.length === 0) return null;

  const closest = playerTargets.reduce((best, t) => {
    const d = getDistance(enemy, t);
    return !best || d < best.dist ? { target: t, dist: d } : best;
  }, null);
  const target = closest.target;
  const dist = closest.dist;

  // Flee at low HP
  if (enemy.wounds < enemy.maxWounds * 0.2 && Math.random() < 0.3) {
    return { manoeuvre: 'flee', targetId: target.id };
  }

  const inMelee = dist <= gameData.MELEE_RANGE;

  if (!inMelee) {
    return { manoeuvre: 'charge', targetId: target.id, moveToward: target.id };
  }

  if (Math.random() < 0.15) {
    return { manoeuvre: 'feint', targetId: target.id };
  }

  return { manoeuvre: 'attack', targetId: target.id };
}

export function resolveEnemyTurns(combat) {
  let state = { ...combat, combatants: combat.combatants.map((c) => ({ ...c })) };
  const results = [];

  while (state.turnIndex < state.combatants.length) {
    const current = state.combatants[state.turnIndex];
    if (current.isDefeated) { state.turnIndex++; continue; }
    if (current.type === 'player') break;

    const action = getEnemyAction(state, current.id);
    if (action) {
      if (action.moveToward) {
        const moveTarget = state.combatants.find((c) => c.id === action.moveToward);
        if (moveTarget && !isInMeleeRange(current, moveTarget) && !gameData.manoeuvres[action.manoeuvre]?.closesDistance) {
          const dir = moveTarget.position > current.position ? 1 : -1;
          const remaining = current.movementAllowance - (current.movementUsed || 0);
          const moveDist = Math.min(remaining, getDistance(current, moveTarget) - 1);
          if (moveDist > 0) {
            current.position = Math.max(0, Math.min(gameData.BATTLEFIELD_MAX, current.position + dir * moveDist));
            current.movementUsed = (current.movementUsed || 0) + moveDist;
          }
        }
      }
      const { combat: updated, result } = resolveManoeuvre(state, current.id, action.manoeuvre, action.targetId);
      state = updated;
      if (result) results.push(result);
    }

    state.turnIndex++;
    if (isCombatOver(state)) break;
  }

  if (state.turnIndex >= state.combatants.length) {
    state = advanceRound(state);
  }

  return { combat: state, results };
}

// --- Combat end ---

export function endCombat(combat, playerCharacter) {
  const playerCombatant = combat.combatants.find((c) => c.type === 'player');
  const woundsLost = playerCombatant ? playerCharacter.wounds - playerCombatant.wounds : 0;
  const enemiesDefeated = combat.combatants.filter((c) => c.type === 'enemy' && c.isDefeated).length;
  const totalEnemies = combat.combatants.filter((c) => c.type === 'enemy').length;

  return {
    woundsChange: woundsLost > 0 ? -woundsLost : 0,
    xp: Math.max(10, enemiesDefeated * 15 + combat.round * 5),
    enemiesDefeated,
    totalEnemies,
    rounds: combat.round,
    playerSurvived: playerCombatant ? !playerCombatant.isDefeated : false,
  };
}

export function surrenderCombat(combat, playerCharacter) {
  const playerCombatant = combat.combatants.find((c) => c.type === 'player');
  const woundsLost = playerCombatant ? playerCharacter.wounds - playerCombatant.wounds : 0;
  const enemiesDefeated = combat.combatants.filter((c) => c.type === 'enemy' && c.isDefeated).length;
  const totalEnemies = combat.combatants.filter((c) => c.type === 'enemy').length;
  const remainingEnemies = combat.combatants
    .filter((c) => c.type === 'enemy' && !c.isDefeated)
    .map((c) => ({ name: c.name, wounds: c.wounds, maxWounds: c.maxWounds }));

  return {
    outcome: 'surrender',
    woundsChange: woundsLost > 0 ? -woundsLost : 0,
    xp: Math.max(5, Math.floor((enemiesDefeated * 15 + combat.round * 3) * 0.5)),
    enemiesDefeated, totalEnemies, remainingEnemies,
    rounds: combat.round, playerSurvived: true, reason: combat.reason || '',
  };
}

export function forceTruceCombat(combat, playerCharacter) {
  const playerCombatant = combat.combatants.find((c) => c.type === 'player');
  const woundsLost = playerCombatant ? playerCharacter.wounds - playerCombatant.wounds : 0;
  const enemiesDefeated = combat.combatants.filter((c) => c.type === 'enemy' && c.isDefeated).length;
  const totalEnemies = combat.combatants.filter((c) => c.type === 'enemy').length;
  const remainingEnemies = combat.combatants
    .filter((c) => c.type === 'enemy' && !c.isDefeated)
    .map((c) => ({ name: c.name, wounds: c.wounds, maxWounds: c.maxWounds }));

  return {
    outcome: 'truce',
    woundsChange: woundsLost > 0 ? -woundsLost : 0,
    xp: Math.max(8, Math.floor((enemiesDefeated * 15 + combat.round * 5) * 0.75)),
    enemiesDefeated, totalEnemies, remainingEnemies,
    rounds: combat.round, playerSurvived: true, reason: combat.reason || '',
  };
}

// --- Multiplayer combat ---

export function createMultiplayerCombatState(playerCharacters, enemies, allies = []) {
  const combatants = [];

  for (const pc of playerCharacters) {
    const c = createCombatantFromCharacter(pc, `player_${pc.odId}`, 'player');
    c.odId = pc.odId;
    combatants.push(c);
  }

  for (const ally of allies) {
    combatants.push(createCombatantFromCharacter(ally,
      `ally_${ally.name.toLowerCase().replace(/\s+/g, '_')}`, 'ally'));
  }

  for (const enemy of enemies) {
    combatants.push(createCombatantFromCharacter(enemy,
      `enemy_${enemy.name.toLowerCase().replace(/\s+/g, '_')}_${Math.random().toString(36).slice(2, 5)}`, 'enemy'));
  }

  assignInitialPositions(combatants);
  for (const c of combatants) { c.initiative = rollInitiative(c); }
  combatants.sort((a, b) => b.initiative - a.initiative);

  return {
    active: true, multiplayer: true, round: 1, turnIndex: 0,
    combatants, log: ['Combat begins! Round 1.'], resolved: false,
  };
}

export function endMultiplayerCombat(combat, playerCharacters) {
  const enemiesDefeated = combat.combatants.filter((c) => c.type === 'enemy' && c.isDefeated).length;
  const totalEnemies = combat.combatants.filter((c) => c.type === 'enemy').length;
  const baseXp = Math.max(10, enemiesDefeated * 15 + combat.round * 5);

  const perCharacter = {};
  for (const pc of playerCharacters) {
    const combatant = combat.combatants.find((c) => c.odId === pc.odId);
    if (!combatant) continue;
    const woundsLost = pc.wounds - combatant.wounds;
    perCharacter[pc.name] = {
      wounds: woundsLost > 0 ? -woundsLost : 0,
      xp: baseXp, survived: !combatant.isDefeated,
    };
  }

  return { perCharacter, enemiesDefeated, totalEnemies, rounds: combat.round,
    allSurvived: Object.values(perCharacter).every((p) => p.survived), reason: combat.reason || '' };
}

export function surrenderMultiplayerCombat(combat, playerCharacters) {
  const enemiesDefeated = combat.combatants.filter((c) => c.type === 'enemy' && c.isDefeated).length;
  const totalEnemies = combat.combatants.filter((c) => c.type === 'enemy').length;
  const baseXp = Math.max(5, Math.floor((enemiesDefeated * 15 + combat.round * 3) * 0.5));
  const remainingEnemies = combat.combatants
    .filter((c) => c.type === 'enemy' && !c.isDefeated)
    .map((c) => ({ name: c.name, wounds: c.wounds, maxWounds: c.maxWounds }));

  const perCharacter = {};
  for (const pc of playerCharacters) {
    const combatant = combat.combatants.find((c) => c.odId === pc.odId);
    if (!combatant) continue;
    const woundsLost = pc.wounds - combatant.wounds;
    perCharacter[pc.name] = { wounds: woundsLost > 0 ? -woundsLost : 0, xp: baseXp, survived: true };
  }

  return { outcome: 'surrender', perCharacter, enemiesDefeated, totalEnemies, remainingEnemies,
    rounds: combat.round, reason: combat.reason || '' };
}

export function forceTruceMultiplayerCombat(combat, playerCharacters) {
  const enemiesDefeated = combat.combatants.filter((c) => c.type === 'enemy' && c.isDefeated).length;
  const totalEnemies = combat.combatants.filter((c) => c.type === 'enemy').length;
  const baseXp = Math.max(8, Math.floor((enemiesDefeated * 15 + combat.round * 5) * 0.75));
  const remainingEnemies = combat.combatants
    .filter((c) => c.type === 'enemy' && !c.isDefeated)
    .map((c) => ({ name: c.name, wounds: c.wounds, maxWounds: c.maxWounds }));

  const perCharacter = {};
  for (const pc of playerCharacters) {
    const combatant = combat.combatants.find((c) => c.odId === pc.odId);
    if (!combatant) continue;
    const woundsLost = pc.wounds - combatant.wounds;
    perCharacter[pc.name] = { wounds: woundsLost > 0 ? -woundsLost : 0, xp: baseXp, survived: true };
  }

  return { outcome: 'truce', perCharacter, enemiesDefeated, totalEnemies, remainingEnemies,
    rounds: combat.round, reason: combat.reason || '' };
}
