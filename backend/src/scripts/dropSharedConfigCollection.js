/**
 * One-time cleanup: drop the legacy SharedConfig collection.
 *
 * The model has been removed from prisma/schema.prisma in favour of
 * Campaign.voiceSettings. Prisma never drops Mongo collections automatically,
 * so the old collection lingers in the database. This script removes it.
 *
 * Usage:
 *   node backend/src/scripts/dropSharedConfigCollection.js
 */

import { getCollection } from '../services/mongoNative.js';

async function main() {
  const col = await getCollection('SharedConfig');
  try {
    const dropped = await col.drop();
    console.log(dropped ? 'SharedConfig collection dropped.' : 'SharedConfig: drop returned false.');
  } catch (err) {
    if (err?.codeName === 'NamespaceNotFound') {
      console.log('SharedConfig collection does not exist — nothing to do.');
    } else {
      throw err;
    }
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('dropSharedConfigCollection failed:', err);
  process.exit(1);
});
