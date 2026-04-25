import { prisma } from '../lib/prisma.js';
import { embedText } from './embeddingService.js';

// pgvector retrieval. `embedding <=> query` is the cosine distance operator;
// score = 1 - distance. HNSW indexes (see migration init_postgres) make this
// O(log N) per query.

function vectorLiteral(embedding) {
  return `[${embedding.join(',')}]`;
}

export async function searchScenes(campaignId, queryEmbedding, { limit = 10, minScore = 0.5 } = {}) {
  const vec = vectorLiteral(queryEmbedding);
  const rows = await prisma.$queryRaw`
    SELECT "id", "sceneIndex", "narrative", "chosenAction", "scenePacing",
           "dialogueSegments", "diceRoll",
           1 - ("embedding" <=> ${vec}::vector) AS score
    FROM "CampaignScene"
    WHERE "campaignId" = ${campaignId}::uuid
      AND "embedding" IS NOT NULL
    ORDER BY "embedding" <=> ${vec}::vector
    LIMIT ${limit}
  `;
  return rows.filter((r) => r.score >= minScore);
}

export async function searchKnowledge(
  campaignId,
  queryEmbedding,
  { limit = 10, minScore = 0.5, entryType = null } = {},
) {
  const vec = vectorLiteral(queryEmbedding);
  const rows = entryType
    ? await prisma.$queryRaw`
        SELECT "id", "entryType", "summary", "content", "importance", "status",
               "tags", "sceneIndex",
               1 - ("embedding" <=> ${vec}::vector) AS score
        FROM "CampaignKnowledge"
        WHERE "campaignId" = ${campaignId}::uuid
          AND "entryType" = ${entryType}
          AND "embedding" IS NOT NULL
        ORDER BY "embedding" <=> ${vec}::vector
        LIMIT ${limit}
      `
    : await prisma.$queryRaw`
        SELECT "id", "entryType", "summary", "content", "importance", "status",
               "tags", "sceneIndex",
               1 - ("embedding" <=> ${vec}::vector) AS score
        FROM "CampaignKnowledge"
        WHERE "campaignId" = ${campaignId}::uuid
          AND "embedding" IS NOT NULL
        ORDER BY "embedding" <=> ${vec}::vector
        LIMIT ${limit}
      `;
  return rows.filter((r) => r.score >= minScore);
}

export async function searchNPCs(campaignId, queryEmbedding, { limit = 5, minScore = 0.5 } = {}) {
  const vec = vectorLiteral(queryEmbedding);
  const rows = await prisma.$queryRaw`
    SELECT "id", "npcId", "name", "role", "personality", "attitude", "disposition",
           "alive", "lastLocation", "factionId", "notes", "relationships",
           1 - ("embedding" <=> ${vec}::vector) AS score
    FROM "CampaignNPC"
    WHERE "campaignId" = ${campaignId}::uuid
      AND "embedding" IS NOT NULL
    ORDER BY "embedding" <=> ${vec}::vector
    LIMIT ${limit}
  `;
  return rows.filter((r) => r.score >= minScore);
}

export async function searchCodex(
  campaignId,
  queryEmbedding,
  { limit = 5, minScore = 0.5 } = {},
) {
  const vec = vectorLiteral(queryEmbedding);
  const rows = await prisma.$queryRaw`
    SELECT "id", "codexKey", "name", "category", "fragments", "tags",
           1 - ("embedding" <=> ${vec}::vector) AS score
    FROM "CampaignCodex"
    WHERE "campaignId" = ${campaignId}::uuid
      AND "embedding" IS NOT NULL
    ORDER BY "embedding" <=> ${vec}::vector
    LIMIT ${limit}
  `;
  return rows.filter((r) => r.score >= minScore);
}

/**
 * High-level search: embed a text query and search across scenes + knowledge.
 * Returns combined results sorted by score.
 */
export async function searchCampaignMemory(campaignId, query, { limit = 10 } = {}) {
  const queryEmbedding = await embedText(query);
  if (!queryEmbedding) return [];

  const [scenes, knowledge] = await Promise.all([
    searchScenes(campaignId, queryEmbedding, { limit: Math.ceil(limit * 0.6) }),
    searchKnowledge(campaignId, queryEmbedding, { limit: Math.ceil(limit * 0.4) }),
  ]);

  const combined = [
    ...scenes.map((s) => ({
      type: 'scene',
      sceneIndex: s.sceneIndex,
      content: s.chosenAction
        ? `[Scene ${s.sceneIndex}] Player: ${s.chosenAction}\n${s.narrative}`
        : `[Scene ${s.sceneIndex}] ${s.narrative}`,
      score: s.score,
    })),
    ...knowledge.map((k) => ({
      type: k.entryType,
      content: k.summary,
      importance: k.importance,
      score: k.score,
    })),
  ];

  return combined.sort((a, b) => b.score - a.score).slice(0, limit);
}
