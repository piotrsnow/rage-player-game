import { prisma } from '../lib/prisma.js';

export async function specialPropertyRoutes(fastify) {
  fastify.get('/', {
    schema: {
      querystring: {
        type: 'object',
        required: ['ids'],
        properties: {
          ids: { type: 'string', minLength: 1, maxLength: 2000 },
        },
      },
    },
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
  }, async (request) => {
    const rawIds = request.query.ids.split(',').map((s) => s.trim()).filter(Boolean);
    if (rawIds.length === 0) return [];
    const ids = [...new Set(rawIds)].slice(0, 50);

    const rows = await prisma.specialProperty.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, description: true, color: true },
    });
    return rows;
  });
}
