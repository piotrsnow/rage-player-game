import fp from 'fastify-plugin';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { FastifyAdapter } from '@bull-board/fastify';
import { getAllQueues } from '../services/queues/aiQueue.js';
import { isRedisEnabled } from '../services/redisClient.js';
import { logger } from '../lib/logger.js';

// Mount the bull-board UI under /v1/admin/queues. Gated behind JWT auth +
// an `admin: true` claim on the token. Users without the admin flag get 403.
// When Redis is disabled (dev/CI without Docker) the plugin is a no-op so
// server boot stays clean.

export const bullBoardPlugin = fp(async function (fastify) {
  if (!isRedisEnabled()) {
    logger.info('[bull-board] Redis disabled — skipping mount');
    return;
  }

  const queues = getAllQueues();
  if (queues.length === 0) {
    logger.info('[bull-board] no queues available — skipping mount');
    return;
  }

  const serverAdapter = new FastifyAdapter();
  serverAdapter.setBasePath('/v1/admin/queues');

  createBullBoard({
    queues: queues.map((q) => new BullMQAdapter(q)),
    serverAdapter,
  });

  await fastify.register(async function bullBoardScope(app) {
    app.addHook('onRequest', fastify.authenticate);
    app.addHook('preHandler', async (request, reply) => {
      if (!request.user?.admin) {
        reply.code(403).send({ error: 'Admin only' });
      }
    });
    await app.register(serverAdapter.registerPlugin(), {
      prefix: '/v1/admin/queues',
      basePath: '',
    });
  });

  logger.info({ count: queues.length }, '[bull-board] mounted at /v1/admin/queues');
});
