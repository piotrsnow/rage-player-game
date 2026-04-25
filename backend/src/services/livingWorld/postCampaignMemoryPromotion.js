// Round E — NPC memory Stage 2b.
//
// Cross-campaign promotion of `CampaignNpcExperience` entries to the linked
// `WorldNpcKnowledge` rows. Runs as part of the post-campaign write-back
// after Phase 12b promotion candidates so newly admin-linked NPCs (worldNpcId
// set at approve time) can also carry their lived memory forward — though
// the typical case is canonical WorldNPCs that were seeded + shadowed via
// `getOrCloneCampaignNpc`.
//
// Policy (conservative):
//   - Only `importance: 'major'` entries are promoted. Minor memories stay
//     campaign-local. Cross-campaign memory is for narratively load-bearing
//     events, not small talk.
//   - Idempotent via SOURCE-TAG replace: before appending, DELETE existing
//     `WorldNpcKnowledge` rows with `source = 'campaign:<campaignId>'`.
//     Re-running the pipeline replaces the slice for this campaign with the
//     current experienceLog state — no duplication, no leftover-from-last-run
//     drift.
//   - FIFO cap (50 per npc) is enforced by the AFTER-INSERT trigger, not in
//     app code. When a canonical NPC's cross-campaign history inflates past
//     15 entries, Stage 3 RAG recall takes over at read time — we keep the
//     full history in storage, not just a newest-N window.
//
// Non-throwing: per-NPC failures log + skip, pipeline returns a summary.

import { prisma } from '../../lib/prisma.js';
import { childLogger } from '../../lib/logger.js';
import * as ragService from './ragService.js';
import { memoryEntityId } from '../sceneGenerator/processStateChanges/npcMemoryUpdates.js';

const log = childLogger({ module: 'postCampaignMemoryPromotion' });

const DEFAULT_IMPORTANCE_FILTER = ['major'];

/**
 * Pure — filter raw experience rows by importance + project to the WorldNpcKnowledge
 * INSERT shape. Drops entries with empty content. Source tag is keyed by campaignId
 * so re-runs can DELETE-replace this slice idempotently.
 */
export function buildPromotableEntries(experienceRows, campaignId, { importanceFilter = DEFAULT_IMPORTANCE_FILTER } = {}) {
  if (!Array.isArray(experienceRows)) return [];
  const source = `campaign:${campaignId || 'unknown'}`;
  const allow = Array.isArray(importanceFilter) && importanceFilter.length > 0
    ? new Set(importanceFilter)
    : null;
  return experienceRows
    .filter((e) => e && typeof e.content === 'string' && e.content.trim())
    .filter((e) => !allow || allow.has(e.importance))
    .map((e) => ({
      content: e.content,
      source,
      kind: 'campaign_memory',
      importance: e.importance || 'minor',
      addedAt: e.addedAt instanceof Date ? e.addedAt : new Date(e.addedAt || Date.now()),
    }));
}

/**
 * I/O — promote major experienceLog entries from every CampaignNPC in a
 * campaign with `worldNpcId` set into the linked WorldNpcKnowledge rows.
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
      select: {
        id: true,
        worldNpcId: true,
        experiences: {
          orderBy: { addedAt: 'asc' },
          select: { content: true, importance: true, addedAt: true },
        },
      },
    });
  } catch (err) {
    log.warn({ err: err?.message, campaignId }, 'promoteExperienceLogsToCanonical: shadow load failed');
    return { promoted, skipped };
  }

  if (shadows.length === 0) return { promoted, skipped };

  const sourceTag = `campaign:${campaignId}`;

  for (const shadow of shadows) {
    const entries = buildPromotableEntries(shadow.experiences, campaignId, { importanceFilter });
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
        select: { id: true },
      });
      if (!canonical) {
        skipped.push({ worldNpcId: shadow.worldNpcId, reason: 'world_npc_not_found' });
        continue;
      }

      // Idempotent replace: drop prior promotions from this campaign before inserting fresh.
      await prisma.worldNpcKnowledge.deleteMany({
        where: { npcId: canonical.id, source: sourceTag },
      });
      await prisma.worldNpcKnowledge.createMany({
        data: entries.map((e) => ({
          npcId: canonical.id,
          content: e.content,
          source: e.source,
          kind: e.kind,
          importance: e.importance,
          addedAt: e.addedAt,
        })),
      });

      // Stage 3 wiring — fire-and-forget index each promoted entry so the
      // cross-campaign knowledge pool is searchable alongside in-campaign
      // experience. Stable id scheme: `wknw:<worldNpcId>:<addedAt>`.
      for (const entry of entries) {
        const eid = memoryEntityId('wknw', canonical.id, {
          ...entry,
          addedAt: entry.addedAt instanceof Date ? entry.addedAt.toISOString() : entry.addedAt,
        });
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
