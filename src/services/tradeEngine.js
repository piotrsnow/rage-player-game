import { rollD100, calculateSL, getBonus } from './gameState';
import { getReputationModifier } from './reputationEngine';
import {
  EQUIPMENT,
  calculatePrice,
  priceToCopper,
  AVAILABILITY_MODIFIERS,
  CRAFTING_RECIPES,
} from '../data/wfrpEquipment';

const AVAILABILITY_ORDER = { common: 0, uncommon: 1, rare: 2, exotic: 3 };

function totalCopper(money) {
  return (money?.gold || 0) * 100 + (money?.silver || 0) * 10 + (money?.copper || 0);
}

function moneyFromCopper(total) {
  let t = Math.max(0, Math.round(total));
  return {
    gold: Math.floor(t / 100),
    silver: Math.floor((t % 100) / 10),
    copper: t % 10,
  };
}

function effectiveFel(character) {
  const base = character?.characteristics?.fel ?? 30;
  const adv = character?.advances?.fel ?? 0;
  return base + adv;
}

function resolveEquipmentEntry(item) {
  if (!item) return null;
  if (typeof item === 'string') {
    const def = EQUIPMENT[item];
    return def ? { id: item, ...def } : null;
  }
  if (item.price && item.name) {
    return { id: item.id || item.name, ...item };
  }
  return null;
}

function findRecipe(recipeId) {
  if (recipeId == null) return null;
  if (typeof recipeId === 'number' && Number.isInteger(recipeId)) {
    return CRAFTING_RECIPES[recipeId] ?? null;
  }
  const asNum = Number(recipeId);
  if (!Number.isNaN(asNum) && String(asNum) === String(recipeId).trim()) {
    return CRAFTING_RECIPES[asNum] ?? null;
  }
  const sid = String(recipeId).trim().toLowerCase();
  return (
    CRAFTING_RECIPES.find(
      (r) =>
        r.name.toLowerCase() === sid ||
        r.name.toLowerCase().replace(/\s+/g, '_') === sid
    ) ?? null
  );
}

function normName(s) {
  return String(s || '')
    .trim()
    .toLowerCase();
}

/** @returns {Record<string, number>} */
function inventoryMaterialCounts(inventory) {
  const counts = {};
  for (const entry of inventory || []) {
    if (typeof entry === 'string') {
      const k = normName(entry);
      counts[k] = (counts[k] || 0) + 1;
      continue;
    }
    const name = normName(entry?.name);
    if (!name) continue;
    const q = entry.quantity != null ? Number(entry.quantity) : 1;
    counts[name] = (counts[name] || 0) + (Number.isFinite(q) ? q : 1);
  }
  return counts;
}

function itemAvailableAtLocation(row, locationType) {
  const tier = row.availability || 'common';
  const rank = AVAILABILITY_ORDER[tier] ?? 0;
  const loc = locationType || 'city';

  if (loc === 'wilderness') return rank === 0;

  if (loc === 'village') {
    if (tier === 'exotic') return false;
    if (rank <= AVAILABILITY_ORDER.uncommon) return true;
    if (tier === 'rare') {
      const pool = Object.keys(EQUIPMENT)
        .filter((id) => EQUIPMENT[id].availability === 'rare')
        .sort();
      const stable = pool.indexOf(row.id);
      return stable >= 0 && stable % 3 === 0;
    }
    return false;
  }

  if (loc === 'town') return tier !== 'exotic';

  return true;
}

function formatCoinPrice(price) {
  const parts = [];
  if (price.gold) parts.push(`${price.gold} GC`);
  if (price.silver) parts.push(`${price.silver} SS`);
  if (price.copper) parts.push(`${price.copper} CP`);
  return parts.length ? parts.join(' ') : '0 CP';
}

/**
 * Fellowship-based haggle vs list price. Positive SL reduces price (10% per SL, max 50%); failure adds ~10%.
 */
export function performHaggleTest(
  character,
  basePrice,
  factionId = null,
  factionReputation = 0,
  locationModifier = 0
) {
  const rep =
    factionId != null
      ? getReputationModifier(factionId, factionReputation)
      : { fellowshipMod: 0 };
  const target =
    effectiveFel(character) + (rep.fellowshipMod || 0) + (locationModifier || 0);
  const roll = rollD100();
  const sl = calculateSL(roll, target);
  const success = sl >= 0;

  let discountPercent = 0;
  if (success && sl > 0) {
    discountPercent = Math.min(50, sl * 10);
  } else if (!success) {
    discountPercent = -10;
  }

  const baseCp = totalCopper(basePrice);
  let factor = 1;
  if (success && discountPercent > 0) {
    factor = 1 - discountPercent / 100;
  } else if (!success) {
    factor = 1.1;
  }

  const finalPrice = moneyFromCopper(baseCp * factor);
  const felTens = getBonus(effectiveFel(character));
  const description = success
    ? sl > 0
      ? `Haggle succeeded at +${sl} SL (Fellowship ${effectiveFel(character)}, +${felTens}): ${discountPercent}% off the asking price.`
      : `Haggle barely succeeds (Fellowship ${effectiveFel(character)}, +${felTens}); the merchant holds firm on the tag price.`
    : `Haggle fails (${sl} SL); the trader steels themselves and quotes a steeper price.`;

  return {
    success,
    roll,
    target,
    sl,
    finalPrice,
    discount: discountPercent,
    description,
  };
}

export function canAfford(character, price) {
  return totalCopper(character?.money) >= totalCopper(price);
}

/**
 * @param {object} character
 * @param {string|object} item - equipment id or item-shaped object with price
 * @param {number} quantity
 * @param {string|null} factionId
 * @param {number} factionReputation
 * @param {string} locationType - key of AVAILABILITY_MODIFIERS
 */
export function calculateTransaction(
  character,
  item,
  quantity = 1,
  factionId = null,
  factionReputation = 0,
  locationType = 'city'
) {
  const def = resolveEquipmentEntry(item);
  const q = Math.max(1, quantity || 1);
  const unitBaseCp = def ? priceToCopper(def.price) : 0;
  const totalBaseCp = unitBaseCp * q;

  const totalPrice = moneyFromCopper(totalBaseCp);

  const rep =
    factionId != null
      ? getReputationModifier(factionId, factionReputation)
      : { priceModifier: 1 };
  const priceModifier = rep.priceModifier ?? 1;
  const locMod = AVAILABILITY_MODIFIERS[locationType] ?? AVAILABILITY_MODIFIERS.city ?? 0;
  const repPercent = (priceModifier - 1) * 100;
  const locFactor = 1 - locMod / 100;

  const unitAdjusted = def
    ? calculatePrice(def, repPercent, locMod)
    : { gold: 0, silver: 0, copper: 0 };
  const adjustedCp = priceToCopper(unitAdjusted) * q;
  const adjustedPrice = moneyFromCopper(adjustedCp);

  const reputationDiscount = (1 - priceModifier) * 100;
  const locationMarkup = (locFactor - 1) * 100;

  return {
    totalPrice,
    adjustedPrice,
    canAfford: canAfford(character, adjustedPrice),
    reputationDiscount,
    locationMarkup,
  };
}

/**
 * Trade (skill) test; validates materials and required Trade skill on the sheet.
 */
export function performCraftingTest(character, recipeId) {
  const recipe = findRecipe(recipeId);
  if (!recipe) {
    return {
      success: false,
      roll: null,
      target: null,
      sl: null,
      resultItem: null,
      materialsConsumed: [],
      timeRequired: null,
      description: 'No matching recipe found.',
    };
  }

  const skillKey = recipe.requiredSkill;
  if (!Object.prototype.hasOwnProperty.call(character?.skills || {}, skillKey)) {
    return {
      success: false,
      roll: null,
      target: null,
      sl: null,
      resultItem: recipe.resultItem,
      materialsConsumed: [],
      timeRequired: recipe.time,
      description: `You have no training in ${skillKey}; you cannot attempt this craft properly.`,
    };
  }

  const counts = inventoryMaterialCounts(character?.inventory);
  const missing = [];
  for (const mat of recipe.requiredMaterials || []) {
    const need = mat.quantity ?? 1;
    const have = counts[normName(mat.name)] || 0;
    if (have < need) {
      missing.push(`${mat.name} (need ${need}, have ${have})`);
    }
  }
  if (missing.length) {
    return {
      success: false,
      roll: null,
      target: null,
      sl: null,
      resultItem: recipe.resultItem,
      materialsConsumed: [],
      timeRequired: recipe.time,
      description: `Insufficient materials: ${missing.join('; ')}.`,
    };
  }

  const dex = (character.characteristics?.dex ?? 30) + (character.advances?.dex ?? 0);
  const skill = character.skills[skillKey] ?? 0;
  const difficulty = recipe.difficulty ?? 0;
  const target = dex + skill + difficulty;
  const roll = rollD100();
  const sl = calculateSL(roll, target);
  const success = sl >= 0;

  const materialsConsumed = (recipe.requiredMaterials || []).map((m) => ({
    name: m.name,
    quantity: m.quantity ?? 1,
  }));

  const description = success
    ? `Craft succeeds at ${sl} SL: ${recipe.resultItem} is ready after ${recipe.time} hours.`
    : `The work goes wrong (${sl} SL); scrap the attempt or try again with better prep.`;

  return {
    success,
    roll,
    target,
    sl,
    resultItem: recipe.resultItem,
    materialsConsumed: success ? materialsConsumed : [],
    timeRequired: recipe.time,
    description,
  };
}

/**
 * @param {string} locationType - city | town | village | wilderness
 * @param {string|null} category - EQUIPMENT category key or null for all
 */
export function getAvailableItems(locationType = 'city', category = null) {
  const rows = Object.entries(EQUIPMENT)
    .map(([id, def]) => ({ id, ...def }))
    .filter((row) => !category || row.category === category)
    .filter((row) => itemAvailableAtLocation(row, locationType));

  return rows;
}

export function formatTradeForPrompt(availableItems) {
  if (!availableItems?.length) return 'TRADE STOCK: (nothing listed for this venue)\n';

  const lines = availableItems.map((e) => {
    const props = e.properties?.length ? ` [${e.properties.join('; ')}]` : '';
    return `- ${e.name} — ${formatCoinPrice(e.price)}; ${e.availability}; Enc ${e.weight}${props}. ${e.description}`;
  });

  return `TRADE STOCK:\n${lines.join('\n')}\n`;
}
