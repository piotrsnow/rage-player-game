// Living World — NPC pause/resume lifecycle.
//
// When player leaves a location: pauseNpcsAtLocation captures a snapshot
// of every agent NPC at that location. When player returns (or another
// event queries the location): resumeNpcsAtLocation replays the offline
// gap via offlineSummarizer, emits resume events, and clears pausedAt.

import { prisma } from '../../lib/prisma.js';
import { childLogger } from '../../lib/logger.js';
import { findOrCreateWorldLocation } from './worldStateService.js';
import { appendEvent, forNpc } from './worldEventLog.js';
import { summarizeOfflineActivity } from './offlineSummarizer.js';
import { gameTimeSince, formatGameDuration, wasClamped } from './worldTimeService.js';

const log = childLogger({ module: 'npcLifecycle' });

// Skip summary if offline gap is trivial — avoids nano cost for tiny blinks.
const MIN_GAME_MS_FOR_SUMMARY = 30 * 60 * 1000; // 30 game-minutes

/**
 * Mark all agent NPCs at a location as paused. Idempotent: NPCs already
 * paused are skipped. Called when player's currentLocation changes.
 *
 * @param {string} prevLocationName — human-readable location being left
 * @returns {Promise<{paused: number, skipped: number}>}
 */
export async function pauseNpcsAtLocation(prevLocationName) {
  if (!prevLocationName) return { paused: 0, skipped: 0 };

  const location = await findOrCreateWorldLocation(prevLocationName);
  if (!location) return { paused: 0, skipped: 0 };

  // Phase 2: skip companions (they travel with the player — pausing them would
  // defeat the point) and skip already-locked NPCs (some other campaign owns
  // them; their state is frozen for us anyway).
  const npcs = await prisma.worldNPC.findMany({
    where: {
      currentLocationId: location.id,
      alive: true,
      pausedAt: null,
      companionOfCampaignId: null,
      lockedByCampaignId: null,
    },
  });
  if (npcs.length === 0) return { paused: 0, skipped: 0 };

  const pausedAt = new Date();
  let paused = 0;
  let skipped = 0;

  for (const npc of npcs) {
    try {
      // Snapshot: last-known activity log (top 5 recent events) for eventual resume
      const recent = await forNpc({ worldNpcId: npc.id, limit: 5 });
      const snapshot = {
        pausedAt: pausedAt.toISOString(),
        locationId: location.id,
        locationName: location.canonicalName,
        recentEventIds: recent.map((e) => e.id),
      };

      await prisma.worldNPC.update({
        where: { id: npc.id },
        data: {
          pausedAt,
          pauseSnapshot: JSON.stringify(snapshot),
        },
      });

      // Audit event
      await appendEvent({
        worldNpcId: npc.id,
        worldLocationId: location.id,
        eventType: 'pause_snapshot',
        payload: snapshot,
        gameTime: pausedAt,
      });

      paused += 1;
    } catch (err) {
      log.warn({ err, worldNpcId: npc.id }, 'Failed to pause NPC');
      skipped += 1;
    }
  }

  return { paused, skipped };
}

/**
 * Resume (unpause) all agent NPCs at a location. For each paused NPC:
 *   1. compute game-time elapsed (capped by campaign.worldTimeMaxGapDays)
 *   2. if > threshold, call offlineSummarizer nano
 *   3. apply resulting state (stillHere flag may move NPC elsewhere)
 *   4. emit resume_summary WorldEvent with narrativeBlurb
 *   5. clear pausedAt
 *
 * Returns narrative blurbs so the scene context assembler can inject them.
 *
 * @param {string} newLocationName — human-readable location being entered
 * @param {object} campaign — Campaign row (for worldTimeRatio, worldTimeMaxGapDays, userId, id)
 * @param {{ provider?: string, timeoutMs?: number }} [opts]
 * @returns {Promise<{ blurbs: string[], resumed: number, skipped: number }>}
 */
export async function resumeNpcsAtLocation(newLocationName, campaign, { provider = 'openai', timeoutMs = 8000 } = {}) {
  if (!newLocationName || !campaign) return { blurbs: [], resumed: 0, skipped: 0 };

  const location = await findOrCreateWorldLocation(newLocationName);
  if (!location) return { blurbs: [], resumed: 0, skipped: 0 };

  // Phase 2: also skip locked NPCs — they're owned by another campaign and
  // their state is invisible to global queries until leaveParty flushes.
  const npcs = await prisma.worldNPC.findMany({
    where: {
      currentLocationId: location.id,
      alive: true,
      pausedAt: { not: null },
      lockedByCampaignId: null,
    },
  });
  if (npcs.length === 0) return { blurbs: [], resumed: 0, skipped: 0 };

  const ratio = campaign.worldTimeRatio ?? 24;
  const capDays = campaign.worldTimeMaxGapDays ?? 7;
  const now = new Date();
  const blurbs = [];
  let resumed = 0;
  let skipped = 0;

  for (const npc of npcs) {
    try {
      const gameMs = gameTimeSince(npc.pausedAt, { ratio, capDays, now });
      const clamped = wasClamped(now.getTime() - new Date(npc.pausedAt).getTime(), ratio, capDays);

      let summary = null;
      if (gameMs >= MIN_GAME_MS_FOR_SUMMARY) {
        const recentEvents = await forNpc({ worldNpcId: npc.id, limit: 8 });
        summary = await summarizeOfflineActivity({
          npc,
          locationName: location.canonicalName,
          gameTimeMs: gameMs,
          recentEvents,
          provider,
          timeoutMs,
        });
      }

      // Apply state changes
      const updateData = { pausedAt: null, pauseSnapshot: null };
      if (summary?.stillHere === false) {
        // NPC left — we don't know where (Phase 5 ticks would tell us). Mark location null.
        updateData.currentLocationId = null;
      }
      await prisma.worldNPC.update({ where: { id: npc.id }, data: updateData });

      // Emit resume event
      const duration = formatGameDuration(gameMs);
      const blurb = summary?.narrativeBlurb?.trim()
        || (gameMs < MIN_GAME_MS_FOR_SUMMARY
          ? `${npc.name} wciąż tu jest, niewiele się zmieniło.`
          : `${npc.name} czeka tu od ${duration.label}.`);

      await appendEvent({
        worldNpcId: npc.id,
        worldLocationId: location.id,
        campaignId: campaign.id,
        userId: campaign.userId || null,
        eventType: 'resume_summary',
        payload: {
          gameTimeMs: gameMs,
          clampedAtMaxGap: clamped,
          stillHere: summary?.stillHere !== false,
          moodShift: summary?.moodShift || null,
          blurb,
        },
        gameTime: now,
      });

      blurbs.push(blurb);
      resumed += 1;
    } catch (err) {
      log.warn({ err, worldNpcId: npc.id }, 'Failed to resume NPC');
      skipped += 1;
    }
  }

  return { blurbs, resumed, skipped };
}
