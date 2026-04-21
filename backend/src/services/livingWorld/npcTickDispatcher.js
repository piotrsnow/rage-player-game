// Living World Phase 5 — manual batch tick dispatcher (scoped).
//
// Scoped Phase 5: this dispatcher is invoked ON DEMAND by an admin endpoint.
// It picks N eligible NPCs (by lastTickAt oldest first + interval filter)
// and runs ticks sequentially.
//
// DEFERRED: Cloud Tasks repeatable schedule that would auto-invoke this.
// See knowledge/ideas/living-world-npc-auto-dispatch.md.
//
// Sequential on purpose: small scale, avoids hammering the LLM provider,
// and keeps cost visible. Parallelism comes with the auto-dispatch version.

import { prisma } from '../../lib/prisma.js';
import { childLogger } from '../../lib/logger.js';
import { runNpcTick, isEligibleForTick } from './npcAgentLoop.js';

const log = childLogger({ module: 'npcTickDispatcher' });

const DEFAULT_BATCH_SIZE = 10;

/**
 * Pure selector — pick NPCs from a candidate set that are eligible, ordered
 * by lastTickAt (null first = never ticked). Exported for testability.
 *
 * Pass `currentSceneIndex` so scene-based eligibility can evaluate it;
 * without it, legacy hour-based cooldown kicks in.
 */
export function selectEligibleNpcs(candidates, limit = DEFAULT_BATCH_SIZE, now = new Date(), { currentSceneIndex = null } = {}) {
  const eligible = (candidates || []).filter((npc) => isEligibleForTick(npc, now, { currentSceneIndex }).eligible);
  eligible.sort((a, b) => {
    const at = a.lastTickAt ? new Date(a.lastTickAt).getTime() : 0;
    const bt = b.lastTickAt ? new Date(b.lastTickAt).getTime() : 0;
    return at - bt; // oldest first
  });
  return eligible.slice(0, limit);
}

/**
 * Run a batch of ticks. Returns a compact summary for admin UI / logs.
 *
 * @param {object} opts
 * @param {number} [opts.limit]       — max NPCs to tick this batch (default 10)
 * @param {string} [opts.provider]    — 'openai' | 'anthropic'
 * @param {number} [opts.timeoutMs]   — per-tick nano timeout
 * @param {string} [opts.campaignId]  — optional filter: only NPCs linked to this campaign's location
 * @returns {Promise<{considered, ticked, skipped, results: [{npcId, status, reason?}]}>}
 */
export async function runTickBatch({
  limit = DEFAULT_BATCH_SIZE,
  provider = 'openai',
  timeoutMs = 5000,
  campaignId = null,
  currentSceneIndex = null,
} = {}) {
  try {
    // Pre-filter at the DB level on cheap predicates (alive + has goal +
    // not locked / not companion / not paused). JS-level tick-interval +
    // ordering happens in selectEligibleNpcs.
    const where = {
      alive: true,
      activeGoal: { not: null },
      companionOfCampaignId: null,
      lockedByCampaignId: null,
      pausedAt: null,
    };
    // Campaign scope — only NPCs owned by this campaign. Matches by
    // goalTargetCampaignId which the quest assigner sets at promotion.
    if (campaignId) {
      where.goalTargetCampaignId = campaignId;
    }
    const candidates = await prisma.worldNPC.findMany({
      where,
      // overfetch so selectEligibleNpcs has room to filter by interval
      take: limit * 4,
      orderBy: { lastTickAt: 'asc' },
    });

    const selected = selectEligibleNpcs(candidates, limit, new Date(), { currentSceneIndex });
    const results = [];
    for (const npc of selected) {
      try {
        const r = await runNpcTick(npc.id, { provider, timeoutMs, currentSceneIndex });
        results.push({ npcId: npc.id, name: npc.name, ...r });
      } catch (err) {
        log.warn({ err: err?.message, npcId: npc.id }, 'Tick failed');
        results.push({ npcId: npc.id, name: npc.name, status: 'failed', reason: err?.message });
      }
    }

    const ticked = results.filter((r) => r.status === 'ok').length;
    const skipped = results.filter((r) => r.status === 'skipped').length;
    const failed = results.filter((r) => r.status === 'failed').length;
    log.info({ considered: candidates.length, selected: selected.length, ticked, skipped, failed }, 'Tick batch done');

    return {
      considered: candidates.length,
      selected: selected.length,
      ticked,
      skipped,
      failed,
      results,
    };
  } catch (err) {
    log.error({ err }, 'runTickBatch failed');
    return { considered: 0, selected: 0, ticked: 0, skipped: 0, failed: 0, results: [], error: err?.message };
  }
}
