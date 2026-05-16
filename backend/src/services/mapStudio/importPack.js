// Shared "import a TilesetPack" service. Extracted from
// backend/src/routes/mapStudio/import.js so the field-map visual worker can
// build a pack under the campaign owner's userId without going back through
// the HTTP route (which still runs under the shared Map Studio pseudo-user).
//
// Inputs:
//   userId        — owner of the resulting TilesetPack (real campaign user).
//   packMeta      — { name, projectTilesize, scaleAlgo, origin } (optional).
//   tilesets      — [{ name, buffer, contentType, nativeTilesize, regions?, tiles? }]
//                   `buffer` is a Node Buffer (PNG bytes). No base64 here —
//                   callers pass raw bytes to avoid the 1.33× memory copy.
//   targetPackId  — optional, append-mode (must already belong to userId).
//
// Side effects:
//   - Writes MediaAsset rows (upsert keyed on content hash).
//   - Creates TilesetPack + Tileset + Tile rows.
//   - Kicks off renderTileVariant() in the background for each tileset.
//
// Returns the same shape the HTTP route returned: { pack, tilesets, renderTarget }.

import { createHash } from 'crypto';
import sharp from 'sharp';
import { prisma } from '../../lib/prisma.js';
import { createMediaStore } from '../mediaStore.js';
import { config } from '../../config.js';
import { pmap } from '../../routes/mapStudio/_helpers.js';
import { renderTileVariant } from './renderTileVariant.js';
import { childLogger } from '../../lib/logger.js';

const log = childLogger({ module: 'importPack' });
const store = createMediaStore(config);

function contentHashKey(buffer, ext = 'png') {
  const hash = createHash('sha256').update(buffer).digest('hex').slice(0, 24);
  return `tilesets-src/${hash}.${ext}`;
}

async function storeTilesetBuffer(userId, name, buffer, contentType = 'image/png') {
  const ext = contentType.split('/')[1] || 'png';
  const storagePath = contentHashKey(buffer, ext);
  const mediaKey = `tileset-src:${createHash('sha256').update(buffer).digest('hex').slice(0, 24)}`;

  await store.put(storagePath, buffer, contentType);

  const asset = await prisma.mediaAsset.upsert({
    where: { key: mediaKey },
    create: {
      userId,
      key: mediaKey,
      type: 'image',
      contentType,
      size: buffer.length,
      backend: config.mediaBackend,
      path: storagePath,
      metadata: { kind: 'tileset-src', name },
    },
    update: {
      size: buffer.length,
      path: storagePath,
      lastAccessedAt: new Date(),
    },
  });
  return { asset, buffer };
}

async function probeImageSize(buffer) {
  try {
    const meta = await sharp(buffer).metadata();
    return {
      width: Number.isFinite(meta.width) ? meta.width : 0,
      height: Number.isFinite(meta.height) ? meta.height : 0,
    };
  } catch {
    return { width: 0, height: 0 };
  }
}

async function resolveTargetPack({ userId, packMeta, targetPackId }) {
  if (targetPackId) {
    const pack = await prisma.tilesetPack.findFirst({
      where: { id: targetPackId, userId },
    });
    if (!pack) throw new Error(`Target pack ${targetPackId} not found or not owned by user`);
    return pack;
  }

  const desiredName = packMeta?.name || 'Imported Pack';
  const existing = await prisma.tilesetPack.findMany({
    where: { userId, name: { startsWith: desiredName } },
    select: { name: true },
  });
  let finalName = desiredName;
  if (existing.some((p) => p.name === desiredName)) {
    let i = 2;
    while (existing.some((p) => p.name === `${desiredName} (${i})`)) i++;
    finalName = `${desiredName} (${i})`;
  }

  return prisma.tilesetPack.create({
    data: {
      userId,
      name: finalName,
      projectTilesize: packMeta?.projectTilesize ?? 24,
      scaleAlgo: packMeta?.scaleAlgo ?? 'nearest',
      origin: packMeta?.origin ?? { source: 'png' },
      traitVocab: {},
    },
  });
}

/**
 * Look up a pack by deterministic name (used by visual worker for idempotent
 * upsert: same campaign + location → same pack).
 */
export async function findPackByName(userId, name) {
  return prisma.tilesetPack.findFirst({ where: { userId, name } });
}

/**
 * Import / append tilesets into a TilesetPack belonging to `userId`.
 *
 * Variant rendering at `pack.projectTilesize` is fired in the background
 * (best-effort, errors are logged but don't fail the import). Callers that
 * need synchronous variants should `await renderTileVariant` themselves.
 */
export async function importTilesetPack({ userId, packMeta = {}, tilesets, targetPackId }) {
  if (!userId) throw new Error('importTilesetPack: userId required');
  if (!Array.isArray(tilesets) || tilesets.length === 0) {
    throw new Error('importTilesetPack: at least one tileset required');
  }

  const pack = await resolveTargetPack({ userId, packMeta, targetPackId });

  const createdTilesets = await pmap(tilesets, 4, async (t) => {
    if (!Buffer.isBuffer(t.buffer)) {
      throw new Error(`Tileset "${t.name}": buffer must be a Node Buffer`);
    }
    const { asset, buffer } = await storeTilesetBuffer(
      userId,
      t.name,
      t.buffer,
      t.contentType || 'image/png',
    );
    const { width, height } = await probeImageSize(buffer);

    const tileset = await prisma.tileset.create({
      data: {
        packId: pack.id,
        name: t.name,
        imageKey: asset.key,
        imageWidth: width,
        imageHeight: height,
        nativeTilesize: t.nativeTilesize ?? 16,
        regions: t.regions ?? [],
        sliceMode: (t.regions ?? []).length > 0 ? 'regions' : 'whole',
        atlas: {},
      },
    });

    await Promise.all([
      Array.isArray(t.tiles) && t.tiles.length
        ? prisma.tile.createMany({
            data: t.tiles.map((tile) => ({
              tilesetId: tileset.id,
              localId: tile.localId,
              regionId: tile.regionId ?? '',
              col: tile.col ?? 0,
              row: tile.row ?? 0,
              nativeSize: tile.nativeSize ?? (t.nativeTilesize ?? 16),
            })),
          })
        : Promise.resolve(),
      Array.isArray(t.autotileGroups) && t.autotileGroups.length
        ? pmap(t.autotileGroups, 8, (g) =>
            prisma.autotileGroup.create({
              data: {
                tilesetId: tileset.id,
                regionId: g.regionId ?? '',
                name: g.name,
                layout: g.layout ?? 'blob_47',
                originCol: g.originCol ?? 0,
                originRow: g.originRow ?? 0,
                traits: {},
              },
            }),
          )
        : Promise.resolve(),
    ]);

    return tileset;
  });

  // Defer variant rendering — sharp is CPU-bound. Whoever called us doesn't
  // need to wait; the worker / route can poll Tileset.renderedVariants.
  for (const ts of createdTilesets) {
    renderTileVariant({
      tilesetId: ts.id,
      targetSize: pack.projectTilesize,
      algo: pack.scaleAlgo,
    }).catch((err) => {
      log.warn({ err, tilesetId: ts.id, target: pack.projectTilesize },
        'background renderTileVariant failed');
    });
  }

  return {
    pack,
    tilesets: createdTilesets,
    renderTarget: pack.projectTilesize,
  };
}
