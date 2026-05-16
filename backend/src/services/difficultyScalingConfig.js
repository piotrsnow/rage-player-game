import { prisma } from '../lib/prisma.js';

const DEFAULT_TIER_SCALE = {
  low:    { attrMul: 1.0, woundsMul: 1.0, skillBonus: 0, armourBonus: 0 },
  medium: { attrMul: 1.2, woundsMul: 1.25, skillBonus: 1, armourBonus: 1 },
  high:   { attrMul: 1.4, woundsMul: 1.5, skillBonus: 2, armourBonus: 1 },
  deadly: { attrMul: 1.7, woundsMul: 1.8, skillBonus: 4, armourBonus: 2 },
};

let cached = null;
let cachedAt = 0;
const TTL_MS = 60_000;

export function invalidateDifficultyScalingCache() {
  cached = null;
  cachedAt = 0;
}

export async function loadDifficultyScaling() {
  if (cached && Date.now() - cachedAt < TTL_MS) return cached;

  const row = await prisma.serverSettings.findUnique({ where: { id: 'singleton' } });
  const raw = (row?.difficultyScaling && typeof row.difficultyScaling === 'object') ? row.difficultyScaling : {};

  const merged = {};
  for (const tier of Object.keys(DEFAULT_TIER_SCALE)) {
    merged[tier] = { ...DEFAULT_TIER_SCALE[tier], ...(raw[tier] || {}) };
  }

  cached = merged;
  cachedAt = Date.now();
  return merged;
}

export async function getScaleForTier(tier) {
  const all = await loadDifficultyScaling();
  return all[tier] || all.low || DEFAULT_TIER_SCALE.low;
}
