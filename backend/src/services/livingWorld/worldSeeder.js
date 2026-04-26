// Living World — per-campaign initial world seeder.
//
// Called from POST /v1/campaigns when livingWorldEnabled is true. Creates a
// bounded set of settlement WorldLocations (hamlets/villages/towns/cities)
// arranged on a ring around (0,0) where the global capital `Yeralden` lives,
// auto-edges them to neighbors + capital, then picks a starting settlement
// via a weighted roll and persists campaign-level caps/bounds on the Campaign
// row.
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
import { upsertEdge } from './travelGraph.js';
import { euclidean } from './positionCalculator.js';
import * as ragService from './ragService.js';
import { buildLocationEmbeddingText } from '../embeddingService.js';
import { packWorldBounds } from '../locationRefs.js';

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
const CAPITAL_EDGE_RANGE = 10;  // km — auto-edge to capital if within this range

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
 * Seed the initial per-campaign world for a Living World campaign.
 *
 * @param {string} campaignId
 * @param {object} opts
 * @param {'Short'|'Medium'|'Long'} [opts.length]
 * @param {'low'|'medium'|'high'|'deadly'} [opts.difficultyTier]
 * @returns {Promise<{startingLocationName:string|null, startingType:string, settlementIds:string[], bounds:object, caps:object, capitalId:string|null}>}
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

  // Preload existing canonical names across the whole DB so nameBank avoids collisions
  // with any location seeded by prior campaigns (Yeralden and its sublocations included).
  const existingNames = new Set(
    (await prisma.worldLocation.findMany({ select: { canonicalName: true } }))
      .map((r) => r.canonicalName),
  );

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

    try {
      const row = await prisma.worldLocation.create({
        data: {
          canonicalName: name,
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
      // Round E Phase 9 — fire-and-forget RAG indexing for campaign-seeded settlement.
      ragService.index('location', row.id, buildLocationEmbeddingText(row)).catch(() => {});
      created.push({ ...row, type });
    } catch (err) {
      if (err?.code === 'P2002') {
        log.warn({ name }, 'Canonical name collision during seed; skipping');
        continue;
      }
      throw err;
    }
  }

  // Edges: ring neighbors + every seeded settlement within CAPITAL_EDGE_RANGE
  // of (0,0) gets a capital edge. Directional edges — issue both ways.
  const edgeOps = [];
  for (let i = 0; i < created.length; i += 1) {
    const a = created[i];
    if (created.length > 1) {
      const b = created[(i + 1) % created.length];
      if (b.id !== a.id) {
        const d = Math.round(euclidean(
          { regionX: a.regionX, regionY: a.regionY },
          { regionX: b.regionX, regionY: b.regionY },
        ) * 100) / 100;
        edgeOps.push(upsertEdge({ fromLocationId: a.id, toLocationId: b.id, distance: d, difficulty: 'safe', terrainType: 'road', discoveredByCampaignId: campaignId }));
        edgeOps.push(upsertEdge({ fromLocationId: b.id, toLocationId: a.id, distance: d, difficulty: 'safe', terrainType: 'road', discoveredByCampaignId: campaignId }));
      }
    }
    if (capital) {
      const dCap = Math.round(euclidean(
        { regionX: a.regionX, regionY: a.regionY },
        { regionX: capital.regionX || 0, regionY: capital.regionY || 0 },
      ) * 100) / 100;
      if (dCap <= CAPITAL_EDGE_RANGE) {
        edgeOps.push(upsertEdge({ fromLocationId: a.id, toLocationId: capital.id, distance: dCap, difficulty: 'safe', terrainType: 'road', discoveredByCampaignId: campaignId }));
        edgeOps.push(upsertEdge({ fromLocationId: capital.id, toLocationId: a.id, distance: dCap, difficulty: 'safe', terrainType: 'road', discoveredByCampaignId: campaignId }));
      }
    }
  }
  await Promise.allSettled(edgeOps);

  // Pick the starting settlement type, then pick a concrete row of that type.
  const seededTypes = new Set(created.map((c) => c.type));
  const startingType = pickStartingType({ seededTypes, length, difficultyTier });

  let startingLocationName = null;
  if (startingType === 'capital') {
    startingLocationName = capital?.canonicalName
      || created.find((c) => c.type === 'village')?.canonicalName
      || created[0]?.canonicalName
      || null;
  } else {
    const candidates = created.filter((c) => c.type === startingType);
    if (candidates.length > 0) {
      startingLocationName = candidates[Math.floor(Math.random() * candidates.length)].canonicalName;
    } else if (created.length > 0) {
      startingLocationName = created[0].canonicalName;
    } else {
      startingLocationName = capital?.canonicalName || null;
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
      startingType,
    },
    'Per-campaign world seeded',
  );

  return {
    startingLocationName,
    startingType,
    settlementIds: created.map((c) => c.id),
    bounds,
    caps,
    capitalId: capital?.id || null,
  };
}
