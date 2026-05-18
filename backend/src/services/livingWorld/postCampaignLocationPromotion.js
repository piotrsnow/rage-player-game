// Post-campaign location promotion — unified table version.
//
// With the unified Location table, promotion is:
//   UPDATE location SET campaignId = NULL, canonicalName = slug WHERE id = ?
//
// No more cross-table copy + destructive delete + multi-table relink.

import { prisma } from '../../lib/prisma.js';
import { childLogger } from '../../lib/logger.js';
import { slugifyLocationName } from '../locationRefs.js';
import { index as indexEntity } from './ragService.js';

const log = childLogger({ module: 'postCampaignLocationPromotion' });

/**
 * Promote a campaign-scoped location to canonical.
 *
 * Steps:
 *   1. Validate: must be campaign-scoped
 *   2. Assign canonicalName (slugified)
 *   3. Flip campaignId → null
 *   4. Auto-link to nearest settlement (Road + LocationEdge)
 *   5. RAG index
 */
export async function promoteCampaignLocationToCanonical(locationId) {
  try {
    const loc = await prisma.location.findUnique({ where: { id: locationId } });
    if (!loc) return { ok: false, reason: 'not_found' };
    if (!loc.campaignId) return { ok: false, reason: 'already_canonical' };

    const canonicalName = slugifyLocationName(loc.displayName || loc.canonicalName || loc.id);

    // Dedupe check
    const existing = await prisma.location.findFirst({
      where: { canonicalName, campaignId: null },
    });
    if (existing) {
      return { ok: false, reason: 'name_collision', existingId: existing.id };
    }

    // Promote: flip campaignId to null
    const promoted = await prisma.location.update({
      where: { id: locationId },
      data: {
        campaignId: null,
        canonicalName,
        knownByDefault: false,
        positionConfidence: 1,
        globallyActive: true,
      },
    });

    // Auto-link: create a Road to the nearest top-level settlement
    try {
      await autoLinkToNearestSettlement(promoted);
    } catch (linkErr) {
      log.warn({ err: linkErr?.message, locationId: promoted.id }, 'autoLink after promote failed');
    }

    // RAG index
    try {
      const text = [loc.displayName || canonicalName, loc.locationType, loc.region, loc.description]
        .filter(Boolean).join(' — ');
      await indexEntity('location', promoted.id, text);
    } catch (ragErr) {
      log.warn({ err: ragErr?.message, locationId: promoted.id }, 'RAG index after location promote failed');
    }

    return { ok: true, location: promoted };
  } catch (err) {
    log.error({ err: err?.message, locationId }, 'promoteCampaignLocationToCanonical failed');
    return { ok: false, reason: 'error', error: err?.message };
  }
}

async function autoLinkToNearestSettlement(promoted) {
  const SETTLEMENT_TYPES = ['hamlet', 'village', 'town', 'city', 'capital'];
  const nearest = await prisma.location.findFirst({
    where: {
      campaignId: null,
      locationType: { in: SETTLEMENT_TYPES },
      parentLocationId: null,
      id: { not: promoted.id },
    },
    orderBy: [{ regionX: 'asc' }],
  });
  if (!nearest) return;

  const dx = promoted.regionX - nearest.regionX;
  const dy = promoted.regionY - nearest.regionY;
  const distance = Math.sqrt(dx * dx + dy * dy);

  await prisma.road.create({
    data: {
      fromLocationId: nearest.id,
      toLocationId: promoted.id,
      distance,
      difficulty: 'safe',
      terrainType: 'path',
      bidirectional: true,
    },
  });
}

// ─── Pipeline helpers ────────────────────────────────────────────────

export function scoreLocationCandidate({ sceneCount = 0, questObjectiveCount = 0 }) {
  return sceneCount * 2 + questObjectiveCount * 5;
}

export async function collectLocationCandidates(campaignId, { topN = 5 } = {}) {
  const campaignLocations = await prisma.location.findMany({
    where: { campaignId },
  });
  if (!campaignLocations.length) return [];

  // Score by scene count (via CampaignLocationSummary) + quest objectives
  const summaries = await prisma.campaignLocationSummary.findMany({
    where: { campaignId },
    select: { locationName: true, sceneCount: true },
  });
  const sceneCountByName = new Map(summaries.map((s) => [slugifyLocationName(s.locationName), s.sceneCount]));

  const scored = campaignLocations.map((loc) => ({
    loc,
    score: scoreLocationCandidate({
      sceneCount: sceneCountByName.get(loc.canonicalName) || 0,
    }),
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topN).map((s) => s.loc);
}

export async function runLocationPromotionPipeline({ campaignId, dryRun = false, topN = 5 } = {}) {
  const candidates = await collectLocationCandidates(campaignId, { topN });
  if (!candidates.length) return { collected: 0, persisted: 0, skipped: 0 };

  let persisted = 0;
  let skipped = 0;

  for (const loc of candidates) {
    if (dryRun) { persisted++; continue; }
    try {
      await prisma.locationPromotionCandidate.upsert({
        where: { campaignId_sourceLocationId: { campaignId, sourceLocationId: loc.id } },
        create: {
          campaignId,
          sourceLocationId: loc.id,
          canonicalName: slugifyLocationName(loc.displayName || loc.canonicalName || ''),
          displayName: loc.displayName,
          locationType: loc.locationType,
          region: loc.region,
          description: loc.description,
        },
        update: {
          canonicalName: slugifyLocationName(loc.displayName || loc.canonicalName || ''),
          displayName: loc.displayName,
          description: loc.description,
        },
      });
      persisted++;
    } catch (err) {
      log.warn({ err: err?.message, locationId: loc.id }, 'Location candidate upsert failed');
      skipped++;
    }
  }

  return { collected: candidates.length, persisted, skipped };
}
