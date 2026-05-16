// POST /import — create a TilesetPack with one or more Tilesets in a single
// call. Accepts base64-encoded PNGs (image/png) per-tileset. Each PNG gets
// saved as a MediaAsset and referenced from Tileset.imageKey.
//
// Variant rendering (projectTilesize) happens async in the background so
// we can return the packId immediately. Client polls tileset.renderedVariants
// or re-fetches until the target size appears.
//
// Thin wrapper around services/mapStudio/importPack.js — the shared service
// is also called by the field-map visual worker under the campaign owner's
// userId. Keeping core logic out of the HTTP route avoids duplicating disk
// I/O / sharp probes in two places.

import { ImportRequestSchema } from '../../../../shared/mapSchemas/index.js';
import {
  validateBody,
  deserializePack,
  deserializeTileset,
} from './_helpers.js';
import { importTilesetPack } from '../../services/mapStudio/importPack.js';

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
      for (let i = 0; i < body.tilesets.length; i++) {
        if (!body.tilesets[i].imageBase64) {
          return reply.code(400).send({
            error: `tilesets[${i}].imageBase64 is required for JSON import (or use multipart/form-data)`,
          });
        }
      }
    }

    // Materialize each tileset into the buffer shape importTilesetPack expects.
    const tilesetInputs = body.tilesets.map((t, i) => {
      const transport = multipartBuffers
        ? { buffer: multipartBuffers[i].buffer, contentType: multipartBuffers[i].contentType || t.contentType || 'image/png' }
        : { buffer: Buffer.from(t.imageBase64, 'base64'), contentType: t.contentType || 'image/png' };
      return {
        name: t.name,
        buffer: transport.buffer,
        contentType: transport.contentType,
        nativeTilesize: t.nativeTilesize ?? 16,
        regions: t.regions ?? [],
        tiles: t.tiles,
        autotileGroups: t.autotileGroups,
      };
    });

    const { pack, tilesets, renderTarget } = await importTilesetPack({
      userId: request.user.id,
      packMeta: body.packMeta ?? {},
      tilesets: tilesetInputs,
      targetPackId: body.targetPackId,
    });

    return {
      pack: deserializePack(pack),
      tilesets: tilesets.map(deserializeTileset),
      renderTarget,
    };
  });
}
