import { prisma } from '../../../lib/prisma.js';
import { config } from '../../../config.js';
import { searchCodex } from '../../vectorSearchService.js';
import { embedText } from '../../embeddingService.js';
import { childLogger } from '../../../lib/logger.js';

const log = childLogger({ module: 'aiContextTools' });

export async function handleGetCodex(campaignId, topic) {
  // Try text search first
  const codex = await prisma.campaignCodex.findFirst({
    where: {
      campaignId,
      name: { contains: topic, mode: 'insensitive' },
    },
  });

  if (codex) {
    return formatCodex(codex);
  }

  // Fallback to vector search (graceful — skip if embedding API unavailable/quota exceeded)
  if (config.apiKeys.openai) {
    try {
      const queryEmbedding = await embedText(topic);
      if (queryEmbedding) {
        const results = await searchCodex(campaignId, queryEmbedding, { limit: 1, minScore: 0.6 });
        if (results.length > 0) {
          return formatCodex(results[0]);
        }
      }
    } catch (err) {
      log.warn({ err, campaignId, topic }, 'Codex vector search skipped');
    }
  }

  return `No codex entry found matching "${topic}".`;
}

export function formatCodex(codex) {
  const fragments =
    typeof codex.fragments === 'string' ? JSON.parse(codex.fragments) : codex.fragments || [];

  const lines = [`${codex.name} [${codex.category}]`];

  for (const f of fragments) {
    lines.push(`- [${f.aspect || 'general'}] ${f.content} (source: ${f.source || 'unknown'})`);
  }

  return lines.join('\n');
}
