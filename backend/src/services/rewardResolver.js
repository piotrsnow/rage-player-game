/**
 * Deterministic reward resolution engine.
 *
 * AI returns abstract reward descriptors (type, rarity, quantity, context).
 * This module resolves them into concrete newItems / newMaterials / moneyChange.
 *
 * Pattern follows calculateFreeformSkillXP and fillEnemiesFromBestiary:
 * consume AI metadata → produce concrete state changes → delete metadata.
 */

import { EQUIPMENT, MATERIALS, normalizeCoins, priceToCopper, ALCHEMY_RECIPES } from '../data/equipment/index.js';
import { prefixedId } from '../../../shared/domain/ids.js';

// ── Constants ──

const AVAILABILITY_ORDER = { common: 0, uncommon: 1, rare: 2, exotic: 3 };

const QUANTITY_MAP = { one: [1, 1], few: [1, 2], some: [2, 3], many: [3, 5] };

/** Money base amounts in copper per scene range. */
const MONEY_SCALE = [
  { maxScene: 5, base: 8 },
  { maxScene: 10, base: 20 },
  { maxScene: 15, base: 50 },
  { maxScene: 20, base: 100 },
  { maxScene: 30, base: 250 },
  { maxScene: 45, base: 500 },
  { maxScene: Infinity, base: 1000 },
];

const CONTEXT_MULTIPLIER = {
  quest_reward: 1.5,
  loot: 1.0,
  gift: 0.8,
  found: 0.6,
};

/** Rarity auto-pick probability tables per scene bracket. */
const RARITY_BRACKETS = [
  { maxScene: 15, odds: [80, 20, 0] },   // [common%, uncommon%, rare%]
  { maxScene: 30, odds: [40, 40, 20] },
  { maxScene: Infinity, odds: [0, 40, 60] },
];

/** Equipment category mapping from reward type to EQUIPMENT.category. */
const TYPE_TO_CATEGORY = {
  weapon: 'weapons',
  armour: 'armour',
  shield: 'shields',
  gear: 'adventuring_gear',
  medical: 'medical',
};

// Non-inventoriable categories to exclude from item rewards.
const EXCLUDE_CATEGORIES = new Set(['lodging', 'services', 'food_drink', 'animals']);

// Combat categories where we filter by price tier instead of availability.
const COMBAT_CATEGORIES = new Set(['weapons', 'armour', 'shields']);

/** Max item price (in copper) per rarity for combat equipment. Prevents common-rarity Great Weapons. */
const COMBAT_PRICE_CAP = {
  common: 100,    // up to 1 GC (daggers, clubs, leather, buckler)
  uncommon: 300,  // up to 3 GC (rapier, flail, mail shirt, shield)
  rare: Infinity, // no cap (great weapon, crossbow, full plate, tower shield)
};

// ── Helpers ──

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInRange(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function availabilityAtMost(itemAvailability, maxRarity) {
  return (AVAILABILITY_ORDER[itemAvailability] ?? 0) <= (AVAILABILITY_ORDER[maxRarity] ?? 0);
}

/** Enforce rarity gate: exotic never available from rewards, rare requires scene 16+. */
function enforceRarityGate(requestedRarity, sceneCount) {
  let rarity = requestedRarity || 'common';
  if (rarity === 'exotic') rarity = 'rare';
  if (rarity === 'rare' && sceneCount < 16) rarity = 'uncommon';
  return rarity;
}

/** Auto-pick rarity based on scene count when AI omits it. */
function autoPickRarity(sceneCount) {
  const bracket = RARITY_BRACKETS.find(b => sceneCount <= b.maxScene) || RARITY_BRACKETS[RARITY_BRACKETS.length - 1];
  const roll = Math.random() * 100;
  if (roll < bracket.odds[0]) return 'common';
  if (roll < bracket.odds[0] + bracket.odds[1]) return 'uncommon';
  return 'rare';
}

function resolveQuantity(hint) {
  const range = QUANTITY_MAP[hint] || QUANTITY_MAP.one;
  return randomInRange(range[0], range[1]);
}

function getMoneyBase(sceneCount) {
  const entry = MONEY_SCALE.find(e => sceneCount <= e.maxScene) || MONEY_SCALE[MONEY_SCALE.length - 1];
  return entry.base;
}

// ── Pre-built indexes ──

const equipmentEntries = Object.entries(EQUIPMENT).map(([id, e]) => ({ id, ...e }));

// ── Resolution per type ──

function resolveMaterial(descriptor, rarity) {
  const qty = resolveQuantity(descriptor.quantity);
  const pool = MATERIALS.filter(m => {
    if (!availabilityAtMost(m.availability, rarity)) return false;
    if (descriptor.category && m.category !== descriptor.category) return false;
    return true;
  });
  if (pool.length === 0) return { newMaterials: [] };
  const picked = [];
  for (let i = 0; i < qty; i++) {
    picked.push({ name: pickRandom(pool).name, quantity: 1 });
  }
  // Stack duplicates
  const stacked = [];
  for (const item of picked) {
    const existing = stacked.find(s => s.name.toLowerCase() === item.name.toLowerCase());
    if (existing) existing.quantity++;
    else stacked.push({ ...item });
  }
  return { newMaterials: stacked };
}

function resolveEquipmentItem(descriptor, rarity) {
  const targetCategory = TYPE_TO_CATEGORY[descriptor.type];
  if (!targetCategory) return { newItems: [] };

  const pool = equipmentEntries.filter(e => {
    if (e.category !== targetCategory) return false;
    if (EXCLUDE_CATEGORIES.has(e.category)) return false;
    // Combat equipment: filter by price tier (no availability field)
    if (COMBAT_CATEGORIES.has(e.category)) {
      const cap = COMBAT_PRICE_CAP[rarity] ?? Infinity;
      if (priceToCopper(e.price) > cap) return false;
    } else {
      // Non-combat gear/medical: filter by availability
      if (e.availability && !availabilityAtMost(e.availability, rarity)) return false;
    }
    // Exclude ammunition-type items from random drops
    if (e.properties?.includes('Ammunition')) return false;
    return true;
  });
  if (pool.length === 0) return { newItems: [] };

  const chosen = pickRandom(pool);
  return {
    newItems: [{
      id: prefixedId('reward', 4),
      name: chosen.name,
      type: descriptor.type === 'weapon' ? 'weapon' : descriptor.type === 'armour' ? 'armor' : descriptor.type === 'shield' ? 'shield' : chosen.category,
      baseType: chosen.id,
      rarity,
      description: chosen.description || '',
    }],
  };
}

function resolveMoney(descriptor, sceneCount) {
  const base = getMoneyBase(sceneCount);
  const contextMult = CONTEXT_MULTIPLIER[descriptor.context] || 1;
  // Randomize ±50%
  const variance = 0.5 + Math.random(); // 0.5 to 1.5
  const copperAmount = Math.round(base * contextMult * variance);
  return { moneyChange: normalizeCoins(copperAmount) };
}

function resolvePotion(descriptor, rarity) {
  const pool = ALCHEMY_RECIPES.filter(r =>
    r.resultItem && availabilityAtMost(r.resultItem.rarity || 'common', rarity)
  );
  if (pool.length === 0) return { newItems: [] };

  const recipe = pickRandom(pool);
  return {
    newItems: [{
      id: prefixedId('reward', 4),
      name: recipe.resultItem.name,
      type: 'potion',
      rarity: recipe.resultItem.rarity || 'common',
      description: recipe.description || '',
      effect: recipe.resultItem.effect,
    }],
  };
}

// ── Main resolver ──

/**
 * Resolve abstract reward descriptors into concrete state changes.
 * @param {Array} rewards - Array of reward descriptors from AI
 * @param {object} context
 * @param {number} context.sceneCount - Campaign scene progression
 * @returns {{ newItems: object[], newMaterials: object[], moneyChange: {gold,silver,copper} }}
 */
export function resolveRewards(rewards, { sceneCount = 0 } = {}) {
  const result = { newItems: [], newMaterials: [], moneyChange: { gold: 0, silver: 0, copper: 0 } };

  for (const desc of rewards) {
    if (!desc?.type) continue;

    const rarity = desc.rarity
      ? enforceRarityGate(desc.rarity, sceneCount)
      : enforceRarityGate(autoPickRarity(sceneCount), sceneCount);

    let resolved;
    switch (desc.type) {
      case 'material':
        resolved = resolveMaterial(desc, rarity);
        break;
      case 'weapon':
      case 'armour':
      case 'shield':
      case 'gear':
      case 'medical':
        resolved = resolveEquipmentItem(desc, rarity);
        break;
      case 'money':
        resolved = resolveMoney(desc, sceneCount);
        break;
      case 'potion':
        resolved = resolvePotion(desc, rarity);
        break;
      default:
        continue;
    }

    if (resolved.newItems) result.newItems.push(...resolved.newItems);
    if (resolved.newMaterials) result.newMaterials.push(...resolved.newMaterials);
    if (resolved.moneyChange) {
      result.moneyChange.gold += resolved.moneyChange.gold || 0;
      result.moneyChange.silver += resolved.moneyChange.silver || 0;
      result.moneyChange.copper += resolved.moneyChange.copper || 0;
    }
  }

  // Normalize final money
  if (result.moneyChange.gold || result.moneyChange.silver || result.moneyChange.copper) {
    const totalCopper = result.moneyChange.gold * 100 + result.moneyChange.silver * 10 + result.moneyChange.copper;
    result.moneyChange = normalizeCoins(totalCopper);
  }

  return result;
}

/**
 * Post-processing step: resolve rewards in stateChanges and merge into concrete fields.
 * Consumes stateChanges.rewards and deletes it (same pattern as skillsUsed).
 */
export function resolveAndApplyRewards(stateChanges, { sceneCount = 0 } = {}) {
  if (!stateChanges?.rewards?.length) return;

  const resolved = resolveRewards(stateChanges.rewards, { sceneCount });

  // Merge newItems
  if (resolved.newItems.length > 0) {
    if (!stateChanges.newItems) stateChanges.newItems = [];
    stateChanges.newItems.push(...resolved.newItems);
  }

  // Merge newMaterials
  if (resolved.newMaterials.length > 0) {
    if (!stateChanges.newMaterials) stateChanges.newMaterials = [];
    stateChanges.newMaterials.push(...resolved.newMaterials);
  }

  // Merge moneyChange
  const mc = resolved.moneyChange;
  if (mc.gold || mc.silver || mc.copper) {
    if (!stateChanges.moneyChange) stateChanges.moneyChange = { gold: 0, silver: 0, copper: 0 };
    stateChanges.moneyChange.gold = (stateChanges.moneyChange.gold || 0) + mc.gold;
    stateChanges.moneyChange.silver = (stateChanges.moneyChange.silver || 0) + mc.silver;
    stateChanges.moneyChange.copper = (stateChanges.moneyChange.copper || 0) + mc.copper;
  }

  // Consume the rewards field
  delete stateChanges.rewards;
}
