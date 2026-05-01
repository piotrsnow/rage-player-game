// POST /import — create a TilesetPack with one or more Tilesets in a single
// call. Accepts base64-encoded PNGs (image/png) per-tileset. Each PNG gets
// saved as a MediaAsset and referenced from Tileset.imageKey.
//
// Variant rendering (projectTilesize) happens async in the background so
// we can return the packId immediately. Client polls tileset.renderedVariants
// or re-fetches until the target size appears.

import { createHash } from 'crypto';
import sharp from 'sharp';
import { prisma } from '../../lib/prisma.js';
import { createMediaStore } from '../../services/mediaStore.js';
import { config } from '../../config.js';
import { ImportRequestSchema } from '../../../../shared/mapSchemas/index.js';
import {
  validateBody,
  deserializePack,
  deserializeTileset,
  requireObjectId,
  loadPackOwned,
  pmap,
} from './_helpers.js';
import { renderTileVariant } from '../../services/mapStudio/renderTileVariant.js';

const store = createMediaStore(config);

function contentHashKey(buffer, ext = 'png') {
  const hash = createHash('sha256').update(buffer).digest('hex').slice(0, 24);
  return `tilesets-src/${hash}.${ext}`;
}

/**
 * Persist a raw PNG buffer as a MediaAsset. Shared between the multipart
 * (streamed file part) and JSON (base64) transports so we never decode
 * base64 on the multipart path (avoids an extra ~1.33× memory copy of
 * every upload).
 */
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
      metadata: JSON.stringify({ kind: 'tileset-src', name }),
    },
    update: {
      size: buffer.length,
      path: storagePath,
      lastAccessedAt: new Date(),
    },
  });
  return { asset, buffer };
}

async function storeTilesetImage(userId, name, imageBase64, contentType = 'image/png') {
  const buffer = Buffer.from(imageBase64, 'base64');
  return storeTilesetBuffer(userId, name, buffer, contentType);
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

/**
 * Consume a multipart/form-data import request. Expects one `meta` text
 * field (JSON string matching the legacy JSON body, minus `imageBase64`)
 * and one file part per tileset named `image_<index>`. The browser path
 * uses this transport so `File` bytes stream straight from the socket into
 * a Node Buffer without an intermediate base64 string.
 *
 * Returns the validated body object with a parallel `buffers` array (one
 * Buffer per tileset, indexed to match body.tilesets). Sends a 400 and
 * returns null on validation failure.
 */
async function parseMultipartImport(request, reply) {
  let metaRaw = null;
  const buffersByIndex = new Map();
  const contentTypesByIndex = new Map();

  try {
    for await (const part of request.parts()) {
      if (part.type === 'field') {
        if (part.fieldname === 'meta') {
          metaRaw = String(part.value ?? '');
        }
        continue;
      }
      if (part.type === 'file') {
        const match = /^image_(\d+)$/.exec(part.fieldname || '');
        if (!match) {
          // Drain unexpected files so the stream doesn't stall.
          await part.toBuffer();
          continue;
        }
        const idx = Number(match[1]);
        const buf = await part.toBuffer();
        buffersByIndex.set(idx, buf);
        contentTypesByIndex.set(idx, part.mimetype || 'image/png');
      }
    }
  } catch (err) {
    reply.code(400).send({ error: `Multipart parse failed: ${err.message}` });
    return null;
  }

  if (!metaRaw) {
    reply.code(400).send({ error: 'Multipart import missing `meta` field' });
    return null;
  }

  let meta;
  try {
    meta = JSON.parse(metaRaw);
  } catch (err) {
    reply.code(400).send({ error: `Invalid \`meta\` JSON: ${err.message}` });
    return null;
  }

  const body = await validateBody(reply, ImportRequestSchema, meta);
  if (!body) return null;

  const buffers = [];
  for (let i = 0; i < body.tilesets.length; i++) {
    const buf = buffersByIndex.get(i);
    if (!buf || !buf.length) {
      reply.code(400).send({
        error: `Multipart import missing file part for tileset ${i} (expected field \`image_${i}\`)`,
      });
      return null;
    }
    buffers.push({ buffer: buf, contentType: contentTypesByIndex.get(i) || 'image/png' });
  }

  return { body, buffers };
}

export async function importRoutes(fastify) {
  fastify.post('/', async (request, reply) => {
    // Transport dispatch — multipart (browser, memory-efficient) vs JSON
    // (CLI `mapapp/tools/import-tset.mjs`, keeps backward compat). Both
    // end up with the same validated `body` shape; only the way we obtain
    // tileset image bytes differs.
    const isMultipart = typeof request.isMultipart === 'function' && request.isMultipart();
    let body;
    let multipartBuffers = null;
    if (isMultipart) {
      const parsed = await parseMultipartImport(request, reply);
      if (!parsed) return;
      body = parsed.body;
      multipartBuffers = parsed.buffers;
    } else {
      body = await validateBody(reply, ImportRequestSchema, request.body);
      if (!body) return;
      // JSON transport requires inline base64 for every tileset. Enforce
      // here (rather than in the schema) so multipart stays valid without
      // imageBase64.
      for (let i = 0; i < body.tilesets.length; i++) {
        if (!body.tilesets[i].imageBase64) {
          return reply.code(400).send({
            error: `tilesets[${i}].imageBase64 is required for JSON import (or use multipart/form-data)`,
          });
        }
      }
    }

    const packMeta = body.packMeta ?? {};

    // Resolve the target pack — either an existing one (append mode) or a
    // brand-new one created from packMeta.
    let pack;
    if (body.targetPackId) {
      const id = requireObjectId(reply, body.targetPackId, 'targetPackId');
      if (!id) return;
      pack = await loadPackOwned(prisma, id, request.user.id);
      if (!pack) return reply.code(404).send({ error: 'Target pack not found' });
    } else {
      // Deduplicate against user's existing packs by name — if one already
      // exists, suffix with "(2)", "(3)" etc. so double-clicks on Import
      // don't litter the sidebar with identical entries.
      const desiredName = packMeta.name || 'Imported Pack';
      const existing = await prisma.tilesetPack.findMany({
        where: { userId: request.user.id, name: { startsWith: desiredName } },
        select: { name: true },
      });
      let finalName = desiredName;
      if (existing.some((p) => p.name === desiredName)) {
        let i = 2;
        while (existing.some((p) => p.name === `${desiredName} (${i})`)) i++;
        finalName = `${desiredName} (${i})`;
      }

      pack = await prisma.tilesetPack.create({
        data: {
          userId: request.user.id,
          name: finalName,
          projectTilesize: packMeta.projectTilesize ?? 24,
          scaleAlgo: packMeta.scaleAlgo ?? 'nearest',
          origin: JSON.stringify(packMeta.origin ?? { source: 'png' }),
          traitVocab: JSON.stringify({}),
        },
      });
    }

    // Process tilesets in parallel. Each tileset's work (store PNG, probe
    // size, create rows, seed tiles, seed groups) is independent; the only
    // shared state is `pack.id`. `pmap` caps concurrency to avoid blowing
    // past the Mongo connection pool when a ZIP ships a dozen tilesets.
    const createdTilesets = await pmap(body.tilesets, 4, async (t, i) => {
      const { asset, buffer } = multipartBuffers
        ? await storeTilesetBuffer(
            request.user.id,
            t.name,
            multipartBuffers[i].buffer,
            multipartBuffers[i].contentType || t.contentType || 'image/png'
          )
        : await storeTilesetImage(
            request.user.id,
            t.name,
            t.imageBase64,
            t.contentType || 'image/png'
          );

      // Probe actual PNG dimensions. Using explicit sizes from the payload
      // would be nicer but the current ImportRequestSchema doesn't carry
      // them — sharp probe is cheap on an already-decoded buffer.
      const { width, height } = await probeImageSize(buffer);

      const tileset = await prisma.tileset.create({
        data: {
          packId: pack.id,
          name: t.name,
          imageKey: asset.key,
          imageWidth: width,
          imageHeight: height,
          nativeTilesize: t.nativeTilesize ?? 16,
          regions: JSON.stringify(t.regions ?? []),
          sliceMode: (t.regions ?? []).length > 0 ? 'regions' : 'whole',
          atlas: JSON.stringify({}),
        },
      });

      // Seed tiles + autotile groups in parallel — they're independent
      // child-row writes keyed off the same `tileset.id`.
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
                  traits: JSON.stringify({}),
                },
              })
            )
          : Promise.resolve(),
      ]);

      return tileset;
    });

    const response = {
      pack: deserializePack(pack),
      tilesets: createdTilesets.map(deserializeTileset),
      renderTarget: pack.projectTilesize,
    };

    // Defer variant rendering until after the HTTP response has flushed.
    // Sharp is CPU-bound and can stall the event loop for large atlases —
    // running it inline would make the client perceive the import as
    // "never finishing" even though the data is already saved.
    reply.raw.on('finish', () => {
      for (const ts of createdTilesets) {
        renderTileVariant({
          tilesetId: ts.id,
          targetSize: pack.projectTilesize,
          algo: pack.scaleAlgo,
        }).catch((err) => {
          fastify.log.warn(
            { err, tilesetId: ts.id, target: pack.projectTilesize },
            'background renderTileVariant failed'
          );
        });
      }
    });

    return response;
  });
}
