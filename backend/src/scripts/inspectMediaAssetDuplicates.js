/**
 * Diagnostic: list duplicate MediaAsset rows by `key`.
 *
 * Read-only. Reports groups of MediaAsset documents that share the same `key`
 * value, so we can decide how to clean them up before applying the unique index
 * declared in schema.prisma.
 *
 * Usage:
 *   node backend/src/scripts/inspectMediaAssetDuplicates.js
 */

import { getCollection } from '../services/mongoNative.js';

async function main() {
  const col = await getCollection('MediaAsset');

  const groups = await col.aggregate([
    { $group: { _id: '$key', count: { $sum: 1 }, ids: { $push: '$_id' } } },
    { $match: { count: { $gt: 1 } } },
    { $sort: { count: -1 } },
  ]).toArray();

  if (groups.length === 0) {
    console.log('No duplicates found in MediaAsset.key.');
    process.exit(0);
  }

  console.log(`Found ${groups.length} duplicate key group(s) in MediaAsset.\n`);

  let totalRows = 0;
  let extraRows = 0;

  for (const group of groups) {
    totalRows += group.count;
    extraRows += group.count - 1;

    console.log(`key: ${group._id}`);
    console.log(`  count: ${group.count}`);

    const docs = await col
      .find({ _id: { $in: group.ids } })
      .project({ _id: 1, userId: 1, campaignId: 1, type: 1, path: 1, createdAt: 1, updatedAt: 1 })
      .toArray();

    docs.sort((a, b) => {
      const aTs = (a.updatedAt || a.createdAt || 0).valueOf?.() || 0;
      const bTs = (b.updatedAt || b.createdAt || 0).valueOf?.() || 0;
      return bTs - aTs;
    });

    for (const [i, doc] of docs.entries()) {
      const marker = i === 0 ? '[NEWEST]' : '[older] ';
      const ts = (doc.updatedAt || doc.createdAt || '').toString();
      console.log(`  ${marker} _id=${doc._id} type=${doc.type || '-'} campaign=${doc.campaignId || '-'} path=${doc.path || '-'} ts=${ts}`);
    }
    console.log();
  }

  console.log(`Summary: ${groups.length} duplicate key(s), ${totalRows} rows total, ${extraRows} would be removed if we keep newest.`);
  process.exit(0);
}

main().catch((err) => {
  console.error('inspectMediaAssetDuplicates failed:', err);
  process.exit(1);
});
