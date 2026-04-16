// One-time script: creates a MongoDB TTL index on RefreshToken.expiresAt.
// Prisma cannot emit TTL indexes, so we use the native driver.
//
// Usage: node backend/src/scripts/createRefreshTokenTtlIndex.js
//
// The TTL monitor runs every ~60s and reaps documents whose expiresAt < now().
// Safe to run repeatedly — createIndex is a no-op if the index already exists.

import 'dotenv/config';
import { MongoClient } from 'mongodb';

const uri = process.env.DATABASE_URL;
if (!uri) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

const client = new MongoClient(uri);

try {
  await client.connect();
  const db = client.db();
  const collection = db.collection('RefreshToken');

  const result = await collection.createIndex(
    { expiresAt: 1 },
    { expireAfterSeconds: 0 },
  );
  console.log(`TTL index created: ${result}`);
} catch (err) {
  console.error('Failed to create TTL index:', err);
  process.exit(1);
} finally {
  await client.close();
}
