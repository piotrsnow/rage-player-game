#!/usr/bin/env node
// Smoke test for the /v1/map-studio/import transport layer.
//
// Boots a minimal Fastify app with the same multipart registration used in
// src/server.js, wires up a stripped-down copy of the import route that skips
// Prisma/mediaStore side effects, and injects two requests:
//   1) multipart/form-data (browser transport) — meta field + image_0 part
//   2) application/json (CLI transport) — inline base64
//
// Used to verify the transport dispatch keeps working after the multipart
// refactor without requiring Atlas/Docker.
//
// Run: node backend/scripts/smoke-import-transport.mjs

import Fastify from 'fastify';
import fastifyMultipart from '@fastify/multipart';
import FormData from 'form-data';
import { ImportRequestSchema } from '../../shared/mapSchemas/index.js';

const MEDIA_BODY_LIMIT = 50 * 1024 * 1024;

// 1×1 transparent PNG so @fastify/multipart has real bytes to stream.
const TINY_PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489000000' +
    '0a49444154789c6300010000000500010d0a2db40000000049454e44ae426082',
  'hex'
);

function log(label, ok, detail = '') {
  const tag = ok ? 'PASS' : 'FAIL';
  const line = detail ? `${tag}  ${label}  — ${detail}` : `${tag}  ${label}`;
  console.log(line);
  if (!ok) process.exitCode = 1;
}

async function build() {
  const app = Fastify({ bodyLimit: MEDIA_BODY_LIMIT });

  await app.register(async (scope) => {
    await scope.register(fastifyMultipart, {
      limits: { fileSize: MEDIA_BODY_LIMIT, files: 50, fields: 10, fieldSize: 1 * 1024 * 1024 },
      attachFieldsToBody: false,
    });

    scope.post('/import', async (request, reply) => {
      const isMultipart = typeof request.isMultipart === 'function' && request.isMultipart();
      let body;
      let multipartBuffers = null;

      if (isMultipart) {
        let metaRaw = null;
        const buffersByIndex = new Map();
        const contentTypesByIndex = new Map();
        for await (const part of request.parts()) {
          if (part.type === 'field') {
            if (part.fieldname === 'meta') metaRaw = String(part.value ?? '');
            continue;
          }
          if (part.type === 'file') {
            const match = /^image_(\d+)$/.exec(part.fieldname || '');
            if (!match) { await part.toBuffer(); continue; }
            const idx = Number(match[1]);
            const buf = await part.toBuffer();
            buffersByIndex.set(idx, buf);
            contentTypesByIndex.set(idx, part.mimetype || 'image/png');
          }
        }
        if (!metaRaw) return reply.code(400).send({ error: 'missing meta' });
        const meta = JSON.parse(metaRaw);
        const parsed = ImportRequestSchema.safeParse(meta);
        if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues });
        body = parsed.data;
        multipartBuffers = [];
        for (let i = 0; i < body.tilesets.length; i++) {
          const buf = buffersByIndex.get(i);
          if (!buf) return reply.code(400).send({ error: `missing image_${i}` });
          multipartBuffers.push({ buffer: buf, contentType: contentTypesByIndex.get(i) });
        }
      } else {
        const parsed = ImportRequestSchema.safeParse(request.body);
        if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues });
        body = parsed.data;
        for (let i = 0; i < body.tilesets.length; i++) {
          if (!body.tilesets[i].imageBase64) {
            return reply.code(400).send({ error: `tilesets[${i}].imageBase64 required for JSON` });
          }
        }
      }

      return {
        transport: isMultipart ? 'multipart' : 'json',
        packName: body.packMeta?.name ?? null,
        targetPackId: body.targetPackId ?? null,
        tilesets: body.tilesets.map((t, i) => ({
          name: t.name,
          hasBase64: !!t.imageBase64,
          bufferSize: multipartBuffers ? multipartBuffers[i].buffer.length : null,
          contentType: multipartBuffers ? multipartBuffers[i].contentType : t.contentType,
          tiles: t.tiles?.length ?? 0,
        })),
      };
    });
  }, { prefix: '/v1/map-studio' });

  return app;
}

async function run() {
  const app = await build();

  try {
    // 1) Multipart — mirrors TilesetUpload.doImport + packZip.importPackZip.
    {
      const form = new FormData();
      const meta = {
        packMeta: {
          name: 'Smoke Multipart',
          projectTilesize: 24,
          scaleAlgo: 'nearest',
          origin: { source: 'png' },
        },
        tilesets: [
          {
            name: 'mp-tileset',
            contentType: 'image/png',
            nativeTilesize: 16,
            regions: [],
            tiles: [{ localId: 0, regionId: '', col: 0, row: 0, nativeSize: 16 }],
          },
        ],
      };
      form.append('meta', JSON.stringify(meta));
      form.append('image_0', TINY_PNG, { filename: 'tile.png', contentType: 'image/png' });

      const res = await app.inject({
        method: 'POST',
        url: '/v1/map-studio/import',
        headers: form.getHeaders(),
        payload: form.getBuffer(),
      });
      const body = res.json();
      log(
        'multipart → 200 + transport==multipart',
        res.statusCode === 200 && body.transport === 'multipart' && body.tilesets[0].bufferSize === TINY_PNG.length,
        `status=${res.statusCode} transport=${body.transport} bufLen=${body.tilesets[0].bufferSize}`
      );
    }

    // 2) JSON (CLI path) — mirrors mapapp/tools/import-tset.mjs.
    {
      const payload = {
        packMeta: {
          name: 'Smoke JSON',
          projectTilesize: 24,
          scaleAlgo: 'nearest',
          origin: { source: 'png' },
        },
        tilesets: [
          {
            name: 'json-tileset',
            imageBase64: TINY_PNG.toString('base64'),
            contentType: 'image/png',
            nativeTilesize: 16,
            regions: [],
            tiles: [{ localId: 0, regionId: '', col: 0, row: 0, nativeSize: 16 }],
          },
        ],
      };
      const res = await app.inject({
        method: 'POST',
        url: '/v1/map-studio/import',
        headers: { 'content-type': 'application/json' },
        payload,
      });
      const body = res.json();
      log(
        'json → 200 + transport==json',
        res.statusCode === 200 && body.transport === 'json' && body.tilesets[0].hasBase64 === true,
        `status=${res.statusCode} transport=${body.transport} hasBase64=${body.tilesets[0].hasBase64}`
      );
    }

    // 3) JSON without imageBase64 → should 400 (CLI contract).
    {
      const payload = {
        packMeta: { name: 'Smoke JSON bad', projectTilesize: 24, scaleAlgo: 'nearest', origin: { source: 'png' } },
        tilesets: [{ name: 'x', contentType: 'image/png', nativeTilesize: 16, regions: [] }],
      };
      const res = await app.inject({
        method: 'POST',
        url: '/v1/map-studio/import',
        headers: { 'content-type': 'application/json' },
        payload,
      });
      log(
        'json without imageBase64 → 400',
        res.statusCode === 400,
        `status=${res.statusCode}`
      );
    }

    // 4) Multipart without file part → should 400.
    {
      const form = new FormData();
      const meta = {
        packMeta: { name: 'Smoke MP bad', projectTilesize: 24, scaleAlgo: 'nearest', origin: { source: 'png' } },
        tilesets: [{ name: 'x', contentType: 'image/png', nativeTilesize: 16, regions: [] }],
      };
      form.append('meta', JSON.stringify(meta));
      const res = await app.inject({
        method: 'POST',
        url: '/v1/map-studio/import',
        headers: form.getHeaders(),
        payload: form.getBuffer(),
      });
      log(
        'multipart missing image_0 → 400',
        res.statusCode === 400,
        `status=${res.statusCode}`
      );
    }

    // 5) Larger multipart (~15 MB) — proves the parser handles the big-pack
    //    size tier without buffering everything through a base64 string. We
    //    synthesize one large PNG-shaped buffer; the upload is the part that
    //    needs to stream, not the raw bytes' validity.
    {
      const BIG = Buffer.alloc(15 * 1024 * 1024, 0xaa);
      const form = new FormData();
      const meta = {
        packMeta: { name: 'Smoke Big', projectTilesize: 24, scaleAlgo: 'nearest', origin: { source: 'png' } },
        tilesets: [
          { name: 'big', contentType: 'image/png', nativeTilesize: 16, regions: [] },
        ],
      };
      form.append('meta', JSON.stringify(meta));
      form.append('image_0', BIG, { filename: 'big.png', contentType: 'image/png' });

      const res = await app.inject({
        method: 'POST',
        url: '/v1/map-studio/import',
        headers: form.getHeaders(),
        payload: form.getBuffer(),
      });
      const body = res.json();
      log(
        'multipart 15 MB part → 200 + full buffer size',
        res.statusCode === 200 && body.tilesets[0].bufferSize === BIG.length,
        `status=${res.statusCode} bufLen=${body.tilesets?.[0]?.bufferSize}`
      );
    }
  } finally {
    await app.close();
  }
}

run().catch((err) => {
  console.error('smoke test threw:', err);
  process.exit(1);
});
