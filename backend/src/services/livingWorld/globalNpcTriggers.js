// Living World — event-driven triggers for WorldNPC agent ticks.
//
// Replaces the per-scene cadence scan with three surgical triggers that
// fire only when something actually happened worth a nano tick:
//
//   onLocationEntry({campaignId, worldLocationId, sceneGameTime})
//     — called when the player enters a WorldLocation for the first time
//       in this campaign (or after a cooldown). Picks the top 3 NPCs in
//       that location and ticks them with force=true so they react to
//       the player's arrival.
//
//   onDeadlinePass({sceneGameTime})
//     — finds NPCs whose goalDeadlineAt has passed and ticks them once
//       so they can change plans (up to a budget cap).
//
//   onCrossCampaignMajor({worldLocationId, eventType})
//     — when another campaign writes a global WorldEvent in this
//       location (liberation, dungeon cleared, campaign_complete), the
//       local NPCs tick once to register the ripple.
//
// All three are fire-and-forget: any Prisma/nano failure logs and the
// scene pipeline continues unaffected. Budget caps prevent runaway cost
// when the player wanders through a crowded city.

import { prisma } from '../../lib/prisma.js';
import { childLogger } from '../../lib/logger.js';
import { runNpcTick } from './npcAgentLoop.js';

const log = childLogger({ module: 'globalNpcTriggers' });

const DEFAULT_BUDGET = 3;
// Location ping cooldown — player can re-enter, but we throttle to one
// tick batch per NPC per cooldown window (1h gametime default via
// worldTimeRatio but we keep it realtime for simplicity).
const LOCATION_PING_COOLDOWN_MS = 60 * 60 * 1000;
// Deadline batch cap — worst case: gracz nie grał tydzień, wiele NPC ma
// przeszły deadline. Meta-tick w trybie kompresowanym jest TODO (Phase 5
// dispatch); na razie limitujemy batch.
const DEADLINE_BATCH_CAP = 5;

/**
 * Player just entered a WorldLocation. Pick up to `budget` NPCs living
 * there and force a tick so the world reacts.
 */
export async function onLocationEntry({
  campaignId,
  worldLocationId,
  sceneGameTime = new Date(),
  budget = DEFAULT_BUDGET,
  provider = 'openai',
} = {}) {
  if (!worldLocationId) return { ticked: 0, reason: 'no_location' };
  try {
    const cutoff = new Date(sceneGameTime.getTime() - LOCATION_PING_COOLDOWN_MS);
    const candidates = await prisma.worldNPC.findMany({
      where: {
        currentLocationId: worldLocationId,
        alive: true,
        // Skip companions — they're already in the party
        companionOfCampaignId: null,
        OR: [
          { lastLocationPingAt: null },
          { lastLocationPingAt: { lt: cutoff } },
        ],
      },
      orderBy: [
        { keyNpc: 'desc' },      // key NPCs first
        { lastTickAt: 'asc' },   // least recently ticked first
      ],
      take: budget,
      select: { id: true },
    });
    if (candidates.length === 0) return { ticked: 0, reason: 'no_eligible' };

    const ids = candidates.map((c) => c.id);
    // Stamp ping cooldown up front so a concurrent scene doesn't double-fire.
    await prisma.worldNPC.updateMany({
      where: { id: { in: ids } },
      data: { lastLocationPingAt: sceneGameTime },
    });

    const results = await Promise.allSettled(
      ids.map((id) => runNpcTick(id, { provider, force: true, now: sceneGameTime })),
    );
    const ticked = results.filter((r) => r.status === 'fulfilled' && r.value?.status === 'ok').length;
    log.info({ campaignId, worldLocationId, candidates: ids.length, ticked }, 'onLocationEntry');
    return { ticked, candidates: ids.length };
  } catch (err) {
    log.warn({ err, campaignId, worldLocationId }, 'onLocationEntry failed');
    return { ticked: 0, reason: 'error' };
  }
}

/**
 * Any NPC with a passed goalDeadlineAt ticks once so they can react to
 * the missed deadline (change plan, abandon quest, escalate).
 */
export async function onDeadlinePass({
  sceneGameTime = new Date(),
  cap = DEADLINE_BATCH_CAP,
  provider = 'openai',
} = {}) {
  try {
    const due = await prisma.worldNPC.findMany({
      where: {
        alive: true,
        companionOfCampaignId: null,
        goalDeadlineAt: { lte: sceneGameTime },
      },
      orderBy: { goalDeadlineAt: 'asc' },
      take: cap,
      select: { id: true },
    });
    if (due.length === 0) return { ticked: 0 };

    const ids = due.map((n) => n.id);
    // Clear deadlines up front so the tick can set a new one (or not)
    // without re-triggering on the next scene.
    await prisma.worldNPC.updateMany({
      where: { id: { in: ids } },
      data: { goalDeadlineAt: null },
    });

    const results = await Promise.allSettled(
      ids.map((id) => runNpcTick(id, { provider, force: true, now: sceneGameTime })),
    );
    const ticked = results.filter((r) => r.status === 'fulfilled' && r.value?.status === 'ok').length;
    log.info({ due: ids.length, ticked }, 'onDeadlinePass');
    return { ticked, due: ids.length };
  } catch (err) {
    log.warn({ err }, 'onDeadlinePass failed');
    return { ticked: 0, reason: 'error' };
  }
}

/**
 * A global WorldEvent just fired in this location from another campaign.
 * Local NPCs tick once so the ripple (rumour, reaction) is recorded.
 * Used by processWorldImpactEvent / processCampaignComplete downstream
 * — caller decides when to fire to avoid feedback loops.
 */
export async function onCrossCampaignMajor({
  worldLocationId,
  eventType,
  sceneGameTime = new Date(),
  cap = 2,
  provider = 'openai',
} = {}) {
  if (!worldLocationId || !eventType) return { ticked: 0, reason: 'missing_args' };
  try {
    const candidates = await prisma.worldNPC.findMany({
      where: {
        currentLocationId: worldLocationId,
        alive: true,
        companionOfCampaignId: null,
      },
      orderBy: [{ keyNpc: 'desc' }, { lastTickAt: 'asc' }],
      take: cap,
      select: { id: true },
    });
    if (candidates.length === 0) return { ticked: 0 };

    const results = await Promise.allSettled(
      candidates.map((c) => runNpcTick(c.id, { provider, force: true, now: sceneGameTime })),
    );
    const ticked = results.filter((r) => r.status === 'fulfilled' && r.value?.status === 'ok').length;
    log.info({ worldLocationId, eventType, candidates: candidates.length, ticked }, 'onCrossCampaignMajor');
    return { ticked, candidates: candidates.length };
  } catch (err) {
    log.warn({ err, worldLocationId, eventType }, 'onCrossCampaignMajor failed');
    return { ticked: 0, reason: 'error' };
  }
}
