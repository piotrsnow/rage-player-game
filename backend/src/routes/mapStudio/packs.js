// CRUD for TilesetPack.
// All routes require authentication (inherited via parent register scope).

import { prisma } from '../../lib/prisma.js';
import {
  TilesetPackCreateSchema,
  TilesetPackUpdateSchema,
} from '../../../../shared/mapSchemas/index.js';
import {
  validateBody,
  requireObjectId,
  deserializePack,
} from './_helpers.js';
import { lintPack } from '../../services/mapStudio/lintPack.js';

export async function packRoutes(fastify) {
  fastify.get('/', async (request) => {
    const rows = await prisma.tilesetPack.findMany({
      where: { userId: request.user.id },
      orderBy: { updatedAt: 'desc' },
    });
    return rows.map(deserializePack);
  });

  fastify.get('/:id', async (request, reply) => {
    const id = requireObjectId(reply, request.params.id, 'packId');
    if (!id) return;
    const row = await prisma.tilesetPack.findFirst({
      where: { id, userId: request.user.id },
    });
    if (!row) return reply.code(404).send({ error: 'Pack not found' });

    const tilesets = await prisma.tileset.findMany({ where: { packId: id } });
    return {
      ...deserializePack(row),
      tilesetCount: tilesets.length,
    };
  });

  fastify.post('/', async (request, reply) => {
    const body = await validateBody(reply, TilesetPackCreateSchema, request.body);
    if (!body) return;

    const row = await prisma.tilesetPack.create({
      data: {
        userId: request.user.id,
        name: body.name,
        projectTilesize: body.projectTilesize,
        scaleAlgo: body.scaleAlgo,
        origin: JSON.stringify(body.origin ?? {}),
        traitVocab: JSON.stringify(body.traitVocab ?? {}),
      },
    });
    return deserializePack(row);
  });

  fastify.patch('/:id', async (request, reply) => {
    const id = requireObjectId(reply, request.params.id, 'packId');
    if (!id) return;
    const existing = await prisma.tilesetPack.findFirst({
      where: { id, userId: request.user.id },
    });
    if (!existing) return reply.code(404).send({ error: 'Pack not found' });

    const body = await validateBody(reply, TilesetPackUpdateSchema, request.body);
    if (!body) return;

    const data = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.projectTilesize !== undefined) data.projectTilesize = body.projectTilesize;
    if (body.scaleAlgo !== undefined) data.scaleAlgo = body.scaleAlgo;
    if (body.origin !== undefined) data.origin = JSON.stringify(body.origin);
    if (body.traitVocab !== undefined) data.traitVocab = JSON.stringify(body.traitVocab);

    const row = await prisma.tilesetPack.update({ where: { id }, data });
    return deserializePack(row);
  });

  fastify.get('/:id/lint', async (request, reply) => {
    const id = requireObjectId(reply, request.params.id, 'packId');
    if (!id) return;
    const result = await lintPack({ packId: id, userId: request.user.id });
    if (!result.found) return reply.code(404).send({ error: 'Pack not found' });
    return result;
  });

  fastify.delete('/:id', async (request, reply) => {
    const id = requireObjectId(reply, request.params.id, 'packId');
    if (!id) return;
    const existing = await prisma.tilesetPack.findFirst({
      where: { id, userId: request.user.id },
    });
    if (!existing) return reply.code(404).send({ error: 'Pack not found' });

    await prisma.tilesetPack.delete({ where: { id } });
    return { success: true };
  });
}
