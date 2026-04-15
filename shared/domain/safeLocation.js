export const SAFE_LOCATION_RE = /\b(tavern|inn|karczma|gospoda|oberża|oberza|tawerna|zajazd|świątynia|swiatynia|temple|sanctuary)\b/i;

export function isSafeLocation(loc) {
  if (!loc || typeof loc !== 'string') return false;
  return SAFE_LOCATION_RE.test(loc);
}
