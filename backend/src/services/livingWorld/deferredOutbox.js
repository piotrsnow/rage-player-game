// Living World — Deferred Outbox for companion trips.
//
// While an NPC is locked as a companion, every WorldEvent emitted by their
// campaign is written with visibility="deferred" instead of being applied
// to the global WorldNPC state. On disband (companionService.leaveParty)
// we replay the outbox chronologically against the lockedSnapshot to
// produce the final WorldNPC state, then upgrade visibility per event-type
// so cross-campaign queries see what they should.
//
// Event-type → final visibility mapping is conservative for Phase 2:
// nothing leaks cross-user yet (Phase 3 wires spoilerFilter + "global").

import { prisma } from '../../lib/prisma.js';
import { childLogger } from '../../lib/logger.js';
import { appendEvent, parseEventPayload } from './worldEventLog.js';

const log = childLogger({ module: 'deferredOutbox' });

// Outbox cap — beyond this, the trip is split into "chapters" with a
// nano summary instead of literal replay. Phase 2 just logs a warning;
// chapter-split is Phase 3+ work (rarely hit in practice).
const OUTBOX_HARD_CAP = 500;

// Event types that imply WorldNPC state mutations during replay.
// Anything else is treated as pure log/narrative.
const STATE_MUTATING_TYPES = new Set([
  'companion_moved',      // currentLocationId update
  'died',                 // alive=false
  'loyalty_change',       // companionLoyalty delta
  'attitude_shift',       // mood/disposition (Phase 3 reads this)
]);

// Visibility upgrade map. Phase 2 keeps everything campaign-scoped.
// Phase 3 will widen kills/quests/movement to "global" with anonymization.
const VISIBILITY_AFTER_FLUSH = {
  joined_party:           'private',
  left_party:             'private',
  companion_moved:        'campaign',
  loyalty_change:         'private',
  intimate_dialog:        'private',
  died:                   'campaign',
  kill:                   'campaign',
  quest_complete:         'campaign',
  attitude_shift:         'campaign',
  returned_from_journey:  'campaign',
};

/**
 * Append a deferred event for a companion-locked NPC. Identical to
 * worldEventLog.appendEvent except that visibility is forced to "deferred"
 * and worldNpcId is required (deferred events MUST belong to a single NPC
 * — that's the unit the outbox flushes against).
 */
export async function appendDeferred({
  campaignId,
  worldNpcId,
  worldLocationId = null,
  userId = null,
  eventType,
  payload = {},
  gameTime = null,
}) {
  if (!campaignId || !worldNpcId || !eventType) {
    log.warn({ campaignId, worldNpcId, eventType }, 'appendDeferred missing required fields');
    return null;
  }

  // Soft cap warning — flush will still work, but ~500 events is a code smell.
  const count = await countDeferred({ campaignId, worldNpcId });
  if (count >= OUTBOX_HARD_CAP) {
    log.warn(
      { campaignId, worldNpcId, count },
      'Deferred outbox at hard cap — consider chapter split (Phase 3)',
    );
  }

  return appendEvent({
    worldNpcId,
    worldLocationId,
    campaignId,
    userId,
    eventType,
    payload,
    visibility: 'deferred',
    gameTime: gameTime || new Date(),
  });
}

/**
 * Read deferred events for a (campaign, npc) pair sorted by gameTime ascending.
 * Used by flushDeferred and admin tooling.
 */
export async function listDeferred({ campaignId, worldNpcId }) {
  if (!campaignId || !worldNpcId) return [];
  return prisma.worldEvent.findMany({
    where: { campaignId, worldNpcId, visibility: 'deferred' },
    orderBy: { gameTime: 'asc' },
  });
}

/**
 * Count of deferred events for a pair (cheap, indexed).
 */
export async function countDeferred({ campaignId, worldNpcId }) {
  if (!campaignId || !worldNpcId) return 0;
  return prisma.worldEvent.count({
    where: { campaignId, worldNpcId, visibility: 'deferred' },
  });
}

/**
 * Flush the deferred outbox for a (campaign, npc) pair.
 *
 * Steps (idempotent — safe to call multiple times):
 *   1. Read all deferred events sorted chronologically
 *   2. Replay against lockedSnapshot → projected final state
 *   3. Update WorldNPC with the projected state
 *   4. Upgrade each event's visibility per VISIBILITY_AFTER_FLUSH
 *   5. Append a "returned_from_journey" summary event
 *
 * The caller (companionService.leaveParty) is responsible for releasing
 * the lock fields after this call returns.
 *
 * @returns {Promise<{ replayed: number, finalState: object|null, summaryEventId: string|null }>}
 */
export async function flushDeferred({ campaignId, worldNpcId, lockedSnapshot, userId = null }) {
  if (!campaignId || !worldNpcId) return { replayed: 0, finalState: null, summaryEventId: null };

  const events = await listDeferred({ campaignId, worldNpcId });
  if (events.length === 0) {
    return { replayed: 0, finalState: null, summaryEventId: null };
  }

  // Project final state from snapshot + events
  const baseSnapshot = parseSnapshot(lockedSnapshot);
  const projected = replay(baseSnapshot, events);

  // Apply to global WorldNPC
  try {
    const updateData = {};
    if (projected.currentLocationId !== undefined) updateData.currentLocationId = projected.currentLocationId;
    if (projected.alive !== undefined) updateData.alive = projected.alive;
    if (projected.companionLoyalty !== undefined) updateData.companionLoyalty = projected.companionLoyalty;
    if (Object.keys(updateData).length > 0) {
      await prisma.worldNPC.update({ where: { id: worldNpcId }, data: updateData });
    }
  } catch (err) {
    log.error({ err, worldNpcId }, 'Failed to write projected state during flush');
  }

  // Upgrade visibility per event
  await Promise.allSettled(events.map((e) => upgradeVisibility(e)));

  // Emit summary event
  const fromLoc = baseSnapshot?.locationName || baseSnapshot?.locationId || null;
  const toLoc = projected.locationName || projected.currentLocationId || fromLoc || null;
  const durationGameMs = events.length > 0
    ? new Date(events[events.length - 1].gameTime).getTime() - new Date(events[0].gameTime).getTime()
    : 0;
  const summary = await appendEvent({
    worldNpcId,
    worldLocationId: projected.currentLocationId || null,
    campaignId,
    userId,
    eventType: 'returned_from_journey',
    payload: {
      fromLocation: fromLoc,
      toLocation: toLoc,
      durationGameMs,
      replayedEvents: events.length,
      finalAlive: projected.alive !== false,
    },
    visibility: 'campaign', // Phase 3 will lift to "global" with anonymization
    gameTime: new Date(),
  });

  return {
    replayed: events.length,
    finalState: projected,
    summaryEventId: summary?.id ?? null,
  };
}

/**
 * Discard the deferred outbox for a (campaign, npc) pair WITHOUT applying.
 * Used when a campaign is abandoned or moderation needs to wipe a trip.
 * Returns count of events deleted.
 */
export async function dropDeferred({ campaignId, worldNpcId }) {
  if (!campaignId || !worldNpcId) return 0;
  const result = await prisma.worldEvent.deleteMany({
    where: { campaignId, worldNpcId, visibility: 'deferred' },
  });
  return result.count;
}

// ──────────────────────────────────────────────────────────────────────
// Internal: snapshot parsing + event replay
// ──────────────────────────────────────────────────────────────────────

function parseSnapshot(lockedSnapshot) {
  if (!lockedSnapshot) return {};
  if (typeof lockedSnapshot === 'object') return lockedSnapshot;
  try {
    return JSON.parse(lockedSnapshot);
  } catch {
    return {};
  }
}

/**
 * Pure replay function — applies state-mutating events to a base snapshot
 * and returns the projected final state. Non-mutating events (dialogs,
 * narrative beats) are ignored here; they're already preserved as
 * WorldEvent rows for the timeline.
 *
 * Exported for unit testing.
 */
export function replay(baseSnapshot, events) {
  const state = {
    currentLocationId: baseSnapshot.currentLocationId ?? baseSnapshot.locationId ?? null,
    locationName: baseSnapshot.locationName ?? null,
    alive: baseSnapshot.alive ?? true,
    companionLoyalty: baseSnapshot.companionLoyalty ?? null,
  };

  for (const e of events) {
    if (!STATE_MUTATING_TYPES.has(e.eventType)) continue;
    const payload = parseEventPayload(e);
    switch (e.eventType) {
      case 'companion_moved':
        if (payload.toLocationId !== undefined) state.currentLocationId = payload.toLocationId;
        if (payload.toLocationName !== undefined) state.locationName = payload.toLocationName;
        break;
      case 'died':
        state.alive = false;
        break;
      case 'loyalty_change':
        if (typeof payload.delta === 'number') {
          const cur = typeof state.companionLoyalty === 'number' ? state.companionLoyalty : 50;
          state.companionLoyalty = clamp(cur + payload.delta, 0, 100);
        } else if (typeof payload.absolute === 'number') {
          state.companionLoyalty = clamp(payload.absolute, 0, 100);
        }
        break;
      case 'attitude_shift':
        // Phase 3 surfaces attitude separately; for now we just preserve as a marker.
        if (payload.disposition !== undefined) state.disposition = payload.disposition;
        break;
      default:
        break;
    }
  }

  return state;
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

async function upgradeVisibility(event) {
  const target = VISIBILITY_AFTER_FLUSH[event.eventType] ?? 'campaign';
  if (target === 'deferred') return; // safety: never re-defer
  try {
    await prisma.worldEvent.update({
      where: { id: event.id },
      data: { visibility: target },
    });
  } catch (err) {
    log.warn({ err, eventId: event.id, eventType: event.eventType }, 'Failed to upgrade visibility');
  }
}
