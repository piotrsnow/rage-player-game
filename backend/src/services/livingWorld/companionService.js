// Living World — Companion mode (NPC travels with the party).
//
// joinParty is an atomic compare-and-swap on the WorldNPC.lockedByCampaignId
// field via the native Mongo driver (Prisma can't express CAS over non-unique
// fields). Once locked, all WorldEvents for the (campaign, npc) pair are
// written via deferredOutbox until leaveParty flushes them back into the
// global state.
//
// See plan §Phase 2 — snapshot-and-overlay model. The WorldNPC row appears
// "frozen" to other campaigns while a companion is on tour; the lockedSnapshot
// + deferred events compose the read-model for the owning campaign.

import { ObjectId } from 'mongodb';
import { prisma } from '../../lib/prisma.js';
import { childLogger } from '../../lib/logger.js';
import { getCollection } from '../mongoNative.js';
import { findOrCreateWorldLocation } from './worldStateService.js';
import { appendDeferred, flushDeferred } from './deferredOutbox.js';
import { appendEvent } from './worldEventLog.js';

const log = childLogger({ module: 'companionService' });

const DEFAULT_LOYALTY = 50;

/**
 * Atomic claim. Returns:
 *   { success: true, npc } when this campaign now owns the lock
 *   { success: false, reason: 'already_locked' | 'not_found' | 'dead' } otherwise
 *
 * The native findOneAndUpdate is the only way to express "claim if and only
 * if no one else has it" against MongoDB without a transaction.
 */
export async function joinParty({ worldNpcId, campaignId, userId = null }) {
  if (!worldNpcId || !campaignId) {
    return { success: false, reason: 'invalid_args' };
  }

  let npcOid;
  let campaignOid;
  try {
    npcOid = new ObjectId(worldNpcId);
    campaignOid = new ObjectId(campaignId);
  } catch {
    return { success: false, reason: 'invalid_args' };
  }

  const collection = await getCollection('WorldNPC');
  const now = new Date();

  // 1. Pre-check: does NPC exist + is alive?
  const probe = await collection.findOne(
    { _id: npcOid },
    { projection: { _id: 1, alive: 1, lockedByCampaignId: 1, currentLocationId: 1, name: 1, role: 1, personality: 1, factionId: 1, alignment: 1 } },
  );
  if (!probe) return { success: false, reason: 'not_found' };
  if (probe.alive === false) return { success: false, reason: 'dead' };

  // 2. Compose snapshot from probe (frozen base view at join time)
  const lockedSnapshot = {
    capturedAt: now.toISOString(),
    currentLocationId: probe.currentLocationId ? String(probe.currentLocationId) : null,
    alive: probe.alive !== false,
    name: probe.name,
    role: probe.role || null,
    personality: probe.personality || null,
    factionId: probe.factionId || null,
    alignment: probe.alignment || 'neutral',
  };

  // 3. Atomic CAS: claim only if no current lock
  const result = await collection.findOneAndUpdate(
    { _id: npcOid, lockedByCampaignId: null },
    {
      $set: {
        lockedByCampaignId: campaignOid,
        lockedAt: now,
        lockedSnapshot: JSON.stringify(lockedSnapshot),
        companionOfCampaignId: campaignOid,
        companionJoinedAt: now,
        companionLoyalty: DEFAULT_LOYALTY,
        updatedAt: now,
      },
    },
    { returnDocument: 'after' },
  );

  if (!result) {
    return { success: false, reason: 'already_locked' };
  }

  // 4. Audit trail (deferred — flushed back as 'private' on leaveParty)
  await appendDeferred({
    campaignId,
    worldNpcId,
    userId,
    eventType: 'joined_party',
    payload: {
      lockedSnapshot,
      loyalty: DEFAULT_LOYALTY,
    },
    gameTime: now,
  });

  // 5. Re-read via Prisma so the caller gets a normalised row shape
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

  // Already released?
  if (!npc.lockedByCampaignId) {
    return { success: true, alreadyReleased: true };
  }
  if (String(npc.lockedByCampaignId) !== String(campaignId)) {
    return { success: false, reason: 'not_owner' };
  }

  // Flush deferred outbox FIRST — this writes back to global state
  // and upgrades visibility on every event.
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
    // Continue with release — better to lose a deferred event than zombie-lock the NPC.
  }

  // Append a non-deferred audit event for the release itself
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

  // Release lock + companion fields. Use updateMany with double-condition
  // to stay race-safe: nothing happens if another flow already released.
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
      // Deferred event — applied to global only on leaveParty flush
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

      // Refresh lockedSnapshot.locationName so the read-model (gracz patrzy
      // na companion w nowej lokacji) is coherent without flushing.
      const snap = parseSnapshot(npc.lockedSnapshot);
      snap.currentLocationId = newLoc.id;
      snap.locationName = newLoc.canonicalName;
      await prisma.worldNPC.update({
        where: { id: npc.id },
        data: { lockedSnapshot: JSON.stringify(snap) },
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
  if (!npc || String(npc.companionOfCampaignId) !== String(campaignId)) {
    return { success: false, reason: 'not_companion' };
  }

  const newLoyalty = Math.max(0, Math.min(100, (npc.companionLoyalty ?? DEFAULT_LOYALTY) + delta));

  // Update lockedSnapshot for coherent read-model + persist on the NPC for quick reads.
  // The deferred event is the source of truth on flush — we update both for UX.
  const snap = parseSnapshot(npc.lockedSnapshot);
  snap.companionLoyalty = newLoyalty;

  await prisma.worldNPC.update({
    where: { id: worldNpcId },
    data: {
      companionLoyalty: newLoyalty,
      lockedSnapshot: JSON.stringify(snap),
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

function parseSnapshot(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(raw); } catch { return {}; }
}
