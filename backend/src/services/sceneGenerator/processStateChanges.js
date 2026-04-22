import { prisma } from '../../lib/prisma.js';
import { childLogger } from '../../lib/logger.js';
import {
  embedText,
  buildSceneEmbeddingText,
  buildKnowledgeEmbeddingText,
  buildNPCEmbeddingText,
  buildCodexEmbeddingText,
} from '../embeddingService.js';
import { writeEmbedding } from '../vectorSearchService.js';
import { maybePromote } from '../livingWorld/npcPromotion.js';
import { updateLoyalty } from '../livingWorld/companionService.js';
import { appendEvent } from '../livingWorld/worldEventLog.js';
import { assignGoalsForCampaign } from '../livingWorld/questGoalAssigner.js';
import { findOrCreateWorldLocation, createSublocation } from '../livingWorld/worldStateService.js';
import {
  setCampaignNpcLocation,
  setCampaignNpcIntroHint,
  resolveNpcKnownLocations,
} from '../livingWorld/campaignSandbox.js';
import { markLocationHeardAbout, markLocationDiscovered } from '../livingWorld/userDiscoveryService.js';
import { decideSublocationAdmission } from '../livingWorld/topologyGuard.js';
import { computeSmartPosition, findMergeCandidate, euclidean } from '../livingWorld/positionCalculator.js';
import { upsertEdge } from '../livingWorld/travelGraph.js';
import { getTemplate, effectiveCustomCap } from '../livingWorld/settlementTemplates.js';
import { applyDungeonRoomState } from '../livingWorld/dungeonEntry.js';
import { auditQuestWorldImpact } from '../livingWorld/questAudit.js';
import { applyFameFromEvent } from '../livingWorld/fameService.js';

const log = childLogger({ module: 'sceneGenerator' });

/**
 * Generate and store embedding for a saved scene (async, fire-and-forget).
 */
export async function generateSceneEmbedding(scene) {
  const embeddingText = buildSceneEmbeddingText(scene);
  if (!embeddingText) return;

  const embedding = await embedText(embeddingText);
  if (!embedding) return;

  writeEmbedding('CampaignScene', scene.id, embedding, embeddingText);
}

async function processNpcChanges(campaignId, npcs, { livingWorldEnabled = false } = {}) {
  const affectedNpcIds = [];

  for (const npcChange of npcs) {
    if (!npcChange.name) continue;

    const npcId = npcChange.name.toLowerCase().replace(/\s+/g, '_');

    try {
      const existing = await prisma.campaignNPC.findUnique({
        where: { campaignId_npcId: { campaignId, npcId } },
      });

      if (existing) {
        const updateData = {};
        if (npcChange.attitude) updateData.attitude = npcChange.attitude;
        if (npcChange.disposition != null) updateData.disposition = npcChange.disposition;
        if (npcChange.alive != null) updateData.alive = npcChange.alive;
        if (npcChange.lastLocation) updateData.lastLocation = npcChange.lastLocation;
        if (npcChange.relationships) {
          updateData.relationships = JSON.stringify(npcChange.relationships);
        }
        if (npcChange.acknowledgedFame === true) updateData.hasAcknowledgedFame = true;

        if (Object.keys(updateData).length > 0) {
          const updated = await prisma.campaignNPC.update({
            where: { id: existing.id },
            data: updateData,
          });
          const embText = buildNPCEmbeddingText(updated);
          const emb = await embedText(embText);
          if (emb) writeEmbedding('CampaignNPC', updated.id, emb, embText);
          affectedNpcIds.push(updated.id);
        }
      } else if (npcChange.action === 'introduce' || !existing) {
        try {
          const created = await prisma.campaignNPC.create({
            data: {
              campaignId,
              npcId,
              name: npcChange.name,
              gender: npcChange.gender || 'unknown',
              role: npcChange.role || null,
              personality: npcChange.personality || null,
              attitude: npcChange.attitude || 'neutral',
              disposition: npcChange.disposition ?? 0,
              relationships: JSON.stringify(npcChange.relationships || []),
            },
          });
          const embText = buildNPCEmbeddingText(created);
          const emb = await embedText(embText);
          if (emb) writeEmbedding('CampaignNPC', created.id, emb, embText);
          affectedNpcIds.push(created.id);
        } catch (createErr) {
          // P2002 = unique constraint (campaignId+npcId) — retry created it already, safe to skip
          if (createErr.code !== 'P2002') throw createErr;
        }
      }
    } catch (err) {
      log.error({ err, campaignId, npcName: npcChange.name }, 'Failed to process NPC change');
    }
  }

  // Living World: attempt promotion for touched NPCs + propagate companion
  // loyalty drift from dispositionChange. Both parallel, best-effort.
  if (livingWorldEnabled && affectedNpcIds.length > 0) {
    const promotionTasks = affectedNpcIds.map((id) => maybePromote(id));
    const loyaltyTasks = npcs
      .filter((n) => n.name && typeof n.dispositionChange === 'number' && n.dispositionChange !== 0)
      .map(async (change) => {
        try {
          // Resolve CampaignNPC → worldNpcId so we can target the canonical row
          const npcId = change.name.toLowerCase().replace(/\s+/g, '_');
          const cn = await prisma.campaignNPC.findUnique({
            where: { campaignId_npcId: { campaignId, npcId } },
            select: { worldNpcId: true, isAgent: true },
          });
          if (!cn?.worldNpcId || !cn.isAgent) return;
          // Loyalty scale: dispositionChange ±1-5 → same delta on 0-100 loyalty
          const delta = Math.max(-10, Math.min(10, change.dispositionChange));
          await updateLoyalty({
            worldNpcId: cn.worldNpcId,
            campaignId,
            delta,
            reason: `scene disposition ${delta >= 0 ? '+' : ''}${delta}`,
          });
        } catch (err) {
          log.warn({ err, npcName: change.name, campaignId }, 'Loyalty drift propagation failed');
        }
      });
    await Promise.allSettled([...promotionTasks, ...loyaltyTasks]);
  }
}

/**
 * Phase 4 — observe item-attribution hints. When a living-world campaign
 * emits newItems with `fromNpcId`, we write a WorldEvent `item_given`
 * attributing the transfer to the canonical WorldNPC. No validation /
 * rejection — that belongs to full orchestration (see
 * knowledge/ideas/living-world-scene-orchestration.md).
 */
async function processItemAttributions(campaignId, newItems, userId, sceneGameTime) {
  if (!Array.isArray(newItems) || newItems.length === 0) return;
  for (const item of newItems) {
    const fromNpcId = item?.fromNpcId;
    if (!fromNpcId || typeof fromNpcId !== 'string') continue;
    try {
      const slug = fromNpcId.toLowerCase().replace(/\s+/g, '_');
      const campaignNpc = await prisma.campaignNPC.findUnique({
        where: { campaignId_npcId: { campaignId, npcId: slug } },
        select: { worldNpcId: true, name: true },
      });
      let worldLocationId = null;
      if (campaignNpc?.worldNpcId) {
        const worldNpc = await prisma.worldNPC.findUnique({
          where: { id: campaignNpc.worldNpcId },
          select: { currentLocationId: true },
        });
        worldLocationId = worldNpc?.currentLocationId || null;
      }
      await appendEvent({
        worldNpcId: campaignNpc?.worldNpcId || null,
        worldLocationId,
        campaignId,
        userId: userId || null,
        eventType: 'item_given',
        payload: {
          itemName: item.name || item.itemName || 'unknown',
          itemId: item.id || null,
          rarity: item.rarity || 'common',
          fromNpcName: campaignNpc?.name || fromNpcId,
          fromNpcId,
        },
        visibility: 'campaign',
        gameTime: sceneGameTime,
      });
    } catch (err) {
      log.warn({ err, campaignId, fromNpcId }, 'item attribution event write failed');
    }
  }
}

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
/**
 * Round B (Phase 4b) — hearsay policy handler.
 *
 * For each `{locationId, byNpcId}` the LLM emitted, resolve the NPC (by
 * CampaignNPC.npcId OR name), ensure the location sits in the NPC's
 * `resolveNpcKnownLocations` set, and only then mark it as heard-about for
 * the player (canonical → UserWorldKnowledge, non-canonical → Campaign).
 *
 * Violations (LLM made up a location or wrote one outside the NPC's scope)
 * are skipped with a warning — the mention doesn't propagate to fog state.
 */
async function processLocationMentions(campaignId, mentions) {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { userId: true },
  }).catch(() => null);
  if (!campaign?.userId) return;

  for (const entry of mentions) {
    const locationId = String(entry?.locationId || '').trim();
    const byNpcIdent = String(entry?.byNpcId || entry?.npcId || entry?.byNpc || '').trim();
    if (!locationId || !byNpcIdent) continue;

    try {
      const location = await prisma.worldLocation.findUnique({
        where: { id: locationId },
        select: { id: true },
      });
      if (!location) {
        log.warn({ campaignId, locationId, byNpcIdent }, 'locationMentioned: location not found — skipping');
        continue;
      }

      // Resolve the NPC — campaign shadow first, canonical by name fallback.
      const campaignNpc = await prisma.campaignNPC.findFirst({
        where: {
          campaignId,
          OR: [
            { npcId: byNpcIdent },
            { name: { equals: byNpcIdent, mode: 'insensitive' } },
          ],
        },
      });
      const worldNpc = campaignNpc?.worldNpcId
        ? await prisma.worldNPC.findUnique({ where: { id: campaignNpc.worldNpcId } })
        : await prisma.worldNPC.findFirst({
          where: { name: { equals: byNpcIdent, mode: 'insensitive' } },
        });

      if (!campaignNpc && !worldNpc) {
        log.warn({ campaignId, byNpcIdent }, 'locationMentioned: NPC not found — skipping');
        continue;
      }

      const known = await resolveNpcKnownLocations({ campaignNpc, worldNpc });
      if (!known.has(locationId)) {
        log.warn(
          { campaignId, locationId, byNpcIdent, knownCount: known.size },
          'locationMentioned: location outside NPC knowledge scope — policy violation, skipping',
        );
        continue;
      }

      await markLocationHeardAbout({ userId: campaign.userId, locationId, campaignId });
    } catch (err) {
      log.warn({ err: err?.message, campaignId, entry }, 'locationMentioned: handler failed');
    }
  }
}

async function processLocationChanges(campaignId, newLocations, { prevLoc = null } = {}) {
  if (!Array.isArray(newLocations) || newLocations.length === 0) return;

  // Resolve anchor once (used by every top-level entry in this batch).
  let anchor = null;
  if (prevLoc) {
    try { anchor = await findOrCreateWorldLocation(prevLoc); } catch { /* ignore */ }
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

async function processKnowledgeUpdates(campaignId, ku) {
  const entries = [];

  if (ku.events?.length) {
    for (const e of ku.events) {
      entries.push({ entryType: 'event', summary: e.summary || e, content: JSON.stringify(e), importance: e.importance, tags: JSON.stringify(e.tags || []) });
    }
  }
  if (ku.decisions?.length) {
    for (const d of ku.decisions) {
      entries.push({ entryType: 'decision', summary: `${d.choice} -> ${d.consequence}`, content: JSON.stringify(d), importance: d.importance, tags: JSON.stringify(d.tags || []) });
    }
  }

  for (const entry of entries) {
    try {
      const created = await prisma.campaignKnowledge.create({
        data: { campaignId, ...entry },
      });
      const embText = buildKnowledgeEmbeddingText(created);
      const emb = await embedText(embText);
      if (emb) writeEmbedding('CampaignKnowledge', created.id, emb, embText);
    } catch (err) {
      log.error({ err, campaignId, entryType: entry.entryType }, 'Failed to save knowledge entry');
    }
  }
}

async function processCodexUpdates(campaignId, codexUpdates) {
  for (const cu of codexUpdates) {
    if (!cu.id || !cu.name) continue;

    try {
      const existing = await prisma.campaignCodex.findUnique({
        where: { campaignId_codexKey: { campaignId, codexKey: cu.id } },
      });

      if (existing) {
        const existingFragments = JSON.parse(existing.fragments || '[]');
        if (cu.fragment) existingFragments.push(cu.fragment);

        const updated = await prisma.campaignCodex.update({
          where: { id: existing.id },
          data: {
            fragments: JSON.stringify(existingFragments),
            tags: JSON.stringify(cu.tags || JSON.parse(existing.tags || '[]')),
          },
        });
        const embText = buildCodexEmbeddingText(updated);
        const emb = await embedText(embText);
        if (emb) writeEmbedding('CampaignCodex', updated.id, emb, embText);
      } else {
        try {
          const created = await prisma.campaignCodex.create({
            data: {
              campaignId,
              codexKey: cu.id,
              name: cu.name,
              category: cu.category || 'concept',
              tags: JSON.stringify(cu.tags || []),
              fragments: JSON.stringify(cu.fragment ? [cu.fragment] : []),
              relatedEntries: JSON.stringify(cu.relatedEntries || []),
            },
          });
          const embText = buildCodexEmbeddingText(created);
          const emb = await embedText(embText);
          if (emb) writeEmbedding('CampaignCodex', created.id, emb, embText);
        } catch (createErr) {
          // P2002 = unique constraint (campaignId+codexKey) — retry created it already, safe to skip
          if (createErr.code !== 'P2002') throw createErr;
        }
      }
    } catch (err) {
      log.error({ err, campaignId, codexId: cu.id }, 'Failed to process codex update');
    }
  }
}

// Resolve a raw quest-id string (as emitted by the premium model) to a real
// CampaignQuest row. Premium sees quest names only (not ids) in the prompt,
// so its `completedQuests`/`questUpdates[].questId` entries may be names,
// hallucinated ids, or anything in between. Strategy:
//   1) exact `questId` match among active quests
//   2) case-insensitive `name` match among active quests
//   3) if exactly one active quest exists, use it (player-facing UI always
//      shows a single current quest, so one-active is the common case)
//   4) otherwise warn and return null — ambiguity is never resolved silently
async function resolveActiveQuest(campaignId, rawId) {
  const activeQuests = await prisma.campaignQuest.findMany({
    where: { campaignId, status: 'active' },
  });
  if (activeQuests.length === 0) return null;

  const normalized = typeof rawId === 'string' ? rawId.trim().toLowerCase() : '';

  const exact = activeQuests.find((q) => q.questId === rawId);
  if (exact) return exact;

  if (normalized) {
    const byName = activeQuests.find((q) => (q.name || '').trim().toLowerCase() === normalized);
    if (byName) {
      log.info({ campaignId, rawId, resolved: byName.questId }, 'Quest id resolved by name match');
      return byName;
    }
  }

  if (activeQuests.length === 1) {
    log.info({ campaignId, rawId, resolved: activeQuests[0].questId }, 'Quest id resolved via single-active fallback');
    return activeQuests[0];
  }

  log.warn(
    { campaignId, rawId, activeCount: activeQuests.length, activeNames: activeQuests.map((q) => q.name) },
    'Quest id from premium did not match any active quest — ignored',
  );
  return null;
}

function resolveObjective(objectives, rawObjectiveId) {
  if (!Array.isArray(objectives) || objectives.length === 0) return null;
  const exact = objectives.find((o) => o.id === rawObjectiveId);
  if (exact) return exact;
  const normalized = typeof rawObjectiveId === 'string' ? rawObjectiveId.trim().toLowerCase() : '';
  if (normalized) {
    const byDesc = objectives.find((o) => (o.description || '').trim().toLowerCase() === normalized);
    if (byDesc) return byDesc;
  }
  const pending = objectives.filter((o) => !o.completed);
  if (pending.length === 1) return pending[0];
  return null;
}

/**
 * Fire the `onComplete.moveNpcToPlayer` quest trigger. Relocates the named
 * NPC's CampaignNPC shadow to the player's current location and stores a
 * one-shot pendingIntroHint for next-scene prompt surfacing.
 *
 * `onComplete.moveNpcToPlayer` is an NPC name (or canonicalId) emitted by
 * the AI. We resolve to WorldNPC by exact canonicalId, then fallback to
 * name (case-insensitive). Non-canonical AI-invented NPCs are resolved
 * via CampaignNPC.npcId directly.
 *
 * NEVER mutates WorldNPC — canonical state stays immutable during play.
 */
async function fireMoveNpcToPlayerTrigger(campaignId, onComplete) {
  const npcIdent = String(onComplete.moveNpcToPlayer || '').trim();
  const message = String(onComplete.message || '').trim();
  if (!npcIdent) return;

  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { coreState: true, userId: true },
  });
  if (!campaign) return;

  let playerLocationId = null;
  try {
    const core = JSON.parse(campaign.coreState || '{}');
    const locName = core?.world?.currentLocation;
    if (locName) {
      const row = await prisma.worldLocation.findFirst({
        where: { canonicalName: locName },
        select: { id: true },
      });
      playerLocationId = row?.id || null;
    }
  } catch { /* ignore — player location unknown */ }
  if (!playerLocationId) return;

  // Resolve NPC: canonicalId → name → CampaignNPC.npcId
  let worldNpcId = null;
  const byCanonical = await prisma.worldNPC.findFirst({
    where: { canonicalId: npcIdent },
    select: { id: true },
  }).catch(() => null);
  if (byCanonical) {
    worldNpcId = byCanonical.id;
  } else {
    const byName = await prisma.worldNPC.findFirst({
      where: { name: { equals: npcIdent, mode: 'insensitive' } },
      select: { id: true },
    }).catch(() => null);
    if (byName) worldNpcId = byName.id;
  }

  if (worldNpcId) {
    await setCampaignNpcLocation(campaignId, worldNpcId, playerLocationId);
    await setCampaignNpcIntroHint(campaignId, worldNpcId, message || null);
    return;
  }

  // Fallback: ephemeral CampaignNPC (no WorldNPC link). Name-match inside
  // the campaign and update in-place.
  const ephemeral = await prisma.campaignNPC.findFirst({
    where: {
      campaignId,
      OR: [
        { npcId: npcIdent },
        { name: { equals: npcIdent, mode: 'insensitive' } },
      ],
    },
    select: { id: true },
  }).catch(() => null);
  if (ephemeral) {
    await prisma.campaignNPC.update({
      where: { id: ephemeral.id },
      data: {
        lastLocationId: playerLocationId,
        pendingIntroHint: message || null,
      },
    }).catch((err) => log.warn({ err: err?.message, campaignNpcId: ephemeral.id }, 'moveNpcToPlayer ephemeral update failed'));
  }
}

async function processQuestObjectiveUpdates(campaignId, questUpdates, alreadyCompletedQuestIds = []) {
  const touchedQuestIds = new Set();
  for (const update of questUpdates) {
    try {
      const quest = await resolveActiveQuest(campaignId, update.questId);
      if (!quest) continue;
      const objectives = JSON.parse(quest.objectives || '[]');
      const targetObj = resolveObjective(objectives, update.objectiveId);
      if (!targetObj) {
        log.warn({ campaignId, questId: quest.questId, objectiveId: update.objectiveId }, 'Objective id from premium did not match — ignored');
        continue;
      }
      const updated = objectives.map(obj => {
        if (obj.id !== targetObj.id) return obj;
        const next = { ...obj };
        if (update.completed) next.completed = true;
        if (update.addProgress) {
          const prev = obj.progress || '';
          next.progress = prev ? `${prev}; ${update.addProgress}` : update.addProgress;
        }
        return next;
      });
      await prisma.campaignQuest.update({
        where: { id: quest.id },
        data: { objectives: JSON.stringify(updated) },
      });
      if (update.completed) touchedQuestIds.add(quest.questId);

      // Round B (Phase 4) — `onComplete.moveNpcToPlayer` trigger. When the
      // objective that was just completed carries `onComplete: { moveNpcToPlayer,
      // message }`, we (a) relocate the CampaignNPC shadow to the player's
      // current location, (b) stash the message on `pendingIntroHint` so the
      // next scene prompt surfaces "NPC just arrived with news". The trigger
      // fires once per objective completion — no further bookkeeping.
      if (update.completed && targetObj.onComplete?.moveNpcToPlayer) {
        try {
          await fireMoveNpcToPlayerTrigger(campaignId, targetObj.onComplete);
        } catch (err) {
          log.warn({ err: err?.message, campaignId, questId: quest.questId }, 'moveNpcToPlayer trigger failed');
        }
      }
    } catch (err) {
      log.error({ err, campaignId, questId: update.questId, objectiveId: update.objectiveId }, 'Failed to update quest objective');
    }
  }

  // Auto-complete quests where all objectives are now done. Returns list of
  // auto-completed questIds so the caller can merge them into
  // stateChanges.completedQuests (audit + world-impact gate depend on that).
  const autoCompleted = [];
  const skip = new Set(alreadyCompletedQuestIds);
  for (const questId of touchedQuestIds) {
    if (skip.has(questId)) continue;
    try {
      const quest = await prisma.campaignQuest.findFirst({
        where: { campaignId, questId },
      });
      if (!quest || quest.status === 'completed') continue;
      const objectives = JSON.parse(quest.objectives || '[]');
      if (objectives.length > 0 && objectives.every(o => o.completed)) {
        await prisma.campaignQuest.update({
          where: { id: quest.id },
          data: { status: 'completed', completedAt: new Date() },
        });
        autoCompleted.push(questId);
        log.info({ campaignId, questId }, 'Quest auto-completed — all objectives done');
      }
    } catch (err) {
      log.error({ err, campaignId, questId }, 'Failed to auto-complete quest');
    }
  }
  return autoCompleted;
}

// Returns the list of ACTUALLY-resolved questIds so callers (e.g. world
// impact audit, goal reassignment) can use real ids instead of whatever
// premium emitted. Unresolved entries are dropped with a warn already logged
// by resolveActiveQuest.
async function processQuestStatusChange(campaignId, questIds, status) {
  const resolvedIds = [];
  for (const rawId of questIds) {
    try {
      const quest = await resolveActiveQuest(campaignId, rawId);
      if (quest) {
        await prisma.campaignQuest.update({
          where: { id: quest.id },
          data: { status, completedAt: new Date() },
        });
        resolvedIds.push(quest.questId);
      }
    } catch (err) {
      log.error({ err, campaignId, questId: rawId, status }, 'Failed to update quest status');
    }
  }
  return resolvedIds;
}

/**
 * Pure decision function — does the current scene earn global visibility?
 *
 * Gate: premium flags `worldImpact: 'major'` OR any deadly/dungeon flag
 * is set; AT LEAST ONE objective signal must be present:
 *   - named NPC killed in this scene
 *   - a main-type quest completed
 *   - explicit locationLiberated flag
 *   - defeatedDeadlyEncounter flag
 *   - dungeonComplete payload
 *
 * Returns `{ promote: bool, gate: string }`. `gate` identifies which
 * signal fired so the event payload can explain why this is gossip-worthy.
 * Exported so tests can exercise the gate without touching Prisma.
 */
export function shouldPromoteToGlobal(stateChanges, { mainQuestCompleted = false } = {}) {
  if (!stateChanges || typeof stateChanges !== 'object') {
    return { promote: false, gate: null };
  }
  const flaggedMajor = stateChanges.worldImpact === 'major';
  const deadly = stateChanges.defeatedDeadlyEncounter === true;
  const dungeon = stateChanges.dungeonComplete && typeof stateChanges.dungeonComplete === 'object';
  const liberated = stateChanges.locationLiberated === true;
  const namedKill = Array.isArray(stateChanges.npcs)
    && stateChanges.npcs.some((n) => n && n.alive === false && typeof n.name === 'string' && n.name.trim().length > 0);

  // Dungeon completion and deadly victory are self-gating (AI explicitly
  // marks them) — they promote regardless of worldImpact tag.
  if (dungeon) return { promote: true, gate: 'dungeon' };
  if (deadly) return { promote: true, gate: 'deadly' };

  // Everything else requires worldImpact='major' AND an objective signal.
  if (!flaggedMajor) return { promote: false, gate: null };
  if (liberated) return { promote: true, gate: 'liberation' };
  if (mainQuestCompleted) return { promote: true, gate: 'main_quest' };
  if (namedKill) return { promote: true, gate: 'named_kill' };

  return { promote: false, gate: null };
}

/**
 * Write a GLOBAL WorldEvent when the current scene clears the gate.
 * Caller resolves `mainQuestCompleted` (requires a Prisma query against
 * completedQuests). Payload is meta-only.
 */
async function processWorldImpactEvent({
  campaignId,
  stateChanges,
  ownerUserId,
  sceneGameTime,
  mainQuestCompleted,
  characterIds = [],
}) {
  const { promote, gate } = shouldPromoteToGlobal(stateChanges, { mainQuestCompleted });
  if (!promote) return;

  const currentLocationName = stateChanges.currentLocation || null;
  let worldLocationId = null;
  if (currentLocationName) {
    try {
      const loc = await findOrCreateWorldLocation(currentLocationName);
      worldLocationId = loc?.id || null;
    } catch {
      // Non-fatal — event still attaches via campaignId
    }
  }

  const eventType = gate === 'dungeon' ? 'dungeon_cleared'
    : gate === 'deadly' ? 'deadly_victory'
    : 'major_deed';

  await appendEvent({
    worldLocationId,
    campaignId,
    userId: ownerUserId,
    eventType,
    payload: {
      gate,
      reason: stateChanges.worldImpactReason || null,
      locationName: currentLocationName,
      dungeonName: stateChanges.dungeonComplete?.name || null,
      dungeonSummary: stateChanges.dungeonComplete?.summary || null,
    },
    visibility: 'global',
    gameTime: sceneGameTime,
  });
  log.info({ campaignId, gate, eventType, locationName: currentLocationName }, 'worldImpact event promoted to global');

  await applyFameFromEvent(characterIds, {
    eventType,
    visibility: 'global',
    payload: { gate },
  });
}

/**
 * Write a GLOBAL WorldEvent when the player resolves a campaign's main
 * conflict. Visible cross-campaign via `forLocation` (worldEventLog reads
 * `visibility='global'` without campaignId filter). Payload is meta-only
 * — title, summary, achievements, locationName — so no character-private
 * data leaks into other players' contexts.
 */
async function processCampaignComplete({
  campaignId,
  data,
  ownerUserId,
  sceneGameTime,
  currentLocationName,
}) {
  if (!data || typeof data !== 'object') return;
  let worldLocationId = null;
  if (currentLocationName) {
    try {
      const loc = await findOrCreateWorldLocation(currentLocationName);
      worldLocationId = loc?.id || null;
    } catch {
      // Non-fatal — event can still attach via campaignId
    }
  }
  await appendEvent({
    worldLocationId,
    campaignId,
    userId: ownerUserId,
    eventType: 'campaign_complete',
    payload: {
      title: data.title || '',
      summary: data.summary || '',
      majorAchievements: Array.isArray(data.majorAchievements) ? data.majorAchievements : [],
      locationName: currentLocationName || null,
    },
    visibility: 'global',
    gameTime: sceneGameTime,
  });
  log.info({ campaignId, locationName: currentLocationName, title: data.title }, 'campaign_complete global event written');
}

export async function processStateChanges(campaignId, stateChanges, { prevLoc = null } = {}) {
  // Fetch campaign once to check living-world flag + userId for Phase 4
  // WorldEvent attribution (cheap — same record is already loaded by
  // postSceneWork for the same campaignId).
  let livingWorldEnabled = false;
  let ownerUserId = null;
  let campaignCharacterIds = [];
  try {
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { livingWorldEnabled: true, userId: true, characterIds: true },
    });
    livingWorldEnabled = campaign?.livingWorldEnabled === true;
    ownerUserId = campaign?.userId || null;
    campaignCharacterIds = Array.isArray(campaign?.characterIds) ? campaign.characterIds : [];
  } catch {
    // non-fatal — fall back to legacy behaviour
  }

  // Phase 7 — single timestamp per scene so intra-scene WorldEvents are
  // internally consistent (instead of each appendEvent minting its own
  // `new Date()` drifting by milliseconds). Cross-user time reconstruction
  // later depends on this being stable per scene.
  const sceneGameTime = new Date();

  if (stateChanges.npcs?.length) {
    await processNpcChanges(campaignId, stateChanges.npcs, { livingWorldEnabled });
  }

  // Campaign completion → global WorldEvent (user's explicit requirement:
  // "zakończenie kampanii musi być zapisane globalnie").
  if (livingWorldEnabled && stateChanges.campaignComplete) {
    await processCampaignComplete({
      campaignId,
      data: stateChanges.campaignComplete,
      ownerUserId,
      sceneGameTime,
      currentLocationName: stateChanges.currentLocation,
    });
    await applyFameFromEvent(campaignCharacterIds, {
      eventType: 'campaign_complete',
      visibility: 'global',
      payload: {},
    });
  }

  if (livingWorldEnabled && stateChanges.newItems?.length) {
    await processItemAttributions(campaignId, stateChanges.newItems, ownerUserId, sceneGameTime);
  }

  if (livingWorldEnabled && stateChanges.newLocations?.length) {
    await processLocationChanges(campaignId, stateChanges.newLocations, { prevLoc });
  }

  // Round B (Phase 4b) — hearsay. `locationMentioned` is an array of
  // `{ locationId, byNpcId }` emitted when a key NPC reveals a location in
  // dialog. Promotes the location to "heard-about" for the player + enforces
  // policy: the NPC must have the location in their knownLocations set, else
  // we reject the mention and log a warning (prevents LLM from leaking
  // hearsay past intent).
  if (livingWorldEnabled && Array.isArray(stateChanges.locationMentioned) && stateChanges.locationMentioned.length > 0) {
    await processLocationMentions(campaignId, stateChanges.locationMentioned);
  }

  // Phase 7 — dungeon room state flags. `prevLoc` is the room the player
  // was IN when premium wrote the flags; currentLocation may already point
  // to the next room (movement). Flags apply to prevLoc.
  if (livingWorldEnabled && stateChanges.dungeonRoom && prevLoc) {
    await applyDungeonRoomState({
      campaignId,
      prevLoc,
      flags: stateChanges.dungeonRoom,
    });
  }

  if (stateChanges.knowledgeUpdates) {
    await processKnowledgeUpdates(campaignId, stateChanges.knowledgeUpdates);
  }

  if (stateChanges.codexUpdates?.length) {
    await processCodexUpdates(campaignId, stateChanges.codexUpdates);
  }

  // Premium sees quest *names* in its prompt (not ids), so completedQuests
  // and questUpdates[].questId may carry names or hallucinated ids. Route
  // everything through resolveActiveQuest so downstream (audit, world-impact
  // gate, goal reassigner) works against real CampaignQuest.questId values.
  //
  // Ordering matters: resolve completedQuests BEFORE questUpdates. Otherwise
  // an auto-completion during questUpdates leaves only one active quest,
  // and the single-active fallback in completedQuests could wrongly close
  // the wrong quest.
  if (stateChanges.completedQuests?.length) {
    stateChanges.completedQuests = await processQuestStatusChange(
      campaignId, stateChanges.completedQuests, 'completed',
    );
  }

  if (stateChanges.failedQuests?.length) {
    stateChanges.failedQuests = await processQuestStatusChange(
      campaignId, stateChanges.failedQuests, 'failed',
    );
  }

  if (stateChanges.questUpdates?.length) {
    const autoCompleted = await processQuestObjectiveUpdates(
      campaignId, stateChanges.questUpdates, stateChanges.completedQuests || [],
    );
    if (autoCompleted.length > 0) {
      if (!Array.isArray(stateChanges.completedQuests)) stateChanges.completedQuests = [];
      for (const id of autoCompleted) {
        if (!stateChanges.completedQuests.includes(id)) stateChanges.completedQuests.push(id);
      }
    }
  }

  // Major-event gate (Zakres C). Two paths fire a global WorldEvent:
  //   1) AI flagged worldImpact='major' / deadly / dungeon AND the gate
  //      (named kill / main quest / liberation) confirms with evidence.
  //   2) Side quest auto-completed without any worldImpact flag — nano
  //      audit asks "is this a tavern rumour?" as a cheap backup.
  if (livingWorldEnabled && stateChanges.completedQuests?.length) {
    // Resolve main vs side for completed quests in this scene (one query).
    let completedMeta = [];
    try {
      completedMeta = await prisma.campaignQuest.findMany({
        where: { campaignId, questId: { in: stateChanges.completedQuests } },
        select: { questId: true, name: true, description: true, type: true },
      });
    } catch (err) {
      log.warn({ err, campaignId }, 'completedQuests metadata fetch failed');
    }
    const mainQuestCompleted = completedMeta.some((q) => q.type === 'main');

    const hasExplicitImpact = stateChanges.worldImpact === 'major'
      || stateChanges.defeatedDeadlyEncounter === true
      || !!stateChanges.dungeonComplete
      || stateChanges.locationLiberated === true;

    if (hasExplicitImpact || mainQuestCompleted) {
      await processWorldImpactEvent({
        campaignId,
        stateChanges,
        ownerUserId,
        sceneGameTime,
        mainQuestCompleted,
        characterIds: campaignCharacterIds,
      });
    }

    // Backup audit for side quests when nothing else promoted the scene.
    // Skip main quests (they promote via gate) and skip when an explicit
    // impact already wrote a global event — no duplication.
    if (!hasExplicitImpact) {
      const sideQuests = completedMeta.filter((q) => q.type !== 'main');
      for (const quest of sideQuests) {
        const verdict = await auditQuestWorldImpact(quest, {
          locationName: stateChanges.currentLocation,
          sceneSummary: stateChanges.campaignComplete?.summary || null,
        });
        if (verdict?.isMajor) {
          let worldLocationId = null;
          if (stateChanges.currentLocation) {
            try {
              const loc = await findOrCreateWorldLocation(stateChanges.currentLocation);
              worldLocationId = loc?.id || null;
            } catch { /* non-fatal */ }
          }
          await appendEvent({
            worldLocationId,
            campaignId,
            userId: ownerUserId,
            eventType: 'major_deed',
            payload: {
              gate: 'nano_audit',
              reason: verdict.reason,
              questName: quest.name,
              locationName: stateChanges.currentLocation || null,
            },
            visibility: 'global',
            gameTime: sceneGameTime,
          });
          log.info({ campaignId, questId: quest.questId, reason: verdict.reason }, 'nano audit promoted side quest to global');
          await applyFameFromEvent(campaignCharacterIds, {
            eventType: 'major_deed',
            visibility: 'global',
            payload: { gate: 'nano_audit' },
          });
        }
      }
    }
  } else if (livingWorldEnabled && (
    stateChanges.worldImpact === 'major'
    || stateChanges.defeatedDeadlyEncounter === true
    || stateChanges.dungeonComplete
    || stateChanges.locationLiberated === true
  )) {
    // No completed quests this scene — still honour explicit impact flags.
    await processWorldImpactEvent({
      campaignId,
      stateChanges,
      ownerUserId,
      sceneGameTime,
      mainQuestCompleted: false,
      characterIds: campaignCharacterIds,
    });
  }

  // Phase 5 — any quest status change (complete/fail) or objective update
  // potentially advances the "next quest" pointer → re-run goal assigner.
  // Also fires on pure NPC changes because newly-promoted NPCs may need
  // their first goal (maybePromote already calls the assigner but batch
  // runs catch cases where promotion returned an existing WorldNPC with
  // outdated goals from earlier assignments).
  if (livingWorldEnabled && (
    stateChanges.completedQuests?.length
    || stateChanges.failedQuests?.length
    || stateChanges.questUpdates?.length
    || stateChanges.npcs?.length
  )) {
    try {
      await assignGoalsForCampaign(campaignId);
    } catch (err) {
      log.warn({ err, campaignId }, 'assignGoalsForCampaign failed (non-fatal)');
    }
  }
}
