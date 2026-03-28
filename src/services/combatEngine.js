import { rollD100, calculateSL, getBonus } from './gameState';
import { getHitLocation, getWeaponData, getArmourAP, MANOEUVRES, MELEE_RANGE, BATTLEFIELD_MAX, DEFAULT_MOVEMENT } from '../data/wfrpCombat';
import { rollCriticalWound, getCriticalEffectSummary } from '../data/wfrpCriticals';
import { performCastingTest } from './magicEngine';

const CRITICAL_HIT_DAMAGE_BONUS = 2;
const CRITICAL_HIT_MIN_DAMAGE = 1;
const MAX_COMBAT_CREATIVITY_BONUS = 25;

function getMovementAllowance(combatant) {
  return combatant.characteristics?.m || DEFAULT_MOVEMENT;
}

function assignInitialPositions(combatants) {
  const friendlies = combatants.filter((c) => c.type === 'player' || c.type === 'ally');
  const enemies = combatants.filter((c) => c.type === 'enemy');
  friendlies.forEach((c, i) => { c.position = 2 + i * 2; });
  enemies.forEach((c, i) => { c.position = BATTLEFIELD_MAX - 2 - i * 2; });
}

export function getDistance(a, b) {
  return Math.abs((a.position ?? 0) - (b.position ?? 0));
}

export function isInMeleeRange(a, b) {
  return getDistance(a, b) <= MELEE_RANGE;
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
  const normalized = sanitizeCombatDescription(description).toLowerCase();
  if (!normalized) return 0;

  const words = normalized.match(/[\p{L}\p{N}'-]+/gu) || [];
  const uniqueWords = new Set(words);
  const keywordHits = COMBAT_CREATIVITY_KEYWORDS.filter((keyword) => normalized.includes(keyword)).length;

  let bonus = 5;
  if (words.length >= 6) bonus += 5;
  if (words.length >= 10) bonus += 5;
  if (keywordHits >= 2) bonus += 5;
  if (words.length >= 14 && uniqueWords.size >= 10) bonus += 5;

  return Math.min(MAX_COMBAT_CREATIVITY_BONUS, bonus);
}

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
    position: 0,
    movementUsed: 0,
    movementAllowance: getMovementAllowance(playerCharacter),
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
      position: 0,
      movementUsed: 0,
      movementAllowance: getMovementAllowance(ally),
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
      position: 0,
      movementUsed: 0,
      movementAllowance: getMovementAllowance(enemy),
    });
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
    log: [`Combat begins! Round 1.`],
    resolved: false,
  };
}

export function moveCombatant(combat, actorId, targetPosition) {
  const state = { ...combat, combatants: combat.combatants.map((c) => ({ ...c })) };
  const actor = state.combatants.find((c) => c.id === actorId);
  if (!actor || actor.isDefeated) return { combat: state, moved: false };

  const clampedTarget = Math.max(0, Math.min(BATTLEFIELD_MAX, Math.round(targetPosition)));
  const dist = Math.abs(clampedTarget - (actor.position ?? 0));
  const remaining = actor.movementAllowance - (actor.movementUsed || 0);
  if (dist === 0 || dist > remaining) return { combat: state, moved: false };

  actor.movementUsed = (actor.movementUsed || 0) + dist;
  actor.position = clampedTarget;
  return { combat: state, moved: true, distance: dist };
}

function getSkillBreakdown(combatant, skillKey) {
  const charKey = skillKey === 'Dodge' ? 'ag'
    : skillKey.startsWith('Melee') ? 'ws'
    : skillKey.startsWith('Ranged') ? 'bs'
    : skillKey === 'Athletics' ? 'ag'
    : skillKey === 'Channelling' ? 'wp'
    : 'ws';
  const baseChar = combatant.characteristics?.[charKey] || 30;
  const advances = combatant.skills?.[skillKey] || 0;
  return {
    skill: skillKey,
    characteristic: charKey,
    characteristicValue: baseChar,
    skillAdvances: advances,
    baseTarget: baseChar + advances,
  };
}

function getSkillValue(combatant, skillKey) {
  return getSkillBreakdown(combatant, skillKey).baseTarget;
}

function getWeaponDamageBreakdown(weaponData, strengthBonus) {
  const dmgStr = weaponData.damage || '+SB';

  if (dmgStr.includes('+SB+')) {
    const staticModifier = parseInt(dmgStr.split('+SB+')[1], 10) || 0;
    return {
      formula: dmgStr,
      usesStrengthBonus: true,
      strengthBonus,
      staticModifier,
      total: strengthBonus + staticModifier,
    };
  }

  if (dmgStr.includes('+SB-')) {
    const staticModifier = -(parseInt(dmgStr.split('+SB-')[1], 10) || 0);
    return {
      formula: dmgStr,
      usesStrengthBonus: true,
      strengthBonus,
      staticModifier,
      total: strengthBonus + staticModifier,
    };
  }

  if (dmgStr.includes('SB')) {
    return {
      formula: dmgStr,
      usesStrengthBonus: true,
      strengthBonus,
      staticModifier: 0,
      total: strengthBonus,
    };
  }

  const staticModifier = dmgStr.startsWith('+') ? parseInt(dmgStr.slice(1), 10) || 0 : 0;
  return {
    formula: dmgStr,
    usesStrengthBonus: false,
    strengthBonus,
    staticModifier,
    total: staticModifier,
  };
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

export function resolveManoeuvre(combat, actorId, manoeuvreKey, targetId, options = {}) {
  const state = { ...combat, combatants: combat.combatants.map((c) => ({ ...c })) };
  const actor = state.combatants.find((c) => c.id === actorId);
  const target = targetId ? state.combatants.find((c) => c.id === targetId) : null;
  const manoeuvre = MANOEUVRES[manoeuvreKey];
  const customDescription = sanitizeCombatDescription(options.customDescription);

  if (!actor || !manoeuvre) return { combat: state, result: null };

  if (target && manoeuvre.range === 'melee' && !isInMeleeRange(actor, target)) {
    return {
      combat: state,
      result: {
        actor: actor.name,
        actorId: actor.id,
        actorType: actor.type,
        manoeuvre: manoeuvre.name,
        manoeuvreKey,
        targetId: target.id,
        targetName: target.name,
        outcome: 'out_of_range',
        distance: getDistance(actor, target),
        rolls: [],
      },
    };
  }

  if (target && manoeuvre.closesDistance) {
    const dir = target.position > actor.position ? 1 : -1;
    actor.position = target.position - dir;
    actor.position = Math.max(0, Math.min(BATTLEFIELD_MAX, actor.position));
  }

  const log = [];
  const result = {
    actor: actor.name,
    actorId: actor.id,
    actorType: actor.type,
    manoeuvre: manoeuvre.name,
    manoeuvreKey,
    targetId: target?.id || null,
    targetType: target?.type || null,
    rolls: [],
  };

  if (manoeuvre.type === 'defensive') {
    if (manoeuvreKey === 'defend') {
      actor.conditions = [...actor.conditions.filter((c) => c !== 'defending'), 'defending'];
      log.push(`${actor.name} takes a defensive stance.`);
      result.effectDescription = '+20 defense until next round';
    } else if (manoeuvreKey === 'dodge') {
      actor.conditions = [...actor.conditions.filter((c) => c !== 'dodging'), 'dodging'];
      log.push(`${actor.name} prepares to dodge.`);
      result.effectDescription = 'Uses Dodge against the next incoming attack';
    }
    result.outcome = 'defensive';
    state.log = [...state.log, ...log];
    return { combat: state, result };
  }

  if (manoeuvre.modifiers.flee) {
    const skill = manoeuvre.skill || 'Athletics';
    const skillBreakdown = getSkillBreakdown(actor, skill);
    const target_num = skillBreakdown.baseTarget;
    const roll = rollD100();
    const sl = calculateSL(roll, target_num);
    const success = roll <= 4 || (roll <= target_num && roll < 96);

    result.rolls.push({ skill, roll, target: target_num, sl, success });
    result.checkBreakdown = {
      ...skillBreakdown,
      target: target_num,
    };

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
    result.targetName = target.name;
    const knownSpells = actor.knownSpells || [];
    const spell = knownSpells[0] || { name: 'Magic Dart', cn: 0, damage: '+WPB', lore: 'petty' };
    result.spellName = spell.name;
    const castResult = performCastingTest(actor, spell, 0);
    const castBreakdown = getSkillBreakdown(actor, 'Language (Magick)');

    result.rolls.push({
      skill: 'Language (Magick)',
      roll: castResult.roll,
      target: castResult.target,
      sl: castResult.sl,
      success: castResult.success,
      side: 'caster',
    });
    result.castBreakdown = {
      ...castBreakdown,
      target: castResult.target,
    };

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
      result.damageBreakdown = {
        willpowerBonus: wpb,
        totalSL: castResult.totalSL,
        rawDamage,
        toughnessBonus: tb,
        totalDamage,
      };
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
    result.targetName = target.name;
    const attackSkill = manoeuvre.skill || 'Melee (Basic)';
    const attackSkillBreakdown = getSkillBreakdown(actor, attackSkill);
    const advantageBonus = actor.advantage * 10;
    const creativityBonus = getCombatCreativityBonus(customDescription);
    const attackTarget = attackSkillBreakdown.baseTarget + advantageBonus + creativityBonus;

    const defenseSkill = target.conditions.includes('dodging') ? 'Dodge'
      : (manoeuvre.opposed || 'Melee (Basic)');
    const defenseSkillBreakdown = getSkillBreakdown(target, defenseSkill);
    const defendBonus = target.conditions.includes('defending') ? 20 : 0;
    let defenseTarget = defenseSkillBreakdown.baseTarget + defendBonus;

    const attackRoll = rollD100();
    const defenseRoll = rollD100();
    const attackSL = calculateSL(attackRoll, attackTarget);
    const defenseSL = calculateSL(defenseRoll, defenseTarget);

    const attackCrit = attackRoll >= 1 && attackRoll <= 4;
    const attackFumble = attackRoll >= 96;
    const attackSuccess = attackCrit || (!attackFumble && attackRoll <= attackTarget);

    result.rolls.push(
      {
        skill: attackSkill,
        roll: attackRoll,
        target: attackTarget,
        sl: attackSL,
        success: attackSuccess,
        side: 'attacker',
        criticalHit: attackCrit,
      },
      { skill: defenseSkill, roll: defenseRoll, target: defenseTarget, sl: defenseSL, success: defenseRoll <= defenseTarget, side: 'defender' },
    );
    result.customDescription = customDescription || null;
    result.creativityBonus = creativityBonus;
    result.attackBreakdown = {
      ...attackSkillBreakdown,
      advantageBonus,
      creativityBonus,
      target: attackTarget,
    };
    result.defenseBreakdown = {
      ...defenseSkillBreakdown,
      defendBonus,
      target: defenseTarget,
    };

    const netSL = attackSL - defenseSL;
    result.netSL = netSL;

    if (attackSuccess && netSL >= 0) {
      actor.advantage += 1;
      if (manoeuvre.modifiers.chargeBonus) actor.advantage += 1;

      const hitLoc = getHitLocation(attackRoll);
      const sb = getBonus(actor.characteristics?.s || 30);

      const mainWeapon = (actor.weapons || actor.inventory || [])
        .map((w) => (typeof w === 'string' ? w : w.name))
        .find((w) => getWeaponData(w)) || 'Hand Weapon';
      const weaponData = getWeaponData(mainWeapon);
      result.weaponName = mainWeapon;

      const weaponDamage = getWeaponDamageBreakdown(weaponData, sb);
      const weaponDmg = weaponDamage.total;

      const rawDamage = weaponDmg + netSL;
      const criticalBonusDamage = attackCrit ? CRITICAL_HIT_DAMAGE_BONUS : 0;
      const tb = getBonus(target.characteristics?.t || 30);
      const ap = getCombatantAP(target, hitLoc);
      const mitigatedDamage = rawDamage + criticalBonusDamage - tb - ap;
      const totalDamage = attackCrit
        ? Math.max(CRITICAL_HIT_MIN_DAMAGE, mitigatedDamage)
        : Math.max(0, mitigatedDamage);

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
        `${attackCrit ? 'CRITICAL HIT! ' : ''}` +
        `Hit ${hitLoc}! Damage: ${rawDamage}` +
        `${criticalBonusDamage ? ` + ${criticalBonusDamage} crit` : ''}` +
        ` - ${tb} TB - ${ap} AP = ${totalDamage} wounds.` +
        `${target.isDefeated ? ` ${target.name} is defeated!` : ''}` +
        `${criticalWound ? ` CRITICAL: ${getCriticalEffectSummary(criticalWound)}` : ''}`
      );

      result.outcome = 'hit';
      result.damage = totalDamage;
      result.hitLocation = hitLoc;
      result.criticalHit = attackCrit;
      result.criticalBonusDamage = criticalBonusDamage;
      result.minimumDamageApplied = attackCrit && mitigatedDamage < CRITICAL_HIT_MIN_DAMAGE;
      result.damageBreakdown = {
        ...weaponDamage,
        netSL,
        rawDamage,
        criticalBonusDamage,
        toughnessBonus: tb,
        armourPoints: ap,
        totalDamage,
      };
      result.isDoubles = isDoubles && attackSuccess;
      result.criticalWound = criticalWound;
      result.targetDefeated = target.isDefeated;
    } else {
      const mainWeapon = (actor.weapons || actor.inventory || [])
        .map((w) => (typeof w === 'string' ? w : w.name))
        .find((w) => getWeaponData(w)) || 'Hand Weapon';
      result.weaponName = mainWeapon;
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
    c.movementUsed = 0;
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

  if (enemy.wounds < enemy.maxWounds * 0.2 && Math.random() < 0.3) {
    return { manoeuvre: 'flee', targetId: target.id };
  }

  const inMelee = dist <= MELEE_RANGE;

  if (!inMelee) {
    if (dist <= MELEE_RANGE + (enemy.movementAllowance - (enemy.movementUsed || 0))) {
      return { manoeuvre: 'charge', targetId: target.id, moveToward: target.id };
    }
    return { manoeuvre: 'charge', targetId: target.id, moveToward: target.id };
  }

  if (enemy.advantage === 0 && Math.random() < 0.2) {
    return { manoeuvre: 'feint', targetId: target.id };
  }

  if (Math.random() < 0.15 && dist > MELEE_RANGE) {
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
      if (action.moveToward) {
        const moveTarget = state.combatants.find((c) => c.id === action.moveToward);
        if (moveTarget && !isInMeleeRange(current, moveTarget) && !MANOEUVRES[action.manoeuvre]?.closesDistance) {
          const dir = moveTarget.position > current.position ? 1 : -1;
          const remaining = current.movementAllowance - (current.movementUsed || 0);
          const moveDist = Math.min(remaining, getDistance(current, moveTarget) - 1);
          if (moveDist > 0) {
            current.position = Math.max(0, Math.min(BATTLEFIELD_MAX, current.position + dir * moveDist));
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

export function forceTruceCombat(combat, playerCharacter) {
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
    outcome: 'truce',
    woundsChange: woundsLost > 0 ? -woundsLost : 0,
    xp: Math.max(8, Math.floor((enemiesDefeated * 15 + combat.round * 5) * 0.75)),
    criticalWounds: playerCriticals,
    enemiesDefeated,
    totalEnemies,
    remainingEnemies,
    rounds: combat.round,
    playerSurvived: true,
    reason: combat.reason || '',
  };
}

// --- Multiplayer combat ---

export function createMultiplayerCombatState(playerCharacters, enemies, allies = []) {
  const combatants = [];

  for (const pc of playerCharacters) {
    combatants.push({
      id: `player_${pc.odId}`,
      odId: pc.odId,
      name: pc.name,
      type: 'player',
      characteristics: { ...pc.characteristics },
      wounds: pc.wounds,
      maxWounds: pc.maxWounds,
      skills: { ...pc.skills },
      talents: [...(pc.talents || [])],
      inventory: [...(pc.inventory || [])],
      knownSpells: pc.knownSpells || [],
      advantage: 0,
      initiative: 0,
      conditions: [],
      isDefeated: false,
      position: 0,
      movementUsed: 0,
      movementAllowance: getMovementAllowance(pc),
    });
  }

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
      position: 0,
      movementUsed: 0,
      movementAllowance: getMovementAllowance(ally),
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
      position: 0,
      movementUsed: 0,
      movementAllowance: getMovementAllowance(enemy),
    });
  }

  assignInitialPositions(combatants);

  for (const c of combatants) {
    c.initiative = rollInitiative(c);
  }
  combatants.sort((a, b) => b.initiative - a.initiative);

  return {
    active: true,
    multiplayer: true,
    round: 1,
    turnIndex: 0,
    combatants,
    log: ['Combat begins! Round 1.'],
    resolved: false,
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
      xp: baseXp,
      criticalWounds: combatant.criticalWounds || [],
      survived: !combatant.isDefeated,
    };
  }

  return {
    perCharacter,
    enemiesDefeated,
    totalEnemies,
    rounds: combat.round,
    allSurvived: Object.values(perCharacter).every((p) => p.survived),
    reason: combat.reason || '',
  };
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
    perCharacter[pc.name] = {
      wounds: woundsLost > 0 ? -woundsLost : 0,
      xp: baseXp,
      criticalWounds: combatant.criticalWounds || [],
      survived: true,
    };
  }

  return {
    outcome: 'surrender',
    perCharacter,
    enemiesDefeated,
    totalEnemies,
    remainingEnemies,
    rounds: combat.round,
    reason: combat.reason || '',
  };
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
    perCharacter[pc.name] = {
      wounds: woundsLost > 0 ? -woundsLost : 0,
      xp: baseXp,
      criticalWounds: combatant.criticalWounds || [],
      survived: true,
    };
  }

  return {
    outcome: 'truce',
    perCharacter,
    enemiesDefeated,
    totalEnemies,
    remainingEnemies,
    rounds: combat.round,
    reason: combat.reason || '',
  };
}
