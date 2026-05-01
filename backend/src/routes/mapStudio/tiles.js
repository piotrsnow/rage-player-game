// Tile listing + bulk metadata updates. The Studio Inspector hammers this
// endpoint with debounced bulk patches (up to 5000 tiles per call).

import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import {
  TileBulkPatchSchema,
  TileSchema,
  ObjectIdSchema,
  TileSizeSchema,
} from '../../../../shared/mapSchemas/index.js';
import {
  validateBody,
  requireObjectId,
  deserializeTile,
  loadTilesetOwned,
  pmap,
} from './_helpers.js';

const TileCreateSchema = z.object({
  tilesetId: ObjectIdSchema,
  localId: z.number().int().nonnegative(),
  regionId: z.string().default(''),
  col: z.number().int().nonnegative().default(0),
  row: z.number().int().nonnegative().default(0),
  nativeSize: TileSizeSchema.default(16),
});

export async function tileRoutes(fastify) {
  fastify.get('/', async (request, reply) => {
    const tilesetId = requireObjectId(reply, request.query?.tilesetId, 'tilesetId');
    if (!tilesetId) return;
    const res = await loadTilesetOwned(prisma, tilesetId, request.user.id);
    if (!res) return reply.code(404).send({ error: 'Tileset not found' });

    const rows = await prisma.tile.findMany({
      where: { tilesetId },
      orderBy: { localId: 'asc' },
    });
    return rows.map(deserializeTile);
  });

  fastify.post('/', async (request, reply) => {
    const body = await validateBody(reply, TileCreateSchema, request.body);
    if (!body) return;
    const res = await loadTilesetOwned(prisma, body.tilesetId, request.user.id);
    if (!res) return reply.code(404).send({ error: 'Tileset not found' });

    const row = await prisma.tile.create({
      data: {
        tilesetId: body.tilesetId,
        regionId: body.regionId,
        localId: body.localId,
        col: body.col,
        row: body.row,
        nativeSize: body.nativeSize,
      },
    });
    return deserializeTile(row);
  });

  // Bulk patch — the Inspector sends debounced batches to update atoms/traits/
  // tags across many tiles at once. Validated by TileBulkPatchSchema.
  fastify.patch('/bulk', async (request, reply) => {
    const body = await validateBody(reply, TileBulkPatchSchema, request.body);
    if (!body) return;
    const res = await loadTilesetOwned(prisma, body.tilesetId, request.user.id);
    if (!res) return reply.code(404).send({ error: 'Tileset not found' });

    // Run per-tile upserts in parallel against the Mongo connection pool.
    // Sequential `await` in this loop used to dominate latency on Atlas —
    // a 3-tile patch round-tripped 3× the single-query RTT (~600 ms).
    const results = await pmap(body.patches, 32, async ({ localId, patch }) => {
      const data = {};
      if (patch.atoms !== undefined) data.atoms = JSON.stringify(patch.atoms);
      if (patch.traits !== undefined) data.traits = JSON.stringify(patch.traits);
      if (patch.tags !== undefined) data.tags = JSON.stringify(patch.tags);
      if (patch.autotileGroupId !== undefined) data.autotileGroupId = patch.autotileGroupId ?? null;
      if (patch.autotileRole !== undefined) data.autotileRole = patch.autotileRole ?? null;
      if (patch.notes !== undefined) data.notes = patch.notes;
      if (patch.regionId !== undefined) data.regionId = patch.regionId;

      const row = await prisma.tile.upsert({
        where: { tilesetId_localId: { tilesetId: body.tilesetId, localId } },
        create: {
          tilesetId: body.tilesetId,
          localId,
          regionId: patch.regionId ?? '',
          atoms: JSON.stringify(patch.atoms ?? []),
          traits: JSON.stringify(patch.traits ?? {}),
          tags: JSON.stringify(patch.tags ?? []),
          autotileGroupId: patch.autotileGroupId ?? null,
          autotileRole: patch.autotileRole ?? null,
          notes: patch.notes ?? '',
        },
        update: data,
      });
      return deserializeTile(row);
    });
    return { updated: results.length, tiles: results };
  });

  fastify.delete('/:id', async (request, reply) => {
    const id = requireObjectId(reply, request.params.id, 'tileId');
    if (!id) return;
    const existing = await prisma.tile.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ error: 'Tile not found' });
    const res = await loadTilesetOwned(prisma, existing.tilesetId, request.user.id);
    if (!res) return reply.code(404).send({ error: 'Tile not found' });

    await prisma.tile.delete({ where: { id } });
    return { success: true };
  });
}
