/**
 * RPGon Trade Engine — deterministic shop, buy/sell, haggling.
 * AI is used ONLY for haggle flavor text (called externally, not here).
 */

import { resolveSkillCheck } from './mechanics/skillCheck.js';
import {
  priceToCopper, normalizeCoins, calculatePrice, canAfford,
  applyDiscount, formatCoinPrice,
} from '../../shared/domain/pricing.js';
import { prefixedId } from '../../shared/domain/ids.js';

// ── Shop Archetypes ──

export const SHOP_ARCHETYPES = {
  blacksmith:  { categories: ['weapons', 'armour'], materialCategories: ['metal', 'misc'] },
  smith:       { categories: ['weapons', 'armour'], materialCategories: ['metal', 'misc'] },
  weaponsmith: { categories: ['weapons'], materialCategories: ['metal'] },
  armourer:    { categories: ['armour'], materialCategories: ['metal', 'fabric'] },
  apothecary:  { categories: ['medical'], materialCategories: ['herb', 'liquid', 'misc'] },
  herbalist:   { categories: ['medical'], materialCategories: ['herb', 'liquid'] },
  merchant:    { categories: ['adventuring_gear', 'food_drink', 'tools', 'clothing'], materialCategories: ['misc', 'fabric', 'wood'] },
  trader:      { categories: ['adventuring_gear', 'food_drink', 'tools', 'clothing'], materialCategories: ['misc', 'fabric', 'wood'] },
  tailor:      { categories: ['clothing'], materialCategories: ['fabric'] },
  innkeeper:   { categories: ['food_drink'] },
  jeweller:    { categories: ['clothing'], materialCategories: ['metal'] },
  goldsmith:   { categories: ['clothing'], materialCategories: ['metal'] },
  general:     { categories: ['adventuring_gear', 'food_drink', 'tools'], materialCategories: ['misc', 'wood'] },
};

// Sell price factor (50% of base price)
const SELL_FACTOR = 0.5;
const MAX_HAGGLE_ATTEMPTS = 3;
const MAX_RANDOM_ITEMS = 5;
const MIN_RANDOM_ITEMS = 3;

// Fallback base prices (in copper) when item has neither price nor resolvable baseType.
// Used so loot/reward items always sell for something rather than 0.
const RARITY_FALLBACK_COPPER = {
  common: 5,
  uncommon: 20,
  rare: 50,
  exotic: 100,
};

/**
 * Resolve an item's price from explicit field, baseType catalog lookup, or rarity fallback.
 * Returns { gold, silver, copper } — zeros only as last resort.
 *
 * @param {object} item - inventory/shop item (may lack `price`)
 * @param {object} [equipmentCatalog] - optional EQUIPMENT map keyed by baseType id
 * @returns {{gold:number, silver:number, copper:number}}
 */
export function resolveItemPrice(item, equipmentCatalog = null) {
  if (item?.price) return item.price;
  if (item?.baseType && equipmentCatalog) {
    const entry = equipmentCatalog[item.baseType];
    if (entry?.price) return entry.price;
  }
  const fallbackCopper = RARITY_FALLBACK_COPPER[item?.rarity] ?? RARITY_FALLBACK_COPPER.common;
  return normalizeCoins(fallbackCopper);
}

// ── Seeded PRNG (for consistent shop inventory per NPC) ──

function seedHash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return h;
}

function seededRandom(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) | 0;
    return ((s >>> 0) / 4294967296);
  };
}

function seededShuffle(arr, rng) {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// ── Archetype Resolution ──

/**
 * Resolve NPC role string to a shop archetype key.
 * Fuzzy: "town blacksmith" → "blacksmith", "traveling merchant" → "merchant".
 */
export function resolveShopArchetype(npcRole) {
  if (!npcRole) return 'general';
  const lower = npcRole.toLowerCase();
  for (const key of Object.keys(SHOP_ARCHETYPES)) {
    if (lower.includes(key)) return key;
  }
  return 'general';
}

// ── Shop Inventory Building ──

/**
 * Build deterministic shop inventory from equipment catalog + materials.
 * @param {string} archetypeKey - resolved archetype
 * @param {object} equipment - full equipment catalog (keyed by id)
 * @param {Array} materials - materials catalog array
 * @param {string} npcName - used as seed for randomization
 * @param {string} [locationType='city'] - affects availability filter
 * @returns {Array} shop items with prices
 */
export function buildShopInventory(archetypeKey, equipment, materials, npcName, locationType = 'city') {
  const archetype = SHOP_ARCHETYPES[archetypeKey] || SHOP_ARCHETYPES.general;
  const rng = seededRandom(seedHash(npcName + archetypeKey));
  const items = [];

  // Add equipment items matching archetype categories
  if (archetype.categories) {
    for (const [id, item] of Object.entries(equipment)) {
      if (!archetype.categories.includes(item.category)) continue;
      if (!filterByAvailability(item.availability, locationType, rng)) continue;
      items.push({ ...item, id, source: 'equipment' });
    }
  }

  // Add materials matching archetype material categories
  if (archetype.materialCategories && materials.length) {
    for (const mat of materials) {
      if (!archetype.materialCategories.includes(mat.category)) continue;
      if (!filterByAvailability(mat.availability, locationType, rng)) continue;
      items.push({ ...mat, id: `mat_${mat.name.toLowerCase().replace(/\s+/g, '_')}`, source: 'material' });
    }
  }

  return seededShuffle(items, rng);
}

/**
 * Build small random inventory for non-merchant NPCs.
 */
export function buildRandomInventory(npcName, equipment, materials) {
  const rng = seededRandom(seedHash(npcName + '_random'));
  const count = MIN_RANDOM_ITEMS + Math.floor(rng() * (MAX_RANDOM_ITEMS - MIN_RANDOM_ITEMS + 1));

  // Combine common items from both catalogs
  const pool = [];
  for (const [id, item] of Object.entries(equipment)) {
    if (item.availability === 'common') pool.push({ ...item, id, source: 'equipment' });
  }
  for (const mat of materials) {
    if (mat.availability === 'common') pool.push({ ...mat, id: `mat_${mat.name.toLowerCase().replace(/\s+/g, '_')}`, source: 'material' });
  }

  const shuffled = seededShuffle(pool, rng);
  return shuffled.slice(0, count);
}

function filterByAvailability(availability, locationType, rng) {
  const chances = {
    common: { city: 1, town: 0.9, village: 0.7, wilderness: 0.4 },
    uncommon: { city: 0.7, town: 0.5, village: 0.3, wilderness: 0.1 },
    rare: { city: 0.4, town: 0.2, village: 0.05, wilderness: 0 },
    exotic: { city: 0.15, town: 0.05, village: 0, wilderness: 0 },
  };
  const chance = chances[availability]?.[locationType] ?? chances.common[locationType] ?? 0.5;
  return rng() < chance;
}

// ── Trade Session ──

/**
 * Create a new trade session state object.
 */
export function createTradeSession(shopItems, npcData, locationMod = 0) {
  return {
    active: true,
    shopItems,
    npcName: npcData.name,
    npcRole: npcData.role || 'merchant',
    disposition: npcData.disposition || 0,
    locationMod,
    haggleAttempts: 0,
    maxHaggle: MAX_HAGGLE_ATTEMPTS,
    haggleLog: [],
    // Track per-item haggled prices: { [itemId]: { gold, silver, copper } }
    haggleDiscounts: {},
  };
}

// ── Pricing ──

/**
 * Calculate buy price for an item, applying disposition and location modifiers.
 */
export function calculateItemBuyPrice(item, disposition = 0, locationMod = 0, equipmentCatalog = null) {
  const price = resolveItemPrice(item, equipmentCatalog);
  // Disposition: -50 to +50 maps to +25% to -25% price modifier
  const dispositionMod = -(disposition / 2);
  return calculatePrice({ ...item, price }, dispositionMod, locationMod);
}

/**
 * Calculate sell price (50% of base, modified by Handel skill).
 */
export function calculateItemSellPrice(item, handelLevel = 0, equipmentCatalog = null) {
  const price = resolveItemPrice(item, equipmentCatalog);
  const base = priceToCopper(price);
  // Base 50%, +1% per Handel level (max 75%)
  const factor = Math.min(0.75, SELL_FACTOR + handelLevel * 0.01);
  return normalizeCoins(Math.max(1, Math.round(base * factor)));
}

// ── Haggling ──

/**
 * Resolve a haggle attempt using d50 skill check.
 * Returns mechanical result — AI flavor text is generated separately.
 */
export function resolveHaggle(character, currentMomentum = 0, difficulty = 'medium', worldNpcs = [], resolveDisposition = null) {
  const result = resolveSkillCheck({
    character,
    actionText: 'haggle negotiate price',
    currentMomentum,
    worldNpcs,
    resolveDisposition,
    actionContext: {
      attribute: 'charyzma',
      suggestedSkills: ['Handel', 'Perswazja', 'Blef'],
      difficulty,
    },
    difficultyOverride: difficulty,
  });

  if (!result) return { success: false, margin: 0, discountPercent: 0 };

  const discountPercent = result.success
    ? Math.min(30, Math.max(5, Math.round(result.margin * 2)))
    : 0;

  return {
    ...result,
    discountPercent,
  };
}

// ── Buy / Sell Execution ──

/**
 * Execute a purchase. Returns state changes to dispatch.
 */
export function executeBuy(item, finalPrice) {
  const moneyChange = {
    gold: -(finalPrice.gold || 0),
    silver: -(finalPrice.silver || 0),
    copper: -(finalPrice.copper || 0),
  };

  // Materials go to materialBag (stacked), equipment goes to inventory
  if (item.source === 'material') {
    return { moneyChange, newMaterials: [{ name: item.name, quantity: 1 }] };
  }

  const newItem = {
    id: prefixedId('item', 4),
    name: item.name,
    type: item.type || item.category || 'misc',
    rarity: item.rarity || item.availability || 'common',
    description: item.description,
  };

  // Preserve special fields
  if (item.weight != null) newItem.weight = item.weight;
  if (item.properties) newItem.properties = item.properties;
  if (item.effect) newItem.effect = item.effect;
  if (item.baseType) newItem.baseType = item.baseType;

  return { moneyChange, newItems: [newItem] };
}

/**
 * Execute a sale. Returns state changes to dispatch.
 */
export function executeSell(item, sellPrice) {
  return {
    moneyChange: {
      gold: sellPrice.gold || 0,
      silver: sellPrice.silver || 0,
      copper: sellPrice.copper || 0,
    },
    removeItems: [item.id],
  };
}

// Re-export for panel convenience
export { canAfford, formatCoinPrice, priceToCopper, applyDiscount };
