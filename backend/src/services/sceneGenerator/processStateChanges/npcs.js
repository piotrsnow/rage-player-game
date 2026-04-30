import { prisma } from '../../../lib/prisma.js';
import { childLogger } from '../../../lib/logger.js';
import { buildNPCEmbeddingText, embedText } from '../../embeddingService.js';
import { writeEmbedding } from '../../embeddingWrite.js';
import { updateLoyalty } from '../../livingWorld/companionService.js';
import { appendEvent } from '../../livingWorld/worldEventLog.js';
import { coerceGender, normalizeGender } from '../../../../../shared/domain/npcGender.js';

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
    .map((r) => ({
      campaignNpcId,
      targetType: 'npc',
      targetRef: r.npcName,
      relation: r.type || 'unknown',
      strength: typeof r.strength === 'number' ? r.strength : 0,
    }));
  if (inserts.length > 0) {
    await prismaClient.campaignNpcRelationship.createMany({ data: inserts, skipDuplicates: true });
  }
}

export async function processNpcChanges(campaignId, npcs, { livingWorldEnabled = false, sceneIndex = null } = {}) {
  const affectedNpcIds = [];

  for (const npcChange of npcs) {
    if (!npcChange.name) continue;

    const npcId = npcChange.name.toLowerCase().replace(/\s+/g, '_');

    try {
      const existing = await prisma.campaignNPC.findUnique({
        where: { campaignId_npcId: { campaignId, npcId } },
      });

      if (existing) {
        const contentUpdate = {};
        if (npcChange.attitude) contentUpdate.attitude = npcChange.attitude;
        if (npcChange.disposition != null) contentUpdate.disposition = npcChange.disposition;
        if (npcChange.alive != null) contentUpdate.alive = npcChange.alive;
        if (npcChange.lastLocation) contentUpdate.lastLocation = npcChange.lastLocation;
        if (npcChange.acknowledgedFame === true) contentUpdate.hasAcknowledgedFame = true;
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

        const hasContentUpdate = Object.keys(contentUpdate).length > 0 || Array.isArray(npcChange.relationships);
        const statsDelta = computeInteractionDelta(existing, sceneIndex);
        const updated = await prisma.campaignNPC.update({
          where: { id: existing.id },
          data: { ...statsDelta, ...contentUpdate },
        });
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
        try {
          const created = await prisma.campaignNPC.create({
            data: {
              campaignId,
              npcId,
              name: npcChange.name,
              gender: coerceGender(npcChange.gender, npcChange.name),
              role: npcChange.role || null,
              personality: npcChange.personality || null,
              attitude: npcChange.attitude || 'neutral',
              disposition: npcChange.disposition ?? 0,
              ...initialInteractionFields(sceneIndex),
            },
          });
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

  // Living World: propagate companion loyalty drift from dispositionChange
  // for NPCs already linked to a canonical WorldNPC (seeded or admin-promoted).
  // Ephemeral CampaignNPCs (`worldNpcId=null`) skip this path — canonical
  // promotion happens post-campaign via the admin-review pipeline (Phase 12b),
  // no longer inline. Best-effort, never blocks scene commit.
  if (livingWorldEnabled && affectedNpcIds.length > 0) {
    const loyaltyTasks = npcs
      .filter((n) => n.name && typeof n.dispositionChange === 'number' && n.dispositionChange !== 0)
      .map(async (change) => {
        try {
          const npcId = change.name.toLowerCase().replace(/\s+/g, '_');
          const cn = await prisma.campaignNPC.findUnique({
            where: { campaignId_npcId: { campaignId, npcId } },
            select: { worldNpcId: true, isAgent: true },
          });
          if (!cn?.worldNpcId || !cn.isAgent) return;
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
    await Promise.allSettled(loyaltyTasks);
  }
}

/**
 * Phase 4 — observe item-attribution hints. When a living-world campaign
 * emits newItems with `fromNpcId`, we write a WorldEvent `item_given`
 * attributing the transfer to the canonical WorldNPC. No validation /
 * rejection — that belongs to full orchestration (see
 * knowledge/ideas/living-world-scene-orchestration.md).
 */
export async function processItemAttributions(campaignId, newItems, userId, sceneGameTime) {
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
