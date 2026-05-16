import { prisma } from '../../../lib/prisma.js';
import { childLogger } from '../../../lib/logger.js';
import { buildNPCEmbeddingText, embedText } from '../../embeddingService.js';
import { writeEmbedding } from '../../embeddingWrite.js';
import { resolveLocationByName, findCanonicalWorldNpcByName } from '../../livingWorld/worldStateService.js';
import { upsertPendingChange } from '../../livingWorld/postCampaignWorldChanges.js';
import { getOrCloneCampaignNpc } from '../../livingWorld/campaignSandbox.js';
import { propagateRelationshipRipple } from '../../livingWorld/relationshipRippleService.js';
import { coerceGender, normalizeGender } from '../../../../../shared/domain/npcGender.js';
import { NPC_RACES } from '../../../../../shared/domain/npcRaces.js';
import {
  generateNpcSheet,
  mergeSheetOverride,
  npcStatsNeedsBaseline,
} from '../../../../../shared/domain/npcCharacterSheet.js';
import {
  appendCampaignNpcLocationMovement,
  NPC_LOCATION_MOVE_SOURCE_SCENE,
} from '../../livingWorld/campaignNpcLocationMovement.js';

const log = childLogger({ module: 'sceneGenerator' });

// Phase 12b — "return visit" signal threshold. Two consecutive scenes with
// the same NPC (player holds a dialog across scenes) should NOT count as a
// return. Three+ scenes apart means the player left and came back.
const RETURN_VISIT_SCENE_GAP = 2;

/**
 * Pure — compute the `prisma.campaignNPC.update` payload that captures this
 * scene's interaction with an existing CampaignNPC. Always increments
 * `interactionCount` and stamps the scene cursor. Conditionally increments
 * `questInvolvementCount` when the sceneIndex gap since last interaction
 * qualifies as a return visit (Q3 signal — "player came back to this NPC").
 *
 * `sceneIndex` may be null in legacy call paths that don't thread it through —
 * in that case we just stamp `lastInteractionAt` and skip the return-visit
 * signal entirely (ranking falls back to interactionCount alone).
 */
export function computeInteractionDelta(existing, sceneIndex, now = new Date()) {
  const data = {
    interactionCount: { increment: 1 },
    lastInteractionAt: now,
  };
  if (typeof sceneIndex === 'number' && sceneIndex >= 0) {
    data.lastInteractionSceneIndex = sceneIndex;
    const prev = existing?.lastInteractionSceneIndex;
    if (typeof prev === 'number' && sceneIndex - prev >= RETURN_VISIT_SCENE_GAP) {
      data.questInvolvementCount = { increment: 1 };
    }
  }
  return data;
}

/** Pure — initial stats fields for a freshly-created CampaignNPC. */
export function initialInteractionFields(sceneIndex, now = new Date()) {
  return {
    interactionCount: 1,
    lastInteractionAt: now,
    lastInteractionSceneIndex: typeof sceneIndex === 'number' && sceneIndex >= 0 ? sceneIndex : null,
  };
}

/**
 * F4 — replace the relationship slice for a single CampaignNPC. Pure
 * delete-then-insert; relationships are flavor metadata, no audit need.
 */
async function replaceNpcRelationships(campaignNpcId, relationships, prismaClient = prisma) {
  if (!campaignNpcId) return;
  await prismaClient.campaignNpcRelationship.deleteMany({ where: { campaignNpcId } });
  const inserts = (relationships || [])
    .filter((r) => r && r.npcName)
    .map((r) => {
      const strength = typeof r.strength === 'number' ? r.strength : 0;
      // rippleStrength (oś 2): jeśli LLM podał, użyj; inaczej heurystyka
      // |strength| clamp 0..100 (mocniejsza relacja → mocniejszy ripple).
      const ripple = typeof r.rippleStrength === 'number'
        ? Math.max(0, Math.min(100, Math.round(r.rippleStrength)))
        : Math.max(0, Math.min(100, Math.abs(strength)));
      return {
        campaignNpcId,
        targetType: 'npc',
        targetRef: r.npcName,
        relation: r.type || 'unknown',
        strength,
        rippleStrength: ripple,
      };
    });
  if (inserts.length > 0) {
    await prismaClient.campaignNpcRelationship.createMany({ data: inserts, skipDuplicates: true });
  }
}

export async function processNpcChanges(campaignId, npcs, { livingWorldEnabled = false, sceneIndex = null } = {}) {
  const affectedNpcIds = [];

  // Lazy-loaded campaign location ref for NPC location enforcement.
  let _campaignLocRef = undefined;
  async function getCampaignLocationRef() {
    if (_campaignLocRef !== undefined) return _campaignLocRef;
    const row = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { currentLocationKind: true, currentLocationId: true },
    });
    _campaignLocRef = (row?.currentLocationKind && row?.currentLocationId)
      ? { kind: row.currentLocationKind, id: row.currentLocationId }
      : null;
    return _campaignLocRef;
  }

  // Per-scene cache — identical free-text location strings across multiple
  // NPCs in the same scene resolve once. npcs[] capped at 30.
  const locationResolveCache = new Map();
  async function resolveLocationCached(rawName) {
    if (locationResolveCache.has(rawName)) return locationResolveCache.get(rawName);
    const result = await resolveLocationByName(rawName, { campaignId });
    locationResolveCache.set(rawName, result);
    return result;
  }

  for (const npcChange of npcs) {
    if (!npcChange.name) continue;

    const npcId = npcChange.name.toLowerCase().replace(/\s+/g, '_');

    try {
      // Primary: lookup by campaignNpcId (UUID) if AI emitted one.
      // Fallback: slug-based lookup (legacy name-based identity).
      let existing = null;
      if (npcChange.campaignNpcId) {
        existing = await prisma.campaignNPC.findUnique({
          where: { id: npcChange.campaignNpcId },
        });
        if (existing && existing.campaignId !== campaignId) existing = null;
      }
      if (!existing) {
        existing = await prisma.campaignNPC.findUnique({
          where: { campaignId_npcId: { campaignId, npcId } },
        });
      }

      if (existing) {
        const contentUpdate = {};
        if (npcChange.attitude) contentUpdate.attitude = npcChange.attitude;
        if (npcChange.disposition != null) contentUpdate.disposition = npcChange.disposition;
        if (npcChange.alive != null) contentUpdate.alive = npcChange.alive;
        if (npcChange.lastLocation) contentUpdate.lastLocation = npcChange.lastLocation;

        // Refresh lastLocationKind/Id so the location-graph inspector tracks
        // NPC movement. Skip when NPC is being killed/removed.
        /** @type {{ kind: string, id: string } | null} */
        let newLocRefForLog = null;
        if (npcChange.alive !== false) {
          let resolvedLocRef = null;
          if (npcChange.lastLocation) {
            const resolved = await resolveLocationCached(npcChange.lastLocation);
            if (resolved) resolvedLocRef = { kind: resolved.kind, id: resolved.row.id };
          }
          if (!resolvedLocRef && !existing.lastLocationKind) {
            const campRef = await getCampaignLocationRef();
            if (campRef) resolvedLocRef = campRef;
          }
          if (resolvedLocRef &&
              (resolvedLocRef.kind !== existing.lastLocationKind || resolvedLocRef.id !== existing.lastLocationId)) {
            contentUpdate.lastLocationKind = resolvedLocRef.kind;
            contentUpdate.lastLocationId = resolvedLocRef.id;
            newLocRefForLog = resolvedLocRef;
          }
        }

        // Opportunistically link orphaned ephemeral shadows to their
        // canonical WorldNPC so post-campaign promotion dedup works.
        if (!existing.worldNpcId) {
          const canonical = await findCanonicalWorldNpcByName(npcChange.name);
          if (canonical) contentUpdate.worldNpcId = canonical.id;
        }

        if (npcChange.acknowledgedFame === true) contentUpdate.hasAcknowledgedFame = true;
        if (typeof npcChange.role === 'string' && npcChange.role.trim() && existing.role !== npcChange.role) contentUpdate.role = npcChange.role;
        if (typeof npcChange.personality === 'string' && npcChange.personality.trim() && existing.personality !== npcChange.personality) contentUpdate.personality = npcChange.personality;
        // Backfill / refresh appearance + dialect. Only overwrite when the
        // LLM actually sent something — empty strings must NOT clobber a
        // previously stored canonical description.
        if (typeof npcChange.appearance === 'string' && npcChange.appearance.trim() && existing.appearance !== npcChange.appearance) {
          contentUpdate.appearance = npcChange.appearance.trim();
        }
        if (typeof npcChange.dialect === 'string' && npcChange.dialect.trim() && existing.dialect !== npcChange.dialect) {
          contentUpdate.dialect = npcChange.dialect.trim();
        }
        // Backfill gender on existing NPCs: either the LLM just sent a valid
        // value (upgrade path) or the row was persisted earlier with
        // "unknown" and now we can coerce it deterministically so voice
        // resolution has something to work with.
        const incomingGender = normalizeGender(npcChange.gender);
        if (incomingGender && incomingGender !== existing.gender) {
          contentUpdate.gender = incomingGender;
        } else if (!incomingGender && !normalizeGender(existing.gender)) {
          contentUpdate.gender = coerceGender(null, npcChange.name);
        }

        // Character sheet — race / creatureKind / level may be set on the
        // first post-introduction update if the LLM decides the NPC's race
        // now. statsOverride lets the LLM nudge specific attributes/skills
        // on an existing sheet. Lazy backfill: when `stats` is empty (legacy
        // rows created before this migration) we regenerate a baseline
        // sheet so the FE/combat can rely on the shape.
        const hasValidRace = typeof npcChange.race === 'string' && NPC_RACES.includes(npcChange.race);
        if (hasValidRace && existing.race !== npcChange.race) contentUpdate.race = npcChange.race;
        if (typeof npcChange.creatureKind === 'string' && existing.creatureKind !== npcChange.creatureKind) {
          contentUpdate.creatureKind = npcChange.creatureKind;
        }
        if (typeof npcChange.level === 'number' && npcChange.level >= 1 && npcChange.level <= 30 && existing.level !== npcChange.level) {
          contentUpdate.level = Math.floor(npcChange.level);
        }

        const existingStats = !npcStatsNeedsBaseline(existing.stats) ? existing.stats : null;
        const needsBaseline = !existingStats;
        if (needsBaseline || npcChange.statsOverride) {
          const baseline = existingStats || generateNpcSheet({
            name: npcChange.name,
            race: contentUpdate.race ?? existing.race ?? (hasValidRace ? npcChange.race : null),
            creatureKind: contentUpdate.creatureKind ?? existing.creatureKind ?? npcChange.creatureKind ?? null,
            role: npcChange.role ?? existing.role ?? '',
            category: existing.category,
            personality: npcChange.personality ?? existing.personality ?? '',
            level: contentUpdate.level ?? existing.level ?? null,
          });
          const merged = npcChange.statsOverride ? mergeSheetOverride(baseline, npcChange.statsOverride) : baseline;
          contentUpdate.stats = merged;
          if (typeof merged.level === 'number' && merged.level !== existing.level) contentUpdate.level = merged.level;
          if (merged.race && merged.race !== existing.race) contentUpdate.race = merged.race;
          if (merged.creatureKind && merged.creatureKind !== existing.creatureKind) contentUpdate.creatureKind = merged.creatureKind;
        }

        if (npcChange.alive === false && livingWorldEnabled) {
          const effectiveWorldNpcId = contentUpdate.worldNpcId || existing.worldNpcId;
          if (effectiveWorldNpcId) {
            try {
              await upsertPendingChange({
                change: {
                  kind: 'npcDeath',
                  targetHint: npcChange.name,
                  newValue: 'dead',
                  confidence: 1.0,
                },
                resolved: { entityId: effectiveWorldNpcId, entityType: 'npc', similarity: 1.0 },
                reason: 'scene_npc_killed',
                campaignId,
              });
            } catch (err) {
              log.warn({ err: err?.message, campaignId, npcName: npcChange.name }, 'NPC death pending queue failed (non-fatal)');
            }
          }
        }

        const hasContentUpdate = Object.keys(contentUpdate).length > 0 || Array.isArray(npcChange.relationships);
        const statsDelta = computeInteractionDelta(existing, sceneIndex);
        const updated = await prisma.campaignNPC.update({
          where: { id: existing.id },
          data: { ...statsDelta, ...contentUpdate },
        });
        if (newLocRefForLog) {
          await appendCampaignNpcLocationMovement(prisma, {
            campaignNpcId: existing.id,
            fromKind: existing.lastLocationKind,
            fromId: existing.lastLocationId,
            toKind: newLocRefForLog.kind,
            toId: newLocRefForLog.id,
            source: NPC_LOCATION_MOVE_SOURCE_SCENE,
            sceneIndex,
          });
        }
        if (Array.isArray(npcChange.relationships)) {
          await replaceNpcRelationships(existing.id, npcChange.relationships);
        }
        // Only re-embed + queue downstream work when LLM actually changed
        // state — bare mentions tick stats but don't require embedding churn.
        if (hasContentUpdate) {
          const embText = buildNPCEmbeddingText(updated);
          const emb = await embedText(embText);
          if (emb) writeEmbedding('CampaignNPC', updated.id, emb, embText);
          affectedNpcIds.push(updated.id);
        }
      } else {
        // Build the character sheet deterministically — backend picks race
        // (if LLM didn't), derives stats from role + category + level.
        // LLM can override specific fields via `statsOverride`.
        const rawRace = typeof npcChange.race === 'string' && NPC_RACES.includes(npcChange.race) ? npcChange.race : null;
        const rawCreatureKind = typeof npcChange.creatureKind === 'string' && npcChange.creatureKind.trim()
          ? npcChange.creatureKind.trim()
          : null;
        // If neither race nor creatureKind set, fall back to Human so every
        // NPC has *some* card. LLM can update later.
        const resolvedRace = rawRace || (rawCreatureKind ? null : 'Human');
        const baseline = generateNpcSheet({
          name: npcChange.name,
          race: resolvedRace,
          creatureKind: rawCreatureKind,
          role: npcChange.role || '',
          category: 'commoner',
          personality: npcChange.personality || '',
          level: typeof npcChange.level === 'number' ? npcChange.level : null,
        });
        const stats = npcChange.statsOverride ? mergeSheetOverride(baseline, npcChange.statsOverride) : baseline;

        try {
          const locRef = await getCampaignLocationRef();
          const trimmedAppearance = typeof npcChange.appearance === 'string' && npcChange.appearance.trim() ? npcChange.appearance.trim() : null;
          const trimmedDialect = typeof npcChange.dialect === 'string' && npcChange.dialect.trim() ? npcChange.dialect.trim() : null;

          // Check if the LLM is mentioning a canonical WorldNPC the player
          // hasn't physically met yet. If so, route through the sandbox
          // cloner to get a properly-linked shadow instead of an ephemeral.
          const canonicalMatch = await findCanonicalWorldNpcByName(npcChange.name);
          let created;
          if (canonicalMatch) {
            const cloned = await getOrCloneCampaignNpc(campaignId, canonicalMatch.id);
            if (cloned) {
              const prevKind = cloned.lastLocationKind;
              const prevId = cloned.lastLocationId;
              const nextKind = locRef?.kind || cloned.lastLocationKind || null;
              const nextId = locRef?.id || cloned.lastLocationId || null;
              created = await prisma.campaignNPC.update({
                where: { id: cloned.id },
                data: {
                  gender: coerceGender(npcChange.gender, npcChange.name),
                  role: npcChange.role || cloned.role || null,
                  personality: npcChange.personality || cloned.personality || null,
                  appearance: trimmedAppearance || cloned.appearance || null,
                  dialect: trimmedDialect || cloned.dialect || null,
                  attitude: npcChange.attitude || cloned.attitude || 'neutral',
                  disposition: npcChange.disposition ?? cloned.disposition ?? 0,
                  race: stats.race,
                  creatureKind: stats.creatureKind,
                  level: stats.level,
                  stats,
                  lastLocationKind: nextKind,
                  lastLocationId: nextId,
                  ...initialInteractionFields(sceneIndex),
                },
              });
              if (nextKind && nextId && (prevKind !== nextKind || prevId !== nextId)) {
                await appendCampaignNpcLocationMovement(prisma, {
                  campaignNpcId: created.id,
                  fromKind: prevKind,
                  fromId: prevId,
                  toKind: nextKind,
                  toId: nextId,
                  source: NPC_LOCATION_MOVE_SOURCE_SCENE,
                  sceneIndex,
                });
              }
            }
          }

          if (!created) {
            created = await prisma.campaignNPC.create({
              data: {
                campaignId,
                npcId,
                name: npcChange.name,
                gender: coerceGender(npcChange.gender, npcChange.name),
                role: npcChange.role || null,
                personality: npcChange.personality || null,
                appearance: trimmedAppearance,
                dialect: trimmedDialect,
                attitude: npcChange.attitude || 'neutral',
                disposition: npcChange.disposition ?? 0,
                race: stats.race,
                creatureKind: stats.creatureKind,
                level: stats.level,
                stats,
                lastLocationKind: locRef?.kind || null,
                lastLocationId: locRef?.id || null,
                ...initialInteractionFields(sceneIndex),
              },
            });
            if (created.lastLocationKind && created.lastLocationId) {
              await appendCampaignNpcLocationMovement(prisma, {
                campaignNpcId: created.id,
                fromKind: null,
                fromId: null,
                toKind: created.lastLocationKind,
                toId: created.lastLocationId,
                source: NPC_LOCATION_MOVE_SOURCE_SCENE,
                sceneIndex,
              });
            }
          }

          if (Array.isArray(npcChange.relationships) && npcChange.relationships.length > 0) {
            await replaceNpcRelationships(created.id, npcChange.relationships);
          }
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

  // ── Oś 2 — relationship ripple ─────────────────────────────────────
  // Po wszystkich update'ach NPC, dla każdego z dispositionChange ≠ 0
  // lub alive=false, propagate ripple do powiązanych NPC. Cap 8 targets
  // per source. Anti-loop: ripple write nie wywołuje dalej ripple.
  // Dziala nawet gdy livingWorldEnabled=false — relationships są
  // per-campaign, nie globalne, więc nie zaśmiecają global ledgera.
  const rippleTasks = npcs
    .filter((n) => n.name && (
      (typeof n.dispositionChange === 'number' && n.dispositionChange !== 0)
      || n.alive === false
    ))
    .map(async (change) => {
      try {
        const npcId = change.name.toLowerCase().replace(/\s+/g, '_');
        const cn = await prisma.campaignNPC.findUnique({
          where: { campaignId_npcId: { campaignId, npcId } },
          select: { id: true, name: true },
        });
        if (!cn?.id) return;
        await propagateRelationshipRipple(campaignId, cn.id, {
          dispositionDelta: typeof change.dispositionChange === 'number' ? change.dispositionChange : 0,
          alive: change.alive !== false,
          actionType: null,  // actionType pochodzi z npcMemoryUpdates — osobny passthrough
          sceneIndex,
          sourceName: cn.name,
        });
      } catch (err) {
        log.warn({ err: err?.message, npcName: change.name, campaignId }, 'Relationship ripple propagation failed (non-fatal)');
      }
    });
  await Promise.allSettled(rippleTasks);
}

