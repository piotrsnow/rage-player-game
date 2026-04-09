/**
 * RPGon pricing utilities.
 * Currency: 1 Gold Crown (GC) = 10 Silver Shillings (SS) = 100 Copper Pennies (CP)
 */

export function normalizeCoins(copperTotal) {
  let cp = Math.max(0, Math.round(copperTotal));
  let ss = Math.floor(cp / 100);
  cp %= 100;
  let gc = Math.floor(ss / 10);
  ss %= 10;
  return { gold: gc, silver: ss, copper: cp };
}

/** @param {{ gold?: number, silver?: number, copper?: number }} price */
export function priceToCopper(price) {
  const g = price.gold ?? 0;
  const s = price.silver ?? 0;
  const c = price.copper ?? 0;
  return g * 100 + s * 10 + c;
}

/**
 * @param {object} item - Item with a .price field
 * @param {number} [reputationModifier] Percent change to list price (+10 = 10% dearer, -10 = cheaper)
 * @param {number} [locationModifier] From AVAILABILITY_MODIFIERS (city 0, town -10, …)
 */
export function calculatePrice(item, reputationModifier = 0, locationModifier = 0) {
  const base = priceToCopper(item.price);
  const repFactor = 1 + reputationModifier / 100;
  const locFactor = 1 - locationModifier / 100;
  return normalizeCoins(base * repFactor * locFactor);
}

export function formatCoinPrice(price) {
  const parts = [];
  if (price.gold) parts.push(`${price.gold} GC`);
  if (price.silver) parts.push(`${price.silver} SS`);
  if (price.copper) parts.push(`${price.copper} CP`);
  return parts.length ? parts.join(' ') : '0 CP';
}
