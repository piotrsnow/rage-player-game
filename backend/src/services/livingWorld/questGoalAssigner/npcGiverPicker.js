/**
 * Phase D — weighted-hybrid quest-giver picker.
 *
 * Premium used to free-hand new NPCs on every "I ask about work" prompt.
 * This picker surfaces an existing roster NPC so repeat askers aren't
 * swamped with brand-new faces every scene. Non-binding — premium may
 * still invent if the hint feels narratively wrong.
 *
 * Called pre-premium when the classifier flags `questOfferLikely` AND
 * Phase C saturation is tight.
 */

import { prisma } from '../../../lib/prisma.js';
import { loadCampaignGraph } from '../travelGraph.js';
import { slugify } from './questRole.js';
import { roleMatchesQuestType } from './roleAffinity.js';

const STORY_FLAGS = /story[-_]critical|lock(?:ed)?[-_]campaign|main[-_]only/i;

async function resolveLocationName(locationId) {
  if (!locationId) return null;
  try {
    const loc = await prisma.worldLocation.findUnique({
      where: { id: locationId },
      select: { canonicalName: true },
    });
    return loc?.canonicalName || null;
  } catch {
    return null;
  }
}

/**
 * Weighting (after filtering by alive + keyNpc + role-affinity):
 *   60% local   — NPC at currentLocation OR at an edge-adjacent location
 *   30% lightly — NPC with < 2 quests assigned (giver or turn-in)
 *   10% wildcard — any eligible NPC
 *
 * Returns `{ name, role, location }` or null if no eligible NPC.
 */
export async function pickQuestGiver(campaignId, currentLocationName, { questType = null } = {}) {
  if (!campaignId) return null;

  const [npcs, quests] = await Promise.all([
    prisma.campaignNPC.findMany({
      where: { campaignId },
      select: {
        id: true, name: true, role: true, personality: true, alive: true,
        lastLocation: true, worldNpcId: true,
      },
    }),
    prisma.campaignQuest.findMany({
      where: { campaignId },
      select: { questId: true, questGiverId: true, turnInNpcId: true, status: true },
    }),
  ]).catch(() => [[], []]);

  if (!npcs.length) return null;

  // Count outstanding quests per NPC (slug-normalized).
  const questCountByGiver = new Map();
  for (const q of quests) {
    if (q.status === 'completed' || q.status === 'failed') continue;
    const giver = slugify(q.questGiverId);
    const turnIn = slugify(q.turnInNpcId);
    if (giver) questCountByGiver.set(giver, (questCountByGiver.get(giver) || 0) + 1);
    if (turnIn && turnIn !== giver) {
      questCountByGiver.set(turnIn, (questCountByGiver.get(turnIn) || 0) + 1);
    }
  }

  // Base filter: alive + role-affinity. Key-NPC filter + story-critical skip
  // via worldNpc lookup (single IN-query covering every candidate at once).
  const liveNpcs = npcs.filter((n) => n.alive !== false);
  const worldNpcIds = liveNpcs.map((n) => n.worldNpcId).filter(Boolean);
  const worldMap = new Map();
  if (worldNpcIds.length > 0) {
    try {
      const rows = await prisma.worldNPC.findMany({
        where: { id: { in: worldNpcIds } },
        select: { id: true, keyNpc: true, currentLocationId: true, activeGoal: true },
      });
      for (const r of rows) worldMap.set(r.id, r);
    } catch {
      // Non-fatal — fall through with empty map (keyNpc filter degrades to "all alive").
    }
  }

  const eligible = liveNpcs.filter((n) => {
    if (!n.name) return false;
    if (!roleMatchesQuestType(n.role || n.personality, questType)) return false;
    const wn = n.worldNpcId ? worldMap.get(n.worldNpcId) : null;
    if (wn && wn.keyNpc === false) return false;
    if (wn?.activeGoal && STORY_FLAGS.test(wn.activeGoal)) return false;
    return true;
  });
  if (!eligible.length) return null;

  // Build "local" set — same location as the player, OR any edge-adjacent
  // location. Edge-adjacent is loaded from the campaign's travel graph.
  const currentLocNorm = String(currentLocationName || '').toLowerCase().trim();
  let localLocationIds = new Set();
  try {
    if (currentLocationName) {
      const currentLoc = await prisma.worldLocation.findFirst({
        where: { canonicalName: currentLocationName },
        select: { id: true },
      });
      if (currentLoc?.id) {
        localLocationIds.add(currentLoc.id);
        const adj = await loadCampaignGraph(campaignId);
        const neighbors = adj.get(currentLoc.id) || [];
        for (const n of neighbors) {
          if (n.toId) localLocationIds.add(n.toId);
        }
      }
    }
  } catch {
    localLocationIds = new Set();
  }

  const isLocal = (n) => {
    if (currentLocNorm && String(n.lastLocation || '').toLowerCase().trim() === currentLocNorm) return true;
    const wn = n.worldNpcId ? worldMap.get(n.worldNpcId) : null;
    if (wn?.currentLocationId && localLocationIds.has(wn.currentLocationId)) return true;
    return false;
  };

  const localPool = eligible.filter(isLocal);
  const lightlyAssigned = eligible.filter((n) => {
    const slug = slugify(n.name);
    return (questCountByGiver.get(slug) || 0) < 2;
  });
  const wildcardPool = eligible;

  // Weighted roll. When a bucket is empty, its weight redistributes to the
  // next non-empty bucket so we don't return null just because nobody is
  // locally eligible.
  const buckets = [
    { pool: localPool, weight: 60 },
    { pool: lightlyAssigned, weight: 30 },
    { pool: wildcardPool, weight: 10 },
  ].filter((b) => b.pool.length > 0);
  if (!buckets.length) return null;

  const totalWeight = buckets.reduce((a, b) => a + b.weight, 0);
  let roll = Math.random() * totalWeight;
  let picked = buckets[buckets.length - 1].pool;
  for (const b of buckets) {
    roll -= b.weight;
    if (roll <= 0) { picked = b.pool; break; }
  }
  const chosen = picked[Math.floor(Math.random() * picked.length)];
  const wn = chosen.worldNpcId ? worldMap.get(chosen.worldNpcId) : null;
  let locationName = chosen.lastLocation || null;
  if (!locationName && wn?.currentLocationId) {
    locationName = await resolveLocationName(wn.currentLocationId);
  }
  return {
    name: chosen.name,
    role: chosen.role || chosen.personality || null,
    location: locationName,
  };
}
