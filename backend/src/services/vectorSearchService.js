import { ObjectId } from 'mongodb';
import { getCollection } from './mongoNative.js';
import { embedText } from './embeddingService.js';

/**
 * Run a vector search on CampaignScene collection.
 * Returns scenes sorted by semantic similarity to the query.
 */
export async function searchScenes(campaignId, queryEmbedding, { limit = 10, minScore = 0.5 } = {}) {
  const collection = await getCollection('CampaignScene');

  const results = await collection
    .aggregate([
      {
        $vectorSearch: {
          index: 'scene_vector_idx',
          path: 'embedding',
          queryVector: queryEmbedding,
          numCandidates: limit * 5,
          limit,
          filter: { campaignId },
        },
      },
      {
        $project: {
          _id: 1,
          sceneIndex: 1,
          narrative: 1,
          chosenAction: 1,
          scenePacing: 1,
          dialogueSegments: 1,
          diceRoll: 1,
          score: { $meta: 'vectorSearchScore' },
        },
      },
    ])
    .toArray();

  return results.filter((r) => r.score >= minScore);
}

/**
 * Run a vector search on CampaignKnowledge collection.
 */
export async function searchKnowledge(
  campaignId,
  queryEmbedding,
  { limit = 10, minScore = 0.5, entryType = null } = {},
) {
  const collection = await getCollection('CampaignKnowledge');

  const filter = { campaignId };
  if (entryType) filter.entryType = entryType;

  const results = await collection
    .aggregate([
      {
        $vectorSearch: {
          index: 'knowledge_vector_idx',
          path: 'embedding',
          queryVector: queryEmbedding,
          numCandidates: limit * 5,
          limit,
          filter,
        },
      },
      {
        $project: {
          _id: 1,
          entryType: 1,
          summary: 1,
          content: 1,
          importance: 1,
          status: 1,
          tags: 1,
          sceneIndex: 1,
          score: { $meta: 'vectorSearchScore' },
        },
      },
    ])
    .toArray();

  return results.filter((r) => r.score >= minScore);
}

/**
 * Run a vector search on CampaignNPC collection.
 */
export async function searchNPCs(campaignId, queryEmbedding, { limit = 5, minScore = 0.5 } = {}) {
  const collection = await getCollection('CampaignNPC');

  const results = await collection
    .aggregate([
      {
        $vectorSearch: {
          index: 'npc_vector_idx',
          path: 'embedding',
          queryVector: queryEmbedding,
          numCandidates: limit * 5,
          limit,
          filter: { campaignId },
        },
      },
      {
        $project: {
          _id: 1,
          npcId: 1,
          name: 1,
          role: 1,
          personality: 1,
          attitude: 1,
          disposition: 1,
          alive: 1,
          lastLocation: 1,
          factionId: 1,
          notes: 1,
          relationships: 1,
          score: { $meta: 'vectorSearchScore' },
        },
      },
    ])
    .toArray();

  return results.filter((r) => r.score >= minScore);
}

/**
 * Run a vector search on CampaignCodex collection.
 */
export async function searchCodex(
  campaignId,
  queryEmbedding,
  { limit = 5, minScore = 0.5 } = {},
) {
  const collection = await getCollection('CampaignCodex');

  const results = await collection
    .aggregate([
      {
        $vectorSearch: {
          index: 'codex_vector_idx',
          path: 'embedding',
          queryVector: queryEmbedding,
          numCandidates: limit * 5,
          limit,
          filter: { campaignId },
        },
      },
      {
        $project: {
          _id: 1,
          codexKey: 1,
          name: 1,
          category: 1,
          fragments: 1,
          tags: 1,
          score: { $meta: 'vectorSearchScore' },
        },
      },
    ])
    .toArray();

  return results.filter((r) => r.score >= minScore);
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

/**
 * Write an embedding to a document using the native MongoDB driver.
 * Prisma can't handle native BSON float arrays, so we write directly.
 */
export async function writeEmbedding(collectionName, documentId, embedding, embeddingText) {
  const collection = await getCollection(collectionName);
  await collection.updateOne(
    { _id: new ObjectId(documentId) },
    {
      $set: {
        embedding,
        embeddingText,
      },
    },
  );
}
