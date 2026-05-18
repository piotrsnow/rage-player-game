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
        npcId: worldNpcId,
        locationId: worldLocationId,
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
    locationId: locationId,
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
  const where = { npcId: worldNpcId };
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

// ── Oś 3 — quest emergence: hook'i z npcAgentLoop ─────────────────────
//
// `appendQuestOpportunity` zapisuje hook gdy NPC w agent loop wybierze
// `needs_player_help`. To NIE jest jeszcze quest — tylko sygnał dla scene
// generator-a. Materializacja w `CampaignQuest` dzieje się przy emit
// `questOffers` przez LLM (po widzeniu hook-a w prompcie).
//
// `forLocationOpportunities(locationId, sinceDays)` zwraca
// hook-i powiązane z lokacją. Phase 1 — używamy `worldLocationId` (gdy
// hook był wystawiony przy WorldNPC w canonical lokacji); CampaignLocation
// hook-i mają campaignId+locationName w payloadzie i są filtrowane lokalnie.

export async function appendQuestOpportunity({
  worldNpcId = null,
  worldLocationId = null,
  campaignId = null,
  questGiverName,
  locationName = null,
  pitch,
  type = 'side',
  involvedNpcs = [],
  goalContext = null,
  gameTime = null,
}) {
  if (!questGiverName || !pitch) {
    log.warn({ questGiverName: !!questGiverName, pitch: !!pitch }, 'appendQuestOpportunity called without required fields');
    return null;
  }
  return appendEvent({
    worldNpcId,
    worldLocationId,
    campaignId,
    eventType: 'quest_opportunity',
    payload: {
      questGiverName,
      locationName,
      pitch,
      type,
      involvedNpcs: Array.isArray(involvedNpcs) ? involvedNpcs.slice(0, 6) : [],
      goalContext,
      // materializedAs: jest dopisywane do payloadu w `processQuestOffers`
      // gdy LLM wybierze materializację. Dopóki null/undefined — hook jest
      // "live" (warto pokazać LLM-owi w pendingHooks).
    },
    visibility: 'campaign',
    gameTime,
  });
}

/**
 * Hook-i live (jeszcze nie zmaterializowane) per lokacja. Filtr wiek-u w
 * dniach gry — domyślnie 7 (cap kampanii). Zwraca tablicę payload-ów +
 * meta `{ hookId, gameTime, payload }` dla łatwego rendering w prompcie.
 */
export async function forLocationOpportunities({ campaignId, worldLocationId = null, locationName = null, sinceTimestamp = null, limit = 5 }) {
  if (!campaignId) return [];
  try {
    const where = {
      campaignId,
      eventType: 'quest_opportunity',
    };
    if (worldLocationId) where.locationId = worldLocationId;
    if (sinceTimestamp) where.gameTime = { gte: sinceTimestamp };

    const events = await prisma.worldEvent.findMany({
      where,
      orderBy: { gameTime: 'desc' },
      take: limit * 2,  // overfetch — filtrujemy materializedAs po stronie JS
    });
    const results = [];
    for (const ev of events) {
      const payload = parseEventPayload(ev);
      if (payload.materializedAs) continue;  // już zmateralizowane
      // Filtr nazwy lokacji jeśli worldLocationId nie był przekazany
      if (!worldLocationId && locationName && payload.locationName && payload.locationName !== locationName) {
        continue;
      }
      results.push({
        hookId: ev.id,
        worldNpcId: ev.npcId,
        gameTime: ev.gameTime,
        payload,
      });
      if (results.length >= limit) break;
    }
    return results;
  } catch (err) {
    log.error({ err, campaignId, worldLocationId }, 'forLocationOpportunities query failed');
    return [];
  }
}

/**
 * Mark a quest_opportunity event as materialized (when LLM emits questOffer
 * with `relatedHookId`). Update payload.materializedAs = questId — ledger
 * pozostaje append-only (nie usuwamy), ale follow-up queries pomijają go.
 */
export async function markQuestOpportunityMaterialized(hookId, questId) {
  if (!hookId || !questId) return false;
  try {
    const ev = await prisma.worldEvent.findUnique({ where: { id: hookId } });
    if (!ev) return false;
    const payload = parseEventPayload(ev);
    payload.materializedAs = questId;
    await prisma.worldEvent.update({
      where: { id: hookId },
      data: { payload },
    });
    return true;
  } catch (err) {
    log.warn({ err: err?.message, hookId, questId }, 'markQuestOpportunityMaterialized failed (non-fatal)');
    return false;
  }
}
