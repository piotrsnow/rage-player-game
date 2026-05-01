// Map Studio routes mount point. Parent scope registers these under
// /v1/map-studio and installs rate-limiting in server.js.
//
// Auth is intentionally disabled — Map Studio is a local/dev tool, not part
// of the live product. Every request runs as a single shared pseudo-user so
// the userId-scoped Prisma queries keep working without real JWTs or
// cookies. This means all Map Studio data (packs, tilesets, maps, rules) is
// shared across anyone who can reach the backend — fine for a dev tool,
// not safe for public exposure. If Map Studio ever ships, replace the stub
// below with `fastify.authenticate` again.

import { packRoutes } from './packs.js';
import { tilesetRoutes } from './tilesets.js';
import { tileRoutes } from './tiles.js';
import { ruleRoutes } from './rules.js';
import { autotileRoutes } from './autotile.js';
import { mapRoutes } from './maps.js';
import { importRoutes } from './import.js';
import { actorRoutes } from './actors.js';

// 24-char hex zero ObjectId — valid shape for Prisma's @db.ObjectId, and
// will never collide with a real Mongo-generated id.
const MAP_STUDIO_USER_ID = '000000000000000000000000';

export async function mapStudioRoutes(fastify) {
  fastify.addHook('onRequest', async (request) => {
    request.user = { id: MAP_STUDIO_USER_ID };
  });

  await fastify.register(packRoutes, { prefix: '/packs' });
  await fastify.register(tilesetRoutes, { prefix: '/tilesets' });
  await fastify.register(tileRoutes, { prefix: '/tiles' });
  await fastify.register(ruleRoutes, { prefix: '/rules' });
  await fastify.register(autotileRoutes, { prefix: '/autotile' });
  await fastify.register(mapRoutes, { prefix: '/maps' });
  await fastify.register(importRoutes, { prefix: '/import' });
  await fastify.register(actorRoutes, { prefix: '/actors' });
}
