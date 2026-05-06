import { prisma } from '../../lib/prisma.js';

export async function llmCallLogRoutes(fastify) {
  fastify.get('/llm-call-log', async (request, reply) => {
    const userId = request.user?.id;
    if (!userId) return reply.code(401).send({ error: 'Unauthorized' });

    const since = request.query.since || null;
    const where = { userId };
    if (since) {
      where.startedAt = { gt: new Date(since) };
    }

    const rows = await prisma.llmCallLog.findMany({
      where,
      orderBy: { startedAt: 'desc' },
      take: 100,
      select: {
        id: true,
        type: true,
        label: true,
        provider: true,
        model: true,
        status: true,
        durationMs: true,
        error: true,
        request: true,
        response: true,
        startedAt: true,
        finishedAt: true,
      },
    });

    return { calls: rows };
  });
}
