import { prisma } from '../lib/prisma.js';

export async function adminUserRoutes(fastify) {
  fastify.addHook('onRequest', fastify.authenticate);
  fastify.addHook('onRequest', fastify.requireAdmin);

  fastify.get('/', {
    schema: {
      querystring: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
    },
  }, async () => {
    return prisma.user.findMany({
      select: { id: true, email: true, isAdmin: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
  });

  fastify.patch('/:id', {
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', format: 'uuid' } },
      },
      body: {
        type: 'object',
        required: ['isAdmin'],
        properties: { isAdmin: { type: 'boolean' } },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    const { id } = request.params;
    const { isAdmin } = request.body;

    if (id === request.user.id && !isAdmin) {
      return reply.code(400).send({ error: 'Cannot remove your own admin role' });
    }

    const user = await prisma.user.update({
      where: { id },
      data: { isAdmin },
      select: { id: true, email: true, isAdmin: true, createdAt: true },
    });

    return user;
  });
}
