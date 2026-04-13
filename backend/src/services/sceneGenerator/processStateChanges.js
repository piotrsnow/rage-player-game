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

async function processNpcChanges(campaignId, npcs) {
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
        if (npcChange.factionId) updateData.factionId = npcChange.factionId;
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
        }
      } else if (npcChange.action === 'introduce' || !existing) {
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
            factionId: npcChange.factionId || null,
            relationships: JSON.stringify(npcChange.relationships || []),
            relatedQuestIds: JSON.stringify(npcChange.relatedQuestIds || []),
          },
        });
        const embText = buildNPCEmbeddingText(created);
        const emb = await embedText(embText);
        if (emb) writeEmbedding('CampaignNPC', created.id, emb, embText);
      }
    } catch (err) {
      log.error({ err, campaignId, npcName: npcChange.name }, 'Failed to process NPC change');
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
      }
    } catch (err) {
      log.error({ err, campaignId, codexId: cu.id }, 'Failed to process codex update');
    }
  }
}

async function processQuestObjectiveUpdates(campaignId, questUpdates) {
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
    } catch (err) {
      log.error({ err, campaignId, questId: update.questId, objectiveId: update.objectiveId }, 'Failed to update quest objective');
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
  if (stateChanges.npcs?.length) {
    await processNpcChanges(campaignId, stateChanges.npcs);
  }

  if (stateChanges.knowledgeUpdates) {
    await processKnowledgeUpdates(campaignId, stateChanges.knowledgeUpdates);
  }

  if (stateChanges.codexUpdates?.length) {
    await processCodexUpdates(campaignId, stateChanges.codexUpdates);
  }

  if (stateChanges.questUpdates?.length) {
    await processQuestObjectiveUpdates(campaignId, stateChanges.questUpdates);
  }

  if (stateChanges.completedQuests?.length) {
    await processQuestStatusChange(campaignId, stateChanges.completedQuests, 'completed');
  }

  if (stateChanges.failedQuests?.length) {
    await processQuestStatusChange(campaignId, stateChanges.failedQuests, 'failed');
  }
}
