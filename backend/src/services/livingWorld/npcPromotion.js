// Living World — promotion heuristic: CampaignNPC → WorldNPC (isAgent=true).
//
// Triggers on quest involvement. A named NPC who is a quest-giver or
// turn-in target is by definition important enough to persist globally.
// Plain background NPCs (villagers, guards without roles) stay local.

import { prisma } from '../../lib/prisma.js';
import { childLogger } from '../../lib/logger.js';
import { findOrCreateWorldNPC, findOrCreateWorldLocation } from './worldStateService.js';

const log = childLogger({ module: 'npcPromotion' });

/**
 * Does this CampaignNPC qualify for promotion to WorldNPC?
 * Returns a reason string if yes, null if no.
 */
export async function shouldPromote(campaignNpc) {
  if (!campaignNpc) return null;
  // Already promoted — skip
  if (campaignNpc.worldNpcId && campaignNpc.isAgent) return null;
  if (!campaignNpc.name) return null;

  // Quest involvement — strongest signal
  const questCount = await prisma.campaignQuest.count({
    where: {
      campaignId: campaignNpc.campaignId,
      OR: [{ questGiverId: campaignNpc.npcId }, { turnInNpcId: campaignNpc.npcId }],
    },
  });
  if (questCount > 0) return 'quest_involvement';

  // Named NPC with role + personality (signalled as narratively important by DM)
  if (campaignNpc.role && campaignNpc.personality && campaignNpc.personality.length >= 20) {
    return 'named_with_personality';
  }

  return null;
}

/**
 * Attempt promotion. Idempotent: safe to call repeatedly — if the NPC is
 * already promoted (has worldNpcId + isAgent), returns early. Never throws.
 *
 * Flow:
 *   1. Check promotion heuristic
 *   2. Resolve current location → WorldLocation (create canonical if needed)
 *   3. Dedupe via embedding against WorldNPC → find existing or create
 *   4. Link CampaignNPC.worldNpcId + isAgent=true
 *   5. Append "promoted" WorldEvent (skipped here — handled by caller if wanted)
 */
export async function maybePromote(campaignNpcId) {
  try {
    const cn = await prisma.campaignNPC.findUnique({ where: { id: campaignNpcId } });
    if (!cn) return null;

    const reason = await shouldPromote(cn);
    if (!reason) return null;

    // Resolve location
    let worldLocationId = null;
    if (cn.lastLocation) {
      try {
        const loc = await findOrCreateWorldLocation(cn.lastLocation);
        worldLocationId = loc?.id ?? null;
      } catch (err) {
        log.warn({ err, loc: cn.lastLocation }, 'Location resolution failed during promotion');
      }
    }

    // Dedupe via embedding, create if new
    const worldNpc = await findOrCreateWorldNPC({
      name: cn.name,
      role: cn.role || undefined,
      personality: cn.personality || undefined,
      factionId: cn.factionId || undefined,
      alignment: 'neutral', // Phase 3 refines alignment via heuristics
      alive: cn.alive !== false,
      currentLocationId: worldLocationId,
    });
    if (!worldNpc) return null;

    // Link campaign NPC → world NPC
    await prisma.campaignNPC.update({
      where: { id: cn.id },
      data: {
        worldNpcId: worldNpc.id,
        isAgent: true,
      },
    });

    log.info(
      { campaignId: cn.campaignId, npcId: cn.npcId, worldNpcId: worldNpc.id, reason },
      'Promoted CampaignNPC → WorldNPC',
    );
    return worldNpc;
  } catch (err) {
    log.error({ err, campaignNpcId }, 'Promotion failed');
    return null;
  }
}
