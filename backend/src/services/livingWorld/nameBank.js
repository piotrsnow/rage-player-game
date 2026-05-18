// Living World — settlement name bank backed by the active naming style.
//
// Per-type pools for deterministic-flavor names used by worldSeeder when
// seeding per-campaign hamlets/villages/towns/cities. Capital is NOT here —
// the canonical capital `Yeralden` is seeded globally by `seedWorld.js` and
// shared across every Living World campaign.
//
// Keep each list large enough that two adjacent campaigns rarely collide on
// the same name, and so that fuzzy-dedup in `resolveWorldLocation` doesn't
// keep routing new campaigns onto the same rows. When a name is already
// taken (per-campaign already-used set OR an existing WorldLocation with
// that canonicalName is closer than the new slot's spacing tolerance),
// `pickSettlementName` falls through to the next candidate.

import { activeStyle } from '../../data/namingStyles/index.js';

const POOLS = activeStyle.nameBanks;

/**
 * Pick a name for the given settlement type that is not already in `usedSet`.
 * `usedSet` is a `Set<string>` — caller owns deduping across the current seed
 * pass plus optionally against existing WorldLocation canonical names.
 *
 * Falls back to `${baseName} II` (`III`, …) if the entire pool collides —
 * ensures seeding never hard-fails on a popular-name campaign.
 */
export function pickSettlementName(type, usedSet) {
  const pool = POOLS[type];
  if (!pool || pool.length === 0) {
    throw new Error(`nameBank: no pool for settlement type "${type}"`);
  }
  for (const name of pool) {
    if (!usedSet.has(name)) {
      usedSet.add(name);
      return name;
    }
  }
  // Exhausted — append roman-numeral suffix
  for (let suffix = 2; suffix <= 20; suffix += 1) {
    for (const name of pool) {
      const variant = `${name} ${romanize(suffix)}`;
      if (!usedSet.has(variant)) {
        usedSet.add(variant);
        return variant;
      }
    }
  }
  // Extremely unlikely — 600+ collisions. Last-resort fallback.
  const fallback = `${pool[0]} ${Date.now()}`;
  usedSet.add(fallback);
  return fallback;
}

const ROMAN = [
  ['X', 10], ['IX', 9], ['V', 5], ['IV', 4], ['I', 1],
];
function romanize(n) {
  let out = '';
  let rem = n;
  for (const [sym, val] of ROMAN) {
    while (rem >= val) {
      out += sym;
      rem -= val;
    }
  }
  return out;
}

export const SETTLEMENT_NAME_POOLS = POOLS;
