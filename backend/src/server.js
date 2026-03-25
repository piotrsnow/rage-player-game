import { existsSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import websocket from '@fastify/websocket';
import rateLimit from '@fastify/rate-limit';
import helmet from '@fastify/helmet';
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
import { startRoomCleanup, loadActiveSessionsFromDB } from './services/roomManager.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const STATIC_ROOT = resolve(__dirname, '..', 'public', 'dist');

const fastify = Fastify({
  logger: true,
  bodyLimit: 50 * 1024 * 1024, // 50MB for media uploads
});

await fastify.register(helmet, { contentSecurityPolicy: false });
await fastify.register(corsPlugin);
await fastify.register(authPlugin);
await fastify.register(websocket);

await fastify.register(rateLimit, { global: false });

fastify.get('/health', async () => ({ status: 'ok', timestamp: Date.now() }));

await fastify.register(async function authScope(app) {
  app.addHook('onRoute', (routeOptions) => {
    routeOptions.config = { ...routeOptions.config, rateLimit: { max: 10, timeWindow: '1 minute' } };
  });
  app.register(authRoutes);
}, { prefix: '/auth' });

await fastify.register(async function dataScope(app) {
  app.addHook('onRoute', (routeOptions) => {
    routeOptions.config = { ...routeOptions.config, rateLimit: { max: 60, timeWindow: '1 minute' } };
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

await fastify.register(multiplayerRoutes, { prefix: '/multiplayer' });

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
        request.url.startsWith('/multiplayer') || request.url.startsWith('/health')) {
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
