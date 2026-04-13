import { multiplayerHttpRoutes } from './multiplayer/http.js';
import { multiplayerWsRoute } from './multiplayer/connection.js';

export async function multiplayerRoutes(fastify) {
  fastify.register(multiplayerHttpRoutes);
  fastify.register(multiplayerWsRoute);
}
