/**
 * Living World Phase 5 — quest-driven NPC goal assignment.
 *
 * Given a campaign, computes activeGoal + target character for every
 * CampaignNPC with a quest role (giver or turnIn). Goal text is templated
 * by quest role + whether the player is co-located. As of Phase 12b Slice B
 * the assigner operates on the full CampaignNPC shadow pool regardless of
 * whether the NPC has been linked to a canonical WorldNPC — canonical
 * promotion is post-campaign admin-review only, so mid-play assignment
 * must not gate on `worldNpcId`.
 *
 * Runs on:
 *   - processQuestStatusChange (completed quest → advance to next giver)
 *   - postSceneWork (scene commit → re-evaluate co-location so waiting
 *     NPCs flip to seeker when player wanders off)
 *
 * Non-quest NPCs are left with activeGoal=null and don't tick.
 */

import { prisma } from '../../../lib/prisma.js';
import { childLogger } from '../../../lib/logger.js';
import { classifyQuestRole, buildGoalString } from './questRole.js';
import { generateBackgroundGoal } from './backgroundGoals.js';

const log = childLogger({ module: 'questGoalAssigner' });

// Re-exports so the barrel can forward every public symbol unchanged.
export { NPC_CATEGORIES, categorize } from './categories.js';
export { classifyQuestRole, buildGoalString } from './questRole.js';
export { generateBackgroundGoal } from './backgroundGoals.js';
export { pickQuestGiver } from './npcGiverPicker.js';

async function resolveCharacterName(characterId) {
  try {
    const char = await prisma.character.findUnique({
      where: { id: characterId },
      select: { name: true },
    });
    return char?.name || null;
  } catch {
    return null;
  }
}

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
 * Assign / refresh goals for all quest-involved NPCs of a campaign.
 * Idempotent — safe to call repeatedly. Operates on the full CampaignNPC
 * shadow pool; canonical WorldNPC home-derivation is optional and only
 * consulted when the shadow carries a `worldNpcId` link.
 *
 * @param {string} campaignId
 * @returns {{assigned: number, cleared: number, unchanged: number}}
 */
export async function assignGoalsForCampaign(campaignId) {
  if (!campaignId) return { assigned: 0, cleared: 0, unchanged: 0 };

  try {
    const [campaign, quests, campaignNpcs] = await Promise.all([
      prisma.campaign.findUnique({
        where: { id: campaignId },
        select: { id: true, characterIds: true, coreState: true },
      }),
      prisma.campaignQuest.findMany({ where: { campaignId } }),
      prisma.campaignNPC.findMany({
        where: { campaignId },
        select: {
          id: true, npcId: true, name: true, role: true, personality: true,
          lastLocation: true, lastLocationId: true, worldNpcId: true,
          activeGoal: true, goalProgress: true,
        },
      }),
    ]);
    if (!campaign) return { assigned: 0, cleared: 0, unchanged: 0 };

    const actorCharacterId = Array.isArray(campaign.characterIds) ? campaign.characterIds[0] : null;
    const characterName = actorCharacterId
      ? await resolveCharacterName(actorCharacterId)
      : null;
    const playerLocation = (campaign.coreState || {})?.world?.currentLocation || null;
    const playerLocNorm = String(playerLocation || '').toLowerCase().trim();

    let assigned = 0;
    let cleared = 0;
    let unchanged = 0;

    for (const cn of campaignNpcs) {
      const role = classifyQuestRole(cn.npcId, quests);
      const coLocated = playerLocNorm && String(cn.lastLocation || '').toLowerCase().trim() === playerLocNorm;

      // Canonical lookup is optional — only NPCs already linked to a WorldNPC
      // (seeded canonical or admin-approved promotion) expose a home to return
      // to. Ephemeral shadows fall back to quest-role goals plus background
      // goals without a home-derivation step.
      let canonical = null;
      if (cn.worldNpcId) {
        canonical = await prisma.worldNPC.findUnique({
          where: { id: cn.worldNpcId },
          select: { currentLocationId: true, homeLocationId: true },
        });
      }

      let nextGoal = buildGoalString(role, { characterName, coLocated });
      const shadowLocationId = cn.lastLocationId || canonical?.currentLocationId || null;
      if (!nextGoal && canonical?.homeLocationId && shadowLocationId !== canonical.homeLocationId) {
        const homeName = await resolveLocationName(canonical.homeLocationId);
        if (homeName) {
          nextGoal = `Wracam do swojego miejsca: ${homeName}.`;
        }
      }
      let backgroundMeta = null;
      if (!nextGoal) {
        backgroundMeta = generateBackgroundGoal(
          { role: cn.role, personality: cn.personality },
          { seed: Date.now() },
        );
        nextGoal = backgroundMeta?.text || null;
      }

      if (cn.activeGoal === nextGoal) {
        unchanged += 1;
        continue;
      }

      const shadowUpdate = { activeGoal: nextGoal };
      // Radiant quest flag (G3): when the background goal is offerable, embed
      // metadata in goalProgress so aiContextTools can surface the hook and
      // premium can emit newQuests with source='npc_radiant'.
      if (backgroundMeta?.offerable && backgroundMeta.template) {
        shadowUpdate.goalProgress = JSON.stringify({
          offerableAsQuest: true,
          questTemplate: backgroundMeta.template,
          source: 'background',
          updatedAt: new Date().toISOString(),
        });
      }
      // Round B — shadow OWNS the campaign-scoped goal. We do NOT mirror onto
      // WorldNPC: canonical has its own independent world-level goal ticked
      // by npcAgentLoop. Campaign mutations must never touch canon.
      await prisma.campaignNPC.update({ where: { id: cn.id }, data: shadowUpdate });

      if (nextGoal) assigned += 1;
      else cleared += 1;
    }

    log.info({ campaignId, assigned, cleared, unchanged }, 'Quest goal assigner done');
    return { assigned, cleared, unchanged };
  } catch (err) {
    log.warn({ err: err?.message, campaignId }, 'assignGoalsForCampaign failed');
    return { assigned: 0, cleared: 0, unchanged: 0 };
  }
}
