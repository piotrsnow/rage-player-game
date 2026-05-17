import { prisma } from '../../lib/prisma.js';
import { childLogger } from '../../lib/logger.js';
import { normalizeLocationName } from './worldStateService.js';

const log = childLogger({ module: 'npcNameGuard' });

/**
 * Load the set of normalized NPC names for a campaign. Includes both
 * CampaignNPC shadows and linked WorldNPC canonical names so the guard
 * catches collisions regardless of which NPC layer the AI is echoing.
 *
 * Returns a Set<string> of normalized names (lowercase, stripped).
 */
export async function loadCampaignNpcNames(campaignId) {
  if (!campaignId) return new Set();

  const [shadows, participants] = await Promise.all([
    prisma.npc.findMany({
      where: { campaignId },
      select: { name: true },
    }),
    prisma.campaignParticipant.findMany({
      where: { campaignId },
      select: { character: { select: { name: true } } },
    }),
  ]);

  const names = new Set();
  for (const s of shadows) {
    const norm = normalizeLocationName(s.name);
    if (norm && norm.length >= 3) names.add(norm);
  }
  for (const p of participants) {
    const norm = normalizeLocationName(p.character?.name);
    if (norm && norm.length >= 3) names.add(norm);
  }
  return names;
}

/**
 * Check whether a proposed location name collides with a known NPC name
 * in this campaign. Returns `true` when the name should be REJECTED
 * (it looks like an NPC, not a place).
 *
 * Uses normalized exact match — "Marta z Kamionki" blocked, "Dom Marty"
 * allowed. Safe for Polish: normalizeLocationName strips geo-prepositions
 * but preserves the core identity tokens.
 */
export function isNpcName(proposedLocationName, npcNamesSet) {
  if (!proposedLocationName || !npcNamesSet || npcNamesSet.size === 0) return false;
  const norm = normalizeLocationName(proposedLocationName);
  if (!norm || norm.length < 3) return false;
  return npcNamesSet.has(norm);
}
