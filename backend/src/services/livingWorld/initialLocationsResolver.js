// Campaign-creation phase — applies the AI's `initialLocations` array against
// the per-campaign sandbox. Materializes thematic locations bound to the
// starter NPC's knowledge: sublocations under canonical settlements they
// know, or standalone places anchored relative to the questgiver / capital
// / a named canonical landmark.
//
// Why this lives in livingWorld and not as a generic newLocations call:
//   - It runs ONCE at POST /v1/campaigns time, not per-scene.
//   - The anchor vocabulary is broader (`capital`/`questGiver`/<name> tokens),
//     not just `prevLoc`.
//   - It validates AI emissions against the explicit start-spawn knowledge
//     surface (`allowedAnchorNames`), not the looser mid-play scope.
//
// Validation policy: defensive drop on every shape mismatch, never throw.
// The premium prompt may be partially ignored — bad emissions just don't
// materialize. Per-entry try/catch keeps one bad row from killing the batch.

import { prisma } from '../../lib/prisma.js';
import { childLogger } from '../../lib/logger.js';
import {
  processSublocationEntry,
  processTopLevelEntry,
  resolveAnchorToken,
} from '../sceneGenerator/processStateChanges/locations.js';
import { slugifyLocationName } from '../locationRefs.js';

const log = childLogger({ module: 'initialLocationsResolver' });

const ALLOWED_LOCATION_TYPES = new Set([
  'campaignPlace', 'wilderness', 'ruin', 'camp', 'cave', 'forest', 'dungeon', 'mountain', 'interior',
]);
const ALLOWED_DISTANCE_HINTS = new Set(['very_close', 'close', 'medium', 'far', 'very_far']);
const ALLOWED_DIRECTIONS = new Set(['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']);
const ALLOWED_BIOMES = new Set(['plains', 'forest', 'hills', 'mountains', 'swamp', 'wasteland', 'coast', 'urban']);

/**
 * Apply AI-emitted initial locations to the campaign sandbox.
 *
 * @param {Object}  args
 * @param {string}  args.campaignId
 * @param {Array}   args.locations             — AI emissions, max 5 honored
 * @param {Object}  args.bounds                — `{minX,maxX,minY,maxY}` or null
 * @param {Object}  args.startSpawn            — peeked cache entry (must include
 *                                               `npcCurrentLocationId`, `npcCanonicalId`,
 *                                               `npcName`, `npcKnownLocations`).
 * @param {Set<string>} args.allowedAnchorNames — canonicalNames from
 *                                                `startSpawn.npcKnownLocations`.
 * @returns {Promise<{created: number, dropped: number}>}
 */
export async function applyInitialLocations({
  campaignId,
  locations,
  bounds = null,
  startSpawn,
  allowedAnchorNames,
}) {
  if (!campaignId || !startSpawn || !Array.isArray(locations) || locations.length === 0) {
    return { created: 0, dropped: 0 };
  }
  const allowed = allowedAnchorNames instanceof Set ? allowedAnchorNames : new Set();

  // Pre-load this-campaign slugs once so the pre-pass can reject collisions
  // with rows already created by `seedInitialWorld` without a per-entry round
  // trip. Canonical WorldLocation rows are excluded — they live in their own
  // unique-name namespace (`canonicalName` unique) and a same-name AI
  // location would still be allowed as a CampaignLocation (different table,
  // different uniqueness scope). The collision we're guarding against is the
  // regression where a freshly-seeded `Modrzejów` ate the AI's intended new
  // top-level entry and re-rendered it at (0,0).
  const existingCampaignRows = await prisma.campaignLocation.findMany({
    where: { campaignId },
    select: { canonicalSlug: true },
  });
  const usedSlugs = new Set(existingCampaignRows.map((r) => r.canonicalSlug).filter(Boolean));

  // Resolve the questGiver shadow once for the `knownByQuestGiver` path.
  // Match-by-name is what `syncNPCsToNormalized` uses upstream — same lookup
  // shape, same case-insensitive normalization. Cache miss → skip the
  // experience write per entry, the location still materializes.
  const questGiverShadow = startSpawn.npcName
    ? await prisma.campaignNPC.findFirst({
        where: { campaignId, name: { equals: startSpawn.npcName, mode: 'insensitive' } },
        select: { id: true },
      })
    : null;

  let created = 0;
  let dropped = 0;

  for (const raw of locations) {
    const validation = validateEntry(raw, { allowed, usedSlugs });
    if (!validation.ok) {
      dropped += 1;
      log.warn({ campaignId, name: raw?.name, reason: validation.reason }, 'Initial location dropped');
      continue;
    }
    const entry = validation.entry;

    // Fog at campaign start: ALL initialLocations stay fully unknown to the
    // PLAYER. `knownByQuestGiver` records that the NPC knows the place (so
    // they can volunteer it when asked), but the player only learns about a
    // location through actual scene narration — via mid-play
    // `markLocationHeardAbout` fired from livingWorld.js when the AI mentions
    // it, or `markLocationDiscovered` when the player visits.
    const discoveryState = null;

    try {
      if (entry.parentLocationName) {
        // Sublocation branch — `processSublocationEntry` resolves the parent
        // by name (canonical-priority). We've already validated the name is
        // in the NPC's allowed set, so the lookup is safe.
        await processSublocationEntry(campaignId, entry, { discoveryState });
      } else {
        const anchorRef = await resolveAnchorToken(entry.anchor.relativeTo, campaignId, startSpawn);
        if (!anchorRef) {
          dropped += 1;
          log.warn(
            { campaignId, name: entry.name, anchor: entry.anchor.relativeTo },
            'Initial location dropped — anchor token did not resolve to canonical row',
          );
          continue;
        }
        // Forward the anchor.distance/direction hints into the smart placer
        // by reusing the same field names mid-play uses. Avoids a separate
        // path through `processTopLevelEntry`.
        const topEntry = {
          ...entry,
          distanceHint: entry.anchor.distance,
          directionFromCurrent: entry.anchor.direction || null,
        };
        await processTopLevelEntry(campaignId, topEntry, null, bounds, { anchorOverride: anchorRef, discoveryState });
      }

      // Track slug as used so a same-batch collision later in the loop drops
      // rather than silently no-ops via `findOrCreateCampaignLocation`.
      const slug = slugifyLocationName(entry.name);
      if (slug) usedSlugs.add(slug);
      created += 1;

      if (entry.knownByQuestGiver === true && questGiverShadow?.id) {
        await prisma.campaignNpcExperience.create({
          data: {
            campaignNpcId: questGiverShadow.id,
            content: `Zna miejsce: ${entry.name}`,
            importance: 'minor',
          },
        }).catch((err) => log.warn(
          { err: err?.message, campaignId, name: entry.name },
          'Failed to record knownByQuestGiver experience',
        ));
      }
    } catch (err) {
      dropped += 1;
      log.warn({ err: err?.message, campaignId, name: entry.name }, 'Initial location entry threw');
    }
  }

  log.info({ campaignId, created, dropped, total: locations.length }, 'applyInitialLocations done');
  return { created, dropped };
}

function validateEntry(raw, { allowed, usedSlugs }) {
  if (!raw || typeof raw !== 'object') return { ok: false, reason: 'not_object' };
  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  if (!name) return { ok: false, reason: 'missing_name' };

  const slug = slugifyLocationName(name);
  if (!slug) return { ok: false, reason: 'unsluggable_name' };
  if (usedSlugs.has(slug)) return { ok: false, reason: 'slug_collision_with_seeded' };

  let locationType = typeof raw.locationType === 'string' ? raw.locationType : 'campaignPlace';
  if (!ALLOWED_LOCATION_TYPES.has(locationType)) locationType = 'campaignPlace';

  const description = typeof raw.description === 'string' ? raw.description : '';
  const knownByQuestGiver = raw.knownByQuestGiver === true;

  // Biome — narrative hint only; resolver doesn't place by biome (yet).
  // Out-of-vocab = log + drop the field, keep the entry.
  let biome = null;
  if (typeof raw.biome === 'string') {
    if (ALLOWED_BIOMES.has(raw.biome)) biome = raw.biome;
    else log.info({ name, biome: raw.biome }, 'Biome out of vocab — ignoring');
  }
  if (biome) {
    log.info({ name, biome }, 'Biome hint accepted (informational; resolver does not place by biome today)');
  }

  // Sublocation branch — parent must be canonical from NPC's known set.
  if (raw.parentLocationName) {
    const parent = typeof raw.parentLocationName === 'string' ? raw.parentLocationName.trim() : '';
    if (!parent) return { ok: false, reason: 'parent_not_string' };
    if (!allowed.has(parent)) return { ok: false, reason: 'parent_not_in_npc_known_set' };
    return {
      ok: true,
      entry: {
        name,
        parentLocationName: parent,
        locationType: locationType === 'campaignPlace' ? 'interior' : locationType,
        description,
        slotType: typeof raw.slotType === 'string' ? raw.slotType : null,
        dangerLevel: typeof raw.dangerLevel === 'string' ? raw.dangerLevel : 'safe',
        knownByQuestGiver,
      },
    };
  }

  // Standalone branch — anchor obowiązkowy.
  const anchor = raw.anchor;
  if (!anchor || typeof anchor !== 'object') return { ok: false, reason: 'standalone_missing_anchor' };
  const relativeTo = typeof anchor.relativeTo === 'string' ? anchor.relativeTo.trim() : '';
  if (!relativeTo) return { ok: false, reason: 'anchor_missing_relativeTo' };
  if (relativeTo !== 'capital' && relativeTo !== 'questGiver' && !allowed.has(relativeTo)) {
    return { ok: false, reason: 'anchor_relativeTo_not_in_allowed_set' };
  }
  let distance = typeof anchor.distance === 'string' ? anchor.distance.toLowerCase() : 'close';
  if (!ALLOWED_DISTANCE_HINTS.has(distance)) distance = 'close';
  let direction = null;
  if (typeof anchor.direction === 'string') {
    const up = anchor.direction.trim().toUpperCase();
    if (ALLOWED_DIRECTIONS.has(up)) direction = up;
  }

  return {
    ok: true,
    entry: {
      name,
      parentLocationName: null,
      locationType,
      description,
      dangerLevel: typeof raw.dangerLevel === 'string' ? raw.dangerLevel : 'safe',
      anchor: { relativeTo, distance, direction },
      knownByQuestGiver,
    },
  };
}
