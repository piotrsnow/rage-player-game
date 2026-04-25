// Round E Phase 12c — post-campaign LOCATION promotion batch.
//
// Mirror of Phase 12b (NPC promotion) for non-canonical WorldLocations
// created mid-campaign. Pipeline:
//   1. Collect — WorldLocation rows where `isCanonical=false` AND
//      `createdByCampaignId=campaignId`. These are AI-generated mid-play
//      locations (per `processStateChanges/locations.js`).
//   2. Score — sceneCount (from `CampaignLocationSummary` fuzzy-match by
//      name) + questObjectiveCount (#CampaignQuest rows referencing the
//      location by name). Visit-heavy + quest-tethered locations score
//      higher; raw existence isn't enough.
//   3. Dedup — cosine similarity vs existing `LocationPromotionCandidate`
//      rows at `entityType='location_promotion_candidate'`. Match ≥ 0.85
//      stashes `stats.dedupeOfId` + `stats.dedupeSimilarity` so the admin
//      UI can collapse dupes without schema churn (same pattern as NPCs).
//   4. Persist — upsert keyed by `[campaignId, worldLocationId]`. Stats
//      refresh on re-run; admin decisions (`status`, `reviewedBy`,
//      `reviewedAt`, `reviewNotes`) stay sticky.
//   5. RAG index — fire-and-forget so the NEXT campaign's candidates
//      dedup against this one.
//
// LLM verdict is intentionally omitted in the 12c MVP. All candidates
// land `status='pending'` and wait for manual admin review. When playtest
// signals admin fatigue, add a small-model pass analogous to
// `postCampaignPromotionVerdict.js`.

import { prisma } from '../../lib/prisma.js';
import { childLogger } from '../../lib/logger.js';
import * as ragService from './ragService.js';

const log = childLogger({ module: 'postCampaignLocationPromotion' });

const DEFAULT_TOP_N = 5;
const DEDUP_SIMILARITY_THRESHOLD = 0.85;

// Score weights. Quest-tethered locations (a quest pointed the player here)
// are strong promotion signals — the campaign author built around them. Raw
// scene count is the baseline: a lot of scenes at a location = the player
// cared enough to return.
const WEIGHT_QUEST_OBJECTIVE = 5;

/**
 * Pure — fuzzy compare two location names. Mirrors the strategy used in
 * memoryCompressor's location dedup (substring match in either direction,
 * case-insensitive). Intentionally loose — AI-created locations end up
 * with auto-suffixes like `Chatka myśliwego_abc123`.
 */
export function fuzzyLocationNameMatch(a, b) {
  if (!a || !b) return false;
  const la = String(a).toLowerCase();
  const lb = String(b).toLowerCase();
  return la === lb || la.includes(lb) || lb.includes(la);
}

/**
 * Pure — count how many `CampaignQuest` rows reference a given location
 * (by objective locationId / locationName match). Returns a `Map<worldLocationId, count>`.
 * Quest objectives can be stored with either ID or name — we support both so
 * this doesn't depend on which shape scene-gen chose.
 */
export function computeQuestObjectiveCounts(locations, quests) {
  const counts = new Map();
  if (!Array.isArray(locations) || !Array.isArray(quests)) return counts;
  for (const loc of locations) {
    counts.set(loc.id, 0);
  }
  for (const q of quests) {
    if (!q) continue;
    const objectives = Array.isArray(q.objectives) ? q.objectives : [];
    for (const obj of objectives) {
      if (!obj) continue;
      for (const loc of locations) {
        if (obj.locationId && obj.locationId === loc.id) {
          counts.set(loc.id, (counts.get(loc.id) || 0) + 1);
          break;
        }
        if (obj.locationName && fuzzyLocationNameMatch(obj.locationName, loc.canonicalName)) {
          counts.set(loc.id, (counts.get(loc.id) || 0) + 1);
          break;
        }
      }
    }
  }
  return counts;
}

/**
 * Pure — compute a promotion score. Zero-score candidates are dropped.
 */
export function scoreLocationCandidate({ sceneCount = 0, questObjectiveCount = 0 }) {
  return (sceneCount || 0) + (questObjectiveCount || 0) * WEIGHT_QUEST_OBJECTIVE;
}

/**
 * Pure — join the raw location list with scene/summary counts, quest-objective
 * counts, and return the top-N by score. Zero-score candidates are dropped
 * (no need to surface a location nobody visited). Ties broken by sceneCount
 * DESC then canonicalName ASC for deterministic ordering.
 */
export function selectTopNLocationCandidates(locations, sceneCountByLocId, questCountByLocId, topN = DEFAULT_TOP_N) {
  if (!Array.isArray(locations) || locations.length === 0) return [];
  const scored = [];
  for (const loc of locations) {
    if (!loc) continue;
    const sceneCount = sceneCountByLocId.get(loc.id) || 0;
    const questObjectiveCount = questCountByLocId.get(loc.id) || 0;
    const stats = {
      sceneCount,
      questObjectiveCount,
    };
    const score = scoreLocationCandidate(stats);
    if (score <= 0) continue;
    scored.push({ loc, stats: { ...stats, score } });
  }
  scored.sort((a, b) => {
    if (b.stats.score !== a.stats.score) return b.stats.score - a.stats.score;
    if (b.stats.sceneCount !== a.stats.sceneCount) return b.stats.sceneCount - a.stats.sceneCount;
    return (a.loc.canonicalName || '').localeCompare(b.loc.canonicalName || '');
  });
  return scored.slice(0, topN);
}

/**
 * Pure — text used to embed a location candidate for dedup search. Name +
 * type + region + description snippet. Description truncated to 200 chars so
 * similarly-named locations with divergent long descriptions still collide.
 */
export function buildLocationCandidateEmbeddingText({ canonicalName, displayName, locationType, region, description }) {
  const parts = [];
  if (displayName || canonicalName) parts.push(String(displayName || canonicalName).trim());
  if (locationType) parts.push(String(locationType).trim());
  if (region) parts.push(String(region).trim());
  if (description) parts.push(String(description).trim().slice(0, 200));
  return parts.filter(Boolean).join(' — ');
}

/**
 * I/O — RAG query for an existing `location_promotion_candidate` row above
 * the dedup threshold. Returns `{match: {entityId, similarity} | null}`.
 * Non-throwing.
 */
export async function findDuplicateLocationCandidate(text) {
  if (!text || !text.trim()) return { match: null };
  try {
    const hits = await ragService.query(text, {
      filters: { entityType: 'location_promotion_candidate' },
      topK: 1,
      minSim: DEDUP_SIMILARITY_THRESHOLD,
    });
    if (!hits || hits.length === 0) return { match: null };
    return { match: { entityId: hits[0].entityId, similarity: hits[0].similarity } };
  } catch (err) {
    log.warn({ err: err?.message }, 'findDuplicateLocationCandidate: ragService.query failed');
    return { match: null };
  }
}

/**
 * I/O — collect top-N non-canonical locations from this campaign. Joins
 * scene-count (CampaignLocationSummary fuzzy-match on `locationName`) and
 * quest-objective counts.
 */
export async function collectLocationCandidates(campaignId, { topN = DEFAULT_TOP_N } = {}) {
  if (!campaignId) return [];
  try {
    const [locations, summaries, quests] = await Promise.all([
      prisma.worldLocation.findMany({
        where: { isCanonical: false, createdByCampaignId: campaignId },
        select: {
          id: true, canonicalName: true, displayName: true, locationType: true,
          region: true, description: true, parentLocationId: true,
        },
      }),
      prisma.campaignLocationSummary.findMany({
        where: { campaignId },
        select: { locationName: true, sceneCount: true },
      }),
      prisma.campaignQuest.findMany({
        where: { campaignId },
        select: { questId: true, objectives: true },
      }),
    ]);

    // Map each WorldLocation.id → aggregate sceneCount from fuzzy-matching
    // CampaignLocationSummary rows. One summary might match multiple locations
    // with very similar names; we sum conservatively to avoid dropping signal.
    const sceneCountByLocId = new Map();
    for (const loc of locations) sceneCountByLocId.set(loc.id, 0);
    for (const summary of summaries) {
      for (const loc of locations) {
        if (fuzzyLocationNameMatch(summary.locationName, loc.canonicalName)
            || (loc.displayName && fuzzyLocationNameMatch(summary.locationName, loc.displayName))) {
          sceneCountByLocId.set(loc.id, (sceneCountByLocId.get(loc.id) || 0) + (summary.sceneCount || 0));
        }
      }
    }

    const questCountByLocId = computeQuestObjectiveCounts(locations, quests);
    return selectTopNLocationCandidates(locations, sceneCountByLocId, questCountByLocId, topN);
  } catch (err) {
    log.warn({ err: err?.message, campaignId }, 'collectLocationCandidates failed');
    return [];
  }
}

/**
 * I/O — upsert candidates into `LocationPromotionCandidate`, keyed by
 * `[campaignId, worldLocationId]`. Stats refresh on re-run; admin decisions
 * stay sticky. Dedup via RAG stashes `dedupeOfId`/`dedupeSimilarity` in the
 * `stats` JSON so the UI can collapse. `dryRun=true` reports would-write
 * entries without touching the DB.
 */
export async function persistLocationCandidates(campaignId, candidates, { dryRun = false } = {}) {
  const persisted = [];
  const skipped = [];

  if (!campaignId || !Array.isArray(candidates) || candidates.length === 0) {
    return { persisted, skipped };
  }

  for (const { loc, stats } of candidates) {
    if (!loc?.id) { skipped.push({ reason: 'missing_location_id' }); continue; }

    const embeddingText = buildLocationCandidateEmbeddingText(loc);
    const { match } = await findDuplicateLocationCandidate(embeddingText);
    const statsWithDedup = match && match.entityId !== loc.id
      ? { ...stats, dedupeOfId: match.entityId, dedupeSimilarity: match.similarity }
      : stats;

    const createRow = {
      campaignId,
      worldLocationId: loc.id,
      canonicalName: loc.canonicalName,
      displayName: loc.displayName || null,
      locationType: loc.locationType || null,
      region: loc.region || null,
      description: loc.description || null,
      stats: statsWithDedup,
      status: 'pending',
    };

    if (dryRun) {
      persisted.push({ ...createRow, dryRun: true });
      continue;
    }

    try {
      const existing = await prisma.locationPromotionCandidate.findUnique({
        where: { campaignId_worldLocationId: { campaignId, worldLocationId: loc.id } },
        select: { status: true, reviewedBy: true },
      });
      const adminTouched = existing && (existing.reviewedBy || (existing.status && existing.status !== 'pending'));

      const updateData = {
        canonicalName: createRow.canonicalName,
        displayName: createRow.displayName,
        locationType: createRow.locationType,
        region: createRow.region,
        description: createRow.description,
        stats: createRow.stats,
      };
      if (!adminTouched) updateData.status = createRow.status;

      await prisma.locationPromotionCandidate.upsert({
        where: { campaignId_worldLocationId: { campaignId, worldLocationId: loc.id } },
        create: createRow,
        update: updateData,
      });

      if (embeddingText) {
        ragService.index('location_promotion_candidate', loc.id, embeddingText)
          .catch((err) => log.warn({ err: err?.message, worldLocationId: loc.id }, 'location candidate index failed'));
      }
      persisted.push(createRow);
    } catch (err) {
      log.warn({ err: err?.message, worldLocationId: loc.id }, 'persistLocationCandidates write failed');
      skipped.push({ worldLocationId: loc.id, reason: 'write_failed', error: err?.message });
    }
  }

  return { persisted, skipped };
}

/**
 * Orchestrator — collect + dedup + persist in one call. Returns
 * `{collected, persisted, skipped}` so the writeback phase can thread it
 * into its return value for observability.
 */
export async function runLocationPromotionPipeline({ campaignId, dryRun = false, topN = DEFAULT_TOP_N } = {}) {
  const collected = await collectLocationCandidates(campaignId, { topN });
  const { persisted, skipped } = await persistLocationCandidates(campaignId, collected, { dryRun });

  log.info({
    campaignId, dryRun,
    collectedCount: collected.length,
    persistedCount: persisted.length,
    skippedCount: skipped.length,
  }, 'Location promotion pipeline complete');

  return { collected, persisted, skipped };
}

/**
 * I/O — admin-triggered promotion of a non-canonical WorldLocation to
 * canonical. Called by the Phase 13a approval route. Non-throwing.
 *
 * Flow:
 *   1. Load the non-canonical WorldLocation. Reject if missing or already canonical.
 *   2. Flip `isCanonical=true`, null out `createdByCampaignId` (audit trail
 *      lives in LocationPromotionCandidate row + this timestamp).
 *   3. Fire-and-forget RAG reindex as `entityType='location'` so future
 *      `findOrCreateWorldLocation` dedup queries see it as canonical.
 */
export async function promoteWorldLocationToCanonical(worldLocationId) {
  if (!worldLocationId) return { ok: false, reason: 'missing_world_location_id' };
  try {
    const existing = await prisma.worldLocation.findUnique({
      where: { id: worldLocationId },
      select: { id: true, isCanonical: true, canonicalName: true, displayName: true, locationType: true, region: true, description: true },
    });
    if (!existing) return { ok: false, reason: 'world_location_not_found' };
    if (existing.isCanonical) {
      return { ok: false, reason: 'already_canonical' };
    }
    const updated = await prisma.worldLocation.update({
      where: { id: worldLocationId },
      data: {
        isCanonical: true,
        createdByCampaignId: null,
      },
    });
    // Reindex as canonical location so future retrieval finds it.
    const embeddingText = buildLocationCandidateEmbeddingText(updated);
    if (embeddingText) {
      ragService.index('location', updated.id, embeddingText)
        .catch((err) => log.warn({ err: err?.message, worldLocationId }, 'promoted location index failed'));
    }
    return { ok: true, worldLocation: updated };
  } catch (err) {
    log.warn({ err: err?.message, worldLocationId }, 'promoteWorldLocationToCanonical failed');
    return { ok: false, reason: 'write_failed', error: err?.message };
  }
}
