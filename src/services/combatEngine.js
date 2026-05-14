import { rollD50, rollPercentage } from './gameState';
import { rollLuckCheck } from '../../shared/domain/luck.js';
import { computeEffectiveMods, tickEffects, isRestricted, addEffect } from '../../shared/domain/statusEffects.js';
import { gameData } from './gameDataService';
import { DIFFICULTY_THRESHOLDS, COMBAT_SKILL_XP, WEAPON_SKILL_MAP } from '../data/rpgSystem';
import { SPELL_EFFECTS, findSpell } from '../data/rpgMagic.js';
import { calculateCreativityBonus } from './mechanics/creativityBonus';
import { resolveD50Test } from './mechanics/d50Test';
import { castSpell } from './magicEngine.js';
import { shortId } from '../utils/ids';
import { devLog } from '../stores/devEventLogStore';

// Crit-triggered effects — applied when a critical hit lands (roll=1)
const CRIT_EFFECTS = [
  {
    name: 'Głęboka rana',
    source: 'combat',
    category: 'dot',
    duration: { type: 'rounds', remaining: 3 },
    mechanics: { dotDamage: 1 },
    stackable: true,
    description: 'Krytyczne trafienie powoduje krwawienie.',
  },
  {
    name: 'Oszołomienie',
    source: 'combat',
    category: 'control',
    duration: { type: 'rounds', remaining: 2 },
    mechanics: { testMod: -10 },
    stackable: false,
    description: 'Potężne uderzenie ogłusza na chwilę.',
  },
];

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
  if (combatant.movement) return combatant.movement;
  const zr = combatant.attributes?.zrecznosc;
  if (zr) return Math.max(6, Math.floor(zr / 2) + 4);
  return gameData.DEFAULT_MOVEMENT;
}

/** Remaining Chebyshev movement budget this turn (matches moveCombatant). */
export function getRemainingMovementPoints(actor) {
  if (!actor || actor.isDefeated) return 0;
  const moveMods = computeEffectiveMods(actor.activeEffects || []);
  const effectiveAllowance = Math.max(0, (actor.movementAllowance || 0) + moveMods.movementMod);
  return Math.max(0, effectiveAllowance - (actor.movementUsed || 0));
}

export const SKIRMISH_MODE_COMBAT = 'combat';
export const SKIRMISH_MODE_BEER_DUEL = 'beer_duel';
export const SKIRMISH_MODE_CARD_GAME = 'card_game';
export const SKIRMISH_MODE_DICE_GAME = 'dice_game';

function spawnTerrainTiles(W, H, combatants) {
  const cfg = gameData.terrainSpawnConfig;
  const tileDefs = gameData.terrainTiles;
  if (!tileDefs || typeof tileDefs !== 'object') return [];
  const tileTypes = Object.keys(tileDefs);
  if (tileTypes.length === 0) return [];

  const count = cfg.minCount + Math.floor(Math.random() * (cfg.maxCount - cfg.minCount + 1));
  const margin = cfg.spawnMarginCols;

  const occupied = new Set();
  for (const c of combatants) {
    const p = normalizePos(c.position);
    occupied.add(`${p.x}:${p.y}`);
  }

  const candidates = [];
  for (let x = margin; x < W - margin; x++) {
    for (let y = 0; y < H; y++) {
      if (!occupied.has(`${x}:${y}`)) candidates.push({ x, y });
    }
  }

  const tiles = [];
  const usedCells = new Set();
  const shuffledTypes = [...tileTypes].sort(() => Math.random() - 0.5);

  for (let i = 0; i < count && candidates.length > 0; i++) {
    const idx = Math.floor(Math.random() * candidates.length);
    const cell = candidates[idx];
    if (usedCells.has(`${cell.x}:${cell.y}`)) { candidates.splice(idx, 1); i--; continue; }

    const type = shuffledTypes[i % shuffledTypes.length];
    tiles.push({ x: cell.x, y: cell.y, type, consumed: false });
    usedCells.add(`${cell.x}:${cell.y}`);
    candidates.splice(idx, 1);
  }

  return tiles;
}

function normalizeSkirmishMode(mode) {
  if (mode === SKIRMISH_MODE_BEER_DUEL) return SKIRMISH_MODE_BEER_DUEL;
  if (mode === SKIRMISH_MODE_CARD_GAME) return SKIRMISH_MODE_CARD_GAME;
  if (mode === SKIRMISH_MODE_DICE_GAME) return SKIRMISH_MODE_DICE_GAME;
  return SKIRMISH_MODE_COMBAT;
}

export function getTileAt(terrainTiles, x, y) {
  if (!terrainTiles) return null;
  return terrainTiles.find(t => t.x === x && t.y === y && !t.consumed) || null;
}

function assignInitialPositions(combatants) {
  const W = gameData.BATTLEFIELD_WIDTH;
  const H = gameData.BATTLEFIELD_HEIGHT;
  const friendlies = combatants.filter((c) => c.type === 'player' || c.type === 'ally');
  const enemies = combatants.filter((c) => c.type === 'enemy');
  const spreadY = (group, startX) => {
    const gap = Math.max(1, Math.floor(H / (group.length + 1)));
    group.forEach((c, i) => {
      c.position = { x: Math.min(startX + i, W - 1), y: Math.min(gap * (i + 1), H - 1) };
    });
  };
  spreadY(friendlies, 1);
  spreadY(enemies, W - 3);
}

function normalizePos(p) {
  if (p && typeof p === 'object' && 'x' in p) return p;
  if (typeof p === 'number') return { x: p, y: 4 };
  return { x: 0, y: 0 };
}

export function getDistance(a, b) {
  const pa = normalizePos(a.position);
  const pb = normalizePos(b.position);
  return Math.max(Math.abs(pa.x - pb.x), Math.abs(pa.y - pb.y));
}

export function getOccupiedCells(combatants, excludeId = null) {
  const occupied = new Set();
  for (const c of combatants) {
    if (c.isDefeated || c.id === excludeId) continue;
    const p = normalizePos(c.position);
    occupied.add(`${p.x}:${p.y}`);
  }
  return occupied;
}

export function isCellOccupied(combatants, x, y, excludeId = null) {
  return getOccupiedCells(combatants, excludeId).has(`${x}:${y}`);
}

export function isInMeleeRange(a, b) {
  return getDistance(a, b) <= gameData.MELEE_RANGE;
}

/**
 * Check whether actor can charge target in a straight line (cardinal or diagonal)
 * with no non-defeated combatant blocking the path.
 */
export function canCharge(actor, target, combatants) {
  const ap = normalizePos(actor.position);
  const tp = normalizePos(target.position);
  const dx = tp.x - ap.x;
  const dy = tp.y - ap.y;

  if (dx === 0 && dy === 0) return { valid: false, reason: 'not_straight_line' };
  if (dx !== 0 && dy !== 0 && Math.abs(dx) !== Math.abs(dy)) {
    return { valid: false, reason: 'not_straight_line' };
  }

  const sx = dx === 0 ? 0 : (dx > 0 ? 1 : -1);
  const sy = dy === 0 ? 0 : (dy > 0 ? 1 : -1);

  const occupied = new Set(
    combatants
      .filter(c => !c.isDefeated && c.id !== actor.id && c.id !== target.id)
      .map(c => { const p = normalizePos(c.position); return `${p.x}:${p.y}`; })
  );

  let cx = ap.x + sx;
  let cy = ap.y + sy;
  while (cx !== tp.x || cy !== tp.y) {
    if (occupied.has(`${cx}:${cy}`)) return { valid: false, reason: 'path_blocked' };
    cx += sx;
    cy += sy;
  }

  return { valid: true };
}

/**
 * Compute the valid cells a target can be shoved into from actor's position.
 * Returns cells at distance 1 AND distance 2 behind the target (away from actor),
 * including the straight-behind cell and two diagonal neighbors at each distance.
 * Distance-2 cells require at least one clear intermediate cell along the push path.
 * Filters out cells that are out of bounds or occupied by non-defeated combatants.
 */
export function getShoveCells(actor, target, combatants) {
  const ap = normalizePos(actor.position);
  const tp = normalizePos(target.position);
  const dx = tp.x - ap.x;
  const dy = tp.y - ap.y;
  const sx = dx === 0 ? 0 : (dx > 0 ? 1 : -1);
  const sy = dy === 0 ? 0 : (dy > 0 ? 1 : -1);

  const W = gameData.BATTLEFIELD_WIDTH;
  const H = gameData.BATTLEFIELD_HEIGHT;
  const occupied = new Set(
    combatants
      .filter(c => !c.isDefeated && c.id !== target.id)
      .map(c => { const p = normalizePos(c.position); return `${p.x}:${p.y}`; })
  );

  const ok = (c) => c.x >= 0 && c.x < W && c.y >= 0 && c.y < H && !occupied.has(`${c.x}:${c.y}`);

  // Distance-1 candidates (straight + 2 diagonals)
  const d1 = [];
  const mid = { x: tp.x + sx, y: tp.y + sy };
  d1.push(mid);
  if (sx === 0) {
    d1.push({ x: tp.x - 1, y: tp.y + sy });
    d1.push({ x: tp.x + 1, y: tp.y + sy });
  } else if (sy === 0) {
    d1.push({ x: tp.x + sx, y: tp.y - 1 });
    d1.push({ x: tp.x + sx, y: tp.y + 1 });
  } else {
    d1.push({ x: tp.x + sx, y: tp.y });
    d1.push({ x: tp.x, y: tp.y + sy });
  }

  // Distance-2 candidates — same 3 directions but 2 tiles away.
  // Each entry has the final cell and possible intermediate cells (any one being free suffices).
  const d2 = [];
  d2.push({ cell: { x: tp.x + 2 * sx, y: tp.y + 2 * sy }, via: [mid] });
  if (sx === 0) {
    d2.push({ cell: { x: tp.x - 1, y: tp.y + 2 * sy }, via: [mid, { x: tp.x - 1, y: tp.y + sy }] });
    d2.push({ cell: { x: tp.x + 1, y: tp.y + 2 * sy }, via: [mid, { x: tp.x + 1, y: tp.y + sy }] });
  } else if (sy === 0) {
    d2.push({ cell: { x: tp.x + 2 * sx, y: tp.y - 1 }, via: [mid, { x: tp.x + sx, y: tp.y - 1 }] });
    d2.push({ cell: { x: tp.x + 2 * sx, y: tp.y + 1 }, via: [mid, { x: tp.x + sx, y: tp.y + 1 }] });
  } else {
    d2.push({ cell: { x: tp.x + 2 * sx, y: tp.y + sy }, via: [mid, { x: tp.x + sx, y: tp.y }] });
    d2.push({ cell: { x: tp.x + sx, y: tp.y + 2 * sy }, via: [mid, { x: tp.x, y: tp.y + sy }] });
  }

  const result = [];
  for (const c of d1) if (ok(c)) result.push(c);
  for (const { cell, via } of d2) {
    if (ok(cell) && via.some(m => ok(m))) result.push(cell);
  }
  return result;
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
  const mods = computeEffectiveMods(actor.activeEffects);
  const effectAttrBonus = Object.values(mods.attributeMods).reduce((s, v) => s + v, 0);
  const adjustedAttribute = attribute + effectAttrBonus + mods.testMod;
  return resolveD50Test({ attribute: adjustedAttribute, skillLevel, creativityBonus, threshold, luck: getLuck(actor) });
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
  const blockedByRoll = blockRoll <= effectiveBlockChance;
  const { luckRoll, luckySuccess } = rollLuckCheck(getLuck(target), rollPercentage);
  if (!blockedByRoll && !luckySuccess) {
    return { blocked: false, damage: rawDamage, blockRoll, luckRoll, luckySuccess };
  }

  let reduction = effectiveBlockReduction;
  // Piercing weapons cap block reduction at 50%
  if (weaponData?.qualities?.includes('Piercing')) {
    reduction = Math.min(reduction, 0.5);
  }
  const reducedDamage = Math.ceil(rawDamage * (1 - reduction));
  return { blocked: true, damage: reducedDamage, blockRoll, reduction, luckRoll, luckySuccess };
}

function getDualWieldPenalties(skillLevel) {
  const level = skillLevel ?? 0;
  const mainPenalty = Math.min(0, -10 + level);
  const offPenalty = Math.min(0, -15 + level);
  return { mainPenalty, offPenalty };
}

// --- Pre-roll preview (pure, no dice) ---

/**
 * Compute all the numbers for an attack preview WITHOUT rolling dice.
 * Returns a breakdown of actor bonuses, target threshold, and the minimum d50 roll needed.
 */
export function computeAttackPreview(combat, actorId, manoeuvreKey, targetId, options = {}) {
  const actor = combat.combatants.find(c => c.id === actorId);
  const target = targetId ? combat.combatants.find(c => c.id === targetId) : null;
  const manoeuvre = gameData.manoeuvres[manoeuvreKey];
  if (!actor || !manoeuvre) return null;

  const customDescription = sanitizeCombatDescription(options.customDescription);

  // Flee
  if (manoeuvre.modifiers.flee) {
    const zrecznosc = getDefenseAttribute(actor);
    const skillLevel = getCombatSkillLevel(actor, 'Atletyka');
    const mods = computeEffectiveMods(actor.activeEffects);
    const effectBonus = Object.values(mods.attributeMods).reduce((s, v) => s + v, 0) + mods.testMod;
    const luck = getLuck(actor);
    const baseThreshold = DIFFICULTY_THRESHOLDS.medium;

    const totalBonus = zrecznosc + effectBonus + skillLevel + luck;
    const minRoll = Math.max(1, baseThreshold - totalBonus);

    return {
      type: 'flee',
      actor: {
        name: actor.name, attributeKey: 'zrecznosc', attributeValue: zrecznosc,
        skillName: 'Atletyka', skillLevel, effectBonus, creativityBonus: 0, luckChance: luck,
      },
      target: null,
      threshold: { base: baseThreshold, final: baseThreshold, modifiers: [] },
      bonuses: {
        total: totalBonus,
        modifiers: _buildBonusModifiers({ attributeValue: zrecznosc, attributeKey: 'zrecznosc', skillName: 'Atletyka', skillLevel, effectBonus, creativityBonus: 0, luck }),
      },
      minRoll,
      sureHit: false,
      terrainTile: null,
      weaponName: null,
    };
  }

  // Shove
  if (manoeuvre.modifiers.shove && target) {
    const actorStr = getAttackAttribute(actor);
    const targetTough = getToughness(target);
    const skillLevel = getCombatSkillLevel(actor, 'Walka bronia jednoręczna');
    const mods = computeEffectiveMods(actor.activeEffects);
    const effectBonus = Object.values(mods.attributeMods).reduce((s, v) => s + v, 0) + mods.testMod;
    const luck = getLuck(actor);
    const baseThreshold = DIFFICULTY_THRESHOLDS.easy;
    const finalThreshold = baseThreshold + targetTough;

    const totalBonus = actorStr + effectBonus + skillLevel + luck;
    const minRoll = Math.max(1, finalThreshold - totalBonus);

    return {
      type: 'shove',
      actor: {
        name: actor.name, attributeKey: 'sila', attributeValue: actorStr,
        skillName: 'Walka bronia jednoręczna', skillLevel, effectBonus, creativityBonus: 0, luckChance: luck,
      },
      target: {
        name: target.name, attributeKey: 'wytrzymalosc', defenseValue: targetTough,
        defenseSkillName: null, defenseSkillLevel: 0, defendBonus: 0, dodging: false,
      },
      threshold: {
        base: baseThreshold, final: finalThreshold,
        modifiers: [{ label: 'Wytrzymałość celu', value: targetTough }],
      },
      bonuses: {
        total: totalBonus,
        modifiers: _buildBonusModifiers({ attributeValue: actorStr, attributeKey: 'sila', skillName: 'Walka bronia jednoręczna', skillLevel, effectBonus, creativityBonus: 0, luck }),
      },
      minRoll,
      sureHit: false,
      terrainTile: null,
      weaponName: null,
    };
  }

  // Magic
  if (manoeuvre.type === 'magic' && target) {
    const inteligencja = actor.attributes?.inteligencja || 10;
    const mods = computeEffectiveMods(actor.activeEffects);
    const effectBonus = Object.values(mods.attributeMods).reduce((s, v) => s + v, 0) + mods.testMod;
    const luck = getLuck(actor);
    const baseThreshold = DIFFICULTY_THRESHOLDS.medium;

    const totalBonus = inteligencja + effectBonus + luck;
    const minRoll = Math.max(1, baseThreshold - totalBonus);

    return {
      type: 'magic',
      actor: {
        name: actor.name, attributeKey: 'inteligencja', attributeValue: inteligencja,
        skillName: null, skillLevel: 0, effectBonus, creativityBonus: 0, luckChance: luck,
      },
      target: {
        name: target.name, attributeKey: null, defenseValue: 0,
        defenseSkillName: null, defenseSkillLevel: 0, defendBonus: 0, dodging: false,
      },
      threshold: { base: baseThreshold, final: baseThreshold, modifiers: [] },
      bonuses: {
        total: totalBonus,
        modifiers: _buildBonusModifiers({ attributeValue: inteligencja, attributeKey: 'inteligencja', skillName: null, skillLevel: 0, effectBonus, creativityBonus: 0, luck }),
      },
      minRoll,
      sureHit: false,
      terrainTile: null,
      weaponName: null,
    };
  }

  // Offensive (attack, charge, feint, rangedAttack)
  if (manoeuvre.type === 'offensive' && target) {
    const isRanged = manoeuvre.skill?.startsWith('Ranged');
    const attackAttr = isRanged ? getDefenseAttribute(actor) : getAttackAttribute(actor);
    const attackAttrKey = isRanged ? 'zrecznosc' : 'sila';
    const attackSkillName = isRanged ? 'Strzelectwo' : 'Walka bronia jednoręczna';
    const attackSkillLevel = getCombatSkillLevel(actor, attackSkillName);
    const creativityBonus = getCombatCreativityBonus(customDescription);

    const defendBonus = target.conditions.includes('defending') ? 10 : 0;
    const dodging = target.conditions.includes('dodging');
    const defenseAttr = getDefenseAttribute(target);
    const dodgePenalty = getArmourDodgePenalty(target) + (getShieldDataWithRarity(target)?.shield?.dodgePenalty ?? 0);
    const defenseSkillLevel = dodging ? Math.max(0, getCombatSkillLevel(target, 'Uniki') + dodgePenalty) : 0;
    const baseThreshold = DIFFICULTY_THRESHOLDS.medium;
    const finalThreshold = baseThreshold + defendBonus + defenseAttr + defenseSkillLevel;

    const actorPos = normalizePos(actor.position);
    const actorTile = getTileAt(combat.terrainTiles, actorPos.x, actorPos.y);
    const isSureHit = actorTile?.type === 'sureHit';

    const mods = computeEffectiveMods(actor.activeEffects);
    const effectBonus = Object.values(mods.attributeMods).reduce((s, v) => s + v, 0) + mods.testMod;
    const luck = getLuck(actor);

    const totalBonus = attackAttr + effectBonus + attackSkillLevel + creativityBonus + luck;
    const minRoll = isSureHit ? 0 : Math.max(1, finalThreshold - totalBonus);

    const mainWeapon = getMainWeapon(actor);

    const thresholdModifiers = [];
    if (defenseAttr > 0) thresholdModifiers.push({ label: 'Zręczność celu', value: defenseAttr });
    if (defenseSkillLevel > 0) thresholdModifiers.push({ label: 'Uniki celu', value: defenseSkillLevel });
    if (defendBonus > 0) thresholdModifiers.push({ label: 'Premia obrony', value: defendBonus });

    return {
      type: 'offensive',
      actor: {
        name: actor.name, attributeKey: attackAttrKey, attributeValue: attackAttr,
        skillName: attackSkillName, skillLevel: attackSkillLevel, effectBonus, creativityBonus, luckChance: luck,
      },
      target: {
        name: target.name, attributeKey: 'zrecznosc', defenseValue: defenseAttr,
        defenseSkillName: 'Uniki', defenseSkillLevel, defendBonus, dodging,
      },
      threshold: { base: baseThreshold, final: finalThreshold, modifiers: thresholdModifiers },
      bonuses: {
        total: totalBonus,
        modifiers: _buildBonusModifiers({ attributeValue: attackAttr, attributeKey: attackAttrKey, skillName: attackSkillName, skillLevel: attackSkillLevel, effectBonus, creativityBonus, luck }),
      },
      minRoll,
      sureHit: isSureHit,
      terrainTile: actorTile?.type || null,
      weaponName: mainWeapon,
    };
  }

  return null;
}

function _buildBonusModifiers({ attributeValue, attributeKey, skillName, skillLevel, effectBonus, creativityBonus, luck }) {
  const mods = [];
  if (attributeValue) mods.push({ label: attributeKey, value: attributeValue, color: 'text-purple-300' });
  if (skillName && skillLevel) mods.push({ label: skillName, value: skillLevel, color: 'text-emerald-300' });
  if (effectBonus) mods.push({ label: 'effects', value: effectBonus, color: effectBonus > 0 ? 'text-cyan-300' : 'text-rose-300' });
  if (creativityBonus) mods.push({ label: 'creativity', value: creativityBonus, color: 'text-amber-300' });
  if (luck) mods.push({ label: 'luck', value: luck, color: 'text-yellow-300' });
  return mods;
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
    spriteUrl: character.spriteUrl || null,
    portraitUrl: character.portraitUrl || null,
    species: character.species || character.race || null,
    gender: character.gender || null,
    description: character.description || null,
    activeEffects: [...(character.activeEffects || [])],
    initiative: 0,
    conditions: [],
    isDefeated: false,
    position: { x: 0, y: 0 },
    movementUsed: 0,
    movementAllowance: getMovementAllowance(character),
  };
}

export function createCombatState(playerCharacter, enemies, allies = [], options = {}) {
  const combatants = [];
  const mode = normalizeSkirmishMode(options?.mode);

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

  const W = gameData.BATTLEFIELD_WIDTH;
  const H = gameData.BATTLEFIELD_HEIGHT;
  const terrainTiles = (mode === SKIRMISH_MODE_BEER_DUEL || mode === SKIRMISH_MODE_CARD_GAME || mode === SKIRMISH_MODE_DICE_GAME) ? [] : spawnTerrainTiles(W, H, combatants);

  for (const c of combatants) {
    c.initiative = rollInitiative(c);
  }
  combatants.sort((a, b) => b.initiative - a.initiative);

  const combatState = {
    active: true,
    round: 1,
    turnIndex: 0,
    mode,
    modeConfig: options?.modeConfig || null,
    combatants,
    terrainTiles,
    skirmish: null,
    log: ['Combat begins! Round 1.'],
    resolved: false,
    playerStats: {
      hits: 0,
      misses: 0,
      dodges: 0,
      kills: 0,
      killsByTier: { weak: 0, medium: 0, hard: 0, boss: 0 },
      damageDealt: 0,
      damageTaken: 0,
      startingWounds: playerCharacter.wounds ?? playerCharacter.maxWounds ?? 10,
    },
  };
  devLog.emit({ category: 'combat', type: 'combat_start', label: `Combat started: ${enemies.map((e) => e.name).join(', ')}`, data: { enemies: enemies.map((e) => ({ name: e.name, wounds: e.wounds || e.maxWounds })), allies: allies.length, initiative: combatants.map((c) => ({ name: c.name, init: c.initiative })) } });
  return combatState;
}

export function moveCombatant(combat, actorId, targetPosition) {
  const state = {
    ...combat,
    combatants: combat.combatants.map((c) => ({ ...c })),
    terrainTiles: (combat.terrainTiles || []).map(t => ({ ...t })),
  };
  const actor = state.combatants.find((c) => c.id === actorId);
  if (!actor || actor.isDefeated) return { combat: state, moved: false };
  if (isRestricted(actor.activeEffects, 'no_movement')) return { combat: state, moved: false };

  const W = gameData.BATTLEFIELD_WIDTH;
  const H = gameData.BATTLEFIELD_HEIGHT;
  const target = typeof targetPosition === 'object'
    ? { x: Math.max(0, Math.min(W - 1, Math.round(targetPosition.x))), y: Math.max(0, Math.min(H - 1, Math.round(targetPosition.y))) }
    : { x: Math.max(0, Math.min(W - 1, Math.round(targetPosition))), y: normalizePos(actor.position).y };
  const cur = normalizePos(actor.position);

  if (isCellOccupied(state.combatants, target.x, target.y, actorId)) {
    return { combat: state, moved: false };
  }

  // Standard movement: pay full Chebyshev distance in one jump
  const destTile = getTileAt(state.terrainTiles, target.x, target.y);
  const freezeMultiplier = destTile?.type === 'freeze' ? 2 : 1;

  const dist = Math.max(Math.abs(target.x - cur.x), Math.abs(target.y - cur.y));
  const moveCost = dist * freezeMultiplier;
  const moveMods = computeEffectiveMods(actor.activeEffects);
  const effectiveAllowance = Math.max(0, actor.movementAllowance + moveMods.movementMod);
  const remaining = effectiveAllowance - (actor.movementUsed || 0);
  if (dist === 0 || moveCost > remaining) return { combat: state, moved: false };

  actor.movementUsed = (actor.movementUsed || 0) + moveCost;
  actor.position = target;

  const result = { combat: state, moved: true, distance: dist };

  if (destTile?.type === 'extraTurn') {
    actor.bonusTurn = true;
    const tile = state.terrainTiles.find(t => t.x === target.x && t.y === target.y);
    if (tile) tile.consumed = true;
    result.extraTurn = true;
  }

  if (destTile?.type === 'teleport') {
    const occupiedCells = getOccupiedCells(state.combatants, actorId);
    const tileCells = new Set(state.terrainTiles.filter(t => !t.consumed).map(t => `${t.x}:${t.y}`));
    const emptyCells = [];
    for (let x = 0; x < W; x++) {
      for (let y = 0; y < H; y++) {
        const key = `${x}:${y}`;
        if (!occupiedCells.has(key) && !tileCells.has(key)) emptyCells.push({ x, y });
      }
    }
    if (emptyCells.length > 0) {
      actor.position = emptyCells[Math.floor(Math.random() * emptyCells.length)];
      result.teleported = true;
    }
  }

  return result;
}

// --- Manoeuvre resolution ---

export function resolveManoeuvre(combat, actorId, manoeuvreKey, targetId, options = {}) {
  // Deep-clone the subtrees we mutate below. `combat` may be frozen by Immer
  // (the game store uses `produce`), so a shallow `{...combat}` would still
  // hand us read-only nested objects (playerStats, skillXpAccumulator entries,
  // combatant.conditions/spells/mana, …) and `state.playerStats.hits += 1`
  // would throw `TypeError: "hits" is read-only`.
  const state = {
    ...combat,
    combatants: combat.combatants.map((c) => ({
      ...c,
      conditions: [...(c.conditions || [])],
      activeEffects: [...(c.activeEffects || [])],
      spells: c.spells
        ? { ...c.spells, usageCounts: { ...(c.spells.usageCounts || {}) } }
        : c.spells,
      mana: c.mana ? { ...c.mana } : c.mana,
    })),
    playerStats: combat.playerStats
      ? {
          ...combat.playerStats,
          killsByTier: { ...(combat.playerStats.killsByTier || {}) },
        }
      : combat.playerStats,
    skillXpAccumulator: combat.skillXpAccumulator
      ? Object.fromEntries(
          Object.entries(combat.skillXpAccumulator).map(([k, v]) => [k, { ...v }]),
        )
      : combat.skillXpAccumulator,
    terrainTiles: (combat.terrainTiles || []).map(t => ({ ...t })),
    log: [...(combat.log || [])],
  };
  const actor = state.combatants.find((c) => c.id === actorId);
  const target = targetId ? state.combatants.find((c) => c.id === targetId) : null;
  const manoeuvre = gameData.manoeuvres[manoeuvreKey];
  const customDescription = sanitizeCombatDescription(options.customDescription);

  if (!actor || !manoeuvre) return { combat: state, result: null };

  // Status effect restrictions
  if (manoeuvre.type === 'offensive' && isRestricted(actor.activeEffects, 'no_attack')) {
    return { combat: state, result: { actor: actor.name, actorId: actor.id, actorType: actor.type, manoeuvre: manoeuvre.name, manoeuvreKey, outcome: 'restricted', restriction: 'no_attack', rolls: [] } };
  }
  if (manoeuvre.type === 'magic' && isRestricted(actor.activeEffects, 'no_magic')) {
    return { combat: state, result: { actor: actor.name, actorId: actor.id, actorType: actor.type, manoeuvre: manoeuvre.name, manoeuvreKey, outcome: 'restricted', restriction: 'no_magic', rolls: [] } };
  }
  if (isRestricted(actor.activeEffects, 'skip_turn')) {
    return { combat: state, result: { actor: actor.name, actorId: actor.id, actorType: actor.type, manoeuvre: manoeuvre.name, manoeuvreKey, outcome: 'restricted', restriction: 'skip_turn', rolls: [] } };
  }

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
    const chargeCheck = canCharge(actor, target, state.combatants);
    if (!chargeCheck.valid) {
      return {
        combat: state,
        result: {
          actor: actor.name, actorId: actor.id, actorType: actor.type,
          manoeuvre: manoeuvre.name, manoeuvreKey,
          targetId: target.id, targetName: target.name,
          outcome: 'charge_blocked', reason: chargeCheck.reason, rolls: [],
        },
      };
    }
    const ap = normalizePos(actor.position);
    const tp = normalizePos(target.position);
    const dx = tp.x - ap.x;
    const dy = tp.y - ap.y;
    const sx = dx === 0 ? 0 : (dx > 0 ? 1 : -1);
    const sy = dy === 0 ? 0 : (dy > 0 ? 1 : -1);
    const W = gameData.BATTLEFIELD_WIDTH;
    const H = gameData.BATTLEFIELD_HEIGHT;
    actor.position = {
      x: Math.max(0, Math.min(W - 1, tp.x - sx)),
      y: Math.max(0, Math.min(H - 1, tp.y - sy)),
    };
  }

  const log = [];
  const result = {
    actor: actor.name, actorId: actor.id, actorType: actor.type,
    manoeuvre: manoeuvre.name, manoeuvreKey,
    targetId: target?.id || null, targetType: target?.type || null,
    rolls: [],
    appliedEffects: [],
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

    result.rolls.push({ skill: 'Atletyka', ...test, attributeKey: 'zrecznosc', attributeValue: zrecznosc, side: 'actor' });
    result.checkBreakdown = {
      attribute: zrecznosc,
      skillLevel,
      baseTarget: DIFFICULTY_THRESHOLDS.medium,
      target: DIFFICULTY_THRESHOLDS.medium,
    };

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
    const spellName = options.spellName || manoeuvre.spellName;

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
    const castEffectMods = computeEffectiveMods(actor.activeEffects || []);
    const castEffectBonus = Object.values(castEffectMods.attributeMods).reduce((s, v) => s + v, 0) + castEffectMods.testMod;
    const test = resolveCombatTest(actor, inteligencja, 0, 0, DIFFICULTY_THRESHOLDS.medium);
    result.rolls.push({ skill: 'Inteligencja', ...test, attributeKey: 'inteligencja', attributeValue: inteligencja, side: 'caster' });
    result.castBreakdown = {
      attribute: inteligencja,
      attributeKey: 'inteligencja',
      effectBonus: castEffectBonus,
      spellName: spellName || null,
      baseTarget: DIFFICULTY_THRESHOLDS.medium,
      target: DIFFICULTY_THRESHOLDS.medium,
    };

    if (test.success) {
      const spellStats = spellName ? findSpell(spellName)?.spell?.combatStats : null;
      const dmg = spellStats?.damage;
      const baseDamage = dmg
        ? Math.max(1, Math.floor(inteligencja * dmg.intScale) + dmg.flat)
        : Math.max(1, Math.floor(inteligencja / 2));
      const toughness = getToughness(target);
      const magicTargetMods = computeEffectiveMods(target.activeEffects);
      let totalDamage = Math.max(1, baseDamage - Math.floor(toughness / 3) - magicTargetMods.damageReduction);

      const magicTargetPos = normalizePos(target.position);
      const magicTargetTile = getTileAt(state.terrainTiles, magicTargetPos.x, magicTargetPos.y);
      if (magicTargetTile?.type === 'damageReduction') {
        totalDamage = Math.max(1, Math.ceil(totalDamage * 0.5));
      }

      target.wounds = Math.max(0, target.wounds - totalDamage);
      if (target.wounds <= 0) target.isDefeated = true;

      // Apply spell effect if defined
      const spellFx = spellName ? SPELL_EFFECTS[spellName] : null;
      if (spellFx) {
        const fxTarget = spellFx.target === 'self' ? actor : target;
        const fx = { ...spellFx.effect, id: `sfx_${shortId(6)}` };
        if (!fxTarget.activeEffects) fxTarget.activeEffects = [];
        fxTarget.activeEffects = addEffect(fxTarget.activeEffects, fx);
        log.push(`${fxTarget.name} gains effect: ${fx.name}.`);
        result.appliedEffects.push({ target: fxTarget.name, action: 'add', effectName: fx.name, category: fx.category });

        // all_enemies: apply to every active enemy (besides primary target already handled)
        if (spellFx.target === 'all_enemies') {
          for (const c of state.combatants) {
            if (c.id === target.id || c.isDefeated) continue;
            if ((actor.type === 'player' || actor.type === 'ally') && c.type === 'enemy') {
              if (!c.activeEffects) c.activeEffects = [];
              c.activeEffects = addEffect(c.activeEffects, { ...spellFx.effect, id: `sfx_${shortId(6)}` });
              result.appliedEffects.push({ target: c.name, action: 'add', effectName: spellFx.effect.name, category: spellFx.effect.category });
            }
          }
        }
      }

      result.damageBreakdown = {
        weaponDmg: baseDamage,
        marginBonus: 0,
        blocked: false,
        dr: Math.floor(toughness / 3) + magicTargetMods.damageReduction,
        totalDamage,
        isMagic: true,
      };

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

  // Shove — push target one cell in a chosen direction (requires adjacency)
  if (manoeuvre.modifiers.shove && target) {
    if (getDistance(actor, target) > 1) {
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
    result.targetName = target.name;
    const pushCell = options.pushTarget;
    if (!pushCell || typeof pushCell.x !== 'number' || typeof pushCell.y !== 'number') {
      return { combat: state, result: { ...result, outcome: 'invalid', reason: 'no_push_target', rolls: [] } };
    }

    const actorStr = getAttackAttribute(actor);
    const targetTough = getToughness(target);
    const skillLevel = getCombatSkillLevel(actor, 'Walka bronia jednoręczna');
    const threshold = DIFFICULTY_THRESHOLDS.easy + targetTough;
    const test = resolveCombatTest(actor, actorStr, skillLevel, 0, threshold);

    result.rolls.push({ skill: 'Walka bronia jednoręczna', ...test, attributeKey: 'sila', attributeValue: actorStr, side: 'attacker' });
    result.shoveBreakdown = { actorStr, targetTough, threshold };

    const W = gameData.BATTLEFIELD_WIDTH;
    const H = gameData.BATTLEFIELD_HEIGHT;
    const inBounds = pushCell.x >= 0 && pushCell.x < W && pushCell.y >= 0 && pushCell.y < H;
    const occupied = state.combatants.some(c => !c.isDefeated && c.id !== target.id && normalizePos(c.position).x === pushCell.x && normalizePos(c.position).y === pushCell.y);

    if (test.success && inBounds && !occupied) {
      target.position = { x: pushCell.x, y: pushCell.y };
      log.push(`${actor.name} shoves ${target.name}! (${test.total} vs ${threshold}, margin ${test.margin})`);
      result.outcome = 'shoved';
      result.pushTarget = pushCell;

      // Off-balance chance: margin-based probability to debuff the target
      const offBalanceChance = Math.min(70, 30 + test.margin * 3);
      const offBalanceRoll = rollPercentage();
      if (offBalanceRoll <= offBalanceChance) {
        const fx = {
          id: `shove_${shortId(6)}`,
          name: 'Wytrącenie z równowagi',
          source: 'combat',
          category: 'control',
          duration: { type: 'rounds', remaining: 2 },
          mechanics: { testMod: -10 },
          stackable: false,
          description: 'Pchnięcie wytrąca z równowagi — kara do testów.',
        };
        if (!target.activeEffects) target.activeEffects = [];
        target.activeEffects = addEffect(target.activeEffects, fx);
        log.push(`${target.name} is knocked off-balance!`);
        result.offBalance = true;
        result.appliedEffects.push({ target: target.name, action: 'add', effectName: fx.name, category: fx.category });
      }
    } else if (!test.success) {
      log.push(`${actor.name} tries to shove ${target.name} but fails! (${test.total} vs ${threshold}, margin ${test.margin})`);
      result.outcome = 'shove_failed';
    } else {
      log.push(`${actor.name} shoves ${target.name} but the position is blocked!`);
      result.outcome = 'shove_blocked';
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

    const actorPos = normalizePos(actor.position);
    const actorTile = getTileAt(state.terrainTiles, actorPos.x, actorPos.y);
    const isSureHit = actorTile?.type === 'sureHit';

    let test;
    if (isSureHit) {
      test = { roll: 2, total: 999, threshold: effectiveThreshold, margin: 999, success: true, luckySuccess: false };
      const tile = state.terrainTiles.find(t => t.x === actorPos.x && t.y === actorPos.y);
      if (tile) tile.consumed = true;
    } else {
      test = resolveCombatTest(actor, attackAttr, attackSkillLevel, creativityBonus, effectiveThreshold);
    }

    result.rolls.push({
      skill: attackSkillName, ...test,
      attributeKey: isRanged ? 'zrecznosc' : 'sila',
      attributeValue: attackAttr,
      side: 'attacker',
    });
    result.customDescription = customDescription || null;
    result.creativityBonus = creativityBonus;
    result.terrainTile = actorTile?.type || null;
    const actorEffectMods = computeEffectiveMods(actor.activeEffects || []);
    const effectBonus = Object.values(actorEffectMods.attributeMods).reduce((s, v) => s + v, 0) + actorEffectMods.testMod;
    result.attackBreakdown = {
      attribute: attackAttr,
      attributeKey: isRanged ? 'zrecznosc' : 'sila',
      skillName: attackSkillName,
      skillLevel: attackSkillLevel,
      creativityBonus,
      effectBonus,
      baseTarget: DIFFICULTY_THRESHOLDS.medium,
      target: effectiveThreshold,
      sureHit: isSureHit,
    };
    result.defenseBreakdown = {
      attribute: defenseAttr,
      attributeKey: 'zrecznosc',
      skillName: 'Uniki',
      skillLevel: defenseSkillLevel,
      defendBonus,
      dodging,
      baseTarget: DIFFICULTY_THRESHOLDS.medium,
      target: DIFFICULTY_THRESHOLDS.medium + defendBonus + defenseAttr + defenseSkillLevel,
    };

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

      // Fury tile: +50% raw damage
      if (actorTile?.type === 'fury') {
        rawDamage = Math.ceil(rawDamage * 1.5);
      }

      // Armour DR + effect-based DR (e.g. Ochrona, Wielka Ochrona)
      const targetMods = computeEffectiveMods(target.activeEffects);
      const dr = getCombatantDR(target) + targetMods.damageReduction;
      let totalDamage = Math.max(1, rawDamage - dr);

      // Damage Reduction tile: target takes 50% less
      const targetPos = normalizePos(target.position);
      const targetTile = getTileAt(state.terrainTiles, targetPos.x, targetPos.y);
      if (targetTile?.type === 'damageReduction') {
        totalDamage = Math.max(1, Math.ceil(totalDamage * 0.5));
      }

      target.wounds = Math.max(0, target.wounds - totalDamage);
      if (target.wounds <= 0) target.isDefeated = true;

      // Crit-triggered effect (roll=1 is critical success in d50)
      if (test.roll === 1 && !target.isDefeated) {
        const critFx = CRIT_EFFECTS[Math.floor(Math.random() * CRIT_EFFECTS.length)];
        const fx = { ...critFx, id: `crit_${shortId(6)}` };
        if (!target.activeEffects) target.activeEffects = [];
        target.activeEffects = addEffect(target.activeEffects, fx);
        log.push(`CRITICAL! ${target.name} suffers: ${fx.name}.`);
        result.appliedEffects.push({ target: target.name, action: 'add', effectName: fx.name, category: fx.category });
      }

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

    // Track combat skill XP + playerStats for player attacks
    if (actor.type === 'player') {
      const weaponSkill = getWeaponSkillName(actor);
      if (!state.playerStats) {
        state.playerStats = { hits: 0, misses: 0, dodges: 0, kills: 0, killsByTier: { weak: 0, medium: 0, hard: 0, boss: 0 }, damageDealt: 0, damageTaken: 0 };
      }
      if (result.outcome === 'hit') {
        const tier = getEnemyTier(target);
        const xp = result.targetDefeated
          ? COMBAT_SKILL_XP.kill[tier] || COMBAT_SKILL_XP.kill.medium
          : COMBAT_SKILL_XP.hit;
        addCombatSkillXp(state, actor.id, weaponSkill, xp);
        state.playerStats.hits += 1;
        state.playerStats.damageDealt += result.damage || 0;
        if (result.targetDefeated) {
          state.playerStats.kills += 1;
          state.playerStats.killsByTier[tier] = (state.playerStats.killsByTier[tier] || 0) + 1;
        }
      } else {
        addCombatSkillXp(state, actor.id, weaponSkill, COMBAT_SKILL_XP.miss);
        state.playerStats.misses += 1;
      }
    }
    // Track enemy attack on player → damage taken + dodge tracking
    if (target?.type === 'player') {
      if (!state.playerStats) {
        state.playerStats = { hits: 0, misses: 0, dodges: 0, kills: 0, killsByTier: { weak: 0, medium: 0, hard: 0, boss: 0 }, damageDealt: 0, damageTaken: 0 };
      }
      if (result.outcome === 'hit') {
        state.playerStats.damageTaken += result.damage || 0;
      } else if (target.conditions.includes('dodging') && result.outcome === 'miss') {
        state.playerStats.dodges += 1;
        addCombatSkillXp(state, target.id, 'Uniki', COMBAT_SKILL_XP.dodge);
      }
    }
  }

  state.log = [...state.log, ...log];
  devLog.emit({ category: 'combat', type: 'manoeuvre_resolved', label: `${actor.name}: ${manoeuvre.name} → ${result.outcome}${target ? ` (vs ${target.name})` : ''}`, data: { actor: actor.name, manoeuvre: manoeuvreKey, outcome: result.outcome, target: target?.name, damage: result.damage, rolls: result.rolls } });
  return { combat: state, result };
}

// --- Turn/round management ---

export function advanceRound(combat) {
  const state = {
    ...combat,
    combatants: combat.combatants.map((c) => ({ ...c, activeEffects: [...(c.activeEffects || [])] })),
    terrainTiles: (combat.terrainTiles || []).map(t => ({ ...t })),
  };
  const dotLog = [];
  const roundEffectEvents = [];

  for (const c of state.combatants) {
    c.conditions = c.conditions.filter((cond) => cond !== 'defending' && cond !== 'dodging');
    c.movementUsed = 0;

    if (c.isDefeated) continue;

    // Terrain tile round effects
    const pos = normalizePos(c.position);
    const tile = getTileAt(state.terrainTiles, pos.x, pos.y);

    if (tile?.type === 'regeneration') {
      if (c.wounds < c.maxWounds) {
        c.wounds = Math.min(c.maxWounds, c.wounds + 1);
        dotLog.push(`${c.name} regenerates 1 wound (terrain).`);
      }
    }
    if (tile?.type === 'poison') {
      c.wounds = Math.max(0, c.wounds - 2);
      dotLog.push(`${c.name} takes 2 poison damage (terrain).`);
      if (c.wounds <= 0) { c.isDefeated = true; dotLog.push(`${c.name} is defeated by poison!`); }
    }
    if (tile?.type === 'freeze' && Math.random() < 0.5) {
      c.frozenSkip = true;
      dotLog.push(`${c.name} is frozen and will skip next turn!`);
    }

    if (!c.activeEffects?.length) continue;

    const { remaining, expired, dotDamage, dotHeal } = tickEffects(c.activeEffects, 'rounds');
    c.activeEffects = remaining;

    if (dotDamage > 0) {
      c.wounds = Math.max(0, c.wounds - dotDamage);
      dotLog.push(`${c.name} takes ${dotDamage} DoT damage.`);
      roundEffectEvents.push({ target: c.name, action: 'dot', damage: dotDamage });
      if (c.wounds <= 0) { c.isDefeated = true; dotLog.push(`${c.name} is defeated by DoT!`); }
    }
    if (dotHeal > 0) {
      c.wounds = Math.min(c.maxWounds, c.wounds + dotHeal);
      dotLog.push(`${c.name} heals ${dotHeal} from effects.`);
      roundEffectEvents.push({ target: c.name, action: 'heal', heal: dotHeal });
    }
    if (expired.length > 0) {
      dotLog.push(`${c.name}: ${expired.map((e) => e.name).join(', ')} expired.`);
      for (const e of expired) {
        roundEffectEvents.push({ target: c.name, action: 'expired', effectName: e.name, category: e.category });
      }
    }
  }

  state.round += 1;
  state.turnIndex = 0;
  state.log = [...state.log, ...dotLog, `--- Round ${state.round} ---`];
  state.roundEffectEvents = roundEffectEvents;
  return state;
}

export function advanceTurn(combat) {
  const state = {
    ...combat,
    combatants: combat.combatants.map(c => ({ ...c })),
  };
  const current = state.combatants[state.turnIndex];

  // Bonus turn from Extra Turn tile: consume and keep the same turnIndex
  if (current && current.bonusTurn) {
    current.bonusTurn = false;
    return state;
  }

  let nextIndex = state.turnIndex + 1;
  while (nextIndex < state.combatants.length && state.combatants[nextIndex].isDefeated) {
    nextIndex++;
  }
  if (nextIndex >= state.combatants.length) {
    return advanceRound(state);
  }

  // Frozen skip: auto-skip this combatant's turn
  const next = state.combatants[nextIndex];
  if (next?.frozenSkip) {
    next.frozenSkip = false;
    state.turnIndex = nextIndex;
    state.log = [...(state.log || []), `${next.name} is frozen and skips their turn!`];
    return advanceTurn(state);
  }

  return { ...state, turnIndex: nextIndex };
}

export function getCurrentTurnCombatant(combat) {
  if (!combat || !combat.combatants) return null;
  return combat.combatants[combat.turnIndex] || null;
}

export function isCombatOver(combat) {
  if (!combat?.combatants) return true;
  if (combat.mode === SKIRMISH_MODE_BEER_DUEL || combat.mode === SKIRMISH_MODE_CARD_GAME || combat.mode === SKIRMISH_MODE_DICE_GAME) return false;
  const activeEnemies = combat.combatants.filter((c) => c.type === 'enemy' && !c.isDefeated);
  const activeFriendly = combat.combatants.filter((c) => (c.type === 'player' || c.type === 'ally') && !c.isDefeated);
  return activeEnemies.length === 0 || activeFriendly.length === 0;
}

export function isPlayerWinning(combat) {
  if (!combat?.combatants) return false;
  if (combat.mode === SKIRMISH_MODE_BEER_DUEL || combat.mode === SKIRMISH_MODE_CARD_GAME || combat.mode === SKIRMISH_MODE_DICE_GAME) return false;
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

  if (isRestricted(enemy.activeEffects, 'skip_turn')) {
    return { skipped: true, reason: 'skip_turn', enemyName: enemy.name };
  }

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
    if (canCharge(enemy, target, combat.combatants).valid) {
      return { manoeuvre: 'charge', targetId: target.id, moveToward: target.id };
    }
    return { manoeuvre: 'attack', targetId: target.id, moveToward: target.id };
  }

  if (Math.random() < 0.15) {
    return { manoeuvre: 'feint', targetId: target.id };
  }

  return { manoeuvre: 'attack', targetId: target.id };
}

const TILE_SCORE = { sureHit: 3, fury: 2, damageReduction: 1, regeneration: 1, extraTurn: 2, teleport: -1, poison: -3, freeze: -3 };

function scoreTileAt(terrainTiles, x, y) {
  const tile = getTileAt(terrainTiles, x, y);
  if (!tile) return 0;
  return TILE_SCORE[tile.type] || 0;
}

export function resolveEnemyTurns(combat) {
  let state = {
    ...combat,
    combatants: combat.combatants.map((c) => ({ ...c })),
    terrainTiles: (combat.terrainTiles || []).map(t => ({ ...t })),
  };
  const results = [];

  while (state.turnIndex < state.combatants.length) {
    const current = state.combatants[state.turnIndex];
    if (current.isDefeated) { state.turnIndex++; continue; }
    if (current.type === 'player') break;

    const action = getEnemyAction(state, current.id);
    if (action && action.skipped) {
      state.log = [...state.log, `${current.name} is stunned and skips their turn.`];
      results.push({ actor: current.name, actorId: current.id, actorType: current.type, manoeuvre: null, manoeuvreKey: null, outcome: 'skipped', restriction: 'skip_turn', rolls: [] });
      state.turnIndex++;
      if (isCombatOver(state)) break;
      continue;
    }
    if (action) {
      if (action.moveToward) {
        const moveTarget = state.combatants.find((c) => c.id === action.moveToward);
        if (moveTarget && !isInMeleeRange(current, moveTarget) && !gameData.manoeuvres[action.manoeuvre]?.closesDistance) {
          const cp = normalizePos(current.position);
          const tp = normalizePos(moveTarget.position);
          const enemyMoveMods = computeEffectiveMods(current.activeEffects);
          const effAllowance = Math.max(0, current.movementAllowance + enemyMoveMods.movementMod);
          const remaining = effAllowance - (current.movementUsed || 0);
          const totalDist = Math.max(Math.abs(tp.x - cp.x), Math.abs(tp.y - cp.y));
          const moveDist = Math.min(remaining, Math.max(0, totalDist - 1));
          if (moveDist > 0) {
            const W = gameData.BATTLEFIELD_WIDTH;
            const H = gameData.BATTLEFIELD_HEIGHT;
            let nx = cp.x, ny = cp.y;
            const enemyOccupied = getOccupiedCells(state.combatants, current.id);
            for (let step = 0; step < moveDist; step++) {
              const dx = tp.x - nx;
              const dy = tp.y - ny;
              if (dx === 0 && dy === 0) break;
              const sx = dx === 0 ? 0 : (dx > 0 ? 1 : -1);
              const sy = dy === 0 ? 0 : (dy > 0 ? 1 : -1);
              const directScore = scoreTileAt(state.terrainTiles, nx + sx, ny + sy);
              let bx = sx, by = sy;
              if (enemyOccupied.has(`${nx + bx}:${ny + by}`) || (directScore < 0 && (sx !== 0 || sy !== 0))) {
                const altMoves = [];
                if (sx !== 0) altMoves.push({ ax: sx, ay: 0 });
                if (sy !== 0) altMoves.push({ ax: 0, ay: sy });
                let found = false;
                for (const { ax, ay } of altMoves) {
                  if (!enemyOccupied.has(`${nx + ax}:${ny + ay}`)) {
                    const alt = scoreTileAt(state.terrainTiles, nx + ax, ny + ay);
                    if (alt >= 0) { bx = ax; by = ay; found = true; break; }
                  }
                }
                if (!found && enemyOccupied.has(`${nx + bx}:${ny + by}`)) break;
              }
              nx += bx;
              ny += by;
              enemyOccupied.delete(`${cp.x}:${cp.y}`);
              enemyOccupied.add(`${nx}:${ny}`);
            }
            current.position = { x: Math.max(0, Math.min(W - 1, nx)), y: Math.max(0, Math.min(H - 1, ny)) };
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

function computeManaDelta(combatant, original) {
  const combatMana = combatant?.mana?.current ?? null;
  const origMana = original?.mana?.current ?? null;
  if (combatMana === null || origMana === null) return 0;
  return combatMana - origMana;
}

function buildCombatStats(combat) {
  const ps = combat.playerStats || {};
  return {
    hits: ps.hits || 0,
    misses: ps.misses || 0,
    dodges: ps.dodges || 0,
    kills: ps.kills || 0,
    killsByTier: { ...(ps.killsByTier || { weak: 0, medium: 0, hard: 0, boss: 0 }) },
    damageDealt: ps.damageDealt || 0,
    damageTaken: ps.damageTaken || 0,
  };
}

export function endCombat(combat, playerCharacter) {
  const playerCombatant = combat.combatants.find((c) => c.type === 'player');
  const woundsDelta = playerCombatant ? playerCombatant.wounds - playerCharacter.wounds : 0;
  const manaDelta = computeManaDelta(playerCombatant, playerCharacter);
  const enemiesDefeated = combat.combatants.filter((c) => c.type === 'enemy' && c.isDefeated).length;
  const totalEnemies = combat.combatants.filter((c) => c.type === 'enemy').length;

  // Gather accumulated combat skill XP for the player
  const playerSkillXp = playerCombatant && combat.skillXpAccumulator?.[playerCombatant.id]
    ? { ...combat.skillXpAccumulator[playerCombatant.id] }
    : null;

  const playerSurvived = playerCombatant ? !playerCombatant.isDefeated : false;
  const isVictory = playerSurvived && enemiesDefeated === totalEnemies && totalEnemies > 0;
  const combatStats = buildCombatStats(combat);

  const combatResult = {
    outcome: isVictory ? 'victory' : 'defeat',
    mode: combat.mode || SKIRMISH_MODE_COMBAT,
    woundsChange: woundsDelta,
    manaChange: manaDelta,
    skillProgress: playerSkillXp,
    combatStats,
    enemiesDefeated,
    totalEnemies,
    rounds: combat.round,
    playerSurvived,
    flawless: isVictory && combatStats.damageTaken === 0,
    survivingEffects: playerCombatant?.activeEffects || [],
    skirmishSummary: null,
  };
  devLog.emit({ category: 'combat', type: 'combat_end', label: `Combat ended: ${combatResult.outcome} (${combatResult.rounds} rounds)`, data: { outcome: combatResult.outcome, rounds: combatResult.rounds, enemiesDefeated, totalEnemies, woundsChange: woundsDelta, flawless: combatResult.flawless, stats: combatStats } });
  return combatResult;
}

export function surrenderCombat(combat, playerCharacter) {
  const playerCombatant = combat.combatants.find((c) => c.type === 'player');
  const woundsDelta = playerCombatant ? playerCombatant.wounds - playerCharacter.wounds : 0;
  const manaDelta = computeManaDelta(playerCombatant, playerCharacter);
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
    woundsChange: woundsDelta,
    manaChange: manaDelta,
    skillProgress: playerSkillXp,
    combatStats: buildCombatStats(combat),
    enemiesDefeated, totalEnemies, remainingEnemies,
    rounds: combat.round, playerSurvived: true, reason: combat.reason || '',
  };
}

export function forceTruceCombat(combat, playerCharacter) {
  const playerCombatant = combat.combatants.find((c) => c.type === 'player');
  const woundsDelta = playerCombatant ? playerCombatant.wounds - playerCharacter.wounds : 0;
  const manaDelta = computeManaDelta(playerCombatant, playerCharacter);
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
    woundsChange: woundsDelta,
    manaChange: manaDelta,
    skillProgress: playerSkillXp,
    combatStats: buildCombatStats(combat),
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

  const W = gameData.BATTLEFIELD_WIDTH;
  const H = gameData.BATTLEFIELD_HEIGHT;
  const terrainTiles = spawnTerrainTiles(W, H, combatants);

  for (const c of combatants) { c.initiative = rollInitiative(c); }
  combatants.sort((a, b) => b.initiative - a.initiative);

  return {
    active: true, multiplayer: true, round: 1, turnIndex: 0,
    mode: SKIRMISH_MODE_COMBAT,
    combatants, terrainTiles, skirmish: null, log: ['Combat begins! Round 1.'], resolved: false,
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
    perCharacter[pc.name] = {
      wounds: combatant.wounds - pc.wounds,
      manaChange: computeManaDelta(combatant, pc),
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
    perCharacter[pc.name] = { wounds: combatant.wounds - pc.wounds, manaChange: computeManaDelta(combatant, pc), xp: baseXp, survived: true };
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
    perCharacter[pc.name] = { wounds: combatant.wounds - pc.wounds, manaChange: computeManaDelta(combatant, pc), xp: baseXp, survived: true };
  }

  return { outcome: 'truce', perCharacter, enemiesDefeated, totalEnemies, remainingEnemies,
    rounds: combat.round, reason: combat.reason || '' };
}
