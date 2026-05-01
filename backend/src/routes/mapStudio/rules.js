// CRUD for ConnectionRule (per-pack). Validation + basic lint checks happen
// in packs/tiles routes; this file is just the data plumbing.

import { prisma } from '../../lib/prisma.js';
import {
  ConnectionRuleCreateSchema,
  ConnectionRuleUpdateSchema,
} from '../../../../shared/mapSchemas/index.js';
import {
  validateBody,
  requireObjectId,
  deserializeRule,
  loadPackOwned,
} from './_helpers.js';

export async function ruleRoutes(fastify) {
  fastify.get('/', async (request, reply) => {
    const packId = requireObjectId(reply, request.query?.packId, 'packId');
    if (!packId) return;
    const pack = await loadPackOwned(prisma, packId, request.user.id);
    if (!pack) return reply.code(404).send({ error: 'Pack not found' });

    const rows = await prisma.connectionRule.findMany({
      where: { packId },
      orderBy: { priority: 'desc' },
    });
    return rows.map(deserializeRule);
  });

  fastify.post('/', async (request, reply) => {
    const body = await validateBody(reply, ConnectionRuleCreateSchema, request.body);
    if (!body) return;
    const packId = requireObjectId(reply, request.body?.packId, 'packId');
    if (!packId) return;
    const pack = await loadPackOwned(prisma, packId, request.user.id);
    if (!pack) return reply.code(404).send({ error: 'Pack not found' });

    const row = await prisma.connectionRule.create({
      data: {
        packId,
        name: body.name ?? '',
        leftTraits: JSON.stringify(body.leftTraits ?? {}),
        rightTraits: JSON.stringify(body.rightTraits ?? {}),
        via: body.via,
        viaRef: JSON.stringify(body.viaRef ?? {}),
        priority: body.priority ?? 0,
      },
    });
    return deserializeRule(row);
  });

  fastify.patch('/:id', async (request, reply) => {
    const id = requireObjectId(reply, request.params.id, 'ruleId');
    if (!id) return;
    const existing = await prisma.connectionRule.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ error: 'Rule not found' });
    const pack = await loadPackOwned(prisma, existing.packId, request.user.id);
    if (!pack) return reply.code(404).send({ error: 'Rule not found' });

    const body = await validateBody(reply, ConnectionRuleUpdateSchema, request.body);
    if (!body) return;

    const data = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.leftTraits !== undefined) data.leftTraits = JSON.stringify(body.leftTraits);
    if (body.rightTraits !== undefined) data.rightTraits = JSON.stringify(body.rightTraits);
    if (body.via !== undefined) data.via = body.via;
    if (body.viaRef !== undefined) data.viaRef = JSON.stringify(body.viaRef);
    if (body.priority !== undefined) data.priority = body.priority;

    const row = await prisma.connectionRule.update({ where: { id }, data });
    return deserializeRule(row);
  });

  fastify.delete('/:id', async (request, reply) => {
    const id = requireObjectId(reply, request.params.id, 'ruleId');
    if (!id) return;
    const existing = await prisma.connectionRule.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ error: 'Rule not found' });
    const pack = await loadPackOwned(prisma, existing.packId, request.user.id);
    if (!pack) return reply.code(404).send({ error: 'Rule not found' });

    await prisma.connectionRule.delete({ where: { id } });
    return { success: true };
  });
}
