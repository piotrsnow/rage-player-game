/**
 * Cleanup: remove duplicate MediaAsset rows that share the same `key`.
 *
 * Strategy: keep the newest row in each duplicate group (by updatedAt, then
 * createdAt, then ObjectId). Older rows are deleted from MongoDB. The
 * underlying storage files are NOT touched — every row in a group points to
 * the same `path`, so the file is shared and remains valid for the surviving
 * row.
 *
 * Default mode is dry-run. Pass --apply to actually delete.
 *
 * Usage:
 *   node backend/src/scripts/pruneMediaAssetDuplicates.js          # dry-run
 *   node backend/src/scripts/pruneMediaAssetDuplicates.js --apply  # delete
 */

import { getCollection } from '../services/mongoNative.js';

const APPLY = process.argv.includes('--apply');

function tsValue(doc) {
  const ts = doc.updatedAt || doc.createdAt;
  if (!ts) return 0;
  return ts.valueOf?.() ?? 0;
}

function compareNewestFirst(a, b) {
  const diff = tsValue(b) - tsValue(a);
  if (diff !== 0) return diff;
  return String(b._id).localeCompare(String(a._id));
}

async function main() {
  console.log(APPLY ? '=== APPLY MODE — will delete rows ===\n' : '=== DRY RUN (pass --apply to delete) ===\n');

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

  console.log(`Found ${groups.length} duplicate key group(s).\n`);

  let toDeleteTotal = 0;
  let deletedTotal = 0;

  for (const group of groups) {
    const docs = await col
      .find({ _id: { $in: group.ids } })
      .project({ _id: 1, createdAt: 1, updatedAt: 1, path: 1 })
      .toArray();

    docs.sort(compareNewestFirst);
    const [keep, ...drop] = docs;
    toDeleteTotal += drop.length;

    if (APPLY) {
      const result = await col.deleteMany({ _id: { $in: drop.map((d) => d._id) } });
      deletedTotal += result.deletedCount;
      console.log(`key=${group._id}  kept=${keep._id}  deleted=${result.deletedCount}`);
    } else {
      console.log(`key=${group._id}  would_keep=${keep._id}  would_delete=${drop.length}`);
    }
  }

  console.log();
  if (APPLY) {
    console.log(`Done. Deleted ${deletedTotal} duplicate row(s) across ${groups.length} group(s).`);
  } else {
    console.log(`Dry run summary: ${toDeleteTotal} row(s) would be deleted across ${groups.length} group(s).`);
    console.log('Re-run with --apply to actually delete.');
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('pruneMediaAssetDuplicates failed:', err);
  process.exit(1);
});
