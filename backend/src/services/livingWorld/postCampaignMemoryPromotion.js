// Round E — NPC memory Stage 2b.
//
// Cross-campaign promotion of `CampaignNPC.experienceLog` entries to the
// linked `WorldNPC.knowledgeBase`. Runs as part of the post-campaign
// write-back after Phase 12b promotion candidates so newly admin-linked
// NPCs (worldNpcId set at approve time) can also carry their lived memory
// forward — though the typical case is canonical WorldNPCs that were
// seeded + shadowed via `getOrCloneCampaignNpc`.
//
// Policy (conservative):
//   - Only `importance: 'major'` entries are promoted. Minor memories stay
//     campaign-local. Cross-campaign memory is for narratively load-bearing
//     events, not small talk.
//   - Idempotent via SOURCE-TAG replace: before appending, drop any existing
//     knowledgeBase entries with `source === 'campaign:<campaignId>'`. Re-running
//     the pipeline replaces the slice for this campaign with the current
//     experienceLog state — no duplication, no leftover-from-last-run drift.
//   - FIFO-capped at `NPC_KNOWLEDGE_CAP=50` (same cap used by Phase 12
//     `appendKnowledgeEntry`). When a canonical NPC's cross-campaign history
//     inflates past 15 entries, Stage 3 RAG recall takes over at read time —
//     we keep the full history in storage, not just a newest-N window.
//
// Non-throwing: per-NPC failures log + skip, pipeline returns a summary.

import { prisma } from '../../lib/prisma.js';
import { childLogger } from '../../lib/logger.js';
import * as ragService from './ragService.js';
import { memoryEntityId } from '../sceneGenerator/processStateChanges/npcMemoryUpdates.js';

const log = childLogger({ module: 'postCampaignMemoryPromotion' });

const NPC_KNOWLEDGE_CAP = 50;
const DEFAULT_IMPORTANCE_FILTER = ['major'];

/**
 * Pure — parse an `experienceLog` JSON string into entries, filter by
 * importance, shape into WorldNPC.knowledgeBase entry format. Returns
 * `[{content, source, importance, addedAt}]`. Invalid JSON → [].
 */
export function buildPromotableEntries(experienceLogRaw, campaignId, { importanceFilter = DEFAULT_IMPORTANCE_FILTER } = {}) {
  let parsed = [];
  if (typeof experienceLogRaw === 'string' && experienceLogRaw) {
    try {
      const j = JSON.parse(experienceLogRaw);
      if (Array.isArray(j)) parsed = j;
    } catch { /* malformed — treat as empty */ }
  } else if (Array.isArray(experienceLogRaw)) {
    parsed = experienceLogRaw;
  }
  const source = `campaign:${campaignId || 'unknown'}`;
  const allow = Array.isArray(importanceFilter) && importanceFilter.length > 0
    ? new Set(importanceFilter)
    : null;
  return parsed
    .filter((e) => e && typeof e.content === 'string' && e.content.trim())
    .filter((e) => !allow || allow.has(e.importance))
    .map((e) => ({
      content: e.content,
      source,
      importance: e.importance || 'minor',
      addedAt: e.addedAt || new Date().toISOString(),
    }));
}

/**
 * Pure — merge new cross-campaign entries into an existing knowledgeBase
 * (JSONB array or legacy JSON string), replacing any prior entries tagged
 * with the same campaign source. FIFO-cap on total length. Returns a plain
 * array ready to write into a JSONB column.
 */
export function mergeKnowledgeBaseForCampaign(rawKnowledgeBase, campaignEntries, campaignId, { cap = NPC_KNOWLEDGE_CAP } = {}) {
  let parsed = [];
  if (Array.isArray(rawKnowledgeBase)) {
    parsed = rawKnowledgeBase;
  } else if (typeof rawKnowledgeBase === 'string' && rawKnowledgeBase) {
    try {
      const j = JSON.parse(rawKnowledgeBase);
      if (Array.isArray(j)) parsed = j;
    } catch { /* malformed — rebuild */ }
  }
  const sourceTag = `campaign:${campaignId || 'unknown'}`;
  const preserved = parsed.filter((e) => e && e.source !== sourceTag);
  const merged = [...preserved, ...(Array.isArray(campaignEntries) ? campaignEntries : [])];
  return merged.length > cap ? merged.slice(merged.length - cap) : merged;
}

/**
 * I/O — promote major experienceLog entries from every CampaignNPC in a
 * campaign with `worldNpcId` set into the linked WorldNPC.knowledgeBase.
 * Returns `{ promoted: [{worldNpcId, entryCount}], skipped: [{reason, ...}] }`.
 * `dryRun=true` collects without writes.
 */
export async function promoteExperienceLogsToCanonical(campaignId, { dryRun = false, importanceFilter = DEFAULT_IMPORTANCE_FILTER } = {}) {
  const promoted = [];
  const skipped = [];
  if (!campaignId) return { promoted, skipped };

  let shadows = [];
  try {
    shadows = await prisma.campaignNPC.findMany({
      where: { campaignId, worldNpcId: { not: null } },
      select: { id: true, worldNpcId: true, experienceLog: true },
    });
  } catch (err) {
    log.warn({ err: err?.message, campaignId }, 'promoteExperienceLogsToCanonical: shadow load failed');
    return { promoted, skipped };
  }

  if (shadows.length === 0) return { promoted, skipped };

  for (const shadow of shadows) {
    const entries = buildPromotableEntries(shadow.experienceLog, campaignId, { importanceFilter });
    if (entries.length === 0) {
      skipped.push({ worldNpcId: shadow.worldNpcId, reason: 'no_promotable_entries' });
      continue;
    }
    if (dryRun) {
      promoted.push({ worldNpcId: shadow.worldNpcId, entryCount: entries.length, dryRun: true });
      continue;
    }

    try {
      const canonical = await prisma.worldNPC.findUnique({
        where: { id: shadow.worldNpcId },
        select: { id: true, knowledgeBase: true },
      });
      if (!canonical) {
        skipped.push({ worldNpcId: shadow.worldNpcId, reason: 'world_npc_not_found' });
        continue;
      }
      const nextKnowledgeBase = mergeKnowledgeBaseForCampaign(
        canonical.knowledgeBase, entries, campaignId,
      );
      await prisma.worldNPC.update({
        where: { id: canonical.id },
        data: { knowledgeBase: nextKnowledgeBase },
      });
      // Stage 3 wiring — fire-and-forget index each promoted entry so the
      // cross-campaign knowledge pool is searchable alongside in-campaign
      // experience. Stable id scheme: `wknw:<worldNpcId>:<addedAt>`.
      for (const entry of entries) {
        const eid = memoryEntityId('wknw', canonical.id, entry);
        if (!eid) continue;
        ragService.index('npc_memory', eid, entry.content)
          .catch(() => { /* non-fatal */ });
      }
      promoted.push({ worldNpcId: canonical.id, entryCount: entries.length });
    } catch (err) {
      log.warn({ err: err?.message, worldNpcId: shadow.worldNpcId, campaignId },
        'promoteExperienceLogsToCanonical: write failed');
      skipped.push({ worldNpcId: shadow.worldNpcId, reason: 'write_failed', error: err?.message });
    }
  }

  log.info({
    campaignId,
    dryRun,
    shadowsExamined: shadows.length,
    promotedCount: promoted.length,
    skippedCount: skipped.length,
  }, 'Stage 2b experienceLog promotion complete');

  return { promoted, skipped };
}
