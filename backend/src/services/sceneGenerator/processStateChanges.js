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
async function processItemAttributions(campaignId, newItems, userId) {
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
      });
    } catch (err) {
      log.warn({ err, campaignId, fromNpcId }, 'item attribution event write failed');
    }
  }
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

async function processQuestObjectiveUpdates(campaignId, questUpdates, alreadyCompletedQuestIds = []) {
  const touchedQuestIds = new Set();
  for (const update of questUpdates) {
    try {
      const quest = await prisma.campaignQuest.findFirst({
        where: { campaignId, questId: update.questId },
      });
      if (!quest) continue;
      const objectives = JSON.parse(quest.objectives || '[]');
      const updated = objectives.map(obj => {
        if (obj.id !== update.objectiveId) return obj;
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
      if (update.completed) touchedQuestIds.add(update.questId);
    } catch (err) {
      log.error({ err, campaignId, questId: update.questId, objectiveId: update.objectiveId }, 'Failed to update quest objective');
    }
  }

  // Auto-complete quests where all objectives are now done.
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
        log.info({ campaignId, questId }, 'Quest auto-completed — all objectives done');
      }
    } catch (err) {
      log.error({ err, campaignId, questId }, 'Failed to auto-complete quest');
    }
  }
}

async function processQuestStatusChange(campaignId, questIds, status) {
  for (const questId of questIds) {
    try {
      const quest = await prisma.campaignQuest.findFirst({
        where: { campaignId, questId },
      });
      if (quest) {
        await prisma.campaignQuest.update({
          where: { id: quest.id },
          data: { status, completedAt: new Date() },
        });
      }
    } catch (err) {
      log.error({ err, campaignId, questId, status }, 'Failed to update quest status');
    }
  }
}

export async function processStateChanges(campaignId, stateChanges) {
  // Fetch campaign once to check living-world flag + userId for Phase 4
  // WorldEvent attribution (cheap — same record is already loaded by
  // postSceneWork for the same campaignId).
  let livingWorldEnabled = false;
  let ownerUserId = null;
  try {
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { livingWorldEnabled: true, userId: true },
    });
    livingWorldEnabled = campaign?.livingWorldEnabled === true;
    ownerUserId = campaign?.userId || null;
  } catch {
    // non-fatal — fall back to legacy behaviour
  }

  if (stateChanges.npcs?.length) {
    await processNpcChanges(campaignId, stateChanges.npcs, { livingWorldEnabled });
  }

  if (livingWorldEnabled && stateChanges.newItems?.length) {
    await processItemAttributions(campaignId, stateChanges.newItems, ownerUserId);
  }

  if (stateChanges.knowledgeUpdates) {
    await processKnowledgeUpdates(campaignId, stateChanges.knowledgeUpdates);
  }

  if (stateChanges.codexUpdates?.length) {
    await processCodexUpdates(campaignId, stateChanges.codexUpdates);
  }

  if (stateChanges.questUpdates?.length) {
    await processQuestObjectiveUpdates(campaignId, stateChanges.questUpdates, stateChanges.completedQuests || []);
  }

  if (stateChanges.completedQuests?.length) {
    await processQuestStatusChange(campaignId, stateChanges.completedQuests, 'completed');
  }

  if (stateChanges.failedQuests?.length) {
    await processQuestStatusChange(campaignId, stateChanges.failedQuests, 'failed');
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
