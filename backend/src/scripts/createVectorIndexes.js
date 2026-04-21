// One-time script: creates Atlas Vector Search indexes used by the backend.
// Prisma cannot emit vector search indexes, so we use the native driver.
//
// Usage: node backend/src/scripts/createVectorIndexes.js
//
// Safe to run repeatedly — createSearchIndex skips if an index with the same
// name already exists. Requires MongoDB Atlas (not local MongoDB) because
// $vectorSearch is an Atlas-only aggregation stage.

import 'dotenv/config';
import { MongoClient } from 'mongodb';

const uri = process.env.DATABASE_URL;
if (!uri) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

const EMBEDDING_DIMENSIONS = 1536;

// Definition format matches Atlas UI / `db.collection.createSearchIndex()` API.
// `type: 'vectorSearch'` is required for $vectorSearch aggregation support.
const INDEXES = [
  {
    collection: 'CampaignScene',
    name: 'scene_vector_idx',
    definition: {
      fields: [
        { type: 'vector', path: 'embedding', numDimensions: EMBEDDING_DIMENSIONS, similarity: 'cosine' },
        { type: 'filter', path: 'campaignId' },
      ],
    },
  },
  {
    collection: 'CampaignKnowledge',
    name: 'knowledge_vector_idx',
    definition: {
      fields: [
        { type: 'vector', path: 'embedding', numDimensions: EMBEDDING_DIMENSIONS, similarity: 'cosine' },
        { type: 'filter', path: 'campaignId' },
        { type: 'filter', path: 'entryType' },
      ],
    },
  },
  {
    collection: 'CampaignNPC',
    name: 'npc_vector_idx',
    definition: {
      fields: [
        { type: 'vector', path: 'embedding', numDimensions: EMBEDDING_DIMENSIONS, similarity: 'cosine' },
        { type: 'filter', path: 'campaignId' },
      ],
    },
  },
  {
    collection: 'CampaignCodex',
    name: 'codex_vector_idx',
    definition: {
      fields: [
        { type: 'vector', path: 'embedding', numDimensions: EMBEDDING_DIMENSIONS, similarity: 'cosine' },
        { type: 'filter', path: 'campaignId' },
      ],
    },
  },
  // Living World vector indexes (world_npc_vector_idx, world_location_vector_idx)
  // are deferred — name-based dedupe is sufficient at current scale.
  // See `knowledge/ideas/living-world-vector-search.md` for the trigger to enable.
];

const client = new MongoClient(uri);

try {
  await client.connect();
  const db = client.db();

  for (const idx of INDEXES) {
    const collection = db.collection(idx.collection);
    try {
      const result = await collection.createSearchIndex({
        name: idx.name,
        type: 'vectorSearch',
        definition: idx.definition,
      });
      console.log(`[${idx.collection}] created: ${result}`);
    } catch (err) {
      // IndexAlreadyExists / duplicate name → safe skip
      const msg = err?.message || String(err);
      if (msg.includes('already exists') || msg.includes('duplicate')) {
        console.log(`[${idx.collection}] ${idx.name} — already exists, skipping`);
      } else {
        console.error(`[${idx.collection}] ${idx.name} FAILED:`, msg);
      }
    }
  }
  console.log('Done.');
} catch (err) {
  console.error('Failed to create vector indexes:', err);
  process.exit(1);
} finally {
  await client.close();
}
