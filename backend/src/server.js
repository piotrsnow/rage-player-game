import { existsSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import websocket from '@fastify/websocket';
import rateLimit from '@fastify/rate-limit';
import helmet from '@fastify/helmet';
import fastifyCookie from '@fastify/cookie';
import { config } from './config.js';
import { corsPlugin } from './plugins/cors.js';
import { authPlugin } from './plugins/auth.js';
import { requireAdminPlugin } from './plugins/requireAdmin.js';
import { csrfPlugin } from './plugins/csrf.js';
import { buildRateLimitKey } from './plugins/rateLimitKey.js';
import { idempotencyPlugin } from './plugins/idempotency.js';
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
import { internalRoutes } from './routes/internal.js';
import { livingWorldRoutes } from './routes/livingWorld.js';
import { adminLivingWorldRoutes } from './routes/adminLivingWorld.js';
import { seedWorld } from './scripts/seedWorld.js';
import {
  startRoomCleanup,
  stopRoomCleanup,
  loadActiveSessionsFromDB,
  saveAllActiveRooms,
  closeAllRoomSockets,
} from './services/roomManager.js';
import { prisma } from './lib/prisma.js';
import { logger } from './lib/logger.js';
import { startPeriodicCleanup as startRefreshTokenCleanup, stopPeriodicCleanup as stopRefreshTokenCleanup } from './services/refreshTokenService.js';

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

await fastify.register(helmet, {
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
});
await fastify.register(corsPlugin);
await fastify.register(fastifyCookie);
await fastify.register(authPlugin);
await fastify.register(requireAdminPlugin);
await fastify.register(csrfPlugin);
await fastify.register(websocket);

// Rate limit keyed by userId when the JWT verifies, per-IP otherwise.
// In-memory store — sufficient for single-instance Cloud Run.
await fastify.register(rateLimit, {
  global: false,
  keyGenerator: buildRateLimitKey,
  nameSpace: 'rl:',
});

// Idempotency-Key support on opt-in mutating routes. Plugin installs
// preHandler + onSend hooks; routes enable it via `config: { idempotency: true }`.
await fastify.register(idempotencyPlugin);

fastify.get('/health', async (request, reply) => {
  let dbOk = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbOk = true;
  } catch (err) {
    fastify.log.warn({ err }, 'Health check DB ping failed');
  }

  if (!dbOk) {
    return reply.code(503).send({ status: 'degraded', db: 'down', timestamp: Date.now() });
  }
  return { status: 'ok', db: 'ok', timestamp: Date.now() };
});

// All API routes live under /v1 so a future breaking change can bump to /v2.
// /health stays at root (standard practice for orchestrator health probes).
// /v1/auth runs the cookie-based refresh-token flow (Mongo-backed).
// /v1/internal routes are Cloud Tasks handlers (OIDC-authenticated, no rate limit).
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

// Cloud Tasks handler (OIDC-auth, no rate limit — dispatch rate controlled by queue config)
await fastify.register(internalRoutes, { prefix: '/v1/internal' });

// Living World (Phase 2) — companion CAS, C2 dialog. Auth-gated, rate-limited like data routes.
await fastify.register(async function livingWorldScope(app) {
  app.addHook('onRoute', (routeOptions) => {
    routeOptions.config = { ...routeOptions.config, rateLimit: { max: 30, timeWindow: '1 minute' } };
  });
  app.register(livingWorldRoutes);
}, { prefix: '/v1/livingWorld' });

// Phase 6 — admin observability + moderation routes. Gated on User.isAdmin
// via requireAdmin plugin. Default rate is 60/min — read-heavy, but tick
// endpoints fire nano LLM calls and declare their own stricter limits in
// the route config. We respect the route-level rateLimit when present
// instead of unconditionally overwriting it.
await fastify.register(async (app) => {
  app.addHook('onRoute', (routeOptions) => {
    routeOptions.config = {
      ...routeOptions.config,
      rateLimit: routeOptions.config?.rateLimit || { max: 60, timeWindow: '1 minute' },
    };
  });
  app.register(adminLivingWorldRoutes);
}, { prefix: '/v1/admin/livingWorld' });

startRoomCleanup();
startRefreshTokenCleanup();

if (existsSync(STATIC_ROOT)) {
  await fastify.register(fastifyStatic, {
    root: STATIC_ROOT,
    wildcard: false,
  });

  fastify.setNotFoundHandler((request, reply) => {
    if (
      request.url.startsWith('/v1/') || request.url === '/v1' ||
      request.url.startsWith('/health')
    ) {
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

// Living World Phase 7 — ensure the canonical capital Yeralden + its named
// NPCs exist. Idempotent, best-effort — schema drift or seed bugs must not
// block the server from serving requests.
seedWorld().catch((err) => {
  fastify.log.warn(`World seed skipped: ${err.message}`);
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
  stopRefreshTokenCleanup();

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
