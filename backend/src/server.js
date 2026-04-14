import { existsSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import websocket from '@fastify/websocket';
import rateLimit from '@fastify/rate-limit';
import helmet from '@fastify/helmet';
import compress from '@fastify/compress';
import { config } from './config.js';
import { corsPlugin } from './plugins/cors.js';
import { authPlugin } from './plugins/auth.js';
import { authRoutes } from './routes/auth.js';
import { campaignRoutes } from './routes/campaigns.js';
import { characterRoutes } from './routes/characters.js';
import { mediaRoutes } from './routes/media.js';
import { wanted3dRoutes } from './routes/wanted3d.js';
import { openaiProxyRoutes } from './routes/proxy/openai.js';
import { anthropicProxyRoutes } from './routes/proxy/anthropic.js';
import { elevenlabsProxyRoutes } from './routes/proxy/elevenlabs.js';
import { stabilityProxyRoutes } from './routes/proxy/stability.js';
import { geminiProxyRoutes } from './routes/proxy/gemini.js';
import { meshyProxyRoutes } from './routes/proxy/meshy.js';
import { musicRoutes } from './routes/music.js';
import { multiplayerRoutes } from './routes/multiplayer.js';
import { aiRoutes } from './routes/ai.js';
import { gameDataRoutes } from './routes/gameData.js';
import {
  startRoomCleanup,
  stopRoomCleanup,
  loadActiveSessionsFromDB,
  saveAllActiveRooms,
  closeAllRoomSockets,
} from './services/roomManager.js';
import {
  getRedisClient,
  isRedisEnabled,
  pingRedis,
  closeRedis,
} from './services/redisClient.js';
import { prisma } from './lib/prisma.js';
import { logger } from './lib/logger.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const STATIC_ROOT = resolve(__dirname, '..', 'public', 'dist');

const DEFAULT_BODY_LIMIT = 2 * 1024 * 1024;
const MEDIA_BODY_LIMIT = 50 * 1024 * 1024;

// Hand the shared pino instance to Fastify so route handlers' request.log
// and services' `import { logger }` are the same underlying instance.
const fastify = Fastify({
  loggerInstance: logger,
  bodyLimit: DEFAULT_BODY_LIMIT,
});

await fastify.register(compress, { global: true });
await fastify.register(helmet, {
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
});
await fastify.register(corsPlugin);
await fastify.register(authPlugin);
await fastify.register(websocket);

await fastify.register(rateLimit, { global: false });

fastify.get('/health', async (request, reply) => {
  let dbOk = false;
  try {
    await prisma.$runCommandRaw({ ping: 1 });
    dbOk = true;
  } catch (err) {
    fastify.log.warn({ err }, 'Health check DB ping failed');
  }

  // Redis is optional in Stage 1 — treat "disabled" and "connected" as healthy,
  // "enabled but unreachable" as degraded (surface it in the response but don't
  // 503 the whole backend, features have fallbacks).
  const redisStatus = await pingRedis();
  const redisField = redisStatus.enabled
    ? (redisStatus.ok ? 'ok' : 'down')
    : 'disabled';

  if (!dbOk) {
    return reply.code(503).send({ status: 'degraded', db: 'down', redis: redisField, timestamp: Date.now() });
  }
  return { status: 'ok', db: 'ok', redis: redisField, timestamp: Date.now() };
});

// All API routes live under /v1 so breaking changes can bump to /v2 later.
// /health stays at root (standard practice for orchestrator health probes).
await fastify.register(async function authScope(app) {
  app.addHook('onRoute', (routeOptions) => {
    routeOptions.config = { ...routeOptions.config, rateLimit: { max: 10, timeWindow: '1 minute' } };
  });
  app.register(authRoutes);
}, { prefix: '/v1/auth' });

await fastify.register(async function dataScope(app) {
  app.addHook('onRoute', (routeOptions) => {
    routeOptions.config = { ...routeOptions.config, rateLimit: { max: 60, timeWindow: '1 minute' } };
    if (routeOptions.url?.includes('/media')) {
      routeOptions.bodyLimit = MEDIA_BODY_LIMIT;
    }
  });
  app.register(campaignRoutes, { prefix: '/campaigns' });
  app.register(characterRoutes, { prefix: '/characters' });
  app.register(mediaRoutes, { prefix: '/media' });
  app.register(wanted3dRoutes, { prefix: '/wanted3d' });
}, { prefix: '/v1' });

await fastify.register(async function proxyScope(app) {
  app.addHook('onRoute', (routeOptions) => {
    routeOptions.config = { ...routeOptions.config, rateLimit: { max: 30, timeWindow: '1 minute' } };
  });
  app.register(openaiProxyRoutes, { prefix: '/openai' });
  app.register(anthropicProxyRoutes, { prefix: '/anthropic' });
  app.register(elevenlabsProxyRoutes, { prefix: '/elevenlabs' });
  app.register(stabilityProxyRoutes, { prefix: '/stability' });
  app.register(geminiProxyRoutes, { prefix: '/gemini' });
  app.register(meshyProxyRoutes, { prefix: '/meshy' });
}, { prefix: '/v1/proxy' });

await fastify.register(async function musicScope(app) {
  app.addHook('onRoute', (routeOptions) => {
    routeOptions.config = { ...routeOptions.config, rateLimit: { max: 60, timeWindow: '1 minute' } };
  });
  app.register(musicRoutes);
}, { prefix: '/v1/music' });

await fastify.register(async function aiScope(app) {
  app.addHook('onRoute', (routeOptions) => {
    routeOptions.config = { ...routeOptions.config, rateLimit: { max: 20, timeWindow: '1 minute' } };
  });
  app.register(aiRoutes, { prefix: '/ai' });
}, { prefix: '/v1' });

await fastify.register(async function multiplayerScope(app) {
  app.addHook('onRoute', (routeOptions) => {
    // WebSocket upgrades are throttled here; per-message throttling lives in the ws handler.
    routeOptions.config = { ...routeOptions.config, rateLimit: { max: 120, timeWindow: '1 minute' } };
  });
  app.register(multiplayerRoutes);
}, { prefix: '/v1/multiplayer' });

// Static game rules data — no auth, generous rate limit
await fastify.register(async function gameDataScope(app) {
  app.addHook('onRoute', (routeOptions) => {
    routeOptions.config = { ...routeOptions.config, rateLimit: { max: 120, timeWindow: '1 minute' } };
  });
  app.register(gameDataRoutes);
}, { prefix: '/v1/game-data' });

startRoomCleanup();

// Touch the Redis singleton so the lazy client kicks off its initial connect
// attempt during boot instead of waiting for the first feature call. Safe
// when REDIS_URL is empty — `getRedisClient()` just returns null.
if (isRedisEnabled()) {
  getRedisClient();
  fastify.log.info('[redis] enabled — connecting in background');
} else {
  fastify.log.info('[redis] disabled (REDIS_URL not set) — features will use in-memory fallbacks');
}

if (existsSync(STATIC_ROOT)) {
  await fastify.register(fastifyStatic, {
    root: STATIC_ROOT,
    wildcard: false,
  });

  fastify.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith('/v1/') || request.url === '/v1' || request.url.startsWith('/health')) {
      return reply.code(404).send({ error: 'Not found' });
    }
    return reply.sendFile('index.html');
  });

  fastify.log.info(`Serving frontend from ${STATIC_ROOT}`);
}

try {
  await fastify.listen({ port: config.port, host: config.host });
  fastify.log.info(`Server listening on ${config.host}:${config.port}`);
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}

loadActiveSessionsFromDB().catch((err) => {
  fastify.log.warn(`Failed to load active sessions from DB: ${err.message}`);
});

// ── Graceful shutdown ─────────────────────────────────────────────
// SIGTERM arrives from container orchestrators on deploy/stop. We must:
//   1. Stop the room cleanup timer (so it doesn't schedule new work)
//   2. Persist every active room to DB (so players can reconnect after deploy)
//   3. Close WebSocket sockets cleanly so clients see a graceful close frame
//   4. Let Fastify drain in-flight HTTP requests via fastify.close()
//   5. Disconnect Prisma
// prisma.js also registers SIGTERM/SIGINT handlers for disconnect, but those
// run independently — double-disconnect is a no-op.

const SHUTDOWN_DRAIN_TIMEOUT_MS = 10_000;
let shuttingDown = false;

async function gracefulShutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  fastify.log.info(`[shutdown] received ${signal} — draining`);

  stopRoomCleanup();

  try {
    const savedCount = await saveAllActiveRooms();
    fastify.log.info(`[shutdown] persisted ${savedCount} active rooms`);
  } catch (err) {
    fastify.log.warn({ err }, '[shutdown] failed to persist active rooms');
  }

  try {
    const closedCount = closeAllRoomSockets(1001, 'Server shutting down');
    fastify.log.info(`[shutdown] closed ${closedCount} WebSocket connections`);
  } catch (err) {
    fastify.log.warn({ err }, '[shutdown] failed to close sockets');
  }

  try {
    await closeRedis();
  } catch (err) {
    fastify.log.warn({ err }, '[shutdown] failed to close redis');
  }

  const forceExit = setTimeout(() => {
    fastify.log.error('[shutdown] drain timeout — force exiting');
    process.exit(1);
  }, SHUTDOWN_DRAIN_TIMEOUT_MS);
  forceExit.unref();

  try {
    await fastify.close();
    fastify.log.info('[shutdown] fastify closed');
  } catch (err) {
    fastify.log.error({ err }, '[shutdown] fastify close failed');
  }

  clearTimeout(forceExit);
  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
