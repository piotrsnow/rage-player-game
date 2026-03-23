import { prisma } from '../../lib/prisma.js';
import { resolveApiKey } from '../../services/apiKeyService.js';
import { generateKey } from '../../services/hashService.js';
import { createMediaStore } from '../../services/mediaStore.js';
import { config } from '../../config.js';

const store = createMediaStore(config);
const SUNO_URL = 'https://api.sunoapi.org';

export async function sunoProxyRoutes(fastify) {
  fastify.addHook('onRequest', fastify.authenticate);

  fastify.post('/generate', async (request, reply) => {
    const user = await prisma.user.findUnique({
      where: { id: request.user.id },
      select: { apiKeys: true },
    });
    const apiKey = resolveApiKey(user?.apiKeys || '{}', 'suno');
    if (!apiKey) return reply.code(400).send({ error: 'Suno API key not configured' });

    const { style, title, model } = request.body;

    const payload = {
      customMode: true,
      instrumental: true,
      style,
      title: (title || 'RPG Scene').substring(0, 80),
      model: model || 'V4_5',
      callBackUrl: 'https://localhost/no-op',
    };

    const response = await fetch(`${SUNO_URL}/api/v1/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return reply.code(response.status).send({
        error: err.msg || `Suno API error: ${response.status}`,
      });
    }

    const data = await response.json();
    if (data.code !== 200) {
      return reply.code(400).send({ error: data.msg || 'Suno generation request failed' });
    }

    return { taskId: data.data.taskId };
  });

  fastify.get('/status/:taskId', async (request, reply) => {
    const user = await prisma.user.findUnique({
      where: { id: request.user.id },
      select: { apiKeys: true },
    });
    const apiKey = resolveApiKey(user?.apiKeys || '{}', 'suno');
    if (!apiKey) return reply.code(400).send({ error: 'Suno API key not configured' });

    const { taskId } = request.params;

    const response = await fetch(
      `${SUNO_URL}/api/v1/generate/record-info?taskId=${encodeURIComponent(taskId)}`,
      { headers: { Authorization: `Bearer ${apiKey}` } }
    );

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return reply.code(response.status).send({
        error: err.msg || `Suno status error: ${response.status}`,
      });
    }

    const data = await response.json();
    if (data.code !== 200) {
      return reply.code(400).send({ error: data.msg || 'Failed to fetch task status' });
    }

    return data.data;
  });

  fastify.post('/cache-track', async (request, reply) => {
    const { audioUrl, genre, tone, mood, style, title, duration, imageUrl, campaignId } = request.body;
    if (!audioUrl) return reply.code(400).send({ error: 'audioUrl is required' });

    const cacheParams = { genre, tone, mood, style };
    const cacheKey = generateKey('music', cacheParams, campaignId);

    const existing = await prisma.mediaAsset.findUnique({ where: { key: cacheKey } });
    if (existing) {
      const url = await store.getUrl(existing.path);
      return { cached: true, url, key: cacheKey };
    }

    let buffer;
    try {
      const audioResponse = await fetch(audioUrl);
      if (!audioResponse.ok) throw new Error(`Failed to download audio: ${audioResponse.status}`);
      buffer = Buffer.from(await audioResponse.arrayBuffer());
    } catch (err) {
      return reply.code(502).send({ error: `Failed to download track: ${err.message}` });
    }

    const storeResult = await store.put(cacheKey, buffer, 'audio/mpeg');

    await prisma.mediaAsset.create({
      data: {
        userId: request.user.id,
        campaignId: campaignId || undefined,
        key: cacheKey,
        type: 'music',
        contentType: 'audio/mpeg',
        size: buffer.length,
        backend: config.mediaBackend,
        path: cacheKey,
        metadata: JSON.stringify({ genre, tone, mood, style, title, duration, imageUrl }),
      },
    });

    return { cached: false, url: storeResult.url, key: cacheKey, size: buffer.length };
  });
}
