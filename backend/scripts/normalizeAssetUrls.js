#!/usr/bin/env node
/**
 * One-shot backfill — normalize legacy asset URLs in the database.
 *
 * Historic FE clients persisted fully-hydrated URLs like
 *   `http://backend:3001/v1/media/file/xxx.jpg?token=<JWT>`
 * into `Character.portraitUrl`, `CharacterInventoryItem.imageUrl` and
 * `CampaignScene.imageUrl`. This script strips them back to the canonical
 * `/v1/media/file/xxx.jpg` form so records survive backend host changes and
 * don't leak user JWTs to other players.
 *
 * Usage:
 *   node backend/scripts/normalizeAssetUrls.js           # dry-run (prints diffs)
 *   node backend/scripts/normalizeAssetUrls.js --apply   # actually writes updates
 *
 * Idempotent — rows already using canonical paths are skipped.
 */

import { PrismaClient } from '@prisma/client';
import { toCanonicalStoragePath } from '../src/services/urlCanonical.js';

const prisma = new PrismaClient();

const APPLY = process.argv.includes('--apply');

function needsNormalization(url) {
  if (!url || typeof url !== 'string') return false;
  const canonical = toCanonicalStoragePath(url);
  return canonical !== url;
}

async function backfillCharacters() {
  const rows = await prisma.character.findMany({
    where: { portraitUrl: { not: '' } },
    select: { id: true, name: true, portraitUrl: true },
  });

  let changed = 0;
  for (const row of rows) {
    if (!needsNormalization(row.portraitUrl)) continue;
    const next = toCanonicalStoragePath(row.portraitUrl);
    console.log(`  Character ${row.id} (${row.name})`);
    console.log(`    from: ${row.portraitUrl.slice(0, 120)}${row.portraitUrl.length > 120 ? '…' : ''}`);
    console.log(`    to:   ${next}`);
    if (APPLY) {
      await prisma.character.update({
        where: { id: row.id },
        data: { portraitUrl: next },
      });
    }
    changed += 1;
  }
  console.log(`[characters] ${changed} row(s) ${APPLY ? 'updated' : 'would be updated'} (scanned ${rows.length})`);
  return changed;
}

async function backfillInventoryItems() {
  const rows = await prisma.characterInventoryItem.findMany({
    where: { imageUrl: { not: null } },
    select: { characterId: true, itemKey: true, imageUrl: true },
  });

  let changed = 0;
  for (const row of rows) {
    if (!needsNormalization(row.imageUrl)) continue;
    const next = toCanonicalStoragePath(row.imageUrl);
    console.log(`  InventoryItem ${row.characterId}/${row.itemKey}`);
    console.log(`    from: ${row.imageUrl.slice(0, 120)}${row.imageUrl.length > 120 ? '…' : ''}`);
    console.log(`    to:   ${next}`);
    if (APPLY) {
      await prisma.characterInventoryItem.update({
        where: { characterId_itemKey: { characterId: row.characterId, itemKey: row.itemKey } },
        data: { imageUrl: next },
      });
    }
    changed += 1;
  }
  console.log(`[inventory] ${changed} row(s) ${APPLY ? 'updated' : 'would be updated'} (scanned ${rows.length})`);
  return changed;
}

async function backfillScenes() {
  const rows = await prisma.campaignScene.findMany({
    where: { imageUrl: { not: null } },
    select: { id: true, campaignId: true, sceneIndex: true, imageUrl: true },
  });

  let changed = 0;
  for (const row of rows) {
    if (!needsNormalization(row.imageUrl)) continue;
    const next = toCanonicalStoragePath(row.imageUrl);
    console.log(`  CampaignScene ${row.id} (campaign=${row.campaignId}, idx=${row.sceneIndex})`);
    console.log(`    from: ${row.imageUrl.slice(0, 120)}${row.imageUrl.length > 120 ? '…' : ''}`);
    console.log(`    to:   ${next}`);
    if (APPLY) {
      await prisma.campaignScene.update({
        where: { id: row.id },
        data: { imageUrl: next },
      });
    }
    changed += 1;
  }
  console.log(`[scenes] ${changed} row(s) ${APPLY ? 'updated' : 'would be updated'} (scanned ${rows.length})`);
  return changed;
}

async function main() {
  console.log(`\n=== Normalize asset URLs ${APPLY ? '(APPLY)' : '(dry-run)'} ===\n`);

  const characters = await backfillCharacters();
  const inventory = await backfillInventoryItems();
  const scenes = await backfillScenes();

  const total = characters + inventory + scenes;
  console.log(`\nTotal: ${total} row(s) ${APPLY ? 'updated' : 'would be updated'}.`);
  if (!APPLY && total > 0) {
    console.log('Re-run with `--apply` to persist changes.');
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
