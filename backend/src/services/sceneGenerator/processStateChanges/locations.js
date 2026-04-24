import { prisma } from '../../../lib/prisma.js';
import { childLogger } from '../../../lib/logger.js';
import { findOrCreateWorldLocation, createSublocation } from '../../livingWorld/worldStateService.js';
import { markLocationDiscovered } from '../../livingWorld/userDiscoveryService.js';
import { decideSublocationAdmission } from '../../livingWorld/topologyGuard.js';
import { computeSmartPosition, findMergeCandidate, euclidean } from '../../livingWorld/positionCalculator.js';
import { upsertEdge } from '../../livingWorld/travelGraph.js';
import { getTemplate, effectiveCustomCap } from '../../livingWorld/settlementTemplates.js';
import * as ragService from '../../livingWorld/ragService.js';
import { buildLocationEmbeddingText } from '../../embeddingService.js';

const log = childLogger({ module: 'sceneGenerator' });

/**
 * Phase 7 — materialize AI-emitted locations.
 *
 * Sublocation path (parentLocationName=set):
 *   1. Resolve parent via fuzzy name lookup.
 *   2. Fetch parent's children + compute slot groups.
 *   3. Run topologyGuard.decideSublocationAdmission → accept/reject.
 *   4. On accept: upsert via createSublocation with slotType+slotKind.
 *
 * Top-level path (parentLocationName=null + directionFromCurrent + travelDistance):
 *   1. Resolve anchor from `prevLoc` (scene-start location).
 *   2. Load existing top-level WorldLocations (for spacing + merge check).
 *   3. Run positionCalculator.computeNewPosition → { position, mergeCandidate? }.
 *   4. If mergeCandidate + fuzzy-name match → reuse existing (dedup).
 *   5. Otherwise create WorldLocation with position + locationType + template caps.
 *   6. Auto-create bidirectional WorldLocationEdge anchor↔new (discovered by this campaign).
 *   7. Walk connectsTo[] — create edges to any resolvable existing locations within euclidean range.
 */
export async function processLocationChanges(campaignId, newLocations, { prevLoc = null } = {}) {
  if (!Array.isArray(newLocations) || newLocations.length === 0) return;

  // Resolve anchor once (used by every top-level entry in this batch).
  // If anchor resolution fails we surface it via log.warn — silently
  // swallowing this means every top-level creation in the batch skips
  // later with a cryptic "no anchor" warning and no root cause.
  let anchor = null;
  if (prevLoc) {
    try {
      anchor = await findOrCreateWorldLocation(prevLoc);
    } catch (err) {
      log.warn({ err: err?.message, campaignId, prevLoc }, 'anchor resolution failed — top-level entries will be skipped');
    }
  }

  // Phase F — fetch worldBounds once per batch for out-of-bounds rejection
  // in processTopLevelEntry. Sublocations inherit parent position so they
  // don't need the check. Missing bounds → legacy behaviour (no clamp).
  let bounds = null;
  try {
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { worldBounds: true },
    });
    if (campaign?.worldBounds) bounds = JSON.parse(campaign.worldBounds);
  } catch { bounds = null; }

  for (const entry of newLocations) {
    if (!entry?.name || typeof entry.name !== 'string') continue;

    try {
      if (entry.parentLocationName) {
        await processSublocationEntry(campaignId, entry);
      } else {
        // Round B — relaxed contract. Any top-level entry goes through the
        // smart placer; it accepts missing directionFromCurrent / travelDistance
        // and falls back to a random angle + `close` radius. Nothing is
        // silently skipped for missing hints now.
        await processTopLevelEntry(campaignId, entry, anchor, bounds);
      }
    } catch (err) {
      log.warn({ err: err?.message, campaignId, name: entry.name }, 'processLocationChanges entry failed');
    }
  }
}

async function processSublocationEntry(campaignId, entry) {
  const parent = await findOrCreateWorldLocation(entry.parentLocationName);
  if (!parent) {
    log.warn({ campaignId, parent: entry.parentLocationName, child: entry.name }, 'Parent location resolve failed');
    return;
  }

  const children = await prisma.worldLocation.findMany({
    where: { parentLocationId: parent.id },
    select: { id: true, canonicalName: true, slotType: true, slotKind: true },
  });
  const childrenBySlot = {
    required: children.filter((c) => c.slotKind === 'required'),
    optional: children.filter((c) => c.slotKind === 'optional'),
    custom: children.filter((c) => c.slotKind === 'custom'),
  };

  // Phase E — effective customCap scales by the REQUESTING campaign's
  // difficultyTier (capital is global but each campaign's additions are
  // budgeted against its own tier). Fetch tier lazily; if missing, tier is
  // null and effectiveCustomCap falls back to the template's base cap.
  let difficultyTier = null;
  try {
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { difficultyTier: true },
    });
    difficultyTier = campaign?.difficultyTier || null;
  } catch { /* non-fatal */ }
  const parentLocationType = parent.locationType || 'generic';
  const customCap = effectiveCustomCap(parentLocationType, difficultyTier);

  const decision = decideSublocationAdmission({
    parentLocationType,
    childrenBySlot,
    maxSubLocations: parent.maxSubLocations || 5,
    slotType: entry.slotType || null,
    name: entry.name,
    customCap,
  });

  if (decision.admission === 'reject') {
    log.info(
      { campaignId, parent: parent.canonicalName, child: entry.name, reason: decision.reason },
      'Sublocation rejected',
    );
    return;
  }

  await createSublocation({
    name: entry.name,
    parent,
    slotType: decision.slotType || null,
    slotKind: decision.slotKind,
    locationType: entry.locationType || 'interior',
    description: entry.description || '',
  });

  log.info(
    { campaignId, parent: parent.canonicalName, child: entry.name, slotKind: decision.slotKind },
    'Sublocation materialized',
  );
}

// Phase A/B — settlement types are seeded at campaign creation (see
// backend/src/services/livingWorld/worldSeeder.js). Mid-play wander into
// unexplored terrain may only yield wilderness/ruins/camps/caves/forests/dungeons;
// new hamlets/villages/towns/cities/capitals are rejected here so the world stays
// bounded. This function only runs when livingWorldEnabled is true (caller
// already gates on it), so the guard doesn't need the flag.
const BLOCKED_MIDPLAY_LOCATION_TYPES = new Set(['hamlet', 'village', 'town', 'city', 'capital']);

async function processTopLevelEntry(campaignId, entry, anchor, bounds = null) {
  if (!anchor) {
    log.warn({ campaignId, name: entry.name }, 'Top-level location skipped — no anchor (prevLoc)');
    return;
  }
  const locationType = entry.locationType || 'generic';

  if (BLOCKED_MIDPLAY_LOCATION_TYPES.has(locationType)) {
    log.info(
      { campaignId, name: entry.name, locationType },
      'Top-level settlement creation blocked mid-play (creation-time-only in Living World)',
    );
    return;
  }

  // Existing top-level + sublocations sharing anchor-space coords. Include
  // both so collision-check sees them all (sublocations inherit parent coords).
  const existing = await prisma.worldLocation.findMany({
    where: {
      parentLocationId: null,
      id: { not: anchor.id },
    },
    select: { id: true, canonicalName: true, regionX: true, regionY: true, locationType: true },
  });

  // Round B — smart placer. Relaxed contract: accepts any subset of
  // directionFromCurrent / travelDistance / distanceHint, defaults to a
  // random angle inside the "close" range (0.1–2 km) when AI gives nothing.
  // Also clamps to worldBounds internally, so we don't need the separate
  // bounds rejection path — out-of-bounds candidates get pulled to the
  // edge rather than silently dropped.
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

  // Merge check: if the picked position landed near an existing location AND
  // fuzzy names match, reuse rather than create a duplicate. MERGE_RADIUS is
  // bigger than COLLISION_RADIUS — the placer only avoided hard collisions,
  // so near-miss coordinates can still fuzzy-match a neighbour by name.
  let created = null;
  const mergeCandidate = findMergeCandidate({
    raw: position,
    existing: existing.filter((loc) => loc.id !== anchor.id),
  });
  if (mergeCandidate) {
    const cand = await findOrCreateWorldLocation(entry.name);
    if (cand && cand.id === mergeCandidate.location.id) {
      log.info(
        { campaignId, name: entry.name, mergedInto: cand.canonicalName },
        'Top-level location merged into existing',
      );
      created = cand;
    }
  }

  if (!created) {
    const template = getTemplate(locationType);
    // Round B (Phase 4c) — AI-created runtime locations are non-canonical
    // and campaign-scoped. We suffix the canonicalName so two campaigns
    // that both spawn "Chatka Myśliwego" stay uncollided in the global
    // canonical name space. Display name is the raw AI-emitted name so
    // the player sees "Chatka Myśliwego" in the UI and prompt.
    const campaignSuffix = campaignId ? `__${campaignId.slice(-8)}` : '';
    const canonicalName = `${entry.name}${campaignSuffix}`;
    try {
      created = await prisma.worldLocation.create({
        data: {
          canonicalName,
          aliases: JSON.stringify([entry.name]),
          description: entry.description || '',
          category: locationType,
          locationType,
          region: anchor.region || null,
          regionX: position.regionX,
          regionY: position.regionY,
          positionConfidence: 0.5,
          maxKeyNpcs: template.maxKeyNpcs || 10,
          maxSubLocations: template.maxSubLocations || 5,
          embeddingText: entry.description
            ? `${entry.name}: ${entry.description}`
            : entry.name,
          // Round B — non-canonical marks
          isCanonical: false,
          createdByCampaignId: campaignId,
          displayName: entry.name,
          dangerLevel: entry.dangerLevel || 'safe',
        },
      });
      log.info(
        { campaignId, name: entry.name, pos: position, locationType },
        'Top-level location created (non-canonical)',
      );
    } catch (err) {
      // P2002 = canonicalName unique race — fall back to fuzzy resolve
      if (err?.code === 'P2002') {
        created = await findOrCreateWorldLocation(entry.name);
      } else {
        throw err;
      }
    }
  }
  if (!created) return;

  // Round E Phase 9 — index the runtime-created WorldLocation into the RAG
  // store so future promotion-dedup + world state resolvers can find it by
  // semantic hint. Fire-and-forget; ragService swallows provider errors.
  ragService.index('location', created.id, buildLocationEmbeddingText(created)).catch(() => {});

  // Round B — non-canonical locations need to land in the campaign's
  // `discoveredLocationIds` since that's how the player map shows them.
  // Canonical seed locations pass through this path only on a merge hit,
  // where UserWorldKnowledge is the correct target — markLocationDiscovered
  // routes by isCanonical so this single call is safe for both.
  try {
    const campaignRow = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { userId: true },
    });
    if (campaignRow?.userId) {
      await markLocationDiscovered({
        userId: campaignRow.userId,
        locationId: created.id,
        campaignId,
      });
    }
  } catch (err) {
    log.warn({ err: err?.message, campaignId, locationId: created.id }, 'auto-discover after create failed');
  }

  // Auto-edge anchor↔new (bidirectional). Distance = euclidean on computed
  // coords, not the AI-declared travelDistance — the positionCalculator may
  // have pushed the raw further for spacing.
  const distance = euclidean(
    { regionX: anchor.regionX || 0, regionY: anchor.regionY || 0 },
    { regionX: created.regionX || 0, regionY: created.regionY || 0 },
  );
  const edgeCommon = {
    distance,
    difficulty: entry.difficulty || 'safe',
    terrainType: entry.terrainType || 'road',
    discoveredByCampaignId: campaignId,
  };
  await Promise.allSettled([
    upsertEdge({
      fromLocationId: anchor.id,
      toLocationId: created.id,
      direction: entry.directionFromCurrent,
      ...edgeCommon,
    }),
    upsertEdge({
      fromLocationId: created.id,
      toLocationId: anchor.id,
      direction: oppositeDirection(entry.directionFromCurrent),
      ...edgeCommon,
    }),
  ]);

  // Optional connectsTo — create edges to other known locations in range.
  // "In range" = within 10 km euclidean (matches user spec guardrail).
  if (Array.isArray(entry.connectsTo) && entry.connectsTo.length > 0) {
    for (const connectName of entry.connectsTo.slice(0, 4)) {
      try {
        const other = await findOrCreateWorldLocation(connectName);
        if (!other || other.id === created.id) continue;
        const d = euclidean(
          { regionX: created.regionX || 0, regionY: created.regionY || 0 },
          { regionX: other.regionX || 0, regionY: other.regionY || 0 },
        );
        if (d > 10) {
          log.info(
            { campaignId, from: created.canonicalName, to: other.canonicalName, d },
            'connectsTo skipped — out of range',
          );
          continue;
        }
        await Promise.allSettled([
          upsertEdge({
            fromLocationId: created.id,
            toLocationId: other.id,
            distance: d,
            difficulty: 'safe',
            terrainType: 'road',
            discoveredByCampaignId: campaignId,
          }),
          upsertEdge({
            fromLocationId: other.id,
            toLocationId: created.id,
            distance: d,
            difficulty: 'safe',
            terrainType: 'road',
            discoveredByCampaignId: campaignId,
          }),
        ]);
      } catch (err) {
        log.warn({ err: err?.message, connect: connectName }, 'connectsTo edge failed');
      }
    }
  }
}

function oppositeDirection(dir) {
  const opp = {
    N: 'S', S: 'N', E: 'W', W: 'E',
    NE: 'SW', SW: 'NE', NW: 'SE', SE: 'NW',
  };
  return opp[dir] || null;
}
