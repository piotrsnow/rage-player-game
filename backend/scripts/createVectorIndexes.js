/**
 * Creates MongoDB Atlas Vector Search indexes for campaign collections.
 *
 * Run with: node scripts/createVectorIndexes.js
 *
 * Prerequisites:
 * - MongoDB Atlas M10+ cluster
 * - DATABASE_URL set in .env
 *
 * Note: Atlas Vector Search indexes can also be created through the Atlas UI
 * if the createSearchIndex command is not available on your cluster tier.
 */
import 'dotenv/config';
import { MongoClient } from 'mongodb';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL not set in environment');
  process.exit(1);
}

const INDEXES = [
  {
    collection: 'CampaignScene',
    name: 'scene_vector_idx',
    definition: {
      fields: [
        {
          type: 'vector',
          path: 'embedding',
          numDimensions: 1536,
          similarity: 'cosine',
        },
        {
          type: 'filter',
          path: 'campaignId',
        },
      ],
    },
  },
  {
    collection: 'CampaignKnowledge',
    name: 'knowledge_vector_idx',
    definition: {
      fields: [
        {
          type: 'vector',
          path: 'embedding',
          numDimensions: 1536,
          similarity: 'cosine',
        },
        {
          type: 'filter',
          path: 'campaignId',
        },
        {
          type: 'filter',
          path: 'entryType',
        },
      ],
    },
  },
  {
    collection: 'CampaignNPC',
    name: 'npc_vector_idx',
    definition: {
      fields: [
        {
          type: 'vector',
          path: 'embedding',
          numDimensions: 1536,
          similarity: 'cosine',
        },
        {
          type: 'filter',
          path: 'campaignId',
        },
      ],
    },
  },
  {
    collection: 'CampaignCodex',
    name: 'codex_vector_idx',
    definition: {
      fields: [
        {
          type: 'vector',
          path: 'embedding',
          numDimensions: 1536,
          similarity: 'cosine',
        },
        {
          type: 'filter',
          path: 'campaignId',
        },
      ],
    },
  },
];

async function main() {
  const client = new MongoClient(DATABASE_URL);
  await client.connect();

  const url = new URL(DATABASE_URL);
  const dbName = url.pathname.replace('/', '') || 'rpgon';
  const db = client.db(dbName);

  console.log(`Connected to database: ${dbName}`);

  for (const idx of INDEXES) {
    const collection = db.collection(idx.collection);
    try {
      await collection.createSearchIndex({
        name: idx.name,
        type: 'vectorSearch',
        definition: idx.definition,
      });
      console.log(`Created vector index "${idx.name}" on ${idx.collection}`);
    } catch (err) {
      if (err.codeName === 'IndexAlreadyExists' || err.message?.includes('already exists')) {
        console.log(`Index "${idx.name}" already exists on ${idx.collection}, skipping`);
      } else {
        console.error(`Failed to create index "${idx.name}" on ${idx.collection}:`, err.message);
      }
    }
  }

  await client.close();
  console.log('Done.');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
