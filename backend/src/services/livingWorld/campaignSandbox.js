// Living World — Round B campaign sandbox.
//
// Canonical rule: WorldNPC rows are IMMUTABLE during a playthrough. Every
// mid-play mutation (location change, death, activeGoal update, dialog,
// `pendingIntroHint`) writes to a per-campaign `CampaignNPC` shadow. A
// concurrent playthrough sees the untouched canonical state; post-campaign
// promotion (Round E) folds shadows back into canon with admin review.
//
// This module owns the shadow helpers:
//   - getOrCloneCampaignNpc(campaignId, worldNpcId)
//       Lazy "clone on first encounter" — returns the CampaignNPC shadow,
//       creating a snapshot from WorldNPC if the campaign hasn't met this
//       NPC yet.
//   - setCampaignNpcLocation(campaignId, worldNpcId, locationId)
//       Write CampaignNPC.lastLocationId. Never touches WorldNPC.
//   - listNpcsAtLocation(locationId, { campaignId, aliveOnly })
//       Campaign-aware enumerator: returns the union of CampaignNPC shadows
//       whose lastLocationId=locationId AND canonical WorldNPCs currently
//       at the same location (auto-cloning any not yet shadowed). Falls
//       back to the canonical-only list if no campaignId is provided.
//
// Back-compat note: `worldStateService.listNpcsAtLocation` still exists and
// returns the raw canonical list. Scene-gen should migrate to the helper
// here when a campaignId is in scope; callers that only care about the
// canonical view (admin map, cross-campaign queries) keep the old one.

import { prisma } from '../../lib/prisma.js';
import { childLogger } from '../../lib/logger.js';
import { listNpcsAtLocation as listWorldNpcsAtLocation } from './worldStateService.js';
import { categorize } from './questGoalAssigner.js';

const log = childLogger({ module: 'campaignSandbox' });

function slugifyName(value) {
  return String(value || '').toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
}

/**
 * Resolve the CampaignNPC shadow for a WorldNPC in a given campaign. If no
 * shadow exists yet, clone one from the canonical WorldNPC (snapshot: name,
 * role, personality, alignment, category, WorldNpcKnownLocation grants → note only,
 * keyNpc, currentLocationId → lastLocationId).
 *
 * Returns null when inputs are invalid or the WorldNPC has been deleted.
 * Never throws — callers can treat null as "skip this NPC for now".
 */
export async function getOrCloneCampaignNpc(campaignId, worldNpcId) {
  if (!campaignId || !worldNpcId) return null;
  try {
    const existing = await prisma.campaignNPC.findFirst({
      where: { campaignId, worldNpcId },
    });
    if (existing) return existing;

    const world = await prisma.worldNPC.findUnique({ where: { id: worldNpcId } });
    if (!world) return null;

    const npcIdSlug = slugifyName(world.name) || world.canonicalId || world.id;
    const category = world.category || categorize(world.role);
    // `@@unique([campaignId, npcId])` — if a prior ephemeral CampaignNPC
    // happens to share the slug, we'd collide. Append the worldNpcId suffix
    // to keep uniqueness without leaking the raw id into prompts.
    const desiredNpcId = await (async () => {
      const hit = await prisma.campaignNPC.findFirst({
        where: { campaignId, npcId: npcIdSlug },
        select: { id: true },
      });
      return hit ? `${npcIdSlug}_${worldNpcId.slice(-6)}` : npcIdSlug;
    })();

    return await prisma.campaignNPC.create({
      data: {
        campaignId,
        npcId: desiredNpcId,
        name: world.name,
        role: world.role || null,
        personality: world.personality || null,
        alignment: world.alignment || 'neutral',
        alive: world.alive !== false,
        lastLocation: null, // flavor string; authoritative FK is lastLocationKind+lastLocationId
        // F5b — `world.currentLocationId` is canonical FK (WorldNPC →
        // WorldLocation), so the clone's lastLocation pair is always kind=world.
        lastLocationKind: world.currentLocationId ? 'world' : null,
        lastLocationId: world.currentLocationId || null,
        worldNpcId: world.id,
        isAgent: true,
        category,
        // Round B — shadow.activeGoal starts null. It's populated by
        // `assignGoalsForCampaign` when a quest role is assigned; it is
        // INDEPENDENT of WorldNPC.activeGoal (which is the NPC's world-
        // level background goal, ticked by npcAgentLoop).
        activeGoal: null,
        goalProgress: null,
      },
    });
  } catch (err) {
    log.warn({ err: err?.message, campaignId, worldNpcId }, 'getOrCloneCampaignNpc failed');
    return null;
  }
}

/**
 * Set CampaignNPC.lastLocation (polymorphic FK pair) for a (campaignId,
 * worldNpcId) shadow. Auto-clones if the shadow doesn't exist yet. Silent on
 * failure.
 *
 * F5b — accepts either a `{ kind, id }` polymorphic ref OR (back-compat) a
 * bare locationId string which is treated as kind='world'.
 */
export async function setCampaignNpcLocation(campaignId, worldNpcId, ref) {
  if (!campaignId || !worldNpcId) return false;
  // Coerce the back-compat bare-string call site into the polymorphic shape.
  const { kind, id } = typeof ref === 'string' || ref == null
    ? { kind: ref ? 'world' : null, id: ref || null }
    : { kind: ref.kind || null, id: ref.id || null };
  try {
    const shadow = await getOrCloneCampaignNpc(campaignId, worldNpcId);
    if (!shadow) return false;
    await prisma.campaignNPC.update({
      where: { id: shadow.id },
      data: {
        lastLocationKind: id ? kind : null,
        lastLocationId: id || null,
      },
    });
    return true;
  } catch (err) {
    log.warn({ err: err?.message, campaignId, worldNpcId, kind, id }, 'setCampaignNpcLocation failed');
    return false;
  }
}

/**
 * Set CampaignNPC.pendingIntroHint. Auto-clones. Used by the
 * `onComplete.moveNpcToPlayer` quest trigger (Phase 4) to leave a
 * one-shot "NPC just arrived with news" note for the next scene.
 */
export async function setCampaignNpcIntroHint(campaignId, worldNpcId, hint) {
  if (!campaignId || !worldNpcId) return false;
  try {
    const shadow = await getOrCloneCampaignNpc(campaignId, worldNpcId);
    if (!shadow) return false;
    await prisma.campaignNPC.update({
      where: { id: shadow.id },
      data: { pendingIntroHint: hint || null },
    });
    return true;
  } catch (err) {
    log.warn({ err: err?.message, campaignId, worldNpcId }, 'setCampaignNpcIntroHint failed');
    return false;
  }
}

/**
 * Clear a previously-set pendingIntroHint. Called by the scene prompt
 * assembler after the hint has been surfaced exactly once.
 */
export async function clearCampaignNpcIntroHint(campaignNpcId) {
  if (!campaignNpcId) return;
  try {
    await prisma.campaignNPC.update({
      where: { id: campaignNpcId },
      data: { pendingIntroHint: null },
    });
  } catch (err) {
    log.warn({ err: err?.message, campaignNpcId }, 'clearCampaignNpcIntroHint failed');
  }
}

/**
 * Enrich a CampaignNPC shadow with selected WorldNPC fields so downstream
 * scene-gen can treat the merged shape like the old `listNpcsAtLocation`
 * canonical result.
 *
 * Rule: shadow fields ALWAYS win. WorldNPC values are fallbacks for
 * uncloned NPCs (which shouldn't happen in normal flow — the enumerator
 * auto-clones — but let's be defensive) and for fields that remain
 * canonical-only (keyNpc, homeLocationId, WorldNpcKnownLocation grants).
 *
 * Ephemeral shadows (no worldNpcId, no WorldNPC lookup) return their own
 * fields with defaults filled in.
 */
function enrichedShape(shadow, world = null) {
  if (!shadow) return null;
  return {
    ...(world || {}),
    ...shadow,
    id: world?.id || shadow.id,
    campaignNpcId: shadow.id,
    worldNpcId: shadow.worldNpcId || null,
    name: shadow.name || world?.name || null,
    role: shadow.role || world?.role || null,
    personality: shadow.personality || world?.personality || null,
    alignment: shadow.alignment || world?.alignment || 'neutral',
    alive: shadow.alive !== false && (world?.alive !== false),
    category: shadow.category || world?.category || 'commoner',
    pendingIntroHint: shadow.pendingIntroHint || null,
    // Campaign-scoped goal state — shadow is AUTHORITATIVE for the
    // campaign view. WorldNPC has its own independent activeGoal (world
    // tick / background life); we deliberately do NOT fall back to it so
    // canonical background drama never leaks into campaign narration.
    activeGoal: shadow.activeGoal || null,
    goalProgress: shadow.goalProgress || null,
    // Pause / tick infra stays canonical (world-level lifecycle).
    pausedAt: world?.pausedAt || null,
    pauseSnapshot: world?.pauseSnapshot || null,
    lastTickAt: world?.lastTickAt || null,
    lastTickSceneIndex: world?.lastTickSceneIndex ?? null,
    tickIntervalScenes: world?.tickIntervalScenes ?? 2,
    // Canonical-only: keyNpc, homeLocationId.
    keyNpc: world ? world.keyNpc !== false : true,
    currentLocationId: shadow.lastLocationId || world?.currentLocationId || null,
    homeLocationId: world?.homeLocationId || null,
  };
}

/**
 * Campaign-aware NPC enumerator for a location.
 *
 * Returns an array of enriched CampaignNPC shadows (`enrichedShape`):
 * CampaignNPC columns + WorldNPC fallback fields (activeGoal, goalProgress,
 * pausedAt, keyNpc, homeLocationId, knownLocations from join) so downstream
 * scene-gen code reads the same field names as it did with the old
 * canonical list.
 *
 * Enumeration:
 *   1. CampaignNPCs where `lastLocationId=locationId` — shadows explicitly
 *      at this tile (includes NPCs moved by quest triggers).
 *   2. Canonical WorldNPCs at this location without a shadow yet → clone
 *      (via `getOrCloneCampaignNpc`) so downstream writers mutate the
 *      shadow rather than canonical state.
 *
 * Shadows whose lastLocationId has been moved elsewhere in the campaign
 * are NOT re-added here, even if their canonical WorldNPC still points to
 * this tile — shadow is the source of truth once it exists.
 *
 * `campaignId=null` falls back to the canonical-only view (used by admin
 * map + cross-campaign queries).
 */
export async function listNpcsAtLocation(locationId, { campaignId = null, aliveOnly = true } = {}) {
  if (!locationId) return [];
  if (!campaignId) {
    return listWorldNpcsAtLocation(locationId, { aliveOnly });
  }

  try {
    const shadowWhere = { campaignId, lastLocationId: locationId };
    if (aliveOnly) shadowWhere.alive = true;
    const shadows = await prisma.campaignNPC.findMany({ where: shadowWhere });

    // Pre-fetch WorldNPC rows for enrichment in one batch.
    const worldNpcIds = shadows.map((s) => s.worldNpcId).filter(Boolean);
    const worldRows = worldNpcIds.length
      ? await prisma.worldNPC.findMany({ where: { id: { in: worldNpcIds } } })
      : [];
    const worldById = new Map(worldRows.map((w) => [w.id, w]));

    const enrichedShadows = shadows
      .map((s) => enrichedShape(s, s.worldNpcId ? worldById.get(s.worldNpcId) || null : null))
      .filter(Boolean);

    // Canonical WorldNPCs currently here — clone any not yet shadowed.
    const canonicalHere = await listWorldNpcsAtLocation(locationId, { aliveOnly });
    const shadowedWorldIds = new Set(shadows.map((s) => s.worldNpcId).filter(Boolean));
    const toClone = canonicalHere.filter((w) => !shadowedWorldIds.has(w.id));
    const cloned = [];
    for (const w of toClone) {
      // Skip WorldNPCs that already have a shadow somewhere else in this
      // campaign — the shadow's lastLocationId is authoritative, so don't
      // double-count them at this tile.
      const existingElsewhere = await prisma.campaignNPC.findFirst({
        where: { campaignId, worldNpcId: w.id },
        select: { id: true },
      });
      if (existingElsewhere) continue;
      const shadow = await getOrCloneCampaignNpc(campaignId, w.id);
      if (!shadow) continue;
      if (aliveOnly && shadow.alive === false) continue;
      cloned.push(enrichedShape(shadow, w));
    }

    return [...enrichedShadows, ...cloned];
  } catch (err) {
    log.warn({ err: err?.message, campaignId, locationId }, 'listNpcsAtLocation (sandbox) failed');
    return listWorldNpcsAtLocation(locationId, { aliveOnly });
  }
}

/**
 * Resolve the canonical + implicit (1-hop edge) + explicit location set
 * that a given NPC is allowed to reveal in dialog. Used by the hearsay
 * prompt block (Phase 4b) and the post-scene policy check in
 * processStateChanges (reject `locationMentioned` entries for locations
 * outside this set).
 *
 * Implicit knowledge:
 *   - the NPC's own location (lastLocationId / canonical currentLocationId)
 *   - every Road neighbour of that location
 *
 * Explicit knowledge (WorldNpcKnownLocation rows) is merged on top so
 * seeded "scout NPCs" reach further than 1 hop.
 *
 * Returns `Set<locationId>`. Empty if the NPC has no location AND no
 * explicit knowledge entries.
 */
export async function resolveNpcKnownLocations({ campaignNpc, worldNpc }) {
  const known = new Set();
  const anchorLocationId = campaignNpc?.lastLocationId
    || worldNpc?.currentLocationId
    || null;
  if (anchorLocationId) {
    known.add(anchorLocationId);
    try {
      const edges = await prisma.road.findMany({
        where: {
          OR: [
            { fromLocationId: anchorLocationId },
            { toLocationId: anchorLocationId },
          ],
        },
        select: { fromLocationId: true, toLocationId: true },
      });
      for (const e of edges) {
        known.add(e.fromLocationId);
        known.add(e.toLocationId);
      }
    } catch (err) {
      log.warn({ err: err?.message, anchorLocationId }, 'resolveNpcKnownLocations edges failed');
    }
  }
  // Explicit knowledge from WorldNpcKnownLocation rows (seed + admin authored).
  if (worldNpc?.id) {
    try {
      const explicit = await prisma.worldNpcKnownLocation.findMany({
        where: { npcId: worldNpc.id },
        select: { locationId: true },
      });
      for (const e of explicit) if (e.locationId) known.add(e.locationId);
    } catch (err) {
      log.warn({ err: err?.message, worldNpcId: worldNpc.id }, 'resolveNpcKnownLocations explicit lookup failed');
    }
  }
  known.delete(null);
  known.delete(undefined);
  return known;
}
