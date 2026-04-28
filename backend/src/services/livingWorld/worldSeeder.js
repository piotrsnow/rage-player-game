// Living World — per-campaign initial world seeder.
//
// Called from POST /v1/campaigns when livingWorldEnabled is true. After the
// per-campaign settlement ring was dropped (2026-04-28), this function only:
//   1. Belt-and-suspenders re-runs `seedWorld()` so canonical capital +
//      heartland villages exist even on a fresh DB.
//   2. Persists `worldBounds` (length-scaled) on the Campaign row — still
//      needed as an AI/seeder placement guardrail (pre-biome-tiles).
//   3. Picks a fallback starting location for the rare case where the AI
//      campaign-gen flow didn't run (no `startSpawn` cache hit upstream).
//      Default = the canonical capital. The startSpawn cache, when present,
//      overrides this in `crud.js` with a canonical settlement+sublocation.
//
// Pre-2026-04-28 the function also created 1-9 hamlet/village/town/city
// CampaignLocation rows on a ring around the capital. They polluted the
// shared world map (each campaign saw different "Modrzejów" / "Drewnica"
// villages on the same -10..10 grid), contradicting the
// "Player map = global canonical world" principle. Drop simplifies the
// architecture and keeps every player on the same canonical map.

import { prisma } from '../../lib/prisma.js';
import { childLogger } from '../../lib/logger.js';
import { seedWorld } from '../../scripts/seedWorld.js';
import {
  packWorldBounds,
  LOCATION_KIND_WORLD,
} from '../locationRefs.js';

const log = childLogger({ module: 'worldSeeder' });

const LENGTH_PLAN = {
  Short:  { boundsKm: 2.5 },
  Medium: { boundsKm: 5 },
  Long:   { boundsKm: 10 },
};

const DEFAULT_PLAN_KEY = 'Medium';

function planFor(length) {
  return LENGTH_PLAN[length] || LENGTH_PLAN[DEFAULT_PLAN_KEY];
}

/**
 * Seed the initial per-campaign world for a Living World campaign. Returns a
 * fallback starting-location pointer the caller can write to
 * `Campaign.currentLocation*`. The startSpawn cache (canonical settlement +
 * sublocation, populated by `generateCampaignStream`) overrides this in
 * `crud.js` whenever the AI gen flow ran.
 *
 * @param {string} campaignId
 * @param {object} opts
 * @param {'Short'|'Medium'|'Long'} [opts.length]
 * @returns {Promise<{
 *   startingLocationName: string|null,
 *   startingLocationKind: 'world'|null,
 *   startingLocationId: string|null,
 *   bounds: object,
 *   capitalId: string|null,
 * }>}
 */
export async function seedInitialWorld(campaignId, { length } = {}) {
  if (!campaignId) throw new Error('seedInitialWorld: campaignId required');

  // Belt-and-suspenders — ensure the global capital + its trainers exist even
  // if server-startup seed failed. Idempotent via upsert on canonical names.
  try {
    await seedWorld();
  } catch (err) {
    log.warn({ err: err?.message }, 'seedWorld belt-suspender failed — continuing without capital');
  }

  const plan = planFor(length);
  const bounds = { minX: -plan.boundsKm, maxX: plan.boundsKm, minY: -plan.boundsKm, maxY: plan.boundsKm };

  const capital = await prisma.worldLocation.findFirst({
    where: { locationType: 'capital', regionX: 0, regionY: 0 },
    select: { id: true, canonicalName: true },
  });

  // Persist worldBounds on the Campaign row so scene-gen / AI placement
  // guardrails see a consistent envelope. Length-scaled (Short=2.5, Med=5,
  // Long=10) — the same envelope the dropped ring seeder used.
  try {
    await prisma.campaign.update({
      where: { id: campaignId },
      data: packWorldBounds(bounds),
    });
  } catch (err) {
    log.warn({ err: err?.message, campaignId }, 'Failed to persist worldBounds');
  }

  log.info(
    { campaignId, length: length || DEFAULT_PLAN_KEY, capital: capital?.canonicalName || null },
    'Per-campaign world seed (canonical-only — ring dropped)',
  );

  return {
    startingLocationName: capital?.canonicalName || null,
    startingLocationKind: capital ? LOCATION_KIND_WORLD : null,
    startingLocationId: capital?.id || null,
    bounds,
    capitalId: capital?.id || null,
  };
}
