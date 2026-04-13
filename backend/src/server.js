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
  try {
    await prisma.$runCommandRaw({ ping: 1 });
    return { status: 'ok', db: 'ok', timestamp: Date.now() };
  } catch (err) {
    fastify.log.warn({ err }, 'Health check DB ping failed');
    return reply.code(503).send({ status: 'degraded', db: 'down', timestamp: Date.now() });
  }
});

await fastify.register(async function authScope(app) {
  app.addHook('onRoute', (routeOptions) => {
    routeOptions.config = { ...routeOptions.config, rateLimit: { max: 10, timeWindow: '1 minute' } };
  });
  app.register(authRoutes);
}, { prefix: '/auth' });

await fastify.register(async function dataScope(app) {
  app.addHook('onRoute', (routeOptions) => {
    routeOptions.config = { ...routeOptions.config, rateLimit: { max: 60, timeWindow: '1 minute' } };
    if (routeOptions.url?.startsWith('/media')) {
      routeOptions.bodyLimit = MEDIA_BODY_LIMIT;
    }
  });
  app.register(campaignRoutes, { prefix: '/campaigns' });
  app.register(characterRoutes, { prefix: '/characters' });
  app.register(mediaRoutes, { prefix: '/media' });
  app.register(wanted3dRoutes, { prefix: '/wanted3d' });
});

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
}, { prefix: '/proxy' });

await fastify.register(async function musicScope(app) {
  app.addHook('onRoute', (routeOptions) => {
    routeOptions.config = { ...routeOptions.config, rateLimit: { max: 60, timeWindow: '1 minute' } };
  });
  app.register(musicRoutes);
}, { prefix: '/music' });

await fastify.register(async function aiScope(app) {
  app.addHook('onRoute', (routeOptions) => {
    routeOptions.config = { ...routeOptions.config, rateLimit: { max: 20, timeWindow: '1 minute' } };
  });
  app.register(aiRoutes, { prefix: '/ai' });
});

await fastify.register(async function multiplayerScope(app) {
  app.addHook('onRoute', (routeOptions) => {
    // WebSocket upgrades are throttled here; per-message throttling lives in the ws handler.
    routeOptions.config = { ...routeOptions.config, rateLimit: { max: 120, timeWindow: '1 minute' } };
  });
  app.register(multiplayerRoutes);
}, { prefix: '/multiplayer' });

// Static game rules data — no auth, generous rate limit
await fastify.register(async function gameDataScope(app) {
  app.addHook('onRoute', (routeOptions) => {
    routeOptions.config = { ...routeOptions.config, rateLimit: { max: 120, timeWindow: '1 minute' } };
  });
  app.register(gameDataRoutes);
}, { prefix: '/game-data' });

startRoomCleanup();

if (existsSync(STATIC_ROOT)) {
  await fastify.register(fastifyStatic, {
    root: STATIC_ROOT,
    wildcard: false,
  });

  fastify.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith('/auth') || request.url.startsWith('/campaigns') ||
        request.url.startsWith('/characters') || request.url.startsWith('/media') ||
        request.url.startsWith('/proxy') || request.url.startsWith('/music') ||
        request.url.startsWith('/multiplayer') || request.url.startsWith('/ai') ||
        request.url.startsWith('/health')) {
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
