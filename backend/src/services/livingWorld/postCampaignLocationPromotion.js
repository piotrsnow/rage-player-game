// Round E Phase 12c — post-campaign LOCATION promotion batch.
// F5b — source rows are now `CampaignLocation` (per-campaign sandbox), not
// `WorldLocation isCanonical=false`. Pipeline:
//
//   1. Collect — `CampaignLocation` rows for this campaign that the player
//      actually engaged with (sceneCount + quest-objective count). Score-zero
//      rows are dropped.
//   2. Dedup — cosine similarity vs existing
//      `LocationPromotionCandidate` rows at
//      `entityType='location_promotion_candidate'`.
//      Match ≥ 0.85 stashes `stats.dedupeOfId` + `stats.dedupeSimilarity` so
//      the admin UI can collapse dupes without schema churn.
//   3. Persist — upsert keyed by
//      `[campaignId, sourceLocationKind, sourceLocationId]`. Stats refresh on
//      re-run; admin decisions stay sticky.
//   4. RAG index — fire-and-forget so the NEXT campaign's candidates dedup
//      against this one.
//   5. Promote — admin approval (route in `adminLivingWorld.js`) calls
//      `promoteCampaignLocationToCanonical(id)` which destructively COPIES
//      the CampaignLocation into a new canonical WorldLocation, RELINKS all
//      polymorphic refs that pointed at the source CampaignLocation, then
//      deletes the source row.
//
// LLM verdict is intentionally omitted in the MVP. All candidates land
// `status='pending'` and wait for manual admin review.

import { prisma } from '../../lib/prisma.js';
import { childLogger } from '../../lib/logger.js';
import * as ragService from './ragService.js';
import {
  LOCATION_KIND_WORLD,
  LOCATION_KIND_CAMPAIGN,
} from '../locationRefs.js';

const log = childLogger({ module: 'postCampaignLocationPromotion' });

const DEFAULT_TOP_N = 5;
const DEDUP_SIMILARITY_THRESHOLD = 0.85;

const WEIGHT_QUEST_OBJECTIVE = 5;

/**
 * Pure — fuzzy compare two location names. Mirrors the strategy used in
 * memoryCompressor's location dedup (substring match in either direction,
 * case-insensitive).
 */
export function fuzzyLocationNameMatch(a, b) {
  if (!a || !b) return false;
  const la = String(a).toLowerCase();
  const lb = String(b).toLowerCase();
  return la === lb || la.includes(lb) || lb.includes(la);
}

/**
 * Pure — count how many `CampaignQuest` rows reference a given location
 * by objective locationId / locationName. Returns a `Map<id, count>`.
 */
export function computeQuestObjectiveCounts(locations, quests) {
  const counts = new Map();
  if (!Array.isArray(locations) || !Array.isArray(quests)) return counts;
  for (const loc of locations) counts.set(loc.id, 0);
  for (const q of quests) {
    if (!q) continue;
    const objectives = Array.isArray(q.objectives) ? q.objectives : [];
    for (const obj of objectives) {
      if (!obj) continue;
      const meta = obj.metadata || obj;
      for (const loc of locations) {
        if (meta.locationId && meta.locationId === loc.id) {
          counts.set(loc.id, (counts.get(loc.id) || 0) + 1);
          break;
        }
        if (meta.locationName && fuzzyLocationNameMatch(meta.locationName, loc.name)) {
          counts.set(loc.id, (counts.get(loc.id) || 0) + 1);
          break;
        }
      }
    }
  }
  return counts;
}

export function scoreLocationCandidate({ sceneCount = 0, questObjectiveCount = 0 }) {
  return (sceneCount || 0) + (questObjectiveCount || 0) * WEIGHT_QUEST_OBJECTIVE;
}

export function selectTopNLocationCandidates(locations, sceneCountByLocId, questCountByLocId, topN = DEFAULT_TOP_N) {
  if (!Array.isArray(locations) || locations.length === 0) return [];
  const scored = [];
  for (const loc of locations) {
    if (!loc) continue;
    const sceneCount = sceneCountByLocId.get(loc.id) || 0;
    const questObjectiveCount = questCountByLocId.get(loc.id) || 0;
    const stats = { sceneCount, questObjectiveCount };
    const score = scoreLocationCandidate(stats);
    if (score <= 0) continue;
    scored.push({ loc, stats: { ...stats, score } });
  }
  scored.sort((a, b) => {
    if (b.stats.score !== a.stats.score) return b.stats.score - a.stats.score;
    if (b.stats.sceneCount !== a.stats.sceneCount) return b.stats.sceneCount - a.stats.sceneCount;
    return (a.loc.name || '').localeCompare(b.loc.name || '');
  });
  return scored.slice(0, topN);
}

export function buildLocationCandidateEmbeddingText({ name, displayName, locationType, region, description }) {
  const parts = [];
  if (displayName || name) parts.push(String(displayName || name).trim());
  if (locationType) parts.push(String(locationType).trim());
  if (region) parts.push(String(region).trim());
  if (description) parts.push(String(description).trim().slice(0, 200));
  return parts.filter(Boolean).join(' — ');
}

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
 * I/O — collect top-N CampaignLocation candidates for promotion. Joins
 * scene-count (CampaignLocationSummary fuzzy-match on `locationName`) and
 * quest-objective counts.
 */
export async function collectLocationCandidates(campaignId, { topN = DEFAULT_TOP_N } = {}) {
  if (!campaignId) return [];
  try {
    const [locations, summaries, quests] = await Promise.all([
      prisma.campaignLocation.findMany({
        where: { campaignId },
        select: {
          id: true, name: true, locationType: true, region: true,
          description: true, parentLocationId: true,
        },
      }),
      prisma.campaignLocationSummary.findMany({
        where: { campaignId },
        select: { locationName: true, sceneCount: true },
      }),
      prisma.campaignQuest.findMany({
        where: { campaignId },
        select: {
          questId: true,
          objectives: { select: { description: true, metadata: true } },
        },
      }),
    ]);

    const sceneCountByLocId = new Map();
    for (const loc of locations) sceneCountByLocId.set(loc.id, 0);
    for (const summary of summaries) {
      for (const loc of locations) {
        if (fuzzyLocationNameMatch(summary.locationName, loc.name)) {
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
 * `[campaignId, sourceLocationKind, sourceLocationId]`. F5b sources are
 * always `kind='campaign'` (CampaignLocation) — the kind column exists for
 * forward compatibility (e.g. relisting an admin-rejected CampaignLocation
 * after edits).
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
      sourceLocationKind: LOCATION_KIND_CAMPAIGN,
      sourceLocationId: loc.id,
      canonicalName: loc.name,
      displayName: loc.name,
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
      const compositeKey = {
        campaignId_sourceLocationKind_sourceLocationId: {
          campaignId,
          sourceLocationKind: LOCATION_KIND_CAMPAIGN,
          sourceLocationId: loc.id,
        },
      };
      const existing = await prisma.locationPromotionCandidate.findUnique({
        where: compositeKey,
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
        where: compositeKey,
        create: createRow,
        update: updateData,
      });

      if (embeddingText) {
        ragService.index('location_promotion_candidate', loc.id, embeddingText)
          .catch((err) => log.warn({ err: err?.message, sourceLocationId: loc.id }, 'location candidate index failed'));
      }
      persisted.push(createRow);
    } catch (err) {
      log.warn({ err: err?.message, sourceLocationId: loc.id }, 'persistLocationCandidates write failed');
      skipped.push({ sourceLocationId: loc.id, reason: 'write_failed', error: err?.message });
    }
  }

  return { persisted, skipped };
}

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
 * I/O — admin-triggered DESTRUCTIVE promotion of a CampaignLocation to a
 * canonical WorldLocation. Called by the Phase 13a approval route.
 *
 * Flow:
 *   1. Load the source CampaignLocation. Reject if missing.
 *   2. CREATE a new WorldLocation with the source's display fields. The new
 *      `canonicalName` defaults to the source `name`; collisions surface as
 *      P2002 and abort.
 *   3. RELINK every polymorphic FK that pointed at the source CampaignLocation
 *      (Campaign.currentLocation*, CampaignNPC.lastLocation*,
 *      CampaignDiscoveredLocation, CharacterClearedDungeon) to point at the
 *      new WorldLocation by flipping kind→'world' and id→new uuid.
 *   4. DELETE the source CampaignLocation row.
 *   5. Reindex as canonical `entityType='location'` so future canonical
 *      lookups dedup against it.
 */
export async function promoteCampaignLocationToCanonical(campaignLocationId) {
  if (!campaignLocationId) return { ok: false, reason: 'missing_source_id' };
  try {
    const source = await prisma.campaignLocation.findUnique({ where: { id: campaignLocationId } });
    if (!source) return { ok: false, reason: 'campaign_location_not_found' };

    const worldLocation = await prisma.$transaction(async (tx) => {
      const created = await tx.worldLocation.create({
        data: {
          canonicalName: source.name,
          displayName: source.name,
          aliases: Array.isArray(source.aliases) ? source.aliases : [source.name],
          description: source.description || '',
          category: source.category || source.locationType || 'generic',
          locationType: source.locationType || 'generic',
          region: source.region || null,
          regionX: source.regionX || 0,
          regionY: source.regionY || 0,
          positionConfidence: 1.0,
          subGridX: source.subGridX || null,
          subGridY: source.subGridY || null,
          maxKeyNpcs: source.maxKeyNpcs || 10,
          maxSubLocations: source.maxSubLocations || 5,
          slotType: source.slotType || null,
          slotKind: source.slotKind || 'custom',
          dangerLevel: source.dangerLevel || 'safe',
          knownByDefault: false,
          embeddingText: source.embeddingText || source.name,
        },
      });

      // Relink polymorphic refs pointing at the source CampaignLocation.
      const newRef = { kind: LOCATION_KIND_WORLD, id: created.id };
      await Promise.all([
        tx.campaign.updateMany({
          where: { currentLocationKind: LOCATION_KIND_CAMPAIGN, currentLocationId: source.id },
          data: { currentLocationKind: newRef.kind, currentLocationId: newRef.id },
        }),
        tx.campaignNPC.updateMany({
          where: { lastLocationKind: LOCATION_KIND_CAMPAIGN, lastLocationId: source.id },
          data: { lastLocationKind: newRef.kind, lastLocationId: newRef.id },
        }),
        tx.campaignDiscoveredLocation.updateMany({
          where: { locationKind: LOCATION_KIND_CAMPAIGN, locationId: source.id },
          data: { locationKind: newRef.kind, locationId: newRef.id },
        }),
        tx.characterClearedDungeon.updateMany({
          where: { dungeonKind: LOCATION_KIND_CAMPAIGN, dungeonId: source.id },
          data: { dungeonKind: newRef.kind, dungeonId: newRef.id },
        }),
      ]);

      // Drop the source. Cascades clean up nothing — no children FK to
      // CampaignLocation in the schema today.
      await tx.campaignLocation.delete({ where: { id: source.id } });
      return created;
    });

    const embeddingText = buildLocationCandidateEmbeddingText({
      name: worldLocation.canonicalName,
      displayName: worldLocation.displayName,
      locationType: worldLocation.locationType,
      region: worldLocation.region,
      description: worldLocation.description,
    });
    if (embeddingText) {
      ragService.index('location', worldLocation.id, embeddingText)
        .catch((err) => log.warn({ err: err?.message, worldLocationId: worldLocation.id }, 'promoted location index failed'));
    }

    log.info(
      { sourceCampaignLocationId: campaignLocationId, worldLocationId: worldLocation.id, name: worldLocation.canonicalName },
      'CampaignLocation destructively promoted to canonical WorldLocation',
    );
    return { ok: true, worldLocation };
  } catch (err) {
    if (err?.code === 'P2002') {
      log.warn({ campaignLocationId }, 'promoteCampaignLocationToCanonical: canonicalName collision');
      return { ok: false, reason: 'canonical_name_collision' };
    }
    log.warn({ err: err?.message, campaignLocationId }, 'promoteCampaignLocationToCanonical failed');
    return { ok: false, reason: 'write_failed', error: err?.message };
  }
}

/** @deprecated F5b — kept as a thin alias for callers that still reference the
 * pre-F5b name. New code should call `promoteCampaignLocationToCanonical`
 * directly. */
export const promoteWorldLocationToCanonical = promoteCampaignLocationToCanonical;
