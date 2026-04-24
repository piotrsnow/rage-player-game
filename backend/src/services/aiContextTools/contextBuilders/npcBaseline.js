import { prisma } from '../../../lib/prisma.js';
import { childLogger } from '../../../lib/logger.js';
import * as ragService from '../../livingWorld/ragService.js';
import { memoryEntityId } from '../../sceneGenerator/processStateChanges/npcMemoryUpdates.js';

const log = childLogger({ module: 'buildNpcMemory' });

/**
 * NPC memory surface — merges two sources:
 *   - Stage 1 baseline knowledge from `WorldNPC.knowledgeBase` (hand-authored
 *     in seedWorld.js + Phase 11-promoted cross-campaign memories).
 *   - Stage 2 lived experience from `CampaignNPC.experienceLog` (accumulated
 *     in this campaign via `npcMemoryUpdates` stateChanges bucket).
 *
 * Rendered into the scene prompt as `[NPC_MEMORY]` — informational, NOT
 * policy-enforced (`[NPC_KNOWLEDGE]` hearsay is the policy block).
 *
 * Returns [{ npcName, entries: [{content, source}] }]. `source` is one of:
 *   - 'baseline'         — canonical, always-been-known
 *   - 'campaign_current' — lived experience this campaign
 *   - 'campaign:<id>'    — lived experience promoted from a prior campaign
 *
 * Caps:
 *   - Baseline: 6 entries per NPC. Small today (3-ish seeded); Stage 3
 *     RAG retrieval takes over when cross-campaign knowledge inflates.
 *   - Lived: last 8 entries per NPC (newest-first after slice — most
 *     recent in-campaign events dominate).
 */
const MAX_BASELINE_ENTRIES_PER_NPC = 6;
const MAX_EXPERIENCE_ENTRIES_PER_NPC = 8;

// Stage 3 — merged memory pool size (baseline + experience + cross-campaign)
// that triggers RAG-powered recall. Below this, the Stage 2a.1 static
// importance-slice is cheaper and good enough. Above, naive slicing drops
// narratively-relevant old memories in favor of noisy recent ones, so we
// swap to cosine similarity against a scene query text.
const RAG_RECALL_THRESHOLD = 15;
const RAG_RECALL_TOP_K = 8;
const RAG_MIN_SIM = 0.35; // looser than the write-back resolver — selection is flavor, not policy

// Stage 2a.1 — importance-aware merge. The `npcMemoryUpdates` Zod enum is
// binary (major|minor); anything else (missing, unknown legacy string) ranks
// below minor so it's dropped first when the log overflows the cap.
const IMPORTANCE_RANK = { major: 2, minor: 1 };
const importanceRank = (value) => IMPORTANCE_RANK[value] ?? 0;

/**
 * Pure — pick key NPCs worth querying. Returns entries carrying both
 * `worldNpcId` (for baseline lookup — may be null for ephemeral) AND
 * `campaignNpcId` (for experienceLog lookup — always present for
 * CampaignNPC shadows). Ephemeral NPCs without a canonical link still
 * qualify for lived experience memory.
 */
export function selectKeyNpcsForMemory(ambientNpcs, ambientNpcsWithGoals) {
  if (!Array.isArray(ambientNpcs) || ambientNpcs.length === 0) return [];
  const out = [];
  for (let i = 0; i < ambientNpcs.length; i += 1) {
    const nEnriched = ambientNpcs[i];
    const goalEntry = ambientNpcsWithGoals?.[i];
    if (!nEnriched || !goalEntry) continue;
    if (nEnriched.keyNpc === false) continue;
    const worldNpcId = nEnriched.worldNpcId || null;
    const campaignNpcId = nEnriched.id || null;
    // Need AT LEAST one handle — canonical baseline OR campaign experience.
    if (!worldNpcId && !campaignNpcId) continue;
    out.push({ worldNpcId, campaignNpcId, npcName: goalEntry.name });
  }
  return out;
}

// Kept for backward compat with earlier Stage 1 imports — shape preserved
// (`{worldNpcId, npcName}` only, no `campaignNpcId`).
export const selectKeyNpcsWithWorldId = (ambient, withGoals) =>
  selectKeyNpcsForMemory(ambient, withGoals)
    .filter((e) => e.worldNpcId)
    .map(({ worldNpcId, npcName }) => ({ worldNpcId, npcName }));

/** Pure — parse a raw `knowledgeBase` string and shape it for prompt rendering. */
export function formatBaselineEntries(knowledgeBaseRaw, maxEntries = MAX_BASELINE_ENTRIES_PER_NPC) {
  let parsed = [];
  if (typeof knowledgeBaseRaw === 'string' && knowledgeBaseRaw) {
    try {
      const j = JSON.parse(knowledgeBaseRaw);
      if (Array.isArray(j)) parsed = j;
    } catch { /* malformed — treat as empty */ }
  } else if (Array.isArray(knowledgeBaseRaw)) {
    parsed = knowledgeBaseRaw;
  }
  return parsed
    .filter((e) => e && typeof e.content === 'string' && e.content.trim())
    .slice(0, maxEntries)
    .map((e) => ({ content: e.content, source: e.source || 'baseline' }));
}

/**
 * Pure — parse a raw `knowledgeBase` into the FULL cross-campaign slice
 * (all entries tagged `source: campaign:<id>` from Stage 2b). Distinct from
 * `formatBaselineEntries` which caps hand-authored 'baseline' entries at 6.
 * Each returned entry carries the `addedAt` timestamp so RAG recall can
 * reconstruct `memoryEntityId('wknw', worldNpcId, entry)` deterministically.
 */
export function formatCrossCampaignEntries(knowledgeBaseRaw) {
  let parsed = [];
  if (typeof knowledgeBaseRaw === 'string' && knowledgeBaseRaw) {
    try {
      const j = JSON.parse(knowledgeBaseRaw);
      if (Array.isArray(j)) parsed = j;
    } catch { /* malformed — treat as empty */ }
  } else if (Array.isArray(knowledgeBaseRaw)) {
    parsed = knowledgeBaseRaw;
  }
  return parsed
    .filter((e) => e && typeof e.content === 'string' && e.content.trim()
      && typeof e.source === 'string' && e.source.startsWith('campaign:'))
    .map((e) => ({
      content: e.content,
      source: e.source,
      addedAt: e.addedAt || null,
    }));
}

/**
 * Pure — parse experienceLog into unprocessed entries preserving importance
 * and addedAt. Used by Stage 3 RAG recall when the static slice would drop
 * narratively-relevant entries. Distinct from `formatExperienceEntries`
 * which applies the top-N importance cap and strips metadata for prompt.
 */
export function parseExperienceEntries(experienceLogRaw) {
  let parsed = [];
  if (typeof experienceLogRaw === 'string' && experienceLogRaw) {
    try {
      const j = JSON.parse(experienceLogRaw);
      if (Array.isArray(j)) parsed = j;
    } catch { /* malformed — treat as empty */ }
  } else if (Array.isArray(experienceLogRaw)) {
    parsed = experienceLogRaw;
  }
  return parsed.filter((e) => e && typeof e.content === 'string' && e.content.trim());
}

/**
 * Pure — parse a raw `experienceLog` string and shape it for prompt rendering.
 *
 * Stage 2a.1 ordering: sort by `importance DESC, addedAt DESC`, then slice
 * the top N. This keeps narratively load-bearing `major` memories in the
 * prompt even after many trivial `minor` entries accumulate; within a tier,
 * newer wins. Output is rendered newest-first within the top-N (callers
 * already expect narrative order where most-recent reads first).
 */
export function formatExperienceEntries(experienceLogRaw, maxEntries = MAX_EXPERIENCE_ENTRIES_PER_NPC) {
  let parsed = [];
  if (typeof experienceLogRaw === 'string' && experienceLogRaw) {
    try {
      const j = JSON.parse(experienceLogRaw);
      if (Array.isArray(j)) parsed = j;
    } catch { /* malformed — treat as empty */ }
  } else if (Array.isArray(experienceLogRaw)) {
    parsed = experienceLogRaw;
  }
  const filtered = parsed.filter((e) => e && typeof e.content === 'string' && e.content.trim());

  // Stage 2a.1 — two-pass selection:
  //   (1) rank by importance DESC, addedAt DESC (recency tiebreak within tier)
  //       to decide WHICH entries survive the cap — major memories never lose
  //       to a flood of newer minor entries.
  //   (2) restore append-order for rendering so the prompt reads chronologically
  //       (matches the old tail-slice behavior the `[NPC_MEMORY]` block expects).
  const ranked = filtered
    .map((entry, originalIdx) => ({ entry, originalIdx }))
    .sort((a, b) => {
      const byImportance = importanceRank(b.entry.importance) - importanceRank(a.entry.importance);
      if (byImportance !== 0) return byImportance;
      const aTime = a.entry.addedAt || '';
      const bTime = b.entry.addedAt || '';
      if (aTime !== bTime) return bTime.localeCompare(aTime);
      return b.originalIdx - a.originalIdx;
    });
  const surviving = ranked.slice(0, maxEntries).sort((a, b) => a.originalIdx - b.originalIdx);
  return surviving.map(({ entry }) => ({ content: entry.content, source: 'campaign_current' }));
}

/**
 * Pure — determine whether an NPC's memory pool should use Stage 3 RAG
 * recall vs the static Stage 2a.1 slice. Based on total entries the
 * top-N slicing would consider (baseline not capped + all experience
 * entries + all cross-campaign entries). Exposed for test visibility.
 */
export function shouldUseRagRecall(totalEligibleEntries) {
  return totalEligibleEntries > RAG_RECALL_THRESHOLD;
}

/**
 * Pure — after RAG returns top-K entityIds, reorder the in-memory entry
 * list so the prompt reflects the selected subset in chronological order.
 * Falls back to the static Stage 2a.1 slice when RAG produced no match.
 */
function selectRagTopEntries(entries, entityIdsByIdx, ragResultIds) {
  if (!Array.isArray(ragResultIds) || ragResultIds.length === 0) return null;
  const matchSet = new Set(ragResultIds);
  const kept = [];
  for (let i = 0; i < entries.length; i += 1) {
    const eid = entityIdsByIdx.get(i);
    if (!eid) continue;
    if (!matchSet.has(eid)) continue;
    kept.push(entries[i]);
  }
  return kept.length > 0 ? kept : null;
}

/**
 * Build the merged memory surface for every ambient key NPC.
 *
 * Two DB round-trips regardless of NPC count:
 *   1. WorldNPC batch for `knowledgeBase` (only NPCs with worldNpcId).
 *   2. CampaignNPC batch for `experienceLog` (all selected).
 *
 * Stage 3: when a single NPC's pool of RAG-eligible entries (experienceLog
 * + cross-campaign knowledgeBase slice) exceeds RAG_RECALL_THRESHOLD, we
 * replace the static Stage 2a.1 importance-slice with a cosine-similarity
 * query against `sceneQueryText` over the `npc_memory` entity type. One
 * batched RAG call per NPC (embed happens once per scene via shared text).
 */
export async function buildNpcMemory({ ambientNpcs, ambientNpcsWithGoals, sceneQueryText = null } = {}) {
  const selection = selectKeyNpcsForMemory(ambientNpcs, ambientNpcsWithGoals);
  if (selection.length === 0) return [];

  const worldNpcIds = [...new Set(selection.map((e) => e.worldNpcId).filter(Boolean))];
  const campaignNpcIds = [...new Set(selection.map((e) => e.campaignNpcId).filter(Boolean))];

  const [worldRows, campaignRows] = await Promise.all([
    worldNpcIds.length > 0
      ? prisma.worldNPC.findMany({
          where: { id: { in: worldNpcIds } },
          select: { id: true, knowledgeBase: true },
        }).catch(() => [])
      : Promise.resolve([]),
    campaignNpcIds.length > 0
      ? prisma.campaignNPC.findMany({
          where: { id: { in: campaignNpcIds } },
          select: { id: true, experienceLog: true },
        }).catch(() => [])
      : Promise.resolve([]),
  ]);
  const baselineById = new Map(worldRows.map((r) => [r.id, r.knowledgeBase]));
  const experienceById = new Map(campaignRows.map((r) => [r.id, r.experienceLog]));

  const result = [];
  const hasSceneQuery = typeof sceneQueryText === 'string' && sceneQueryText.trim().length > 0;

  for (const { worldNpcId, campaignNpcId, npcName } of selection) {
    const baseline = worldNpcId ? formatBaselineEntries(baselineById.get(worldNpcId)) : [];

    const crossCampaignRaw = worldNpcId ? formatCrossCampaignEntries(baselineById.get(worldNpcId)) : [];
    const experienceRaw = campaignNpcId ? parseExperienceEntries(experienceById.get(campaignNpcId)) : [];

    // Eligible RAG pool is experience (cexp) + cross-campaign (wknw). Baseline
    // is always-on in the prompt and capped at 6 so it doesn't participate.
    const eligibleCount = crossCampaignRaw.length + experienceRaw.length;

    let experience = null; // final shape `[{content, source}]` for prompt
    let usedRag = false;

    if (hasSceneQuery && shouldUseRagRecall(eligibleCount)) {
      // Build the entityId list covering both pools + a map back to entries.
      const combined = [];
      const entityIds = [];
      const entityIdsByIdx = new Map();

      for (const entry of crossCampaignRaw) {
        const eid = worldNpcId ? memoryEntityId('wknw', worldNpcId, entry) : null;
        if (!eid) continue;
        combined.push({ content: entry.content, source: entry.source });
        entityIdsByIdx.set(combined.length - 1, eid);
        entityIds.push(eid);
      }
      for (const entry of experienceRaw) {
        const eid = campaignNpcId ? memoryEntityId('cexp', campaignNpcId, entry) : null;
        if (!eid) {
          // Fallback: entry lacking addedAt still goes through static-slice later.
          continue;
        }
        combined.push({ content: entry.content, source: 'campaign_current' });
        entityIdsByIdx.set(combined.length - 1, eid);
        entityIds.push(eid);
      }

      if (entityIds.length > 0) {
        try {
          const hits = await ragService.query(sceneQueryText, {
            filters: { entityType: 'npc_memory', entityIds },
            topK: RAG_RECALL_TOP_K,
            minSim: RAG_MIN_SIM,
          });
          const hitIds = Array.isArray(hits) ? hits.map((h) => h.entityId) : [];
          const selected = selectRagTopEntries(combined, entityIdsByIdx, hitIds);
          if (selected) {
            experience = selected;
            usedRag = true;
          }
        } catch (err) {
          log.warn({ err: err?.message, worldNpcId, campaignNpcId },
            'Stage 3 RAG recall failed — falling back to static slice');
        }
      }
    }

    if (!experience) {
      // Static slice path — Stage 2a.1 importance-aware top-N over experience
      // only (cross-campaign entries drop to baseline's always-on slice here,
      // which keeps prompt behavior identical to pre-Stage-3 for short pools).
      experience = campaignNpcId ? formatExperienceEntries(experienceById.get(campaignNpcId)) : [];
    }

    const entries = [...baseline, ...experience];
    if (entries.length === 0) continue;
    result.push({ npcName, entries, usedRag });
  }
  return result;
}

// Kept as alias during the Stage 1 → Stage 2 transition; callers can migrate
// at their own pace.
export const buildNpcBaselineKnowledge = buildNpcMemory;
