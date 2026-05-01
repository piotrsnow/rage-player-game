// CRUD for Tileset + region editing + variant rendering endpoint.
// POST /tilesets/:id/render?target=24 invokes the renderTileVariant service.

import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import {
  RegionArraySchema,
  TileSizeSchema,
  ScaleAlgoSchema,
  SliceModeSchema,
} from '../../../../shared/mapSchemas/index.js';
import {
  validateBody,
  requireObjectId,
  deserializeTileset,
  loadPackOwned,
  loadTilesetOwned,
} from './_helpers.js';
import { renderTileVariant, deleteTileVariant } from '../../services/mapStudio/renderTileVariant.js';

const TilesetCreateSchema = z.object({
  packId: z.string().regex(/^[a-f0-9]{24}$/i),
  name: z.string().trim().min(1).max(128),
  imageKey: z.string().min(1),
  imageWidth: z.number().int().nonnegative().default(0),
  imageHeight: z.number().int().nonnegative().default(0),
  nativeTilesize: TileSizeSchema.default(16),
  regions: RegionArraySchema,
  sliceMode: SliceModeSchema.default('whole'),
  atlas: z.record(z.string(), z.any()).optional().default({}),
});

const TilesetUpdateSchema = z.object({
  name: z.string().trim().min(1).max(128).optional(),
  nativeTilesize: TileSizeSchema.optional(),
  regions: RegionArraySchema.optional(),
  sliceMode: SliceModeSchema.optional(),
  atlas: z.record(z.string(), z.any()).optional(),
});

const RegionsUpdateSchema = z.object({ regions: RegionArraySchema });

export async function tilesetRoutes(fastify) {
  fastify.get('/', async (request, reply) => {
    const packId = requireObjectId(reply, request.query?.packId, 'packId');
    if (!packId) return;
    const pack = await loadPackOwned(prisma, packId, request.user.id);
    if (!pack) return reply.code(404).send({ error: 'Pack not found' });

    const rows = await prisma.tileset.findMany({
      where: { packId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(deserializeTileset);
  });

  fastify.get('/:id', async (request, reply) => {
    const id = requireObjectId(reply, request.params.id, 'tilesetId');
    if (!id) return;
    const res = await loadTilesetOwned(prisma, id, request.user.id);
    if (!res) return reply.code(404).send({ error: 'Tileset not found' });
    return deserializeTileset(res.tileset);
  });

  fastify.post('/', async (request, reply) => {
    const body = await validateBody(reply, TilesetCreateSchema, request.body);
    if (!body) return;
    const pack = await loadPackOwned(prisma, body.packId, request.user.id);
    if (!pack) return reply.code(404).send({ error: 'Pack not found' });

    const row = await prisma.tileset.create({
      data: {
        packId: body.packId,
        name: body.name,
        imageKey: body.imageKey,
        imageWidth: body.imageWidth,
        imageHeight: body.imageHeight,
        nativeTilesize: body.nativeTilesize,
        regions: JSON.stringify(body.regions ?? []),
        sliceMode: body.sliceMode,
        atlas: JSON.stringify(body.atlas ?? {}),
      },
    });
    return deserializeTileset(row);
  });

  fastify.patch('/:id', async (request, reply) => {
    const id = requireObjectId(reply, request.params.id, 'tilesetId');
    if (!id) return;
    const res = await loadTilesetOwned(prisma, id, request.user.id);
    if (!res) return reply.code(404).send({ error: 'Tileset not found' });

    const body = await validateBody(reply, TilesetUpdateSchema, request.body);
    if (!body) return;

    const data = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.nativeTilesize !== undefined) data.nativeTilesize = body.nativeTilesize;
    if (body.regions !== undefined) data.regions = JSON.stringify(body.regions);
    if (body.sliceMode !== undefined) data.sliceMode = body.sliceMode;
    if (body.atlas !== undefined) data.atlas = JSON.stringify(body.atlas);

    const row = await prisma.tileset.update({ where: { id }, data });
    return deserializeTileset(row);
  });

  // Dedicated regions endpoint — the Studio RegionEditor uses this after a
  // draw/resize session so we don't round-trip the full tileset blob.
  fastify.put('/:id/regions', async (request, reply) => {
    const id = requireObjectId(reply, request.params.id, 'tilesetId');
    if (!id) return;
    const res = await loadTilesetOwned(prisma, id, request.user.id);
    if (!res) return reply.code(404).send({ error: 'Tileset not found' });

    const body = await validateBody(reply, RegionsUpdateSchema, request.body);
    if (!body) return;

    const row = await prisma.tileset.update({
      where: { id },
      data: {
        regions: JSON.stringify(body.regions),
        sliceMode: body.regions.length > 0 ? 'regions' : 'whole',
      },
    });
    return deserializeTileset(row);
  });

  fastify.delete('/:id', async (request, reply) => {
    const id = requireObjectId(reply, request.params.id, 'tilesetId');
    if (!id) return;
    const res = await loadTilesetOwned(prisma, id, request.user.id);
    if (!res) return reply.code(404).send({ error: 'Tileset not found' });

    await prisma.tileset.delete({ where: { id } });
    return { success: true };
  });

  // POST /tilesets/:id/render?target=24&algo=nearest&force=1
  fastify.post('/:id/render', async (request, reply) => {
    const id = requireObjectId(reply, request.params.id, 'tilesetId');
    if (!id) return;
    const res = await loadTilesetOwned(prisma, id, request.user.id);
    if (!res) return reply.code(404).send({ error: 'Tileset not found' });

    const targetRaw = request.query?.target ?? request.body?.target;
    const target = Number(targetRaw);
    if (!Number.isInteger(target) || target < 4 || target > 256) {
      return reply.code(400).send({ error: 'target must be integer 4..256' });
    }
    const algoRaw = request.query?.algo || request.body?.algo;
    const algo = algoRaw ? ScaleAlgoSchema.parse(algoRaw) : undefined;
    const force = request.query?.force === '1' || request.query?.force === 'true';

    try {
      const result = await renderTileVariant({
        tilesetId: id,
        targetSize: target,
        algo,
        force,
      });
      return result;
    } catch (err) {
      request.log.warn({ err }, 'renderTileVariant failed');
      return reply.code(500).send({ error: err.message });
    }
  });

  fastify.delete('/:id/variants/:target', async (request, reply) => {
    const id = requireObjectId(reply, request.params.id, 'tilesetId');
    if (!id) return;
    const res = await loadTilesetOwned(prisma, id, request.user.id);
    if (!res) return reply.code(404).send({ error: 'Tileset not found' });

    const target = Number(request.params.target);
    if (!Number.isInteger(target)) {
      return reply.code(400).send({ error: 'target must be integer' });
    }
    const result = await deleteTileVariant({ tilesetId: id, targetSize: target });
    return result;
  });
}
