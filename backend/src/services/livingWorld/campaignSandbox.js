// Living World — campaign sandbox (unified Npc table version).
//
// With the unified Npc table:
//   campaignId IS NULL → canonical NPC
//   campaignId = uuid  → campaign shadow
//   canonicalNpcId     → FK to the canonical row this shadow was cloned from
//
// Core pattern:
//   - getOrCloneCampaignNpc: lazy clone on first encounter (INSERT in same table)
//   - setCampaignNpcLocation: UPDATE shadow row's currentLocationId
//   - listNpcsAtLocation: campaign-scoped shadows + auto-clone canonical NPCs

import { prisma } from '../../lib/prisma.js';
import { childLogger } from '../../lib/logger.js';
import { generateNpcSheet } from '../../../../shared/domain/npcCharacterSheet.js';
import { categorize } from './questGoalAssigner.js';

const log = childLogger({ module: 'campaignSandbox' });

function slugifyName(value) {
  return String(value || '').toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
}

/**
 * Get or create a campaign shadow of a canonical NPC.
 * Returns the shadow Npc row, or null on invalid input / deleted canonical.
 */
export async function getOrCloneCampaignNpc(campaignId, canonicalNpcId) {
  if (!campaignId || !canonicalNpcId) return null;
  try {
    const existing = await prisma.npc.findFirst({
      where: { campaignId, canonicalNpcId },
    });
    if (existing) return existing;

    const canonical = await prisma.npc.findFirst({
      where: { id: canonicalNpcId, campaignId: null },
    });
    if (!canonical) return null;
    if (canonical.alive === false) return null;

    const npcIdSlug = slugifyName(canonical.name) || canonical.canonicalId || canonical.id;
    const category = canonical.category || categorize(canonical.role);

    const desiredNpcId = await (async () => {
      const hit = await prisma.npc.findFirst({
        where: { campaignId, npcId: npcIdSlug },
        select: { id: true },
      });
      return hit ? `${npcIdSlug}_${canonicalNpcId.slice(-6)}` : npcIdSlug;
    })();

    const sheet = generateNpcSheet({
      name: canonical.name,
      race: canonical.race || null,
      creatureKind: canonical.creatureKind || null,
      role: canonical.role || '',
      category,
      personality: canonical.personality || '',
      level: typeof canonical.level === 'number' ? canonical.level : null,
      keyNpc: canonical.keyNpc === true,
    });

    return await prisma.npc.create({
      data: {
        campaignId,
        canonicalNpcId: canonical.id,
        npcId: desiredNpcId,
        name: canonical.name,
        role: canonical.role || null,
        personality: canonical.personality || null,
        appearance: canonical.appearance || null,
        dialect: canonical.dialect || null,
        alive: canonical.alive !== false,
        alignment: canonical.alignment || 'neutral',
        currentLocationId: canonical.currentLocationId || null,
        homeLocationId: canonical.homeLocationId || null,
        isAgent: true,
        category,
        race: sheet.race,
        creatureKind: sheet.creatureKind,
        level: sheet.level,
        stats: sheet,
        activeGoal: null,
        goalProgress: null,
      },
    });
  } catch (err) {
    log.warn({ err: err?.message, campaignId, canonicalNpcId }, 'getOrCloneCampaignNpc failed');
    return null;
  }
}

/**
 * Set a campaign NPC shadow's current location. Auto-clones if needed.
 * `locationId` is a plain UUID FK to the unified Location table.
 */
export async function setCampaignNpcLocation(campaignId, canonicalNpcId, locationId) {
  if (!campaignId || !canonicalNpcId) return false;
  try {
    const shadow = await getOrCloneCampaignNpc(campaignId, canonicalNpcId);
    if (!shadow) return false;
    await prisma.npc.update({
      where: { id: shadow.id },
      data: { currentLocationId: locationId || null },
    });
    return true;
  } catch (err) {
    log.warn({ err: err?.message, campaignId, canonicalNpcId, locationId }, 'setCampaignNpcLocation failed');
    return false;
  }
}

/**
 * Set pendingIntroHint on a campaign NPC shadow. Auto-clones.
 */
export async function setCampaignNpcIntroHint(campaignId, canonicalNpcId, hint) {
  if (!campaignId || !canonicalNpcId) return false;
  try {
    const shadow = await getOrCloneCampaignNpc(campaignId, canonicalNpcId);
    if (!shadow) return false;
    await prisma.npc.update({
      where: { id: shadow.id },
      data: { pendingIntroHint: hint || null },
    });
    return true;
  } catch (err) {
    log.warn({ err: err?.message, campaignId, canonicalNpcId }, 'setCampaignNpcIntroHint failed');
    return false;
  }
}

/**
 * Clear a previously-set pendingIntroHint after it's been surfaced once.
 */
export async function clearCampaignNpcIntroHint(npcId) {
  if (!npcId) return;
  try {
    await prisma.npc.update({
      where: { id: npcId },
      data: { pendingIntroHint: null },
    });
  } catch (err) {
    log.warn({ err: err?.message, npcId }, 'clearCampaignNpcIntroHint failed');
  }
}

/**
 * Enrich a campaign shadow with canonical NPC fields for scene-gen consumption.
 */
function enrichedShape(shadow, canonical = null) {
  if (!shadow) return null;
  return {
    ...(canonical || {}),
    ...shadow,
    id: canonical?.id || shadow.id,
    campaignNpcId: shadow.id,
    canonicalNpcId: shadow.canonicalNpcId || null,
    name: shadow.name || canonical?.name || null,
    role: shadow.role || canonical?.role || null,
    personality: shadow.personality || canonical?.personality || null,
    alignment: canonical?.alignment || shadow.alignment || 'neutral',
    alive: shadow.alive !== false && (canonical?.alive !== false),
    category: shadow.category || canonical?.category || 'commoner',
    pendingIntroHint: shadow.pendingIntroHint || null,
    activeGoal: shadow.activeGoal || null,
    goalProgress: shadow.goalProgress || null,
    pausedAt: canonical?.pausedAt || null,
    pauseSnapshot: canonical?.pauseSnapshot || null,
    lastTickAt: canonical?.lastTickAt || null,
    lastTickSceneIndex: canonical?.lastTickSceneIndex ?? null,
    tickIntervalScenes: canonical?.tickIntervalScenes ?? 2,
    keyNpc: canonical ? canonical.keyNpc !== false : true,
    currentLocationId: shadow.currentLocationId || canonical?.currentLocationId || null,
    homeLocationId: canonical?.homeLocationId || shadow.homeLocationId || null,
  };
}

/**
 * List canonical NPCs at a location.
 */
function listCanonicalNpcsAtLocation(locationId, { aliveOnly = true } = {}) {
  return prisma.npc.findMany({
    where: {
      campaignId: null,
      currentLocationId: locationId,
      ...(aliveOnly && { alive: true }),
    },
  });
}

/**
 * Campaign-aware NPC enumerator for a location.
 *
 * Returns enriched shadows: campaign NPC columns + canonical fallback fields.
 *
 * Logic:
 *   1. Find campaign shadows with currentLocationId = locationId
 *   2. Find canonical NPCs at this location without a shadow → auto-clone
 *   3. Merge and return
 *
 * `campaignId=null` falls back to canonical-only view.
 */
export async function listNpcsAtLocation(locationId, { campaignId = null, aliveOnly = true } = {}) {
  if (!locationId) return [];
  if (!campaignId) {
    return listCanonicalNpcsAtLocation(locationId, { aliveOnly });
  }

  try {
    const shadowWhere = { campaignId, currentLocationId: locationId };
    if (aliveOnly) shadowWhere.alive = true;
    const shadows = await prisma.npc.findMany({ where: shadowWhere });

    const canonicalNpcIds = shadows.map((s) => s.canonicalNpcId).filter(Boolean);
    const canonicalRows = canonicalNpcIds.length
      ? await prisma.npc.findMany({ where: { id: { in: canonicalNpcIds }, campaignId: null } })
      : [];
    const canonicalById = new Map(canonicalRows.map((c) => [c.id, c]));

    const enrichedShadows = shadows
      .map((s) => enrichedShape(s, s.canonicalNpcId ? canonicalById.get(s.canonicalNpcId) || null : null))
      .filter(Boolean);

    // Auto-clone canonical NPCs at this location not yet shadowed.
    // Check if the location is campaign-scoped — if so, skip (canonical NPCs
    // are only positioned at canonical locations).
    const loc = await prisma.location.findUnique({
      where: { id: locationId },
      select: { campaignId: true },
    });
    if (loc?.campaignId) return enrichedShadows;

    const canonicalHere = await listCanonicalNpcsAtLocation(locationId, { aliveOnly });
    const shadowedIds = new Set(shadows.map((s) => s.canonicalNpcId).filter(Boolean));
    const toClone = canonicalHere.filter((c) => !shadowedIds.has(c.id));

    const cloned = [];
    for (const c of toClone) {
      const existingElsewhere = await prisma.npc.findFirst({
        where: { campaignId, canonicalNpcId: c.id },
        select: { id: true },
      });
      if (existingElsewhere) continue;
      const shadow = await getOrCloneCampaignNpc(campaignId, c.id);
      if (!shadow) continue;
      if (aliveOnly && shadow.alive === false) continue;
      cloned.push(enrichedShape(shadow, c));
    }

    return [...enrichedShadows, ...cloned];
  } catch (err) {
    log.warn({ err: err?.message, campaignId, locationId }, 'listNpcsAtLocation (sandbox) failed');
    return listCanonicalNpcsAtLocation(locationId, { aliveOnly });
  }
}

/**
 * Resolve the set of location IDs an NPC is "allowed to know about" (for hearsay).
 * Includes: own location + explicit NpcKnownLocation grants.
 */
export async function resolveNpcKnownLocations({ shadow, canonical }) {
  const known = new Set();
  const anchorLocationId = shadow?.currentLocationId || canonical?.currentLocationId || null;
  if (anchorLocationId) known.add(anchorLocationId);

  const canonicalId = canonical?.id || shadow?.canonicalNpcId;
  if (canonicalId) {
    try {
      const explicit = await prisma.npcKnownLocation.findMany({
        where: { npcId: canonicalId },
        select: { locationId: true },
      });
      for (const e of explicit) if (e.locationId) known.add(e.locationId);
    } catch (err) {
      log.warn({ err: err?.message, canonicalId }, 'resolveNpcKnownLocations explicit lookup failed');
    }
  }
  known.delete(null);
  known.delete(undefined);
  return known;
}
