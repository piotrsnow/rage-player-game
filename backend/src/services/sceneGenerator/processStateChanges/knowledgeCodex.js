import { prisma } from '../../../lib/prisma.js';
import { childLogger } from '../../../lib/logger.js';
import {
  buildKnowledgeEmbeddingText,
  buildCodexEmbeddingText,
  embedText,
} from '../../embeddingService.js';
import { writeEmbedding } from '../../embeddingWrite.js';

const log = childLogger({ module: 'sceneGenerator' });

export async function processKnowledgeUpdates(campaignId, ku) {
  const entries = [];

  if (ku.events?.length) {
    for (const e of ku.events) {
      entries.push({
        entryType: 'event',
        summary: e.summary || e,
        content: e,
        importance: e.importance,
        tags: e.tags || [],
      });
    }
  }
  if (ku.decisions?.length) {
    for (const d of ku.decisions) {
      entries.push({
        entryType: 'decision',
        summary: `${d.choice} -> ${d.consequence}`,
        content: d,
        importance: d.importance,
        tags: d.tags || [],
      });
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

export async function processCodexUpdates(campaignId, codexUpdates) {
  for (const cu of codexUpdates) {
    if (!cu.id || !cu.name) continue;

    try {
      const existing = await prisma.campaignCodex.findUnique({
        where: { campaignId_codexKey: { campaignId, codexKey: cu.id } },
      });

      if (existing) {
        const existingFragments = Array.isArray(existing.fragments) ? [...existing.fragments] : [];
        if (cu.fragment) existingFragments.push(cu.fragment);

        const updated = await prisma.campaignCodex.update({
          where: { id: existing.id },
          data: {
            fragments: existingFragments,
            tags: cu.tags || existing.tags || [],
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
              tags: cu.tags || [],
              fragments: cu.fragment ? [cu.fragment] : [],
              relatedEntries: cu.relatedEntries || [],
            },
          });
          const embText = buildCodexEmbeddingText(created);
          const emb = await embedText(embText);
          if (emb) writeEmbedding('CampaignCodex', created.id, emb, embText);
        } catch (createErr) {
          if (createErr.code !== 'P2002') throw createErr;
        }
      }
    } catch (err) {
      log.error({ err, campaignId, codexId: cu.id }, 'Failed to process codex update');
    }
  }
}
