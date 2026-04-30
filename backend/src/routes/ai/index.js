import { singleShotRoutes } from './singleShots.js';
import { campaignStreamRoutes } from './campaignStream.js';
import { sceneStreamRoutes } from './sceneStream.js';
import { sceneRoutes } from './scenes.js';
import { keyTestRoutes } from './keyTest.js';

/**
 * Registered in server.js via `app.register(aiRoutes, { prefix: '/ai' })`.
 *
 * Fastify encapsulation: the onRequest auth hook added here applies to
 * every handler inside this scope, including sub-plugins registered below.
 * Each sub-plugin is a thin async function that adds its own handlers to
 * the same scope — no second addHook call needed.
 */
export async function aiRoutes(fastify) {
  fastify.addHook('onRequest', fastify.authenticate);

  await fastify.register(singleShotRoutes);
  await fastify.register(campaignStreamRoutes);
  await fastify.register(sceneStreamRoutes);
  await fastify.register(sceneRoutes);
  await fastify.register(keyTestRoutes);
}
