// Round E Phase 12b — post-campaign NPC promotion batch.
//
// Slice A: picks the top-N ephemeral CampaignNPCs (`worldNpcId=null`) worth
// surfacing to admin review as candidates for canonical promotion, scored on
// two inline signals plus one batch-time structural signal (see `scoreCandidate`).
//
// Slice B layers three things on top:
//   1. Dialog sample harvest — batch-read CampaignScene.dialogueSegments and
//      bucket the last N lines per candidate NPC (~600 chars cap). Fed into
//      the verdict LLM as concrete voice evidence.
//   2. Cross-campaign dedup — embed `name + role + personality`, query
//      ragService('promotion_candidate') for similar rows ≥ 0.85. A hit merges
//      stats onto the existing candidate via a pointer stashed in this row's
//      `stats.dedupeOfId` (no schema churn — admin UI collapses later).
//   3. LLM verdict — standard-tier small model scores {recommend, uniqueness,
//      worldFit, reasons}. `recommend=no` OR `uniqueness<5` → auto-reject with
//      the verdict's first reason as `reviewNotes`. Everything else stays
//      `pending` for admin review.
//
// `NPCPromotionCandidate` is upserted keyed by (campaignId, campaignNpcId).
// Stats / dialogSample / smallModelVerdict refresh on re-run; the reviewer
// decision (`status` once admin touched it, `reviewedBy`, `reviewedAt`,
// `reviewNotes`) stays sticky so feedback survives stats reshuffles.

import { prisma } from '../../lib/prisma.js';
import { childLogger } from '../../lib/logger.js';
import * as ragService from './ragService.js';
import { buildNPCEmbeddingText } from '../embeddingService.js';
import { buildNpcCanonicalId } from './worldStateService.js';
import { runVerdictForCandidates, classifyVerdict } from './postCampaignPromotionVerdict.js';

const log = childLogger({ module: 'postCampaignPromotion' });

const DEFAULT_TOP_N = 5;

// Scoring weights. Structural quest involvement is the strongest signal
// (player is FORCED to talk to this NPC for the quest) so *10. Return
// visits mean voluntary re-engagement so *3. Raw interactions are the
// baseline tick. Adjust in Slice B based on playtest data.
const WEIGHT_STRUCTURAL = 10;
const WEIGHT_RETURN_VISIT = 3;

// Dedup threshold — cosine similarity at/above this collapses onto an
// existing pending/approved candidate (stash pointer in stats.dedupeOfId).
// Slice B default; tuned per playtest.
const DEDUP_SIMILARITY_THRESHOLD = 0.85;

// Dialog sample caps — keeps Haiku input lean.
const DIALOG_SAMPLE_MAX_LINES = 5;
const DIALOG_SAMPLE_MAX_CHARS = 600;

/**
 * Pure — slug an NPC name or id to match `CampaignNPC.npcId`. Mirrors the
 * rule used across processStateChanges handlers; kept local so this module
 * has no cross-handler dependency.
 */
export function slugifyNpcId(raw) {
  return String(raw || '').trim().toLowerCase().replace(/\s+/g, '_');
}

/**
 * Pure — count how many `CampaignQuest` rows have each NPC as a structural
 * participant (questGiverId or turnInNpcId). Returns a `Map<slug, count>`.
 * Counts each quest at most once per NPC even when the NPC fills both
 * roles (questGiver == turnInNpc).
 */
export function computeStructuralInvolvement(quests) {
  const counts = new Map();
  if (!Array.isArray(quests)) return counts;
  for (const q of quests) {
    if (!q) continue;
    const slugs = new Set();
    if (q.questGiverId) slugs.add(slugifyNpcId(q.questGiverId));
    if (q.turnInNpcId) slugs.add(slugifyNpcId(q.turnInNpcId));
    for (const slug of slugs) {
      if (!slug) continue;
      counts.set(slug, (counts.get(slug) || 0) + 1);
    }
  }
  return counts;
}

/**
 * Pure — score one NPC using the three engagement signals. Higher = better
 * promotion candidate. Returns a number (can be zero — fresh ephemerals
 * with no recorded activity don't make the cut).
 */
export function scoreCandidate({ interactionCount = 0, questInvolvementCount = 0, structuralQuestCount = 0 }) {
  return (
    (interactionCount || 0)
    + (questInvolvementCount || 0) * WEIGHT_RETURN_VISIT
    + (structuralQuestCount || 0) * WEIGHT_STRUCTURAL
  );
}

/**
 * Pure — join an ephemeral NPC list with a structural-involvement map and
 * return the top-N by score. Zero-score candidates are dropped (nothing
 * to review). Ties broken by `lastInteractionAt DESC` (more recent wins).
 */
export function selectTopNCandidates(ephemeralNpcs, structuralByNpcId, topN = DEFAULT_TOP_N) {
  if (!Array.isArray(ephemeralNpcs) || ephemeralNpcs.length === 0) return [];
  const scored = [];
  for (const npc of ephemeralNpcs) {
    if (!npc) continue;
    const structuralQuestCount = structuralByNpcId?.get?.(npc.npcId) || 0;
    const stats = {
      interactionCount: npc.interactionCount || 0,
      questInvolvementCount: npc.questInvolvementCount || 0,
      structuralQuestCount,
      dialogCharCount: npc.dialogCharCount || 0,
      lastInteractionAt: npc.lastInteractionAt || null,
      lastInteractionSceneIndex: npc.lastInteractionSceneIndex ?? null,
    };
    const score = scoreCandidate(stats);
    if (score <= 0) continue;
    scored.push({ npc, stats: { ...stats, score } });
  }
  scored.sort((a, b) => {
    if (b.stats.score !== a.stats.score) return b.stats.score - a.stats.score;
    const aTime = a.stats.lastInteractionAt ? new Date(a.stats.lastInteractionAt).getTime() : 0;
    const bTime = b.stats.lastInteractionAt ? new Date(b.stats.lastInteractionAt).getTime() : 0;
    return bTime - aTime;
  });
  return scored.slice(0, topN);
}

/**
 * Pure — text used for dedup embedding. Keep it short and identity-focused
 * (name + role + personality). Personality truncated to 200 chars so two
 * NPCs with divergent long bios but the same archetype still collide.
 */
export function buildCandidateEmbeddingText({ name, role, personality }) {
  const parts = [];
  if (name) parts.push(String(name).trim());
  if (role) parts.push(String(role).trim());
  if (personality) parts.push(String(personality).trim().slice(0, 200));
  return parts.filter(Boolean).join(' — ');
}

/**
 * Pure — walk a campaign's dialogueSegments JSON and bucket dialog lines by
 * speaker name (case-insensitive). Returns `Map<slug, string[]>` of the last
 * N lines per NPC, lightly trimmed.
 *
 * `scenes` is an array of `{ dialogueSegments: string | object[] }`.
 */
export function bucketDialogByNpc(scenes, maxLinesPerNpc = DIALOG_SAMPLE_MAX_LINES) {
  const buckets = new Map();
  if (!Array.isArray(scenes)) return buckets;

  const push = (slug, text) => {
    if (!slug || !text) return;
    const arr = buckets.get(slug) || [];
    arr.push(text);
    if (arr.length > maxLinesPerNpc) arr.shift();
    buckets.set(slug, arr);
  };

  for (const scene of scenes) {
    let segs = scene?.dialogueSegments;
    if (typeof segs === 'string') {
      try { segs = JSON.parse(segs); } catch { segs = null; }
    }
    if (!Array.isArray(segs)) continue;
    for (const seg of segs) {
      if (!seg || seg.type !== 'dialogue') continue;
      const speaker = seg.character || seg.speakerName;
      const text = (seg.text || '').trim();
      if (!speaker || !text) continue;
      push(slugifyNpcId(speaker), text);
    }
  }
  return buckets;
}

/**
 * Pure — render a bucket of dialog lines as a single newline-joined excerpt,
 * capped at DIALOG_SAMPLE_MAX_CHARS. Lines are written oldest-first; when the
 * cap is hit we truncate the last line and append an ellipsis rather than
 * dropping the whole tail (so the most-recent voice is preserved).
 */
export function renderDialogSample(lines) {
  if (!Array.isArray(lines) || lines.length === 0) return null;
  const out = [];
  let total = 0;
  for (const raw of lines) {
    const line = String(raw || '').trim();
    if (!line) continue;
    const addition = (total === 0 ? 0 : 1) + line.length;
    if (total + addition <= DIALOG_SAMPLE_MAX_CHARS) {
      out.push(line);
      total += addition;
      continue;
    }
    const remaining = DIALOG_SAMPLE_MAX_CHARS - total - (total === 0 ? 0 : 1) - 1;
    if (remaining > 20) {
      out.push(`${line.slice(0, remaining)}…`);
    }
    break;
  }
  return out.length > 0 ? out.join('\n') : null;
}

/**
 * I/O — load the campaign's scenes once, bucket dialog lines per NPC,
 * attach a `dialogSample` string to each candidate's `stats`. Idempotent
 * and cheap (one findMany, in-process walk).
 */
export async function harvestDialogSamples(campaignId, candidates) {
  if (!campaignId || !Array.isArray(candidates) || candidates.length === 0) return;
  let scenes = [];
  try {
    scenes = await prisma.campaignScene.findMany({
      where: { campaignId },
      select: { dialogueSegments: true },
      orderBy: { sceneIndex: 'asc' },
    });
  } catch (err) {
    log.warn({ err: err?.message, campaignId }, 'harvestDialogSamples: scene load failed');
    return;
  }
  if (scenes.length === 0) return;

  const buckets = bucketDialogByNpc(scenes);
  for (const { npc, stats } of candidates) {
    const slug = slugifyNpcId(npc?.npcId || npc?.name);
    const lines = buckets.get(slug);
    const sample = renderDialogSample(lines);
    if (sample) stats.dialogSample = sample;
  }
}

/**
 * I/O — find the most similar existing promotion candidate (pending or
 * approved) from any past campaign. Returns `{entityId, similarity}` at or
 * above `DEDUP_SIMILARITY_THRESHOLD`, else null. Non-throwing.
 *
 * The embedding is also returned so the caller can use it when upserting the
 * fresh candidate's index row (avoid re-embedding the same text twice).
 */
export async function findDuplicateCandidate(text) {
  if (!text || !text.trim()) return { match: null, queryText: null };
  try {
    const hits = await ragService.query(text, {
      filters: { entityType: 'promotion_candidate' },
      topK: 1,
      minSim: DEDUP_SIMILARITY_THRESHOLD,
    });
    const best = hits?.[0] || null;
    return { match: best, queryText: text };
  } catch (err) {
    log.warn({ err: err?.message }, 'findDuplicateCandidate: ragService.query failed');
    return { match: null, queryText: text };
  }
}

/**
 * I/O — load the two source collections needed to rank candidates and hand
 * them to the pure selector. Returns `[{npc, stats}]` ordered by descending
 * score. Never throws — DB errors log + return empty.
 */
export async function collectPromotionCandidates(campaignId, { topN = DEFAULT_TOP_N } = {}) {
  if (!campaignId) return [];
  try {
    const [ephemeralNpcs, quests] = await Promise.all([
      prisma.campaignNPC.findMany({
        where: { campaignId, worldNpcId: null },
        select: {
          id: true, npcId: true, name: true, role: true, personality: true,
          interactionCount: true, questInvolvementCount: true, dialogCharCount: true,
          lastInteractionAt: true, lastInteractionSceneIndex: true,
        },
      }),
      prisma.campaignQuest.findMany({
        where: { campaignId },
        select: { questId: true, questGiverId: true, turnInNpcId: true },
      }),
    ]);
    const structuralByNpcId = computeStructuralInvolvement(quests);
    return selectTopNCandidates(ephemeralNpcs, structuralByNpcId, topN);
  } catch (err) {
    log.warn({ err: err?.message, campaignId }, 'collectPromotionCandidates failed');
    return [];
  }
}

/**
 * I/O — fetch campaign meta once for the verdict world-context block.
 * Returns `null` on lookup failure (verdict still runs without context).
 */
async function loadWorldContext(campaignId) {
  try {
    const c = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { name: true, genre: true, tone: true },
    });
    if (!c) return null;
    return { campaignName: c.name, genre: c.genre, tone: c.tone };
  } catch {
    return null;
  }
}

/**
 * I/O — upsert each selected candidate into `NPCPromotionCandidate`.
 * Idempotent per `(campaignId, campaignNpcId)`: stats / dialogSample /
 * smallModelVerdict refresh on every run, reviewer decision stays sticky.
 *
 * Slice B additions:
 *   - Dedup: if an existing candidate has cosine ≥ 0.85 with the new text,
 *     stash its id in `stats.dedupeOfId` so admin UI can collapse.
 *   - Verdict: stored as JSON under `smallModelVerdict`. `recommend=no` OR
 *     `uniqueness<5` maps to `status='rejected'` with auto reason in
 *     `reviewNotes` — but only on CREATE, never overwriting an admin-touched
 *     `status`/`reviewNotes` on UPDATE.
 *   - Index the candidate's embedding into `WorldEntityEmbedding` for future
 *     dedup queries. Fire-and-forget; embedding failure doesn't block write.
 *
 * `dryRun=true` collects `persisted` as "would-write" entries without DB writes.
 */
export async function persistPromotionCandidates(campaignId, candidates, {
  dryRun = false,
  verdictByNpcId = null,
} = {}) {
  const persisted = [];
  const skipped = [];

  if (!campaignId || !Array.isArray(candidates) || candidates.length === 0) {
    return { persisted, skipped };
  }

  for (const { npc, stats } of candidates) {
    if (!npc?.id) { skipped.push({ reason: 'missing_npc_id' }); continue; }

    const embeddingText = buildCandidateEmbeddingText(npc);
    const { match } = await findDuplicateCandidate(embeddingText);
    const statsWithDedup = match && match.entityId !== npc.id
      ? { ...stats, dedupeOfId: match.entityId, dedupeSimilarity: match.similarity }
      : stats;

    const verdictEntry = verdictByNpcId?.get?.(npc.id) || null;
    const verdict = verdictEntry?.verdict || null;
    const classification = classifyVerdict(verdict);

    const createRow = {
      campaignId,
      campaignNpcId: npc.id,
      name: npc.name || 'unknown',
      role: npc.role || null,
      personality: npc.personality || null,
      stats: statsWithDedup,
      dialogSample: stats.dialogSample || null,
      smallModelVerdict: verdict ? JSON.stringify(verdict) : null,
      status: classification.status,
      reviewNotes: classification.autoReason,
    };

    if (dryRun) {
      persisted.push({ ...createRow, dryRun: true });
      continue;
    }

    try {
      // Read pre-image so we preserve sticky admin decisions on UPDATE.
      const existing = await prisma.nPCPromotionCandidate.findUnique({
        where: { campaignId_campaignNpcId: { campaignId, campaignNpcId: npc.id } },
        select: { status: true, reviewedBy: true },
      });

      const adminTouched = existing && (existing.reviewedBy || (existing.status && existing.status !== 'pending' && existing.status !== 'rejected'));

      // UPDATE path refreshes stats/verdict/dialog but never overrides a
      // reviewer who has already made a decision. Auto-reject from verdict
      // may re-classify stats-only rows on re-run — that's intended.
      const updateData = {
        name: createRow.name,
        role: createRow.role,
        personality: createRow.personality,
        stats: createRow.stats,
        dialogSample: createRow.dialogSample,
        smallModelVerdict: createRow.smallModelVerdict,
      };
      if (!adminTouched) {
        updateData.status = createRow.status;
        updateData.reviewNotes = createRow.reviewNotes;
      }

      await prisma.nPCPromotionCandidate.upsert({
        where: { campaignId_campaignNpcId: { campaignId, campaignNpcId: npc.id } },
        create: createRow,
        update: updateData,
      });

      // Fire-and-forget RAG index so future dedup queries find this row.
      if (embeddingText) {
        ragService.index('promotion_candidate', npc.id, embeddingText)
          .catch((err) => log.warn({ err: err?.message, campaignNpcId: npc.id }, 'candidate index failed'));
      }
      persisted.push(createRow);
    } catch (err) {
      log.warn({ err: err?.message, campaignNpcId: npc.id }, 'persistPromotionCandidates write failed');
      skipped.push({ campaignNpcId: npc.id, reason: 'write_failed', error: err?.message });
    }
  }

  return { persisted, skipped };
}

/**
 * Orchestrator — collect + harvest dialog + LLM verdict + persist in one
 * call. Returns `{collected, persisted, skipped, verdicts}` so the writeback
 * phase can thread it into its return value for observability.
 *
 * Opts:
 *   - dryRun: boolean — suppress DB writes (read-through pipeline)
 *   - topN: number — cap on candidates returned / persisted
 *   - skipVerdict: boolean — bypass the small-model scoring step
 *   - verdictProvider / verdictModelTier / verdictUserApiKeys — forwarded
 *     to `runVerdictForCandidates` (defaults to anthropic/standard)
 */
export async function runNpcPromotionPipeline({
  campaignId,
  dryRun = false,
  topN = DEFAULT_TOP_N,
  skipVerdict = false,
  verdictProvider = 'anthropic',
  verdictModelTier = 'standard',
  verdictUserApiKeys = null,
} = {}) {
  const collected = await collectPromotionCandidates(campaignId, { topN });

  if (collected.length > 0) {
    await harvestDialogSamples(campaignId, collected);
  }

  let verdictByNpcId = null;
  let verdictWarnings = 0;
  if (!skipVerdict && collected.length > 0) {
    const worldContext = await loadWorldContext(campaignId);
    verdictByNpcId = await runVerdictForCandidates(collected, {
      provider: verdictProvider,
      modelTier: verdictModelTier,
      userApiKeys: verdictUserApiKeys,
      worldContext,
    });
    for (const entry of verdictByNpcId.values()) {
      if (entry?.warning) verdictWarnings += 1;
    }
  }

  const { persisted, skipped } = await persistPromotionCandidates(campaignId, collected, {
    dryRun,
    verdictByNpcId,
  });

  log.info({
    campaignId, dryRun,
    collectedCount: collected.length,
    persistedCount: persisted.length,
    skippedCount: skipped.length,
    verdictWarnings,
    autoRejected: persisted.filter((p) => p.status === 'rejected').length,
  }, 'NPC promotion pipeline complete');
  return { collected, persisted, skipped, verdicts: verdictByNpcId };
}

/**
 * I/O — admin-triggered promotion of a `CampaignNPC` to a canonical `WorldNPC`.
 * Called by the Phase 13 approval route. Non-throwing — returns
 * `{ok:true, worldNpc}` or `{ok:false, reason}`.
 *
 * Flow:
 *   1. Load the CampaignNPC snapshot. Reject if missing or already promoted.
 *   2. Dedupe — if a canonical WorldNPC with matching (name + role, alive)
 *      already exists, reuse it (link the shadow to it; no new row).
 *   3. Otherwise create a WorldNPC from the shadow fields + seed the canonical
 *      `homeLocationId` / `currentLocationId` from the shadow's `lastLocationId`.
 *   4. Link `CampaignNPC.worldNpcId` so subsequent scene-gen and memory
 *      write-back (Stage 2b) can associate.
 *   5. Fire-and-forget RAG index so future retrieval / dedup queries include
 *      the new row.
 */
export async function promoteCampaignNpcToWorld(campaignNpcId, { reviewedBy = null } = {}) {
  if (!campaignNpcId) return { ok: false, reason: 'missing_campaign_npc_id' };

  const shadow = await prisma.campaignNPC.findUnique({
    where: { id: campaignNpcId },
    select: {
      id: true,
      campaignId: true,
      name: true,
      role: true,
      personality: true,
      worldNpcId: true,
      lastLocationId: true,
      category: true,
    },
  });
  if (!shadow) return { ok: false, reason: 'campaign_npc_not_found' };
  if (shadow.worldNpcId) {
    return { ok: false, reason: 'already_promoted', worldNpcId: shadow.worldNpcId };
  }
  if (!shadow.name) return { ok: false, reason: 'missing_name' };

  const name = shadow.name.trim();
  const role = shadow.role || null;

  try {
    const existing = await prisma.worldNPC.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        role,
        alive: true,
      },
    });
    if (existing) {
      await prisma.campaignNPC.update({
        where: { id: shadow.id },
        data: { worldNpcId: existing.id },
      });
      return { ok: true, worldNpc: existing, deduped: true, reviewedBy };
    }

    const canonicalId = buildNpcCanonicalId({ name, role });
    const embText = buildNPCEmbeddingText({
      name, role, personality: shadow.personality,
    });
    const created = await prisma.worldNPC.create({
      data: {
        canonicalId,
        name,
        role,
        personality: shadow.personality || null,
        alignment: 'neutral',
        alive: true,
        currentLocationId: shadow.lastLocationId || null,
        homeLocationId: shadow.lastLocationId || null,
        category: shadow.category || 'commoner',
        embeddingText: embText,
      },
    });
    await prisma.campaignNPC.update({
      where: { id: shadow.id },
      data: { worldNpcId: created.id },
    });
    ragService.index('npc', created.id, embText)
      .catch((err) => log.warn({ err: err?.message, worldNpcId: created.id }, 'promoted NPC index failed'));
    return { ok: true, worldNpc: created, deduped: false, reviewedBy };
  } catch (err) {
    log.warn({ err: err?.message, campaignNpcId }, 'promoteCampaignNpcToWorld failed');
    return { ok: false, reason: 'write_failed', error: err?.message };
  }
}
