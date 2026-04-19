// Living World — promotion heuristic: CampaignNPC → WorldNPC (isAgent=true).
//
// Triggers on quest involvement. A named NPC who is a quest-giver or
// turn-in target is by definition important enough to persist globally.
// Plain background NPCs (villagers, guards without roles) stay local.

import { prisma } from '../../lib/prisma.js';
import { childLogger } from '../../lib/logger.js';
import { findOrCreateWorldNPC, findOrCreateWorldLocation } from './worldStateService.js';
import { decideNpcAdmission } from './topologyGuard.js';
import { getTemplate } from './settlementTemplates.js';

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
    let worldLocation = null;
    if (cn.lastLocation) {
      try {
        const loc = await findOrCreateWorldLocation(cn.lastLocation);
        worldLocation = loc || null;
        worldLocationId = loc?.id ?? null;
      } catch (err) {
        log.warn({ err, loc: cn.lastLocation }, 'Location resolution failed during promotion');
      }
    }

    // Phase 7 — cap enforcement. Count existing keyNpcs whose home or current
    // location is this parent settlement (or the location itself for top-level).
    // If cap reached, skip promotion — CampaignNPC remains as background,
    // which premium renders collectively via the Living World block.
    if (worldLocation) {
      const capScope = worldLocation.parentLocationId || worldLocation.id;
      const currentKeyNpcCount = await prisma.worldNPC.count({
        where: {
          keyNpc: true,
          alive: true,
          OR: [
            { homeLocationId: capScope },
            { currentLocationId: capScope },
          ],
        },
      });
      const template = getTemplate(worldLocation.locationType || 'generic');
      const maxKeyNpcs = worldLocation.maxKeyNpcs || template.maxKeyNpcs || 10;
      const decision = decideNpcAdmission({ currentKeyNpcCount, maxKeyNpcs });
      if (decision.admission === 'background') {
        log.info(
          { campaignId: cn.campaignId, npcId: cn.npcId, count: currentKeyNpcCount, max: maxKeyNpcs },
          'NPC cap reached — keeping as background, skipping promotion',
        );
        return null;
      }
    }

    // Dedupe via embedding, create if new
    const worldNpc = await findOrCreateWorldNPC({
      name: cn.name,
      role: cn.role || undefined,
      personality: cn.personality || undefined,
      alignment: 'neutral', // Phase 3 refines alignment via heuristics
      alive: cn.alive !== false,
      currentLocationId: worldLocationId,
    });
    if (!worldNpc) return null;

    // Set home location from initial spawn. Only on first promotion —
    // later re-promotions (shouldPromote returns null for already-promoted,
    // so this branch runs exactly once per NPC) leave homeLocationId alone.
    if (!worldNpc.homeLocationId && worldLocationId) {
      try {
        await prisma.worldNPC.update({
          where: { id: worldNpc.id },
          data: { homeLocationId: worldLocationId },
        });
        worldNpc.homeLocationId = worldLocationId;
      } catch (err) {
        log.warn({ err: err?.message, worldNpcId: worldNpc.id }, 'Home location set failed (non-fatal)');
      }
    }

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

    // Phase 5 — immediately assign an activeGoal if this NPC has a quest
    // role. Imports here to avoid cycle on module-load (questGoalAssigner
    // reads CampaignNPC which pulls in promotion logic indirectly).
    try {
      const { assignGoalsForCampaign } = await import('./questGoalAssigner.js');
      await assignGoalsForCampaign(cn.campaignId);
    } catch (err) {
      log.warn({ err: err?.message, campaignId: cn.campaignId }, 'Goal assignment on promotion failed (non-fatal)');
    }

    return worldNpc;
  } catch (err) {
    log.error({ err, campaignNpcId }, 'Promotion failed');
    return null;
  }
}
