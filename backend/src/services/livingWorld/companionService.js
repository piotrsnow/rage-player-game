// Living World — Companion mode (NPC travels with the party).
//
// joinParty does an atomic claim via `prisma.worldNPC.updateMany` with a
// WHERE that includes `lockedByCampaignId: null` — Postgres serializes
// concurrent updaters and only one rowcount comes back as 1. Once locked,
// all WorldEvents for the (campaign, npc) pair are written via
// deferredOutbox until leaveParty flushes them back into the global state.
//
// See plan §Phase 2 — snapshot-and-overlay model. The WorldNPC row appears
// "frozen" to other campaigns while a companion is on tour; the lockedSnapshot
// + deferred events compose the read-model for the owning campaign.

import { prisma } from '../../lib/prisma.js';
import { childLogger } from '../../lib/logger.js';
import { findOrCreateWorldLocation } from './worldStateService.js';
import { appendDeferred, flushDeferred } from './deferredOutbox.js';
import { appendEvent } from './worldEventLog.js';

const log = childLogger({ module: 'companionService' });

const DEFAULT_LOYALTY = 50;

/**
 * Atomic claim. Returns:
 *   { success: true, npc } when this campaign now owns the lock
 *   { success: false, reason: 'already_locked' | 'not_found' | 'dead' } otherwise
 */
export async function joinParty({ worldNpcId, campaignId, userId = null }) {
  if (!worldNpcId || !campaignId) {
    return { success: false, reason: 'invalid_args' };
  }

  const probe = await prisma.worldNPC.findUnique({
    where: { id: worldNpcId },
    select: {
      id: true, alive: true, lockedByCampaignId: true, currentLocationId: true,
      name: true, role: true, personality: true, alignment: true,
    },
  });
  if (!probe) return { success: false, reason: 'not_found' };
  if (probe.alive === false) return { success: false, reason: 'dead' };

  const now = new Date();
  const lockedSnapshot = {
    capturedAt: now.toISOString(),
    currentLocationId: probe.currentLocationId || null,
    alive: true,
    name: probe.name,
    role: probe.role || null,
    personality: probe.personality || null,
    alignment: probe.alignment || 'neutral',
  };

  // Atomic CAS — updateMany returns count; only the first writer wins because
  // Postgres serializes the WHERE check + UPDATE in the same row lock.
  const claim = await prisma.worldNPC.updateMany({
    where: { id: worldNpcId, lockedByCampaignId: null, alive: true },
    data: {
      lockedByCampaignId: campaignId,
      lockedAt: now,
      lockedSnapshot,
      companionOfCampaignId: campaignId,
      companionJoinedAt: now,
      companionLoyalty: DEFAULT_LOYALTY,
    },
  });

  if (claim.count === 0) {
    return { success: false, reason: 'already_locked' };
  }

  await appendDeferred({
    campaignId,
    worldNpcId,
    userId,
    eventType: 'joined_party',
    payload: { lockedSnapshot, loyalty: DEFAULT_LOYALTY },
    gameTime: now,
  });

  const npc = await prisma.worldNPC.findUnique({ where: { id: worldNpcId } });
  return { success: true, npc };
}

/**
 * Release transaction. Atomic check that the caller owns the lock, then
 * flush deferred outbox + clear lock fields. Idempotent: a second call
 * returns { success: true, alreadyReleased: true }.
 */
export async function leaveParty({ worldNpcId, campaignId, reason = 'manual', userId = null }) {
  if (!worldNpcId || !campaignId) {
    return { success: false, reason: 'invalid_args' };
  }

  const npc = await prisma.worldNPC.findUnique({ where: { id: worldNpcId } });
  if (!npc) return { success: false, reason: 'not_found' };

  if (!npc.lockedByCampaignId) {
    return { success: true, alreadyReleased: true };
  }
  if (npc.lockedByCampaignId !== campaignId) {
    return { success: false, reason: 'not_owner' };
  }

  let flushResult = { replayed: 0 };
  try {
    flushResult = await flushDeferred({
      campaignId,
      worldNpcId,
      lockedSnapshot: npc.lockedSnapshot,
      userId,
    });
  } catch (err) {
    log.error({ err, worldNpcId, campaignId }, 'Flush failed during leaveParty');
  }

  try {
    await appendEvent({
      worldNpcId,
      campaignId,
      userId,
      eventType: 'left_party',
      payload: { reason, replayed: flushResult.replayed },
      visibility: 'private',
      gameTime: new Date(),
    });
  } catch (err) {
    log.warn({ err, worldNpcId }, 'left_party event append failed (non-fatal)');
  }

  try {
    await prisma.worldNPC.updateMany({
      where: { id: worldNpcId, lockedByCampaignId: campaignId },
      data: {
        lockedByCampaignId: null,
        lockedAt: null,
        lockedSnapshot: null,
        companionOfCampaignId: null,
        companionJoinedAt: null,
        companionLoyalty: DEFAULT_LOYALTY,
      },
    });
  } catch (err) {
    log.error({ err, worldNpcId, campaignId }, 'Failed to release companion lock');
    return { success: false, reason: 'release_failed' };
  }

  return { success: true, replayed: flushResult.replayed, finalState: flushResult.finalState ?? null };
}

/**
 * Apply party travel — every companion of this campaign moves with the
 * player. Writes a deferred companion_moved event (so the global stays
 * frozen) and updates lockedSnapshot.locationName for read-model coherence.
 *
 * Called from postSceneWork BEFORE pauseNpcsAtLocation, so paused/resume
 * flows can safely skip companions.
 */
export async function applyCompanionTravel({ campaignId, newLocationName, userId = null }) {
  if (!campaignId || !newLocationName) return { moved: 0 };

  const companions = await prisma.worldNPC.findMany({
    where: { companionOfCampaignId: campaignId, alive: true },
  });
  if (companions.length === 0) return { moved: 0 };

  const newLoc = await findOrCreateWorldLocation(newLocationName);
  if (!newLoc) return { moved: 0 };

  const now = new Date();
  let moved = 0;

  for (const npc of companions) {
    if (npc.currentLocationId === newLoc.id) continue;

    try {
      await appendDeferred({
        campaignId,
        worldNpcId: npc.id,
        worldLocationId: newLoc.id,
        userId,
        eventType: 'companion_moved',
        payload: {
          fromLocationId: npc.currentLocationId,
          toLocationId: newLoc.id,
          toLocationName: newLoc.canonicalName,
        },
        gameTime: now,
      });

      const snap = { ...(npc.lockedSnapshot || {}) };
      snap.currentLocationId = newLoc.id;
      snap.locationName = newLoc.canonicalName;
      await prisma.worldNPC.update({
        where: { id: npc.id },
        data: { lockedSnapshot: snap },
      });

      moved += 1;
    } catch (err) {
      log.warn({ err, worldNpcId: npc.id, campaignId }, 'Companion travel failed for one NPC');
    }
  }

  return { moved };
}

/**
 * Adjust companion loyalty (deferred). Triggers narrative leave at <= 0.
 * Returns the new (projected) loyalty for the caller to decide UX.
 */
export async function updateLoyalty({ worldNpcId, campaignId, delta, reason = '', userId = null }) {
  if (!worldNpcId || !campaignId || typeof delta !== 'number') {
    return { success: false, reason: 'invalid_args' };
  }

  const npc = await prisma.worldNPC.findUnique({ where: { id: worldNpcId } });
  if (!npc || npc.companionOfCampaignId !== campaignId) {
    return { success: false, reason: 'not_companion' };
  }

  const newLoyalty = Math.max(0, Math.min(100, (npc.companionLoyalty ?? DEFAULT_LOYALTY) + delta));

  const snap = { ...(npc.lockedSnapshot || {}) };
  snap.companionLoyalty = newLoyalty;

  await prisma.worldNPC.update({
    where: { id: worldNpcId },
    data: {
      companionLoyalty: newLoyalty,
      lockedSnapshot: snap,
    },
  });

  await appendDeferred({
    campaignId,
    worldNpcId,
    userId,
    eventType: 'loyalty_change',
    payload: { delta, absolute: newLoyalty, reason },
    gameTime: new Date(),
  });

  return {
    success: true,
    newLoyalty,
    triggersLeave: newLoyalty <= 0,
  };
}

/**
 * Convenience: list all companions for a campaign (alive only).
 */
export async function getCompanions(campaignId) {
  if (!campaignId) return [];
  return prisma.worldNPC.findMany({
    where: { companionOfCampaignId: campaignId, alive: true },
  });
}
