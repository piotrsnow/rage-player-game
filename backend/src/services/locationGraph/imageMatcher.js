import { prisma } from '../../lib/prisma.js';

/**
 * Find an existing node sprite image that is similar enough to reuse for a
 * newly-created location node. Similarity is scored by locationType (hard
 * filter), biome match (+2), and tag overlap (+1 per shared tag, max 5).
 *
 * @param {{ locationType: string, biome: string|null, tags: string[] }} params
 * @returns {Promise<string|null>} URL of matching image, or null
 */
export async function findSimilarNodeImage({ locationType, biome, tags }) {
  if (!locationType || locationType === 'generic') return null;

  const normalizedTags = (tags || []).map((t) => t.toLowerCase().trim()).filter(Boolean);
  const normalizedBiome = biome?.toLowerCase().trim() || null;

  const [worldRows, campaignRows] = await Promise.all([
    prisma.worldLocation.findMany({
      where: { nodeImageUrl: { not: null }, locationType },
      select: { nodeImageUrl: true, biome: true, tags: true },
    }),
    prisma.campaignLocation.findMany({
      where: { nodeImageUrl: { not: null }, locationType },
      select: { nodeImageUrl: true, biome: true, tags: true },
    }),
  ]);

  const seen = new Set();
  const candidates = [];

  for (const row of [...worldRows, ...campaignRows]) {
    if (!row.nodeImageUrl || seen.has(row.nodeImageUrl)) continue;
    seen.add(row.nodeImageUrl);
    candidates.push(row);
  }

  if (candidates.length === 0) return null;

  let bestUrl = null;
  let bestScore = 0;

  for (const c of candidates) {
    let score = 0;

    const cBiome = c.biome?.toLowerCase().trim() || null;
    if (normalizedBiome && cBiome && normalizedBiome === cBiome) {
      score += 2;
    }

    const cTags = (Array.isArray(c.tags) ? c.tags : []).map((t) => t.toLowerCase().trim());
    let tagHits = 0;
    for (const t of normalizedTags) {
      if (cTags.includes(t) && tagHits < 5) {
        score += 1;
        tagHits++;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestUrl = c.nodeImageUrl;
    }
  }

  return bestScore >= 1 ? bestUrl : null;
}
