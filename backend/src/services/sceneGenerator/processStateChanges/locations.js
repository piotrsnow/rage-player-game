import { prisma } from '../../../lib/prisma.js';
import { childLogger } from '../../../lib/logger.js';
import {
  resolveLocationByName,
  findOrCreateCampaignLocation,
} from '../../livingWorld/worldStateService.js';
import { markLocationDiscovered, markLocationHeardAbout } from '../../livingWorld/userDiscoveryService.js';
import { computeSmartPosition, findMergeCandidate } from '../../livingWorld/positionCalculator.js';
import {
  LOCATION_KIND_WORLD,
  LOCATION_KIND_CAMPAIGN,
} from '../../locationRefs.js';

const log = childLogger({ module: 'sceneGenerator' });

/**
 * F5b — materialize AI-emitted locations into the per-campaign sandbox
 * (`CampaignLocation`). Canonical `WorldLocation` is reserved for
 * hand-authored seed rows + admin-promoted ex-CampaignLocations; AI mid-play
 * never writes there.
 *
 * Sublocation path (`parentLocationName` set):
 *   1. Resolve parent via `resolveLocationByName` (may return canonical OR
 *      another CampaignLocation in this campaign).
 *   2. Create CampaignLocation with polymorphic `parentLocationKind/Id`.
 *      Inherits parent coords so it shows on the map at parent's tile.
 *
 * Top-level path (`parentLocationName` null):
 *   1. Resolve anchor from `prevLoc` (scene-start location, polymorphic).
 *   2. Load existing top-level locations (canonical + this-campaign) for
 *      collision/merge spacing.
 *   3. `computeSmartPosition` picks coords (clamped to worldBounds).
 *   4. Merge check: if coords + name fuzzy-match an existing top-level row,
 *      reuse (don't double-materialize).
 *   5. Otherwise create CampaignLocation with the picked coords.
 *
 * Roads are canonical-only (Road model FK → WorldLocation). AI-created
 * CampaignLocations are off-graph by design — distance to/from them is
 * Euclidean on regionX/regionY, not Dijkstra over Roads.
 */
/**
 * Mid-play location processor. Post-(round-no-AI-locations):
 *   - Top-level entries (parentLocationName=null) are silently rejected.
 *     BE travel resolver owns currentLocation arbitration; AI is no longer
 *     allowed to invent new top-level rows mid-play. The creation-time
 *     `initialLocationsResolver` is the only writer for top-level rows
 *     during a campaign now.
 *   - Sublocation entries (parentLocationName set) are still honored —
 *     player walks into a new tavern/forge/wing inside an existing
 *     settlement, AI emits the entry, BE materializes it. Returns the
 *     created refs so the caller (processStateChanges/index.js) can run
 *     the auto-promote-to-currentLocation rule.
 *
 * @returns {Promise<{createdSublocs: Array<{kind:string,row:Object}>}>}
 */
export async function processLocationChanges(campaignId, newLocations, { prevLoc: _prevLoc = null } = {}) {
  if (!Array.isArray(newLocations) || newLocations.length === 0) return { createdSublocs: [] };

  const createdSublocs = [];
  for (const entry of newLocations) {
    if (!entry?.name || typeof entry.name !== 'string') continue;

    try {
      if (entry.parentLocationName) {
        const ref = await processSublocationEntry(campaignId, entry);
        if (ref) createdSublocs.push(ref);
      } else {
        log.info(
          { campaignId, name: entry.name, locationType: entry.locationType },
          'Top-level newLocations emission rejected mid-play — BE travel resolver owns location arbitration',
        );
      }
    } catch (err) {
      log.warn({ err: err?.message, campaignId, name: entry.name }, 'processLocationChanges entry failed');
    }
  }
  return { createdSublocs };
}

/**
 * Resolve an anchor token to a canonical WorldLocation row. Used by
 * `initialLocationsResolver` for `anchor.relativeTo` standalone entries:
 *   - `'capital'`            → the WorldLocation with locationType='capital'
 *   - `'questGiver'`         → the canonical sublocation the start-spawn NPC
 *                              belongs to (via `WorldNPC.currentLocationId`)
 *   - any other string       → exact-match canonical lookup by canonicalName
 *
 * Canonical-only by design — anchoring AI-emitted standalone locations on
 * a CampaignLocation row would let one ephemeral run influence another's
 * placement. Returns `{ kind, row }` or `null` when the token doesn't
 * resolve.
 */
export async function resolveAnchorToken(token, campaignId, startSpawn = null) {
  if (typeof token !== 'string' || !token.trim()) return null;
  const t = token.trim();

  if (t === 'capital') {
    const row = await prisma.worldLocation.findFirst({ where: { locationType: 'capital' } });
    return row ? { kind: LOCATION_KIND_WORLD, row } : null;
  }

  if (t === 'questGiver') {
    if (!startSpawn?.npcCurrentLocationId) return null;
    const row = await prisma.worldLocation.findUnique({ where: { id: startSpawn.npcCurrentLocationId } });
    return row ? { kind: LOCATION_KIND_WORLD, row } : null;
  }

  // Exact canonicalName hit only — no fuzzy fallback. Caller validated `t`
  // against the NPC's allowed-knowledge set before calling, so a miss here
  // is real (canonical row deleted between seed-spawn pick and POST).
  const row = await prisma.worldLocation.findUnique({ where: { canonicalName: t } });
  return row ? { kind: LOCATION_KIND_WORLD, row } : null;
}

export { processSublocationEntry, processTopLevelEntry };

async function processSublocationEntry(campaignId, entry, { discoveryState = 'visited' } = {}) {
  const parentRef = await resolveLocationByName(entry.parentLocationName, { campaignId });
  if (!parentRef) {
    log.warn({ campaignId, parent: entry.parentLocationName, child: entry.name }, 'Parent location resolve failed');
    return null;
  }
  const parent = parentRef.row;

  const created = await findOrCreateCampaignLocation(entry.name, {
    campaignId,
    description: entry.description || '',
    locationType: entry.locationType || 'interior',
    category: entry.slotType || 'custom',
    region: parent.region || null,
    regionX: parent.regionX ?? 0,
    regionY: parent.regionY ?? 0,
    positionConfidence: parent.positionConfidence ?? 0.5,
    parentLocationKind: parentRef.kind,
    parentLocationId: parent.id,
    slotType: entry.slotType || null,
    slotKind: 'custom',
    dangerLevel: entry.dangerLevel || 'safe',
  });

  if (!created) {
    log.warn({ campaignId, parent: entry.parentLocationName, child: entry.name }, 'Sublocation create failed');
    return null;
  }
  log.info(
    { campaignId, parent: parent.canonicalName || parent.name, child: entry.name, parentKind: parentRef.kind },
    'CampaignLocation sublocation materialized',
  );

  await autoDiscoverCreated({ campaignId, kind: LOCATION_KIND_CAMPAIGN, id: created.id, state: discoveryState });
  return { kind: LOCATION_KIND_CAMPAIGN, row: created };
}

// Phase A/B — settlements are seeded at campaign creation; AI cannot invent
// new settlements mid-play (would inflate the per-campaign sandbox with
// hamlet/village/etc. that the player never asked to build a town near).
// This function only runs when livingWorldEnabled is true (gated upstream).
const BLOCKED_MIDPLAY_LOCATION_TYPES = new Set(['hamlet', 'village', 'town', 'city', 'capital']);

async function processTopLevelEntry(campaignId, entry, anchorRef, bounds = null, { anchorOverride = null, discoveryState = 'visited' } = {}) {
  // FUTURE — see knowledge/ideas/biome-tiles.md. When the biome-tile grid lands,
  // this path should clamp the placed position to the current tile's bounds AND
  // inherit the tile's biome → locationType mapping (mountains tile → mountain
  // locationType when AI doesn't specify). Today AI inventions land with
  // `locationType='campaignPlace'` whenever the LLM omits it; tiles will fix the root.
  // `anchorOverride` (if set) takes precedence over `anchorRef`, used by
  // `initialLocationsResolver` to anchor on `capital`/`questGiver`/named
  // canonical locations independently of the scene-start `prevLoc`.
  const effectiveAnchorRef = anchorOverride && anchorOverride.row ? anchorOverride : anchorRef;
  if (!effectiveAnchorRef?.row) {
    log.warn({ campaignId, name: entry.name }, 'Top-level location skipped — no anchor (prevLoc)');
    return;
  }
  const locationType = entry.locationType || 'campaignPlace';

  if (BLOCKED_MIDPLAY_LOCATION_TYPES.has(locationType)) {
    log.info(
      { campaignId, name: entry.name, locationType },
      'Top-level settlement creation blocked mid-play (creation-time-only in Living World)',
    );
    return;
  }

  const anchor = effectiveAnchorRef.row;

  // Existing top-level rows for spacing/collision: pull both canonical
  // WorldLocation and this-campaign CampaignLocation. Sublocations (parent
  // set) inherit parent coords so they're already represented by the
  // parent row's coords — exclude them to avoid double-collision.
  const [worldRows, campaignRows] = await Promise.all([
    prisma.worldLocation.findMany({
      where: { parentLocationId: null, id: { not: anchor.id } },
      select: { id: true, canonicalName: true, regionX: true, regionY: true, locationType: true },
    }),
    prisma.campaignLocation.findMany({
      where: { campaignId, parentLocationId: null, id: { not: anchor.id } },
      select: { id: true, name: true, regionX: true, regionY: true, locationType: true },
    }),
  ]);
  const existing = [
    ...worldRows.map((r) => ({ ...r, canonicalName: r.canonicalName, kind: LOCATION_KIND_WORLD })),
    ...campaignRows.map((r) => ({ ...r, canonicalName: r.name, kind: LOCATION_KIND_CAMPAIGN })),
  ];

  const placed = computeSmartPosition({
    current: { regionX: anchor.regionX || 0, regionY: anchor.regionY || 0 },
    directionFromCurrent: entry.directionFromCurrent || null,
    travelDistance: entry.travelDistance || null,
    distanceHint: entry.distanceHint || null,
    existing,
    bounds,
  });
  if (!placed) {
    log.warn({ campaignId, name: entry.name }, 'computeSmartPosition returned null — bad anchor');
    return;
  }
  const position = placed.position;
  log.info(
    { campaignId, name: entry.name, pos: position, reason: placed.reason },
    'Smart placer picked position',
  );

  // Merge check — near-miss coords + fuzzy name match → reuse existing row.
  let createdRef = null;
  const mergeCandidate = findMergeCandidate({
    raw: position,
    existing: existing.filter((loc) => loc.id !== anchor.id),
  });
  if (mergeCandidate) {
    const cand = await resolveLocationByName(entry.name, { campaignId });
    if (cand && cand.row.id === mergeCandidate.location.id) {
      log.info(
        { campaignId, name: entry.name, mergedInto: cand.row.canonicalName || cand.row.name, kind: cand.kind },
        'Top-level location merged into existing',
      );
      createdRef = cand;
    }
  }

  if (!createdRef) {
    const created = await findOrCreateCampaignLocation(entry.name, {
      campaignId,
      description: entry.description || '',
      locationType,
      category: locationType,
      region: anchor.region || null,
      regionX: position.regionX,
      regionY: position.regionY,
      positionConfidence: 0.5,
      dangerLevel: entry.dangerLevel || 'safe',
    });
    if (!created) {
      log.warn({ campaignId, name: entry.name }, 'CampaignLocation create failed');
      return;
    }
    log.info(
      { campaignId, name: entry.name, pos: position, locationType },
      'Top-level CampaignLocation created',
    );
    createdRef = { kind: LOCATION_KIND_CAMPAIGN, row: created };
  }

  await autoDiscoverCreated({ campaignId, kind: createdRef.kind, id: createdRef.row.id, state: discoveryState });

  // F5b — `connectsTo` and bidirectional auto-Road both intentionally dropped.
  // Roads are canonical-only; the player will discover routes via map "travel
  // by selection" and the AI's narrative prose. Distance to/from
  // CampaignLocations is Euclidean on regionX/regionY at runtime.
}

// `state` controls the fog mark applied after creation:
//   'visited'     — mid-play default (player just walked into the new place)
//   'heard_about' — campaign-creation initialLocations that the questgiver mentioned
//   null          — skip entirely (location exists in world but stays fully unknown)
async function autoDiscoverCreated({ campaignId, kind, id, state = 'visited' }) {
  if (state !== 'visited' && state !== 'heard_about') return;
  try {
    const campaignRow = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { userId: true },
    });
    if (!campaignRow?.userId) return;
    const fn = state === 'visited' ? markLocationDiscovered : markLocationHeardAbout;
    await fn({
      userId: campaignRow.userId,
      locationKind: kind,
      locationId: id,
      campaignId,
    });
  } catch (err) {
    log.warn({ err: err?.message, campaignId, kind, id, state }, 'auto-discover after create failed');
  }
}
