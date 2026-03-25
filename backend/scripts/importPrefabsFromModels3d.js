/**
 * Imports local GLB prefabs from ../3dmodels into shared GCS storage
 * and syncs them into the global PrefabAsset collection.
 *
 * Usage:
 *   node --env-file=.env scripts/importPrefabsFromModels3d.js
 *   node --env-file=.env scripts/importPrefabsFromModels3d.js --dry-run
 *   node --env-file=.env scripts/importPrefabsFromModels3d.js --prefix prefabs
 */

import 'dotenv/config';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Storage } from '@google-cloud/storage';

import { prisma } from '../src/lib/prisma.js';
import { config } from '../src/config.js';
import { createMediaStore } from '../src/services/mediaStore.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const FORCE = args.includes('--force');
const sourceDir = path.resolve(__dirname, getArgValue('--source') || '../3dmodels');
const storageRootPrefix = sanitizePrefix(getArgValue('--prefix') || 'prefabs');

const store = createMediaStore(config);
const syncedStoragePaths = new Set();
const stats = {
  localFilesFound: 0,
  localRenamed: 0,
  localUploaded: 0,
  localUploadSkipped: 0,
  localDeleted: 0,
  gcsFilesFound: 0,
  dbSynced: 0,
  dbSkipped: 0,
  failed: 0,
  failures: [],
};

function getArgValue(flag) {
  const index = args.indexOf(flag);
  if (index === -1) return '';
  return args[index + 1] || '';
}

function sanitizePrefix(value) {
  return String(value || 'prefabs')
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '')
    .replace(/\/{2,}/g, '/');
}

function sanitizePathSegment(segment) {
  return String(segment || '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/[^a-zA-Z0-9_.-]/g, '_')
    .replace(/^[_\-.]+|[_\-.]+$/g, '');
}

function sanitizeRelativeDir(relativeDir) {
  if (!relativeDir || relativeDir === '.') return '';

  return relativeDir
    .replace(/\\/g, '/')
    .split('/')
    .map(sanitizePathSegment)
    .filter(Boolean)
    .join('/');
}

function sanitizeFileName(fileName) {
  const ext = path.extname(fileName).toLowerCase() || '.glb';
  const baseName = path.basename(fileName, ext);

  let cleaned = baseName.replace(/^Meshy_AI__+/i, '');
  cleaned = cleaned.replace(/(?:[_\s-]?\d+)$/, '');
  cleaned = sanitizePathSegment(cleaned);

  if (!cleaned) {
    cleaned = 'model';
  }

  return `${cleaned}${ext}`;
}

function splitFileName(fileName) {
  const ext = path.extname(fileName).toLowerCase() || '.glb';
  const base = path.basename(fileName, ext);
  return { base, ext };
}

function withSuffix(fileName, suffix) {
  const { base, ext } = splitFileName(fileName);
  return `${base}${suffix}${ext}`;
}

function buildStoragePath(relativeDir, fileName) {
  return [storageRootPrefix, sanitizeRelativeDir(relativeDir), fileName]
    .filter(Boolean)
    .join('/');
}

function buildPrefabKey(storagePath) {
  return storagePath;
}

function getCategoryFromStoragePath(storagePath) {
  const relativePath = storagePath.startsWith(`${storageRootPrefix}/`)
    ? storagePath.slice(storageRootPrefix.length + 1)
    : storagePath;
  const [category = 'uncategorized'] = relativePath.split('/');
  return category || 'uncategorized';
}

function createGcpBucket() {
  const options = {};
  if (config.gcpServiceAccountKey) {
    options.credentials = JSON.parse(config.gcpServiceAccountKey);
  } else if (config.googleApplicationCredentials) {
    options.keyFilename = config.googleApplicationCredentials;
  }

  const storage = new Storage(options);
  return storage.bucket(config.gcsBucketName);
}

async function ensurePreconditions() {
  if (config.mediaBackend !== 'gcp') {
    throw new Error('This script requires MEDIA_BACKEND=gcp.');
  }

  if (!config.gcsBucketName) {
    throw new Error('GCS_BUCKET_NAME is required.');
  }
}

async function collectGlbFiles(dir) {
  const dirStats = await fs.stat(dir).catch(() => null);
  if (!dirStats?.isDirectory()) {
    return [];
  }

  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectGlbFiles(fullPath));
      continue;
    }

    if (entry.isFile() && path.extname(entry.name).toLowerCase() === '.glb') {
      files.push(fullPath);
    }
  }

  return files.sort((a, b) => a.localeCompare(b));
}

function buildLocalEntries(files) {
  const rawEntries = files.map((filePath) => {
    const relativePath = path.relative(sourceDir, filePath);
    const relativeDir = path.dirname(relativePath);
    const sanitizedFileName = sanitizeFileName(path.basename(filePath));

    return {
      originalPath: filePath,
      originalFileName: path.basename(filePath),
      relativePath: relativePath.replace(/\\/g, '/'),
      relativeDir: relativeDir.replace(/\\/g, '/'),
      sanitizedBaseFileName: sanitizedFileName,
    };
  });

  const nameCounters = new Map();

  return rawEntries.map((entry) => {
    const dirKey = entry.relativeDir.toLowerCase();
    const nameKey = `${dirKey}::${entry.sanitizedBaseFileName.toLowerCase()}`;
    const nextCount = (nameCounters.get(nameKey) || 0) + 1;
    nameCounters.set(nameKey, nextCount);

    const sanitizedFileName = nextCount === 1
      ? entry.sanitizedBaseFileName
      : withSuffix(entry.sanitizedBaseFileName, `_dup${nextCount}`);

    const renamedPath = path.join(path.dirname(entry.originalPath), sanitizedFileName);
    const storagePath = buildStoragePath(entry.relativeDir, sanitizedFileName);

    return {
      ...entry,
      sanitizedFileName,
      renamedPath,
      renamed: entry.originalFileName !== sanitizedFileName,
      storagePath,
      key: buildPrefabKey(storagePath),
      category: getCategoryFromStoragePath(storagePath),
    };
  });
}

function ensureNoCollisions(entries) {
  const renamedTargets = new Map();
  const storageTargets = new Map();

  for (const entry of entries) {
    const renamedKey = entry.renamedPath.toLowerCase();
    const storageKey = entry.storagePath.toLowerCase();

    if (renamedTargets.has(renamedKey)) {
      throw new Error(
        `Rename collision: "${entry.originalFileName}" conflicts with "${renamedTargets.get(renamedKey)}"`,
      );
    }

    if (storageTargets.has(storageKey)) {
      throw new Error(
        `Storage collision: "${entry.storagePath}" generated more than once`,
      );
    }

    renamedTargets.set(renamedKey, entry.originalFileName);
    storageTargets.set(storageKey, entry.originalFileName);
  }
}

async function renameLocalFile(entry) {
  if (!entry.renamed) {
    return entry.originalPath;
  }

  const destinationExists = await fs.stat(entry.renamedPath).catch(() => null);
  if (destinationExists && entry.originalPath !== entry.renamedPath) {
    throw new Error(`Cannot rename, destination already exists: ${entry.renamedPath}`);
  }

  if (DRY_RUN) {
    return entry.originalPath;
  }

  await fs.rename(entry.originalPath, entry.renamedPath);
  stats.localRenamed++;
  return entry.renamedPath;
}

async function deleteLocalFile(localPath) {
  if (DRY_RUN) {
    return;
  }

  await fs.unlink(localPath);
  stats.localDeleted++;
}

async function upsertPrefabAssetForPath(entry, size, metadata) {
  if (DRY_RUN) {
    stats.dbSkipped++;
    syncedStoragePaths.add(entry.storagePath);
    return;
  }

  const existingByPath = await prisma.prefabAsset.findUnique({
    where: { path: entry.storagePath },
  });

  const payload = {
    key: entry.key,
    category: entry.category,
    fileName: entry.sanitizedFileName || entry.originalFileName,
    contentType: 'model/gltf-binary',
    size,
    backend: config.mediaBackend,
    path: entry.storagePath,
    metadata: JSON.stringify(metadata),
    lastAccessedAt: new Date(),
  };

  if (existingByPath) {
    await prisma.prefabAsset.update({
      where: { path: entry.storagePath },
      data: payload,
    });
  } else {
    await prisma.prefabAsset.upsert({
      where: { key: entry.key },
      create: {
        ...payload,
      },
      update: payload,
    });
  }

  stats.dbSynced++;
  syncedStoragePaths.add(entry.storagePath);
}

async function processLocalEntry(entry, index) {
  try {
    const localPath = await renameLocalFile(entry);
    const buffer = await fs.readFile(localPath);
    const existsInStore = FORCE ? false : await store.has(entry.storagePath);

    if (!existsInStore && !DRY_RUN) {
      await store.put(entry.storagePath, buffer, 'model/gltf-binary');
      stats.localUploaded++;
    } else {
      stats.localUploadSkipped++;
    }

    await upsertPrefabAssetForPath(entry, buffer.length, {
      source: 'models3d-import',
      imported: true,
      originalFileName: entry.originalFileName,
      storedFileName: entry.sanitizedFileName,
      category: entry.category,
      sourceRelativePath: entry.relativePath,
      storagePath: entry.storagePath,
      storageRootPrefix,
    });

    await deleteLocalFile(localPath);

    const action = entry.renamed
      ? `${entry.originalFileName} -> ${entry.sanitizedFileName}`
      : entry.sanitizedFileName;

    console.log(
      `[local ${index + 1}/${stats.localFilesFound}] OK ${action} -> ${entry.storagePath}${DRY_RUN ? ' (dry-run)' : ''}`,
    );
  } catch (error) {
    stats.failed++;
    stats.failures.push({ file: entry.originalFileName, error: error.message });
    console.error(`[local ${index + 1}/${stats.localFilesFound}] FAIL ${entry.originalFileName}: ${error.message}`);
  }
}

async function listExistingGcsGlbs(bucket) {
  const prefix = `${storageRootPrefix}/`;
  const [files] = await bucket.getFiles({ prefix });

  return files
    .filter((file) => !file.name.endsWith('/'))
    .filter((file) => path.extname(file.name).toLowerCase() === '.glb')
    .sort((a, b) => a.name.localeCompare(b.name));
}

function buildGcsEntry(storagePath) {
  const prefixWithSlash = `${storageRootPrefix}/`;
  return {
    storagePath,
    key: buildPrefabKey(storagePath),
    category: getCategoryFromStoragePath(storagePath),
    originalFileName: path.basename(storagePath),
    relativePath: storagePath.startsWith(prefixWithSlash)
      ? storagePath.slice(prefixWithSlash.length)
      : storagePath,
  };
}

async function processExistingGcsFile(file, index) {
  try {
    const storagePath = file.name.replace(/\\/g, '/');

    if (syncedStoragePaths.has(storagePath)) {
      return;
    }

    const size = parseInt(file.metadata?.size || '0', 10);
    const entry = buildGcsEntry(storagePath);

    await upsertPrefabAssetForPath(entry, size, {
      source: 'gcs-sync',
      imported: true,
      originalFileName: entry.originalFileName,
      category: entry.category,
      storagePath,
      storageRootPrefix,
      sourceRelativePath: entry.relativePath,
    });

    console.log(
      `[gcs   ${index + 1}/${stats.gcsFilesFound}] OK ${storagePath}${DRY_RUN ? ' (dry-run)' : ''}`,
    );
  } catch (error) {
    stats.failed++;
    stats.failures.push({ file: file.name, error: error.message });
    console.error(`[gcs   ${index + 1}/${stats.gcsFilesFound}] FAIL ${file.name}: ${error.message}`);
  }
}

async function main() {
  await ensurePreconditions();

  const bucket = createGcpBucket();
  const localFiles = await collectGlbFiles(sourceDir);
  const localEntries = buildLocalEntries(localFiles);
  const gcsFiles = await listExistingGcsGlbs(bucket);

  ensureNoCollisions(localEntries);

  stats.localFilesFound = localEntries.length;
  stats.gcsFilesFound = gcsFiles.length;

  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║     Local GLB Import + Existing GCS DB Sync     ║');
  console.log('╠══════════════════════════════════════════════════╣');
  console.log(`║  Source: ${sourceDir.padEnd(40).slice(0, 40)}║`);
  console.log(`║  Prefix: ${storageRootPrefix.padEnd(40).slice(0, 40)}║`);
  console.log(`║  Local:  ${String(localEntries.length).padEnd(40).slice(0, 40)}║`);
  console.log(`║  GCS:    ${String(gcsFiles.length).padEnd(40).slice(0, 40)}║`);
  console.log(`║  Dry:    ${String(DRY_RUN).padEnd(40).slice(0, 40)}║`);
  console.log(`║  Force:  ${String(FORCE).padEnd(40).slice(0, 40)}║`);
  console.log('╚══════════════════════════════════════════════════╝');

  if (localEntries.length === 0) {
    console.log(`No local GLB files found in ${sourceDir}, skipping local import.`);
  }

  for (const [index, entry] of localEntries.entries()) {
    await processLocalEntry(entry, index);
  }

  for (const [index, file] of gcsFiles.entries()) {
    await processExistingGcsFile(file, index);
  }

  console.log('\nSummary');
  console.log(`  Local found:      ${stats.localFilesFound}`);
  console.log(`  Local renamed:    ${stats.localRenamed}`);
  console.log(`  Local uploaded:   ${stats.localUploaded}`);
  console.log(`  Upload skipped:   ${stats.localUploadSkipped}`);
  console.log(`  Local deleted:    ${stats.localDeleted}`);
  console.log(`  GCS found:        ${stats.gcsFilesFound}`);
  console.log(`  DB synced:        ${stats.dbSynced}`);
  console.log(`  DB skipped:       ${stats.dbSkipped}`);
  console.log(`  Failed:           ${stats.failed}`);

  if (stats.failures.length > 0) {
    console.log('\nFailures:');
    for (const failure of stats.failures) {
      console.log(`  - ${failure.file}: ${failure.error}`);
    }
  }
}

main()
  .catch((error) => {
    console.error('Fatal error:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
