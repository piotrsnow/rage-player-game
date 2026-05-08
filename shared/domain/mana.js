/**
 * Ensures mana pool numbers are finite. NaN/Infinity/undefined become 0 so bad
 * arithmetic cannot poison UI or downstream clamp math.
 *
 * @param {{ current?: unknown, max?: unknown } | null | undefined} mana
 * @returns {{ current: number, max: number }}
 */
export function sanitizeMana(mana) {
  if (!mana || typeof mana !== 'object') return { current: 0, max: 0 };
  const cur = Number(mana.current);
  const max = Number(mana.max);
  return {
    current: Number.isFinite(cur) ? cur : 0,
    max: Number.isFinite(max) ? max : 0,
  };
}
