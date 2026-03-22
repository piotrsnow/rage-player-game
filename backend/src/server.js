import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import rateLimit from '@fastify/rate-limit';
import { config } from './config.js';
import { corsPlugin } from './plugins/cors.js';
import { authPlugin } from './plugins/auth.js';
import { authRoutes } from './routes/auth.js';
import { campaignRoutes } from './routes/campaigns.js';
import { characterRoutes } from './routes/characters.js';
import { mediaRoutes } from './routes/media.js';
import { openaiProxyRoutes } from './routes/proxy/openai.js';
import { anthropicProxyRoutes } from './routes/proxy/anthropic.js';
import { elevenlabsProxyRoutes } from './routes/proxy/elevenlabs.js';
import { stabilityProxyRoutes } from './routes/proxy/stability.js';
import { sunoProxyRoutes } from './routes/proxy/suno.js';
import { musicRoutes } from './routes/music.js';
import { multiplayerRoutes } from './routes/multiplayer.js';
import { startRoomCleanup } from './services/roomManager.js';

const fastify = Fastify({
  logger: true,
  bodyLimit: 50 * 1024 * 1024, // 50MB for media uploads
});

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

await fastify.register(campaignRoutes, { prefix: '/campaigns' });
await fastify.register(characterRoutes, { prefix: '/characters' });
await fastify.register(mediaRoutes, { prefix: '/media' });

await fastify.register(async function proxyScope(app) {
  app.addHook('onRoute', (routeOptions) => {
    routeOptions.config = { ...routeOptions.config, rateLimit: { max: 30, timeWindow: '1 minute' } };
  });
  app.register(openaiProxyRoutes, { prefix: '/openai' });
  app.register(anthropicProxyRoutes, { prefix: '/anthropic' });
  app.register(elevenlabsProxyRoutes, { prefix: '/elevenlabs' });
  app.register(stabilityProxyRoutes, { prefix: '/stability' });
  app.register(sunoProxyRoutes, { prefix: '/suno' });
}, { prefix: '/proxy' });

await fastify.register(musicRoutes, { prefix: '/music' });
await fastify.register(multiplayerRoutes, { prefix: '/multiplayer' });

startRoomCleanup();

try {
  await fastify.listen({ port: config.port, host: config.host });
  fastify.log.info(`Server listening on ${config.host}:${config.port}`);
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}
