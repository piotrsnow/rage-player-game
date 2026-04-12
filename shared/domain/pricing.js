/**
 * Shared pricing utilities — single source of truth for currency math.
 * Used by frontend engines (tradeEngine, craftingEngine, alchemyEngine)
 * and backend (equipment pricing).
 *
 * Currency: 1 Gold Crown (GC) = 10 Silver Shillings (SS) = 100 Copper Pennies (CP)
 */

/** Convert a { gold, silver, copper } object to total copper. */
export function priceToCopper(price) {
  return (price.gold || 0) * 100 + (price.silver || 0) * 10 + (price.copper || 0);
}

/** Convert total copper back to normalized { gold, silver, copper }. */
export function normalizeCoins(copperTotal) {
  let cp = Math.max(0, Math.round(copperTotal));
  const gold = Math.floor(cp / 100);
  cp %= 100;
  const silver = Math.floor(cp / 10);
  cp %= 10;
  return { gold, silver, copper: cp };
}

/**
 * Apply reputation and location modifiers to an item's base price.
 * @param {object} item - Item with a .price field { gold, silver, copper }
 * @param {number} [reputationModifier=0] - Percent price change (+10 = 10% dearer)
 * @param {number} [locationModifier=0] - Location discount (city=0, town=10, village=20, wilderness=40)
 */
export function calculatePrice(item, reputationModifier = 0, locationModifier = 0) {
  const base = priceToCopper(item.price);
  const repFactor = 1 + reputationModifier / 100;
  const locFactor = 1 - locationModifier / 100;
  return normalizeCoins(Math.round(base * repFactor * locFactor));
}

/** Format a price object as human-readable string: "2 GC 3 SS 5 CP" */
export function formatCoinPrice(price) {
  const parts = [];
  if (price.gold) parts.push(`${price.gold} GC`);
  if (price.silver) parts.push(`${price.silver} SS`);
  if (price.copper) parts.push(`${price.copper} CP`);
  return parts.length ? parts.join(' ') : '0 CP';
}

/** Subtract price from money, returning new money (clamped to 0). */
export function subtractMoney(money, price) {
  const remaining = priceToCopper(money) - priceToCopper(price);
  return normalizeCoins(Math.max(0, remaining));
}

/** Add price to money. */
export function addMoney(money, price) {
  return normalizeCoins(priceToCopper(money) + priceToCopper(price));
}

/** Check if money >= price. */
export function canAfford(money, price) {
  return priceToCopper(money) >= priceToCopper(price);
}

/** Apply a percentage discount to a price. Returns new price object. */
export function applyDiscount(price, discountPercent) {
  const base = priceToCopper(price);
  const discounted = Math.round(base * (1 - discountPercent / 100));
  return normalizeCoins(Math.max(1, discounted)); // minimum 1 CP
}

/** Location modifier constants. */
export const LOCATION_MODIFIERS = {
  city: 0,
  town: 10,
  village: 20,
  wilderness: 40,
};
