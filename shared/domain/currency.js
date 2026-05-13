export const COPPER_PER_SILVER = 12;
export const SILVER_PER_GOLD = 20;
export const COPPER_PER_GOLD = COPPER_PER_SILVER * SILVER_PER_GOLD;

export const DEFAULT_CURRENCY_LABELS = {
  gold: 'ZK',
  silver: 'SK',
  copper: 'MK',
};

export function moneyToCopper(money = {}) {
  return (
    (money.gold || 0) * COPPER_PER_GOLD
    + (money.silver || 0) * COPPER_PER_SILVER
    + (money.copper || 0)
  );
}

export function normalizeCoins(copperTotal) {
  let copper = Math.max(0, Math.round(copperTotal || 0));
  const gold = Math.floor(copper / COPPER_PER_GOLD);
  copper %= COPPER_PER_GOLD;
  const silver = Math.floor(copper / COPPER_PER_SILVER);
  copper %= COPPER_PER_SILVER;
  return { gold, silver, copper };
}

export function addMoney(money, delta) {
  return normalizeCoins(moneyToCopper(money) + moneyToCopper(delta));
}

export function formatMoneyParts(money = {}, labels = DEFAULT_CURRENCY_LABELS, { absolute = false } = {}) {
  const parts = [];
  const value = (amount) => (absolute ? Math.abs(amount || 0) : (amount || 0));
  if (money.gold) parts.push(`${value(money.gold)} ${labels.gold || DEFAULT_CURRENCY_LABELS.gold}`);
  if (money.silver) parts.push(`${value(money.silver)} ${labels.silver || DEFAULT_CURRENCY_LABELS.silver}`);
  if (money.copper) parts.push(`${value(money.copper)} ${labels.copper || DEFAULT_CURRENCY_LABELS.copper}`);
  return parts;
}

export function formatMoney(money = {}, labels = DEFAULT_CURRENCY_LABELS, options = {}) {
  const parts = formatMoneyParts(money, labels, options);
  return parts.length ? parts.join(' ') : `0 ${labels.copper || DEFAULT_CURRENCY_LABELS.copper}`;
}
