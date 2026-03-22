import Fastify from 'fastify';
import { config } from './config.js';
import { corsPlugin } from './plugins/cors.js';
import { authPlugin } from './plugins/auth.js';
import { authRoutes } from './routes/auth.js';
import { campaignRoutes } from './routes/campaigns.js';
import { mediaRoutes } from './routes/media.js';
import { openaiProxyRoutes } from './routes/proxy/openai.js';
import { anthropicProxyRoutes } from './routes/proxy/anthropic.js';
import { elevenlabsProxyRoutes } from './routes/proxy/elevenlabs.js';
import { stabilityProxyRoutes } from './routes/proxy/stability.js';
import { sunoProxyRoutes } from './routes/proxy/suno.js';
import { musicRoutes } from './routes/music.js';

const fastify = Fastify({
  logger: true,
  bodyLimit: 50 * 1024 * 1024, // 50MB for media uploads
});

await fastify.register(corsPlugin);
await fastify.register(authPlugin);

fastify.get('/health', async () => ({ status: 'ok', timestamp: Date.now() }));

await fastify.register(authRoutes, { prefix: '/auth' });
await fastify.register(campaignRoutes, { prefix: '/campaigns' });
await fastify.register(mediaRoutes, { prefix: '/media' });
await fastify.register(openaiProxyRoutes, { prefix: '/proxy/openai' });
await fastify.register(anthropicProxyRoutes, { prefix: '/proxy/anthropic' });
await fastify.register(elevenlabsProxyRoutes, { prefix: '/proxy/elevenlabs' });
await fastify.register(stabilityProxyRoutes, { prefix: '/proxy/stability' });
await fastify.register(sunoProxyRoutes, { prefix: '/proxy/suno' });
await fastify.register(musicRoutes, { prefix: '/music' });

try {
  await fastify.listen({ port: config.port, host: config.host });
  fastify.log.info(`Server listening on ${config.host}:${config.port}`);
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}
