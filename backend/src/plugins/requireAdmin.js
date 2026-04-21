// Living World Phase 6 — admin guard.
//
// Decorates Fastify with `requireAdmin`, an async preHandler that runs
// `authenticate` first (standard JWT) then verifies `User.isAdmin === true`.
// Use in route config: `preHandler: [fastify.authenticate, fastify.requireAdmin]`.

import fp from 'fastify-plugin';
import { prisma } from '../lib/prisma.js';

export const requireAdminPlugin = fp(async function (fastify) {
  fastify.decorate('requireAdmin', async (request, reply) => {
    const userId = request.user?.id;
    if (!userId) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { isAdmin: true },
      });
      if (!user?.isAdmin) {
        return reply.code(403).send({ error: 'Forbidden', message: 'Admin access required' });
      }
    } catch (err) {
      return reply.code(500).send({ error: 'Internal', message: err.message });
    }
  });
});
