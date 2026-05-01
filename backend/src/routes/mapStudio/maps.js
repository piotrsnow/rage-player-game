// CRUD for MapDoc (player-authored maps).

import { prisma } from '../../lib/prisma.js';
import {
  MapDocCreateSchema,
  MapDocUpdateSchema,
} from '../../../../shared/mapSchemas/index.js';
import {
  validateBody,
  requireObjectId,
  deserializeMap,
} from './_helpers.js';

export async function mapRoutes(fastify) {
  fastify.get('/', async (request) => {
    const rows = await prisma.mapDoc.findMany({
      where: { userId: request.user.id },
      orderBy: { updatedAt: 'desc' },
    });
    return rows.map(deserializeMap);
  });

  fastify.get('/:id', async (request, reply) => {
    const id = requireObjectId(reply, request.params.id, 'mapId');
    if (!id) return;
    const row = await prisma.mapDoc.findFirst({
      where: { id, userId: request.user.id },
    });
    if (!row) return reply.code(404).send({ error: 'Map not found' });
    return deserializeMap(row);
  });

  fastify.post('/', async (request, reply) => {
    const body = await validateBody(reply, MapDocCreateSchema, request.body);
    if (!body) return;

    const row = await prisma.mapDoc.create({
      data: {
        userId: request.user.id,
        name: body.name,
        size: JSON.stringify(body.size ?? [64, 64]),
        projectTilesize: body.projectTilesize,
        packIds: body.packIds ?? [],
        layers: JSON.stringify(body.layers ?? {}),
        collision: body.collision ?? '',
        objects: JSON.stringify(body.objects ?? []),
        meta: JSON.stringify(body.meta ?? {}),
        campaignId: body.campaignId ?? null,
      },
    });
    return deserializeMap(row);
  });

  fastify.put('/:id', async (request, reply) => {
    const id = requireObjectId(reply, request.params.id, 'mapId');
    if (!id) return;
    const existing = await prisma.mapDoc.findFirst({
      where: { id, userId: request.user.id },
    });
    if (!existing) return reply.code(404).send({ error: 'Map not found' });

    const body = await validateBody(reply, MapDocUpdateSchema, request.body);
    if (!body) return;

    const data = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.size !== undefined) data.size = JSON.stringify(body.size);
    if (body.projectTilesize !== undefined) data.projectTilesize = body.projectTilesize;
    if (body.packIds !== undefined) data.packIds = body.packIds;
    if (body.layers !== undefined) data.layers = JSON.stringify(body.layers);
    if (body.collision !== undefined) data.collision = body.collision;
    if (body.objects !== undefined) data.objects = JSON.stringify(body.objects);
    if (body.meta !== undefined) data.meta = JSON.stringify(body.meta);
    if (body.campaignId !== undefined) data.campaignId = body.campaignId;

    const row = await prisma.mapDoc.update({ where: { id }, data });
    return deserializeMap(row);
  });

  fastify.delete('/:id', async (request, reply) => {
    const id = requireObjectId(reply, request.params.id, 'mapId');
    if (!id) return;
    const existing = await prisma.mapDoc.findFirst({
      where: { id, userId: request.user.id },
    });
    if (!existing) return reply.code(404).send({ error: 'Map not found' });

    await prisma.mapDoc.delete({ where: { id } });
    return { success: true };
  });
}
