import { rollD50, rollPercentage } from './gameState';
import { gameData } from './gameDataService';
import { DIFFICULTY_THRESHOLDS, COMBAT_SKILL_XP, WEAPON_SKILL_MAP } from '../data/rpgSystem';
import { calculateCreativityBonus } from './mechanics/creativityBonus';
import { resolveD50Test } from './mechanics/d50Test';
import { castSpell } from './magicEngine.js';
import { shortId } from '../utils/ids';

const getWeaponData = (name) => gameData.getWeaponData(name);

// ── Rarity combat modifiers ──
const RARITY_BONUS_SCALE = { common: 1, uncommon: 1.25, rare: 1.5, exotic: 2 };
const RARITY_DR_SCALE = { common: 1, uncommon: 1.25, rare: 1.5, exotic: 2 };

function getEquippedItemRarity(actor, slot) {
  if (!actor.equipped?.[slot]) return 'common';
  const item = (actor.inventory || []).find(i => i.id === actor.equipped[slot]);
  return item?.rarity || 'common';
}

function getEnemyWeaponRarity(combatant) {
  return combatant.weaponRarity || 'common';
}

function getEnemyArmourRarity(combatant) {
  return combatant.armourRarity || 'common';
}

/** Resolve an inventory item's baseType to a WEAPONS combatKey */
function resolveItemCombatKey(item) {
  if (!item?.baseType) return null;
  const resolved = gameData.resolveBaseType(item.baseType);
  return resolved?.combatKey || null;
}

function getMainWeapon(actor) {
  // New system: equipped.mainHand → find in inventory → resolve baseType
  if (actor.equipped?.mainHand) {
    const item = (actor.inventory || []).find(i => i.id === actor.equipped.mainHand);
    if (item) {
      const combatKey = resolveItemCombatKey(item);
      if (combatKey && getWeaponData(combatKey)) return combatKey;
    }
  }
  // NPC fallback: weapons array with direct WEAPONS keys
  for (const w of (actor.weapons || [])) {
    const name = typeof w === 'string' ? w : w.name;
    if (getWeaponData(name)) return name;
  }
  return 'Hand Weapon';
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

function getWeaponSkillName(actor) {
  const mainWeapon = getMainWeapon(actor);
  const weaponInfo = getWeaponData(mainWeapon);
  if (!weaponInfo) return WEAPON_SKILL_MAP.unarmed;
  if (weaponInfo.group === 'Ranged' || weaponInfo.reach === 'ranged') return WEAPON_SKILL_MAP.ranged;
  if (weaponInfo.twoHanded || weaponInfo.group === 'Two-Handed') return WEAPON_SKILL_MAP.melee_2h;
  return WEAPON_SKILL_MAP.melee_1h;
}

function getEnemyTier(enemy) {
  const maxW = enemy.maxWounds || 10;
  if (maxW <= 8) return 'weak';
  if (maxW <= 15) return 'medium';
  if (maxW <= 30) return 'hard';
  return 'boss';
}

function addCombatSkillXp(state, actorId, skillName, xp) {
  if (!state.skillXpAccumulator) state.skillXpAccumulator = {};
  if (!state.skillXpAccumulator[actorId]) state.skillXpAccumulator[actorId] = {};
  state.skillXpAccumulator[actorId][skillName] = (state.skillXpAccumulator[actorId][skillName] || 0) + xp;
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

function getAttackAttribute(actor) {
  return actor.attributes?.sila || 10;
}

function getDefenseAttribute(actor) {
  return actor.attributes?.zrecznosc || 10;
}

function getToughness(actor) {
  return actor.attributes?.wytrzymalosc || 10;
}

function getCombatSkillLevel(actor, skillName) {
  const entry = actor.skills?.[skillName];
  if (!entry) return 0;
  return typeof entry === 'object' ? (entry.level || 0) : entry;
}

function rollInitiative(combatant) {
  const zrecznosc = combatant.attributes?.zrecznosc || 10;
  return rollD50() + zrecznosc;
}

function getLuck(actor) {
  return actor.attributes?.szczescie || 0;
}

function resolveCombatTest(actor, attribute, skillLevel, creativityBonus = 0, threshold = DIFFICULTY_THRESHOLDS.medium) {
  return resolveD50Test({ attribute, skillLevel, creativityBonus, threshold, luck: getLuck(actor) });
}

function getWeaponDamage(weaponData, attacker, rarity = 'common') {
  const str = attacker.attributes?.sila ?? 0;
  const dex = attacker.attributes?.zrecznosc ?? 0;
  const scale = RARITY_BONUS_SCALE[rarity] || 1;
  switch (weaponData?.damageType) {
    case 'melee-1h':       return str + Math.round((weaponData.bonus ?? 0) * scale);
    case 'melee-2h':       return str * 2 + Math.round((weaponData.bonus ?? 0) * scale);
    case 'ranged-dex':     return dex + Math.round((weaponData.bonus ?? 0) * scale);
    case 'ranged-str-dex': return str + dex + Math.round((weaponData.bonus ?? 0) * scale);
    case 'ranged-fixed':   return Math.round((weaponData.fixedDamage ?? 0) * scale);
    default:               return str + 3;
  }
}

function getCombatantDR(combatant) {
  // NPC direct armourDR — apply enemy rarity scaling
  if (combatant.armourDR != null) {
    const scale = RARITY_DR_SCALE[getEnemyArmourRarity(combatant)] || 1;
    return Math.round(combatant.armourDR * scale);
  }
  // Player: equipped.armour → inventory → baseType → ARMOUR + rarity
  if (combatant.equipped?.armour) {
    const item = (combatant.inventory || []).find(i => i.id === combatant.equipped.armour);
    if (item) {
      const armourData = gameData.getArmourDataByBaseType(item.baseType);
      if (armourData) {
        const scale = RARITY_DR_SCALE[item.rarity || 'common'] || 1;
        return Math.round((armourData.damageReduction ?? 0) * scale);
      }
    }
  }
  // NPC fallback: direct equippedArmour string (ARMOUR key)
  if (typeof combatant.equippedArmour === 'string') {
    const armourData = gameData.armour?.[combatant.equippedArmour];
    if (armourData) {
      const scale = RARITY_DR_SCALE[getEnemyArmourRarity(combatant)] || 1;
      return Math.round((armourData.damageReduction ?? 0) * scale);
    }
  }
  return 0;
}

function getArmourDodgePenalty(combatant) {
  if (combatant.equipped?.armour) {
    const item = (combatant.inventory || []).find(i => i.id === combatant.equipped.armour);
    if (item) {
      const armourData = gameData.getArmourDataByBaseType(item.baseType);
      if (armourData) return armourData.dodgePenalty ?? 0;
    }
  }
  if (typeof combatant.equippedArmour === 'string') {
    const armourData = gameData.armour?.[combatant.equippedArmour];
    if (armourData) return armourData.dodgePenalty ?? 0;
  }
  return 0;
}

function getShieldDataWithRarity(combatant) {
  // Player: equipped.offHand → inventory → baseType → SHIELDS + rarity
  if (combatant.equipped?.offHand) {
    const item = (combatant.inventory || []).find(i => i.id === combatant.equipped.offHand);
    if (item) {
      const shieldData = gameData.getShieldDataByBaseType(item.baseType);
      if (shieldData) return { shield: shieldData, rarity: item.rarity || 'common' };
    }
  }
  // NPC fallback: direct equippedShield string
  if (typeof combatant.equippedShield === 'string') {
    const shieldData = gameData.shields?.[combatant.equippedShield];
    if (shieldData) return { shield: shieldData, rarity: combatant.armourRarity || 'common' };
  }
  return null;
}

function resolveShieldBlock(target, rawDamage, weaponData) {
  const result = getShieldDataWithRarity(target);
  if (!result) return { blocked: false, damage: rawDamage };

  const { shield, rarity } = result;
  const scale = RARITY_BONUS_SCALE[rarity] || 1;
  const effectiveBlockChance = Math.min(95, Math.round(shield.blockChance * scale));
  const effectiveBlockReduction = Math.min(0.95, shield.blockReduction * scale);

  const blockRoll = rollD50();
  if (blockRoll > effectiveBlockChance) return { blocked: false, damage: rawDamage, blockRoll };

  let reduction = effectiveBlockReduction;
  // Piercing weapons cap block reduction at 50%
  if (weaponData?.qualities?.includes('Piercing')) {
    reduction = Math.min(reduction, 0.5);
  }
  const reducedDamage = Math.ceil(rawDamage * (1 - reduction));
  return { blocked: true, damage: reducedDamage, blockRoll, reduction };
}

function getDualWieldPenalties(skillLevel) {
  const level = skillLevel ?? 0;
  const mainPenalty = Math.min(0, -10 + level);
  const offPenalty = Math.min(0, -15 + level);
  return { mainPenalty, offPenalty };
}

// --- Combat state creation ---

function createCombatantFromCharacter(character, id, type) {
  return {
    id,
    name: character.name,
    type,
    attributes: character.attributes ? { ...character.attributes } : {},
    wounds: character.wounds ?? character.maxWounds ?? 10,
    maxWounds: character.maxWounds ?? 10,
    skills: character.skills ? { ...character.skills } : {},
    mana: character.mana ? { ...character.mana } : null,
    spells: character.spells || null,
    inventory: [...(character.inventory || [])],
    equipped: character.equipped ? { ...character.equipped } : { mainHand: null, offHand: null, armour: null },
    weapons: character.weapons || [],
    traits: character.traits || [],
    // NPC direct fields (bestiary entries)
    armourDR: character.armourDR ?? null,
    equippedArmour: character.equippedArmour || null,
    equippedShield: character.equippedShield || null,
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
      `enemy_${enemy.name.toLowerCase().replace(/\s+/g, '_')}_${shortId(3)}`, 'enemy'));
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
    const test = resolveCombatTest(actor, inteligencja, 0, 0, DIFFICULTY_THRESHOLDS.medium);
    result.rolls.push({ skill: 'Inteligencja', ...test, side: 'caster' });

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
    const attackSkillName = isRanged ? 'Strzelectwo' : 'Walka bronia jednoręczna';
    const attackSkillLevel = getCombatSkillLevel(actor, attackSkillName);
    const creativityBonus = getCombatCreativityBonus(customDescription);

    // Defender raises threshold (dodge penalties from armour + shield)
    const defendBonus = target.conditions.includes('defending') ? 10 : 0;
    const dodging = target.conditions.includes('dodging');
    const defenseAttr = getDefenseAttribute(target);
    const dodgePenalty = getArmourDodgePenalty(target) + (getShieldDataWithRarity(target)?.shield?.dodgePenalty ?? 0);
    const defenseSkillLevel = dodging ? Math.max(0, getCombatSkillLevel(target, 'Uniki') + dodgePenalty) : 0;
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
      // Damage: weapon formula + margin bonus → shield block → armour DR
      const mainWeapon = getMainWeapon(actor);
      const weaponData = getWeaponData(mainWeapon);
      result.weaponName = mainWeapon;
      const weaponRarity = actor.equipped?.mainHand
        ? getEquippedItemRarity(actor, 'mainHand')
        : getEnemyWeaponRarity(actor);
      const weaponDmg = getWeaponDamage(weaponData, actor, weaponRarity);
      const marginBonus = Math.max(0, Math.floor(test.margin / 5));
      let rawDamage = weaponDmg + marginBonus;

      // Shield block
      const blockResult = resolveShieldBlock(target, rawDamage, weaponData);
      if (blockResult.blocked) rawDamage = blockResult.damage;

      // Armour DR
      const dr = getCombatantDR(target);
      const totalDamage = Math.max(1, rawDamage - dr);

      target.wounds = Math.max(0, target.wounds - totalDamage);
      if (target.wounds <= 0) target.isDefeated = true;

      if (manoeuvre.modifiers.feint) {
        log.push(`${actor.name} feints ${target.name}! Next attack will be easier.`);
      }

      const blockMsg = blockResult.blocked ? ` Blocked (${Math.round((blockResult.reduction ?? 0) * 100)}%)!` : '';
      log.push(
        `${actor.name} attacks ${target.name}: ${test.total} vs ${effectiveThreshold} (margin ${test.margin}). ` +
        `${test.luckySuccess ? 'LUCKY HIT! ' : ''}` +
        `Damage: ${weaponDmg}+${marginBonus}${blockMsg} - ${dr} DR = ${totalDamage}.` +
        `${target.isDefeated ? ` ${target.name} is defeated!` : ''}`
      );

      result.outcome = 'hit';
      result.damage = totalDamage;
      result.damageBreakdown = { weaponDmg, marginBonus, rawDamage: weaponDmg + marginBonus, blocked: blockResult.blocked, dr, totalDamage };
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

    // Track combat skill XP for player attacks
    if (actor.type === 'player') {
      const weaponSkill = getWeaponSkillName(actor);
      if (result.outcome === 'hit') {
        const xp = result.targetDefeated
          ? COMBAT_SKILL_XP.kill[getEnemyTier(target)] || COMBAT_SKILL_XP.kill.medium
          : COMBAT_SKILL_XP.hit;
        addCombatSkillXp(state, actor.id, weaponSkill, xp);
      } else {
        addCombatSkillXp(state, actor.id, weaponSkill, COMBAT_SKILL_XP.miss);
      }
    }
    // Track Uniki XP when player dodges (enemy attacks player who is dodging)
    if (target?.type === 'player' && target.conditions.includes('dodging') && result.outcome === 'miss') {
      addCombatSkillXp(state, target.id, 'Uniki', COMBAT_SKILL_XP.miss);
    }
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

  // Gather accumulated combat skill XP for the player
  const playerSkillXp = playerCombatant && combat.skillXpAccumulator?.[playerCombatant.id]
    ? { ...combat.skillXpAccumulator[playerCombatant.id] }
    : null;

  return {
    woundsChange: woundsLost > 0 ? -woundsLost : 0,
    xp: Math.max(10, enemiesDefeated * 15 + combat.round * 5),
    skillProgress: playerSkillXp,
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

  const playerSkillXp = playerCombatant && combat.skillXpAccumulator?.[playerCombatant.id]
    ? { ...combat.skillXpAccumulator[playerCombatant.id] }
    : null;

  return {
    outcome: 'surrender',
    woundsChange: woundsLost > 0 ? -woundsLost : 0,
    xp: Math.max(5, Math.floor((enemiesDefeated * 15 + combat.round * 3) * 0.5)),
    skillProgress: playerSkillXp,
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

  const playerSkillXp = playerCombatant && combat.skillXpAccumulator?.[playerCombatant.id]
    ? { ...combat.skillXpAccumulator[playerCombatant.id] }
    : null;

  return {
    outcome: 'truce',
    woundsChange: woundsLost > 0 ? -woundsLost : 0,
    xp: Math.max(8, Math.floor((enemiesDefeated * 15 + combat.round * 5) * 0.75)),
    skillProgress: playerSkillXp,
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
      `enemy_${enemy.name.toLowerCase().replace(/\s+/g, '_')}_${shortId(3)}`, 'enemy'));
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
