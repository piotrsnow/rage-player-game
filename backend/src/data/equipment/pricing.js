/**
 * RPGon pricing utilities.
 * Currency: 1 ZK = 20 SK = 240 MK, 1 SK = 12 MK.
 */

import {
  moneyToCopper,
  normalizeCoins,
  formatMoney,
} from '../../../../shared/domain/currency.js';

export { normalizeCoins };

/** @param {{ gold?: number, silver?: number, copper?: number }} price */
export function priceToCopper(price) {
  return moneyToCopper(price);
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
  return formatMoney(price);
}
