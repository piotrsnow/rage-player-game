// CRUD for MapActor — visual NPC/player presets created in the mapapp
// CharGen page. Scoped to the authenticated user; no campaign coupling.

import { prisma } from '../../lib/prisma.js';
import {
  MapActorCreateSchema,
  MapActorUpdateSchema,
} from '../../../../shared/mapSchemas/index.js';
import { parseJsonField, requireObjectId, validateBody } from './_helpers.js';

function deserializeActor(row) {
  if (!row) return row;
  return {
    ...row,
    appearance: parseJsonField(row.appearance, {}),
  };
}

export async function actorRoutes(fastify) {
  fastify.get('/', async (request) => {
    const rows = await prisma.mapActor.findMany({
      where: { userId: request.user.id },
      orderBy: { updatedAt: 'desc' },
    });
    return rows.map(deserializeActor);
  });

  fastify.get('/:id', async (request, reply) => {
    const id = requireObjectId(reply, request.params.id, 'actorId');
    if (!id) return;
    const row = await prisma.mapActor.findFirst({
      where: { id, userId: request.user.id },
    });
    if (!row) return reply.code(404).send({ error: 'Actor not found' });
    return deserializeActor(row);
  });

  fastify.post('/', async (request, reply) => {
    const body = await validateBody(reply, MapActorCreateSchema, request.body);
    if (!body) return;
    const row = await prisma.mapActor.create({
      data: {
        userId: request.user.id,
        name: body.name,
        appearance: JSON.stringify(body.appearance),
        tags: body.tags ?? [],
      },
    });
    return deserializeActor(row);
  });

  fastify.put('/:id', async (request, reply) => {
    const id = requireObjectId(reply, request.params.id, 'actorId');
    if (!id) return;
    const existing = await prisma.mapActor.findFirst({
      where: { id, userId: request.user.id },
    });
    if (!existing) return reply.code(404).send({ error: 'Actor not found' });

    const body = await validateBody(reply, MapActorUpdateSchema, request.body);
    if (!body) return;

    const data = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.appearance !== undefined) data.appearance = JSON.stringify(body.appearance);
    if (body.tags !== undefined) data.tags = body.tags;

    const row = await prisma.mapActor.update({ where: { id }, data });
    return deserializeActor(row);
  });

  fastify.delete('/:id', async (request, reply) => {
    const id = requireObjectId(reply, request.params.id, 'actorId');
    if (!id) return;
    const existing = await prisma.mapActor.findFirst({
      where: { id, userId: request.user.id },
    });
    if (!existing) return reply.code(404).send({ error: 'Actor not found' });

    await prisma.mapActor.delete({ where: { id } });
    return { success: true };
  });
}
