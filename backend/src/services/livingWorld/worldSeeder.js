// Living World — per-campaign initial world seeder.
//
// Called from POST /v1/campaigns when livingWorldEnabled is true. Creates a
// bounded set of settlement rows (hamlets/villages/towns/cities) arranged on
// a ring around (0,0) where the global capital `Yeralden` lives, then picks
// a starting settlement via a weighted roll and persists campaign-level
// caps/bounds on the Campaign row.
//
// F5b — per-campaign settlements live in `CampaignLocation` (per-campaign
// sandbox), NOT canonical `WorldLocation`. They show on the player map via
// regionX/regionY and travel distance is Euclidean. Roads are canonical-only
// (capital + heartland villages from `seedWorld.js`); the ring + capital
// edges that earlier versions created are intentionally dropped.
//
// FUTURE — see knowledge/ideas/biome-tiles.md. When biome tiles land, ring
// placement should be constrained to settlement-friendly biomes (plains,
// hills, coast) instead of dropping settlements on whatever ring slot lands
// on a mountain peak or swamp. Each created CampaignLocation will also pick
// up `tileId` from its (gridX, gridY) lookup.
//
// Capital is NOT seeded here — `seedWorld.js` (server startup) owns Yeralden.
// We call it here as a belt-and-suspenders in case startup skipped it.
//
// Starting-location pool:
//   - Default (capital not eligible): hamlet 10% / village 70% / city 20% (town
//     only used as fallback when no city seeded).
//   - Capital-eligible (difficultyTier ∈ {'high','deadly'} OR length='Long'):
//     hamlet 5% / village 55% / city 20% / capital 20%.
// Low-tier short campaigns never start in the bustling capital — tonal mismatch.

import { prisma } from '../../lib/prisma.js';
import { childLogger } from '../../lib/logger.js';
import { getTemplate } from './settlementTemplates.js';
import { pickSettlementName } from './nameBank.js';
import { seedWorld } from '../../scripts/seedWorld.js';
import * as ragService from './ragService.js';
import { buildLocationEmbeddingText } from '../embeddingService.js';
import {
  packWorldBounds,
  slugifyLocationName,
  LOCATION_KIND_WORLD,
  LOCATION_KIND_CAMPAIGN,
} from '../locationRefs.js';

const log = childLogger({ module: 'worldSeeder' });

const LENGTH_PLAN = {
  Short:  { hamlet: 1, village: 1, town: 0, city: 0, boundsKm: 2.5 },
  Medium: { hamlet: 2, village: 2, town: 1, city: 0, boundsKm: 5 },
  Long:   { hamlet: 3, village: 3, town: 2, city: 1, boundsKm: 10 },
};

const DEFAULT_PLAN_KEY = 'Medium';

// Starting-pool weights — capital bucket is 0 by default and only raised when
// `difficultyTier` OR `length` unlocks the capital. Remaining types are
// re-weighted only against types actually seeded for this campaign.
const WEIGHTS_DEFAULT = { hamlet: 10, village: 70, town: 0, city: 20, capital: 0 };
const WEIGHTS_WITH_CAPITAL = { hamlet: 5, village: 55, town: 0, city: 20, capital: 20 };

const RING_FRACTION = 0.7;      // ring radius = boundsKm * RING_FRACTION
const MIN_RING_RADIUS = 1.5;    // km — floor to avoid cluster-on-capital on Short

export function isCapitalStartEligible({ length, difficultyTier } = {}) {
  return length === 'Long' || difficultyTier === 'high' || difficultyTier === 'deadly';
}

function planFor(length) {
  return LENGTH_PLAN[length] || LENGTH_PLAN[DEFAULT_PLAN_KEY];
}

function buildSeedList(plan) {
  const list = [];
  for (let i = 0; i < plan.city; i += 1) list.push('city');
  for (let i = 0; i < plan.town; i += 1) list.push('town');
  for (let i = 0; i < plan.village; i += 1) list.push('village');
  for (let i = 0; i < plan.hamlet; i += 1) list.push('hamlet');
  return list;
}

function ringPositions(count, radius) {
  const out = [];
  if (count === 0) return out;
  for (let i = 0; i < count; i += 1) {
    const angle = (2 * Math.PI * i) / count;
    out.push({
      regionX: Math.round(radius * Math.cos(angle) * 100) / 100,
      regionY: Math.round(radius * Math.sin(angle) * 100) / 100,
    });
  }
  return out;
}

function pickStartingType({ seededTypes, length, difficultyTier }) {
  const eligible = isCapitalStartEligible({ length, difficultyTier });
  const base = eligible ? WEIGHTS_WITH_CAPITAL : WEIGHTS_DEFAULT;
  const weights = { ...base };

  // Zero types that weren't seeded (except capital — Yeralden is always reachable).
  for (const t of ['hamlet', 'village', 'town', 'city']) {
    if (!seededTypes.has(t)) weights[t] = 0;
  }
  // If we rolled for "city" but only "town" was seeded, redirect city weight to town.
  if (weights.city > 0 && !seededTypes.has('city') && seededTypes.has('town')) {
    weights.town += weights.city;
    weights.city = 0;
  }

  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  if (total === 0) {
    if (seededTypes.has('village')) return 'village';
    if (seededTypes.has('hamlet')) return 'hamlet';
    if (seededTypes.has('town')) return 'town';
    if (seededTypes.has('city')) return 'city';
    return eligible ? 'capital' : 'village';
  }
  let roll = Math.random() * total;
  for (const [type, w] of Object.entries(weights)) {
    if (w <= 0) continue;
    roll -= w;
    if (roll <= 0) return type;
  }
  return 'village';
}

/**
 * Seed the initial per-campaign world for a Living World campaign. The
 * starting-location pointer returned in `startingLocationKind/Id` is the
 * polymorphic ref the caller should write to `Campaign.currentLocationKind/Id`.
 *
 * @param {string} campaignId
 * @param {object} opts
 * @param {'Short'|'Medium'|'Long'} [opts.length]
 * @param {'low'|'medium'|'high'|'deadly'} [opts.difficultyTier]
 * @returns {Promise<{
 *   startingLocationName: string|null,
 *   startingLocationKind: 'world'|'campaign'|null,
 *   startingLocationId: string|null,
 *   startingType: string,
 *   settlementIds: string[],
 *   bounds: object,
 *   caps: object,
 *   capitalId: string|null,
 * }>}
 */
export async function seedInitialWorld(campaignId, { length, difficultyTier } = {}) {
  if (!campaignId) throw new Error('seedInitialWorld: campaignId required');

  // Belt-and-suspenders — ensure the global capital + its trainers exist even if
  // server-startup seed failed. Idempotent via upsert on canonical names.
  try {
    await seedWorld();
  } catch (err) {
    log.warn({ err: err?.message }, 'seedWorld belt-suspender failed — continuing without capital');
  }

  const plan = planFor(length);
  const seedList = buildSeedList(plan);
  const totalSettlements = seedList.length;

  // Preload existing names from BOTH canonical WorldLocation and this campaign's
  // CampaignLocation so the nameBank avoids collisions with seeded canonical
  // (Yeralden + heartland villages) AND any CampaignLocations already in this
  // campaign (e.g. on a re-seed).
  const [worldNames, campaignNames] = await Promise.all([
    prisma.worldLocation.findMany({ select: { canonicalName: true } }),
    prisma.campaignLocation.findMany({
      where: { campaignId },
      select: { name: true },
    }),
  ]);
  const existingNames = new Set([
    ...worldNames.map((r) => r.canonicalName),
    ...campaignNames.map((r) => r.name),
  ]);

  const ringRadius = Math.max(MIN_RING_RADIUS, plan.boundsKm * RING_FRACTION);
  const positions = ringPositions(totalSettlements, ringRadius);

  const capital = await prisma.worldLocation.findFirst({
    where: { locationType: 'capital', regionX: 0, regionY: 0 },
    select: { id: true, canonicalName: true, regionX: true, regionY: true },
  });

  const created = [];
  for (let i = 0; i < seedList.length; i += 1) {
    const type = seedList[i];
    const { regionX, regionY } = positions[i];
    const name = pickSettlementName(type, existingNames);
    const template = getTemplate(type);
    const slug = slugifyLocationName(name);

    try {
      const row = await prisma.campaignLocation.create({
        data: {
          campaignId,
          name,
          canonicalSlug: slug,
          aliases: [name],
          description: '',
          category: type,
          locationType: type,
          region: 'heartland',
          regionX,
          regionY,
          positionConfidence: 0.9,
          maxKeyNpcs: template.maxKeyNpcs || 10,
          maxSubLocations: template.maxSubLocations || 5,
          embeddingText: `${name} (${type})`,
        },
      });
      ragService.index('campaign_location', row.id, buildLocationEmbeddingText(row)).catch(() => {});
      created.push({ ...row, type });
    } catch (err) {
      if (err?.code === 'P2002') {
        log.warn({ name }, 'CampaignLocation slug collision during seed; skipping');
        continue;
      }
      throw err;
    }
  }

  // F5b — Roads are canonical-only (FK to WorldLocation). Per-campaign
  // settlements are off-graph by design; the player travels via map
  // "travel by selection" using Euclidean distance on regionX/regionY.

  // Pick the starting settlement type, then pick a concrete row of that type.
  const seededTypes = new Set(created.map((c) => c.type));
  const startingType = pickStartingType({ seededTypes, length, difficultyTier });

  let startingLocationName = null;
  let startingLocationKind = null;
  let startingLocationId = null;

  if (startingType === 'capital') {
    if (capital) {
      startingLocationName = capital.canonicalName;
      startingLocationKind = LOCATION_KIND_WORLD;
      startingLocationId = capital.id;
    } else {
      const fallback = created.find((c) => c.type === 'village') || created[0] || null;
      if (fallback) {
        startingLocationName = fallback.name;
        startingLocationKind = LOCATION_KIND_CAMPAIGN;
        startingLocationId = fallback.id;
      }
    }
  } else {
    const candidates = created.filter((c) => c.type === startingType);
    const pick = candidates.length > 0
      ? candidates[Math.floor(Math.random() * candidates.length)]
      : (created[0] || null);
    if (pick) {
      startingLocationName = pick.name;
      startingLocationKind = LOCATION_KIND_CAMPAIGN;
      startingLocationId = pick.id;
    } else if (capital) {
      startingLocationName = capital.canonicalName;
      startingLocationKind = LOCATION_KIND_WORLD;
      startingLocationId = capital.id;
    }
  }

  // Persist campaign-level caps + bounds so scene-gen/context can read them later.
  // F5 — bounds went from JSONB to 4 Float columns; pack via locationRefs helper.
  const caps = { hamlet: plan.hamlet, village: plan.village, town: plan.town, city: plan.city };
  const bounds = { minX: -plan.boundsKm, maxX: plan.boundsKm, minY: -plan.boundsKm, maxY: plan.boundsKm };
  try {
    await prisma.campaign.update({
      where: { id: campaignId },
      data: {
        settlementCaps: caps,
        ...packWorldBounds(bounds),
      },
    });
  } catch (err) {
    log.warn({ err: err?.message, campaignId }, 'Failed to persist settlementCaps/worldBounds');
  }

  log.info(
    {
      campaignId,
      length: length || DEFAULT_PLAN_KEY,
      difficultyTier: difficultyTier || 'low',
      settlements: created.length,
      startingLocationName,
      startingLocationKind,
      startingType,
    },
    'Per-campaign world seeded (CampaignLocation)',
  );

  return {
    startingLocationName,
    startingLocationKind,
    startingLocationId,
    startingType,
    settlementIds: created.map((c) => c.id),
    bounds,
    caps,
    capitalId: capital?.id || null,
  };
}
