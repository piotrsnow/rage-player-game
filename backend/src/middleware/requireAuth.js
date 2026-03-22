export function requireAuth(fastify) {
  fastify.addHook('onRequest', fastify.authenticate);
}
