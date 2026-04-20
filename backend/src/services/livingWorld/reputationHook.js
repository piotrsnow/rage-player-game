// Living World Phase 3 — post-scene reputation hook.
//
// Called from postSceneWork.js after processStateChanges has marked
// CampaignNPC.alive=false (and any other action outcomes). We:
//   1. Resolve each dead NPC's canonical WorldNPC (via CampaignNPC.worldNpcId).
//   2. Flip WorldNPC.alive=false (idempotent).
//   3. Nano-judge whether the kill was justified.
//   4. Apply reputation deltas via applyAttribution (ledger + scope upserts).
//   5. Write a WorldEvent `killed` for admin timeline + future cross-user sync.
//
// Gated on `campaign.livingWorldEnabled`. Never throws — failures log warnings
// and skip the affected NPC so the rest of post-scene work still completes.

import { prisma } from '../../lib/prisma.js';
import { childLogger } from '../../lib/logger.js';
import { judgeKill } from './justifiedKillJudge.js';
import { applyAttribution } from './reputationService.js';
import { killWorldNpc } from './worldStateService.js';
import { appendEvent } from './worldEventLog.js';

const log = childLogger({ module: 'reputationHook' });

/**
 * Process all NPC kills in a scene's stateChanges and translate them into
 * reputation ledger entries + scope updates.
 *
 * @param {object} params
 * @param {object} params.campaign      — full Campaign row (must have livingWorldEnabled,
 *                                        characterIds, userId)
 * @param {object} params.stateChanges  — parsed scene stateChanges (must have .npcs array)
 * @param {string} params.narrative     — scene narrative for judge prompt
 * @param {string} [params.playerAction]
 * @param {string} [params.provider]
 * @param {number} [params.timeoutMs]   — nano judge timeout
 * @returns {Promise<{processed: number, skipped: number}>}
 */
export async function handleNpcKills({
  campaign,
  stateChanges,
  narrative = '',
  playerAction = '',
  provider = 'openai',
  timeoutMs = 5000,
}) {
  if (!campaign?.livingWorldEnabled) return { processed: 0, skipped: 0 };
  const npcs = Array.isArray(stateChanges?.npcs) ? stateChanges.npcs : [];
  const deaths = npcs.filter((n) => n?.alive === false && n?.name);
  if (deaths.length === 0) return { processed: 0, skipped: 0 };

  const actorCharacterId = Array.isArray(campaign.characterIds) && campaign.characterIds[0]
    ? campaign.characterIds[0]
    : null;
  if (!actorCharacterId) {
    log.warn({ campaignId: campaign.id }, 'No actor character — skipping kill reputation');
    return { processed: 0, skipped: deaths.length };
  }

  let processed = 0;
  let skipped = 0;

  for (const death of deaths) {
    try {
      const npcId = death.name.toLowerCase().replace(/\s+/g, '_');
      const campaignNpc = await prisma.campaignNPC.findUnique({
        where: { campaignId_npcId: { campaignId: campaign.id, npcId } },
        select: { worldNpcId: true },
      });
      if (!campaignNpc?.worldNpcId) {
        skipped += 1;
        continue; // not a Living World NPC
      }

      const worldNpc = await prisma.worldNPC.findUnique({ where: { id: campaignNpc.worldNpcId } });
      if (!worldNpc) {
        skipped += 1;
        continue;
      }

      // Resolve scope context from current location (region + settlement = canonicalName)
      let region = null;
      let settlementKey = null;
      if (worldNpc.currentLocationId) {
        const loc = await prisma.worldLocation.findUnique({
          where: { id: worldNpc.currentLocationId },
          select: { region: true, canonicalName: true },
        });
        region = loc?.region || null;
        settlementKey = loc?.canonicalName || null;
      }

      // Judge + mark dead in parallel (the mark-dead is idempotent)
      const [judgeResult] = await Promise.all([
        judgeKill({
          narrative,
          victimName: worldNpc.name,
          victimAlignment: worldNpc.alignment,
          victimRole: worldNpc.role,
          playerAction,
          provider,
          timeoutMs,
        }),
        killWorldNpc(worldNpc.id),
      ]);

      // Fallback if judge failed: pessimistic for good, lenient for evil
      const fallbackJustified = worldNpc.alignment === 'evil';
      const justified = judgeResult?.justified ?? fallbackJustified;
      const confidence = judgeResult?.confidence ?? 0.3;
      const reason = judgeResult?.reason ?? (judgeResult ? '' : 'judge unavailable');

      await applyAttribution({
        actorCharacterId,
        actorCampaignId: campaign.id,
        worldNpcId: worldNpc.id,
        actionType: 'killed',
        victimAlignment: worldNpc.alignment,
        scopeContext: { region, settlementKey },
        justified,
        judgeConfidence: confidence,
        judgeReason: reason,
        gameTime: new Date(),
      });

      // Audit trail
      await appendEvent({
        worldNpcId: worldNpc.id,
        worldLocationId: worldNpc.currentLocationId || null,
        campaignId: campaign.id,
        userId: campaign.userId,
        eventType: 'killed',
        payload: {
          victimName: worldNpc.name,
          alignment: worldNpc.alignment,
          justified,
          confidence,
          reason,
        },
        visibility: 'campaign',
        gameTime: new Date(),
      });

      processed += 1;
    } catch (err) {
      skipped += 1;
      log.warn({ err: err?.message, victimName: death.name }, 'Kill reputation hook failed for NPC');
    }
  }

  if (processed > 0 || skipped > 0) {
    log.info({ campaignId: campaign.id, processed, skipped }, 'Kill reputation hook done');
  }
  return { processed, skipped };
}
