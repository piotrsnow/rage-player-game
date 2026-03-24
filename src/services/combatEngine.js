import { rollD100, calculateSL, getBonus } from './gameState';
import { getHitLocation, getWeaponData, getArmourAP, MANOEUVRES } from '../data/wfrpCombat';
import { rollCriticalWound, getCriticalEffectSummary } from '../data/wfrpCriticals';
import { performCastingTest } from './magicEngine';

function rollInitiative(combatant) {
  const agi = combatant.characteristics?.ag || combatant.characteristics?.i || 30;
  const d10 = Math.floor(Math.random() * 10) + 1;
  return agi + d10;
}

export function createCombatState(playerCharacter, enemies, allies = []) {
  const combatants = [];

  combatants.push({
    id: 'player',
    name: playerCharacter.name,
    type: 'player',
    characteristics: { ...playerCharacter.characteristics },
    wounds: playerCharacter.wounds,
    maxWounds: playerCharacter.maxWounds,
    skills: { ...playerCharacter.skills },
    talents: [...(playerCharacter.talents || [])],
    inventory: [...(playerCharacter.inventory || [])],
    advantage: 0,
    initiative: 0,
    conditions: [],
    isDefeated: false,
  });

  for (const ally of allies) {
    combatants.push({
      id: `ally_${ally.name.toLowerCase().replace(/\s+/g, '_')}`,
      name: ally.name,
      type: 'ally',
      characteristics: { ...ally.characteristics },
      wounds: ally.wounds ?? ally.maxWounds ?? 10,
      maxWounds: ally.maxWounds ?? 10,
      skills: { ...ally.skills },
      talents: ally.talents || [],
      inventory: ally.inventory || [],
      advantage: 0,
      initiative: 0,
      conditions: [],
      isDefeated: false,
    });
  }

  for (const enemy of enemies) {
    combatants.push({
      id: `enemy_${enemy.name.toLowerCase().replace(/\s+/g, '_')}_${Math.random().toString(36).slice(2, 5)}`,
      name: enemy.name,
      type: 'enemy',
      characteristics: { ...enemy.characteristics },
      wounds: enemy.wounds ?? enemy.maxWounds ?? 10,
      maxWounds: enemy.maxWounds ?? 10,
      skills: { ...enemy.skills },
      talents: enemy.talents || [],
      traits: enemy.traits || [],
      armour: enemy.armour || {},
      weapons: enemy.weapons || ['Hand Weapon'],
      advantage: 0,
      initiative: 0,
      conditions: [],
      isDefeated: false,
    });
  }

  for (const c of combatants) {
    c.initiative = rollInitiative(c);
  }
  combatants.sort((a, b) => b.initiative - a.initiative);

  return {
    active: true,
    round: 1,
    turnIndex: 0,
    combatants,
    log: [`Combat begins! Round 1.`],
    resolved: false,
  };
}

function getSkillValue(combatant, skillKey) {
  const charKey = skillKey === 'Dodge' ? 'ag'
    : skillKey.startsWith('Melee') ? 'ws'
    : skillKey.startsWith('Ranged') ? 'bs'
    : skillKey === 'Athletics' ? 'ag'
    : skillKey === 'Channelling' ? 'wp'
    : 'ws';
  const baseChar = combatant.characteristics?.[charKey] || 30;
  const advances = combatant.skills?.[skillKey] || 0;
  return baseChar + advances;
}

function getCombatantAP(combatant, location) {
  if (combatant.armour && typeof combatant.armour === 'object' && !Array.isArray(combatant.armour)) {
    return combatant.armour[location] || 0;
  }
  const armourNames = (combatant.inventory || [])
    .filter((i) => (typeof i === 'string' ? i : i.type) === 'armour')
    .map((i) => (typeof i === 'string' ? i : i.name));
  return getArmourAP(armourNames, location);
}

export function resolveManoeuvre(combat, actorId, manoeuvreKey, targetId) {
  const state = { ...combat, combatants: combat.combatants.map((c) => ({ ...c })) };
  const actor = state.combatants.find((c) => c.id === actorId);
  const target = targetId ? state.combatants.find((c) => c.id === targetId) : null;
  const manoeuvre = MANOEUVRES[manoeuvreKey];

  if (!actor || !manoeuvre) return { combat: state, result: null };

  const log = [];
  const result = { actor: actor.name, manoeuvre: manoeuvre.name, rolls: [] };

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

  if (manoeuvre.modifiers.flee) {
    const skill = manoeuvre.skill || 'Athletics';
    const target_num = getSkillValue(actor, skill);
    const roll = rollD100();
    const sl = calculateSL(roll, target_num);
    const success = roll <= 4 || (roll <= target_num && roll < 96);

    result.rolls.push({ skill, roll, target: target_num, sl, success });

    if (success) {
      actor.isDefeated = true;
      actor.conditions.push('fled');
      log.push(`${actor.name} flees combat! (${roll} vs ${target_num}, SL ${sl})`);
      result.outcome = 'fled';
    } else {
      if (actor.advantage > 0) actor.advantage = Math.max(0, actor.advantage - 1);
      log.push(`${actor.name} fails to flee! (${roll} vs ${target_num}, SL ${sl})`);
      result.outcome = 'failed_flee';
    }
    state.log = [...state.log, ...log];
    return { combat: state, result };
  }

  if (manoeuvre.type === 'magic' && target) {
    const knownSpells = actor.knownSpells || [];
    const spell = knownSpells[0] || { name: 'Magic Dart', cn: 0, damage: '+WPB', lore: 'petty' };
    const castResult = performCastingTest(actor, spell, 0);

    result.rolls.push({
      skill: 'Language (Magick)',
      roll: castResult.roll,
      target: castResult.target,
      sl: castResult.sl,
      success: castResult.success,
      side: 'caster',
    });

    if (castResult.success) {
      const wpb = getBonus(actor.characteristics?.wp || 30);
      const rawDamage = wpb + castResult.totalSL;
      const tb = getBonus(target.characteristics?.t || 30);
      const totalDamage = Math.max(0, rawDamage - tb);

      target.wounds = Math.max(0, target.wounds - totalDamage);
      if (target.wounds <= 0) target.isDefeated = true;
      if (target.advantage > 0) target.advantage = 0;
      actor.advantage += 1;

      log.push(
        `${actor.name} casts ${spell.name} at ${target.name}: ${castResult.roll} vs ${castResult.target} (SL ${castResult.sl}). ` +
        `Damage: ${rawDamage} - ${tb} TB = ${totalDamage} wounds.` +
        `${castResult.miscast ? ` MISCAST: ${castResult.miscastResult?.description || 'Magical backlash!'}` : ''}` +
        `${target.isDefeated ? ` ${target.name} is defeated!` : ''}`
      );
      result.outcome = 'hit';
      result.damage = totalDamage;
      result.targetDefeated = target.isDefeated;
    } else {
      if (actor.advantage > 0) actor.advantage = Math.max(0, actor.advantage - 1);
      log.push(
        `${actor.name} attempts to cast ${spell.name} at ${target.name}: ${castResult.roll} vs ${castResult.target} (SL ${castResult.sl}). Spell fizzles!` +
        `${castResult.miscast ? ` MISCAST: ${castResult.miscastResult?.description || 'Magical backlash!'}` : ''}`
      );
      result.outcome = 'miss';
    }

    if (castResult.miscast) {
      result.miscast = castResult.miscastResult;
    }

    state.log = [...state.log, ...log];
    return { combat: state, result };
  }

  if (manoeuvre.type === 'offensive' && target) {
    const attackSkill = manoeuvre.skill || 'Melee (Basic)';
    const attackTarget = getSkillValue(actor, attackSkill) + (actor.advantage * 10);

    const defenseSkill = target.conditions.includes('dodging') ? 'Dodge'
      : (manoeuvre.opposed || 'Melee (Basic)');
    let defenseTarget = getSkillValue(target, defenseSkill);
    if (target.conditions.includes('defending')) defenseTarget += 20;

    const attackRoll = rollD100();
    const defenseRoll = rollD100();
    const attackSL = calculateSL(attackRoll, attackTarget);
    const defenseSL = calculateSL(defenseRoll, defenseTarget);

    const attackCrit = attackRoll >= 1 && attackRoll <= 4;
    const attackFumble = attackRoll >= 96;
    const attackSuccess = attackCrit || (!attackFumble && attackRoll <= attackTarget);

    result.rolls.push(
      { skill: attackSkill, roll: attackRoll, target: attackTarget, sl: attackSL, success: attackSuccess, side: 'attacker' },
      { skill: defenseSkill, roll: defenseRoll, target: defenseTarget, sl: defenseSL, success: defenseRoll <= defenseTarget, side: 'defender' },
    );

    const netSL = attackSL - defenseSL;

    if (attackSuccess && netSL >= 0) {
      actor.advantage += 1;
      if (manoeuvre.modifiers.chargeBonus) actor.advantage += 1;

      const hitLoc = getHitLocation(attackRoll);
      const sb = getBonus(actor.characteristics?.s || 30);

      const mainWeapon = (actor.weapons || actor.inventory || [])
        .map((w) => (typeof w === 'string' ? w : w.name))
        .find((w) => getWeaponData(w)) || 'Hand Weapon';
      const weaponData = getWeaponData(mainWeapon);

      let weaponDmg = sb;
      const dmgStr = weaponData.damage || '+SB';
      if (dmgStr.includes('+SB+')) {
        weaponDmg = sb + parseInt(dmgStr.split('+SB+')[1], 10);
      } else if (dmgStr.includes('+SB-')) {
        weaponDmg = sb - parseInt(dmgStr.split('+SB-')[1], 10);
      } else if (dmgStr.startsWith('+') && !dmgStr.includes('SB')) {
        weaponDmg = parseInt(dmgStr.slice(1), 10);
      }

      const rawDamage = weaponDmg + netSL;
      const tb = getBonus(target.characteristics?.t || 30);
      const ap = getCombatantAP(target, hitLoc);
      const totalDamage = Math.max(0, rawDamage - tb - ap);

      target.wounds = Math.max(0, target.wounds - totalDamage);
      if (target.wounds <= 0) {
        target.isDefeated = true;
      }

      if (target.advantage > 0) target.advantage = 0;

      if (manoeuvre.modifiers.feint) {
        actor.advantage += 1;
        log.push(`${actor.name} feints ${target.name}! Gains extra Advantage.`);
      }

      const isDoubles = attackRoll > 0 && attackRoll.toString().length === 2 &&
        attackRoll.toString()[0] === attackRoll.toString()[1];

      let criticalWound = null;
      if ((isDoubles && attackSuccess) || target.wounds <= 0) {
        const severity = target.wounds <= 0 ? 'severe' : null;
        criticalWound = rollCriticalWound(hitLoc, severity);
        if (!target.criticalWounds) target.criticalWounds = [];
        target.criticalWounds.push(criticalWound);

        if (criticalWound.mechanical?.death) {
          target.isDefeated = true;
        }
      }

      log.push(
        `${actor.name} attacks ${target.name}: ${attackRoll} vs ${attackTarget} (SL ${attackSL}), ` +
        `${target.name} defends: ${defenseRoll} vs ${defenseTarget} (SL ${defenseSL}). ` +
        `Hit ${hitLoc}! Damage: ${rawDamage} - ${tb} TB - ${ap} AP = ${totalDamage} wounds.` +
        `${target.isDefeated ? ` ${target.name} is defeated!` : ''}` +
        `${criticalWound ? ` CRITICAL: ${getCriticalEffectSummary(criticalWound)}` : ''}`
      );

      result.outcome = 'hit';
      result.damage = totalDamage;
      result.hitLocation = hitLoc;
      result.isDoubles = isDoubles && attackSuccess;
      result.criticalWound = criticalWound;
      result.targetDefeated = target.isDefeated;
    } else {
      if (actor.advantage > 0) actor.advantage = Math.max(0, actor.advantage - 1);
      target.advantage += 1;

      log.push(
        `${actor.name} attacks ${target.name}: ${attackRoll} vs ${attackTarget} (SL ${attackSL}), ` +
        `${target.name} defends: ${defenseRoll} vs ${defenseTarget} (SL ${defenseSL}). Miss!`
      );
      result.outcome = 'miss';
    }

    target.conditions = target.conditions.filter((c) => c !== 'defending' && c !== 'dodging');
  }

  state.log = [...state.log, ...log];
  return { combat: state, result };
}

export function advanceRound(combat) {
  const state = { ...combat, combatants: combat.combatants.map((c) => ({ ...c })) };

  for (const c of state.combatants) {
    c.conditions = c.conditions.filter((cond) => cond !== 'defending' && cond !== 'dodging');
  }

  state.round += 1;
  state.turnIndex = 0;
  state.log = [...state.log, `--- Round ${state.round} ---`];
  return state;
}

export function advanceTurn(combat) {
  const state = { ...combat };
  const activeCombatants = state.combatants.filter((c) => !c.isDefeated);
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

export function getEnemyAction(combat, enemyId) {
  const enemy = combat.combatants.find((c) => c.id === enemyId);
  if (!enemy || enemy.isDefeated) return null;

  const playerTargets = combat.combatants.filter(
    (c) => (c.type === 'player' || c.type === 'ally') && !c.isDefeated
  );
  if (playerTargets.length === 0) return null;

  const target = playerTargets[Math.floor(Math.random() * playerTargets.length)];

  if (enemy.wounds < enemy.maxWounds * 0.2 && Math.random() < 0.3) {
    return { manoeuvre: 'flee', targetId: target.id };
  }

  if (enemy.advantage === 0 && Math.random() < 0.2) {
    return { manoeuvre: 'feint', targetId: target.id };
  }

  if (Math.random() < 0.15) {
    return { manoeuvre: 'charge', targetId: target.id };
  }

  return { manoeuvre: 'attack', targetId: target.id };
}

export function resolveEnemyTurns(combat) {
  let state = { ...combat, combatants: combat.combatants.map((c) => ({ ...c })) };
  const results = [];

  while (state.turnIndex < state.combatants.length) {
    const current = state.combatants[state.turnIndex];
    if (current.isDefeated) {
      state.turnIndex++;
      continue;
    }
    if (current.type === 'player') break;

    const action = getEnemyAction(state, current.id);
    if (action) {
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

export function endCombat(combat, playerCharacter) {
  const playerCombatant = combat.combatants.find((c) => c.type === 'player');
  const woundsLost = playerCombatant
    ? playerCharacter.wounds - playerCombatant.wounds
    : 0;

  const enemiesDefeated = combat.combatants.filter((c) => c.type === 'enemy' && c.isDefeated).length;
  const totalEnemies = combat.combatants.filter((c) => c.type === 'enemy').length;

  const playerCriticals = playerCombatant?.criticalWounds || [];

  return {
    woundsChange: woundsLost > 0 ? -woundsLost : 0,
    xp: Math.max(10, enemiesDefeated * 15 + combat.round * 5),
    criticalWounds: playerCriticals,
    enemiesDefeated,
    totalEnemies,
    rounds: combat.round,
    playerSurvived: playerCombatant ? !playerCombatant.isDefeated : false,
  };
}

export function surrenderCombat(combat, playerCharacter) {
  const playerCombatant = combat.combatants.find((c) => c.type === 'player');
  const woundsLost = playerCombatant
    ? playerCharacter.wounds - playerCombatant.wounds
    : 0;

  const enemiesDefeated = combat.combatants.filter((c) => c.type === 'enemy' && c.isDefeated).length;
  const totalEnemies = combat.combatants.filter((c) => c.type === 'enemy').length;

  const remainingEnemies = combat.combatants
    .filter((c) => c.type === 'enemy' && !c.isDefeated)
    .map((c) => ({ name: c.name, wounds: c.wounds, maxWounds: c.maxWounds }));

  const playerCriticals = playerCombatant?.criticalWounds || [];

  return {
    outcome: 'surrender',
    woundsChange: woundsLost > 0 ? -woundsLost : 0,
    xp: Math.max(5, Math.floor((enemiesDefeated * 15 + combat.round * 3) * 0.5)),
    criticalWounds: playerCriticals,
    enemiesDefeated,
    totalEnemies,
    remainingEnemies,
    rounds: combat.round,
    playerSurvived: true,
    reason: combat.reason || '',
  };
}
