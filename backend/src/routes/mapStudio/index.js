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

import { prisma } from '../../lib/prisma.js';
import { packRoutes } from './packs.js';
import { tilesetRoutes } from './tilesets.js';
import { tileRoutes } from './tiles.js';
import { ruleRoutes } from './rules.js';
import { autotileRoutes } from './autotile.js';
import { mapRoutes } from './maps.js';
import { importRoutes } from './import.js';
import { actorRoutes } from './actors.js';

// Zero UUID — stands in for a real user since Map Studio skips auth.
// MediaAsset has a User FK, so the row must actually exist in the DB.
const MAP_STUDIO_USER_ID = '00000000-0000-0000-0000-000000000000';

let systemUserReady;

async function ensureSystemUser() {
  if (!systemUserReady) {
    systemUserReady = prisma.user.upsert({
      where: { id: MAP_STUDIO_USER_ID },
      update: {},
      create: {
        id: MAP_STUDIO_USER_ID,
        email: 'map-studio-system@localhost',
        passwordHash: '!disabled',
      },
    });
  }
  return systemUserReady;
}

export async function mapStudioRoutes(fastify) {
  await ensureSystemUser();

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
