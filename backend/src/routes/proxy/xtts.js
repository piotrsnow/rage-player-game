import { prisma } from '../../lib/prisma.js';
import { UUID_PATTERN } from '../../lib/validators.js';
import { generateKey, toUuid } from '../../services/hashService.js';
import { createMediaStore } from '../../services/mediaStore.js';
import { config } from '../../config.js';

const store = createMediaStore(config);

const TTS_BODY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['voiceId', 'text'],
  properties: {
    voiceId: { type: 'string', maxLength: 128 },
    text: { type: 'string', maxLength: 8000 },
    language: { type: 'string', maxLength: 8 },
    campaignId: { type: 'string', pattern: UUID_PATTERN },
  },
};

function getXttsUrl() {
  const url = config.xttsUrl;
  if (!url) throw Object.assign(new Error('XTTS not configured'), { statusCode: 503 });
  return url.replace(/\/+$/, '');
}

export async function xttsProxyRoutes(fastify) {
  fastify.addHook('onRequest', fastify.authenticate);

  fastify.get('/health', async () => {
    const base = getXttsUrl();
    const res = await fetch(`${base}/api/health`);
    if (!res.ok) throw Object.assign(new Error('XTTS health check failed'), { statusCode: 502 });
    return res.json();
  });

  fastify.get('/voices', async () => {
    const base = getXttsUrl();
    const res = await fetch(`${base}/api/voices`);
    if (!res.ok) throw Object.assign(new Error('XTTS voices fetch failed'), { statusCode: 502 });
    return res.json();
  });

  fastify.post('/tts', { schema: { body: TTS_BODY_SCHEMA } }, async (request, reply) => {
    const base = getXttsUrl();
    const { voiceId, text, language = 'pl', campaignId } = request.body;

    const cacheParams = { voiceId, text, language, provider: 'xtts' };
    const cacheKey = generateKey('tts', cacheParams, campaignId);

    const existing = await prisma.mediaAsset.findUnique({ where: { key: cacheKey } });
    if (existing) {
      const url = await store.getUrl(existing.path);
      return { cached: true, url, key: cacheKey };
    }

    const res = await fetch(`${base}/api/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ voice_id: voiceId, text, language }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return reply.code(res.status).send({
        error: err.detail || `XTTS TTS error: ${res.status}`,
      });
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    await store.put(cacheKey, buffer, 'audio/wav');
    const responseUrl = await store.getUrl(cacheKey);

    await prisma.mediaAsset.upsert({
      where: { key: cacheKey },
      create: {
        userId: request.user.id,
        campaignId: toUuid(campaignId),
        key: cacheKey,
        type: 'tts',
        contentType: 'audio/wav',
        size: buffer.length,
        backend: config.mediaBackend,
        path: cacheKey,
        metadata: cacheParams,
      },
      update: {},
    });

    return { cached: false, url: responseUrl, key: cacheKey };
  });
}
