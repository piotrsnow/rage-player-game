// Living World Phase 6 — admin guard.
//
// Decorates Fastify with `requireAdmin`, an async preHandler that runs
// `authenticate` first (standard JWT) then verifies the `isAdmin` claim
// on the access token. The claim is minted at login/refresh from the DB,
// so promoting/demoting an admin takes at most one access-token TTL
// (15 min) to propagate — good enough for a role that changes rarely.
//
// This replaces an earlier implementation that ran a per-request Prisma
// lookup on every admin route — the admin panel polls live, so that was
// dozens of extra queries per minute for no gain.
//
// Use in route config: `preHandler: [fastify.authenticate, fastify.requireAdmin]`.

import fp from 'fastify-plugin';

export const requireAdminPlugin = fp(async function (fastify) {
  fastify.decorate('requireAdmin', async (request, reply) => {
    if (!request.user?.id) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
    if (request.user.isAdmin !== true) {
      return reply.code(403).send({ error: 'Forbidden', message: 'Admin access required' });
    }
  });
});
