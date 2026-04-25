// Living World — append-only WorldEvent ledger.
//
// Writes are fire-and-forget with best-effort error handling. Reads are
// scoped by location / NPC / campaign + time window, used by scene
// assembly to surface "what happened here recently".

import { prisma } from '../../lib/prisma.js';
import { childLogger } from '../../lib/logger.js';

const log = childLogger({ module: 'worldEventLog' });

/**
 * Append a WorldEvent. `payload` is serialized JSON. `gameTime` defaults
 * to now if not provided. `visibility` defaults to "campaign" (Phase 1).
 *
 * @returns WorldEvent row or null on failure (never throws).
 */
export async function appendEvent({
  worldNpcId = null,
  worldLocationId = null,
  campaignId = null,
  userId = null,
  eventType,
  payload = {},
  visibility = 'campaign',
  gameTime = null,
}) {
  if (!eventType) {
    log.warn('appendEvent called without eventType');
    return null;
  }
  try {
    return await prisma.worldEvent.create({
      data: {
        worldNpcId,
        worldLocationId,
        campaignId,
        userId,
        eventType,
        payload: typeof payload === 'string' ? { raw: payload } : (payload || {}),
        visibility,
        gameTime: gameTime || new Date(),
      },
    });
  } catch (err) {
    log.error({ err, eventType, campaignId, worldNpcId, worldLocationId }, 'appendEvent failed');
    return null;
  }
}

/**
 * Read recent events at a location for scene context assembly.
 * Scoped by visibility tier — Phase 1 default returns only "campaign"
 * tier events from the same campaign + "private" only if own campaign.
 *
 * @param {{ locationId, campaignId, sinceTimestamp?, limit? }} opts
 * @returns WorldEvent[] sorted newest-first
 */
export async function forLocation({ locationId, campaignId, sinceTimestamp = null, limit = 20 }) {
  if (!locationId) return [];
  const where = {
    worldLocationId: locationId,
    OR: [
      { visibility: 'campaign', campaignId: campaignId || undefined },
      { visibility: 'private', campaignId: campaignId || undefined },
      // Global tier: cross-campaign major events (campaign_complete,
      // major_deed, dungeon_cleared, deadly_victory). Payload is already
      // meta-only (title/summary/location) — no char data leaks here.
      // Phase 3 follow-up: rate limit per campaign (e.g. 3 major/tydzień),
      // spoiler filter relative to reader's active quest status.
      { visibility: 'global' },
    ],
  };
  if (sinceTimestamp) {
    where.createdAt = { gte: sinceTimestamp };
  }
  try {
    return await prisma.worldEvent.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  } catch (err) {
    log.error({ err, locationId, campaignId }, 'forLocation query failed');
    return [];
  }
}

/**
 * Read recent events involving a specific WorldNPC. Used by offline
 * summarizer to feed NPC its own activity log + by admin dashboard.
 */
export async function forNpc({ worldNpcId, campaignId = null, sinceTimestamp = null, limit = 50 }) {
  if (!worldNpcId) return [];
  const where = { worldNpcId };
  if (campaignId) {
    where.OR = [
      { visibility: 'campaign', campaignId },
      { visibility: 'private', campaignId },
    ];
  }
  if (sinceTimestamp) {
    where.createdAt = { gte: sinceTimestamp };
  }
  try {
    return await prisma.worldEvent.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  } catch (err) {
    log.error({ err, worldNpcId }, 'forNpc query failed');
    return [];
  }
}

/**
 * Return the event's payload object. Kept as a helper so callers don't
 * sprinkle `event.payload || {}` everywhere.
 */
export function parseEventPayload(event) {
  return (event?.payload && typeof event.payload === 'object') ? event.payload : {};
}
