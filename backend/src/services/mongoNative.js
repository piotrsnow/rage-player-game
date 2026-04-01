import { MongoClient } from 'mongodb';
import { config } from '../config.js';

let client = null;
let db = null;

/**
 * Get the native MongoDB client and database.
 * Reuses a single connection across the application.
 */
export async function getMongoDb() {
  if (db) return db;

  client = new MongoClient(config.databaseUrl);
  await client.connect();

  // Extract database name from connection string or use default
  const url = new URL(config.databaseUrl);
  const dbName = url.pathname.replace('/', '') || 'rpgon';
  db = client.db(dbName);

  return db;
}

/**
 * Get a specific collection by name.
 */
export async function getCollection(collectionName) {
  const database = await getMongoDb();
  return database.collection(collectionName);
}

/**
 * Gracefully close the native MongoDB connection.
 */
export async function closeMongoNative() {
  if (client) {
    await client.close();
    client = null;
    db = null;
  }
}
