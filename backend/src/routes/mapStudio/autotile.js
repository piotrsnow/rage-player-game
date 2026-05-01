// CRUD for AutotileGroup (one per blob/wang set inside a Tileset).

import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import {
  AutotileGroupSchema,
  AutotileLayoutSchema,
  AutotileCellsSchema,
  TraitsSchema,
  ObjectIdSchema,
} from '../../../../shared/mapSchemas/index.js';
import {
  validateBody,
  requireObjectId,
  deserializeAutotileGroup,
  loadTilesetOwned,
  parseJsonField,
} from './_helpers.js';

const CreateSchema = AutotileGroupSchema.omit({ id: true }).extend({
  tilesetId: ObjectIdSchema,
});

const UpdateSchema = z.object({
  name: z.string().trim().min(1).max(128).optional(),
  layout: AutotileLayoutSchema.optional(),
  regionId: z.string().optional(),
  originCol: z.number().int().nonnegative().optional(),
  originRow: z.number().int().nonnegative().optional(),
  cols: z.number().int().positive().max(32).nullish(),
  rows: z.number().int().positive().max(32).nullish(),
  cells: AutotileCellsSchema.optional(),
  traits: TraitsSchema.optional(),
});

// Clear tiles currently pointing at `groupId`, then stamp roles from the
// `cells` map onto matching tiles by computed localId. Caller supplies the
// tileset so we can derive tilesetCols from imageWidth / nativeTilesize.
async function propagateCellsToTiles(tx, { groupId, tilesetId, originCol, originRow, cells, tileset }) {
  await tx.tile.updateMany({
    where: { tilesetId, autotileGroupId: groupId },
    data: { autotileGroupId: null, autotileRole: null },
  });
  const native = tileset.nativeTilesize || 16;
  const tilesetCols = native > 0 ? Math.floor((tileset.imageWidth || 0) / native) : 0;
  if (!tilesetCols) return;
  const entries = Object.entries(cells || {});
  for (const [key, role] of entries) {
    const [cStr, rStr] = key.split(',');
    const c = Number(cStr);
    const r = Number(rStr);
    if (!Number.isFinite(c) || !Number.isFinite(r)) continue;
    const localId = (originRow + r) * tilesetCols + (originCol + c);
    await tx.tile.updateMany({
      where: { tilesetId, localId },
      data: { autotileGroupId: groupId, autotileRole: role },
    });
  }
}

export async function autotileRoutes(fastify) {
  fastify.get('/', async (request, reply) => {
    const tilesetId = requireObjectId(reply, request.query?.tilesetId, 'tilesetId');
    if (!tilesetId) return;
    const res = await loadTilesetOwned(prisma, tilesetId, request.user.id);
    if (!res) return reply.code(404).send({ error: 'Tileset not found' });

    const rows = await prisma.autotileGroup.findMany({
      where: { tilesetId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(deserializeAutotileGroup);
  });

  fastify.post('/', async (request, reply) => {
    try {
      request.log.info({ body: request.body }, 'autotile create');
      const body = await validateBody(reply, CreateSchema, request.body);
      if (!body) return;
      const res = await loadTilesetOwned(prisma, body.tilesetId, request.user.id);
      if (!res) return reply.code(404).send({ error: 'Tileset not found' });

      const isCustom = body.layout === 'custom';
      const cells = body.cells ?? {};

      const row = await prisma.$transaction(async (tx) => {
        const created = await tx.autotileGroup.create({
          data: {
            tilesetId: body.tilesetId,
            regionId: body.regionId ?? '',
            name: body.name,
            layout: body.layout,
            originCol: body.originCol ?? 0,
            originRow: body.originRow ?? 0,
            cols: isCustom ? (body.cols ?? null) : null,
            rows: isCustom ? (body.rows ?? null) : null,
            cells: JSON.stringify(cells),
            traits: JSON.stringify(body.traits ?? {}),
          },
        });
        if (Object.keys(cells).length > 0) {
          await propagateCellsToTiles(tx, {
            groupId: created.id,
            tilesetId: body.tilesetId,
            originCol: created.originCol,
            originRow: created.originRow,
            cells,
            tileset: res.tileset,
          });
        }
        return created;
      });
      return deserializeAutotileGroup(row);
    } catch (err) {
      request.log.error({ err }, 'autotile create failed');
      return reply.code(500).send({ error: err.message });
    }
  });

  fastify.patch('/:id', async (request, reply) => {
    try {
      const id = requireObjectId(reply, request.params.id, 'autotileGroupId');
      if (!id) return;
      const existing = await prisma.autotileGroup.findUnique({ where: { id } });
      if (!existing) return reply.code(404).send({ error: 'AutotileGroup not found' });
      const res = await loadTilesetOwned(prisma, existing.tilesetId, request.user.id);
      if (!res) return reply.code(404).send({ error: 'AutotileGroup not found' });

      const body = await validateBody(reply, UpdateSchema, request.body);
      if (!body) return;

      const data = {};
      if (body.name !== undefined) data.name = body.name;
      if (body.layout !== undefined) data.layout = body.layout;
      if (body.regionId !== undefined) data.regionId = body.regionId;
      if (body.originCol !== undefined) data.originCol = body.originCol;
      if (body.originRow !== undefined) data.originRow = body.originRow;
      if (body.cols !== undefined) data.cols = body.cols;
      if (body.rows !== undefined) data.rows = body.rows;
      if (body.traits !== undefined) data.traits = JSON.stringify(body.traits);
      if (body.cells !== undefined) data.cells = JSON.stringify(body.cells);
      // If layout switched away from custom, clear cols/rows for consistency.
      const effectiveLayout = body.layout ?? existing.layout;
      if (effectiveLayout !== 'custom') {
        data.cols = null;
        data.rows = null;
      }

      const row = await prisma.$transaction(async (tx) => {
        const updated = await tx.autotileGroup.update({ where: { id }, data });
        // Decide if we need to re-propagate. We re-propagate when cells,
        // origin, or layout changed — origin shift moves the mapping on the
        // atlas.
        const needsPropagate =
          body.cells !== undefined ||
          body.originCol !== undefined ||
          body.originRow !== undefined ||
          body.layout !== undefined;
        if (needsPropagate) {
          const effectiveCells =
            body.cells !== undefined
              ? body.cells
              : parseJsonField(existing.cells, {});
          await propagateCellsToTiles(tx, {
            groupId: id,
            tilesetId: existing.tilesetId,
            originCol: updated.originCol,
            originRow: updated.originRow,
            cells: effectiveCells,
            tileset: res.tileset,
          });
        }
        return updated;
      });
      return deserializeAutotileGroup(row);
    } catch (err) {
      request.log.error({ err }, 'autotile patch failed');
      return reply.code(500).send({ error: err.message });
    }
  });

  fastify.delete('/:id', async (request, reply) => {
    const id = requireObjectId(reply, request.params.id, 'autotileGroupId');
    if (!id) return;
    const existing = await prisma.autotileGroup.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ error: 'AutotileGroup not found' });
    const res = await loadTilesetOwned(prisma, existing.tilesetId, request.user.id);
    if (!res) return reply.code(404).send({ error: 'AutotileGroup not found' });

    await prisma.$transaction(async (tx) => {
      await tx.tile.updateMany({
        where: { tilesetId: existing.tilesetId, autotileGroupId: id },
        data: { autotileGroupId: null, autotileRole: null },
      });
      await tx.autotileGroup.delete({ where: { id } });
    });
    return { success: true };
  });
}
