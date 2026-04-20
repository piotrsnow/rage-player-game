// Living World — Stale companion lock reaper.
//
// Runs daily (via Cloud Scheduler → /v1/internal/release-stale-campaign-locks).
// Finds WorldNPCs locked by campaigns that have been silent for
// STALE_CAMPAIGN_DAYS and forcibly releases them through companionService.
// The deferred outbox is still replayed — we don't lose the trip history,
// we just close it out with a "trail goes cold" summary.

import { prisma } from '../../lib/prisma.js';
import { childLogger } from '../../lib/logger.js';
import { leaveParty } from './companionService.js';

const log = childLogger({ module: 'staleLockCleaner' });

const STALE_LOCK_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Scan and release stale companion locks.
 *
 * Eligibility: lockedAt < now - STALE_LOCK_DAYS, AND the owning campaign's
 * lastSaved also < now - STALE_LOCK_DAYS (so active campaigns still
 * travelling with a companion don't get their NPC yanked).
 *
 * @returns {Promise<{ scanned: number, released: number, failures: number }>}
 */
export async function releaseStaleCampaignLocks({ staleDays = STALE_LOCK_DAYS } = {}) {
  const cutoff = new Date(Date.now() - staleDays * DAY_MS);

  const candidates = await prisma.worldNPC.findMany({
    where: {
      lockedAt: { lt: cutoff },
      lockedByCampaignId: { not: null },
    },
    select: {
      id: true,
      lockedByCampaignId: true,
      lockedAt: true,
      name: true,
    },
  });

  if (candidates.length === 0) {
    return { scanned: 0, released: 0, failures: 0 };
  }

  let released = 0;
  let failures = 0;

  for (const npc of candidates) {
    try {
      // Check if the owning campaign is also stale
      const campaign = await prisma.campaign.findUnique({
        where: { id: npc.lockedByCampaignId },
        select: { id: true, userId: true, lastSaved: true },
      });
      if (!campaign) {
        // Campaign deleted — release unconditionally
        await leaveParty({
          worldNpcId: npc.id,
          campaignId: npc.lockedByCampaignId,
          reason: 'campaign_deleted',
        });
        released += 1;
        continue;
      }
      if (campaign.lastSaved && campaign.lastSaved > cutoff) {
        // Active campaign, skip
        continue;
      }
      await leaveParty({
        worldNpcId: npc.id,
        campaignId: campaign.id,
        reason: 'trail_goes_cold',
        userId: campaign.userId || null,
      });
      released += 1;
    } catch (err) {
      log.warn({ err, worldNpcId: npc.id, name: npc.name }, 'Stale lock release failed');
      failures += 1;
    }
  }

  log.info({ scanned: candidates.length, released, failures, staleDays }, 'Stale lock sweep complete');
  return { scanned: candidates.length, released, failures };
}
