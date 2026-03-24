import { prisma } from '../../lib/prisma.js';
import { resolveApiKey } from '../../services/apiKeyService.js';
import { generateKey } from '../../services/hashService.js';
import { createMediaStore } from '../../services/mediaStore.js';
import { config } from '../../config.js';

const store = createMediaStore(config);

export async function openaiProxyRoutes(fastify) {
  fastify.addHook('onRequest', fastify.authenticate);

  fastify.post('/chat', async (request, reply) => {
    const user = await prisma.user.findUnique({
      where: { id: request.user.id },
      select: { apiKeys: true },
    });
    const apiKey = resolveApiKey(user?.apiKeys || '{}', 'openai');
    if (!apiKey) return reply.code(400).send({ error: 'OpenAI API key not configured' });

    const { messages, model, temperature, response_format } = request.body;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model || 'gpt-4o',
        messages,
        temperature: temperature ?? 0.8,
        ...(response_format ? { response_format } : {}),
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return reply.code(response.status).send({
        error: err.error?.message || `OpenAI API error: ${response.status}`,
      });
    }

    const data = await response.json();
    return data;
  });

  fastify.post('/images', async (request, reply) => {
    const user = await prisma.user.findUnique({
      where: { id: request.user.id },
      select: { apiKeys: true },
    });
    const apiKey = resolveApiKey(user?.apiKeys || '{}', 'openai');
    if (!apiKey) return reply.code(400).send({ error: 'OpenAI API key not configured' });

    const { prompt, size, quality, campaignId } = request.body;

    const cacheParams = { provider: 'dalle', prompt };
    const cacheKey = generateKey('image', cacheParams, campaignId);

    const existing = await prisma.mediaAsset.findUnique({ where: { key: cacheKey } });
    if (existing) {
      const url = await store.getUrl(existing.path);
      return { cached: true, url, key: cacheKey };
    }

    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'dall-e-3',
        prompt,
        n: 1,
        size: size || '1792x1024',
        quality: quality || 'standard',
        response_format: 'b64_json',
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return reply.code(response.status).send({
        error: err.error?.message || `DALL-E API error: ${response.status}`,
      });
    }

    const data = await response.json();
    const b64 = data.data[0]?.b64_json;
    if (!b64) return reply.code(500).send({ error: 'No image returned from DALL-E' });

    const buffer = Buffer.from(b64, 'base64');
    const storagePath = cacheKey;
    const storeResult = await store.put(storagePath, buffer, 'image/png');

    await prisma.mediaAsset.create({
      data: {
        userId: request.user.id,
        campaignId: campaignId || undefined,
        key: cacheKey,
        type: 'image',
        contentType: 'image/png',
        size: buffer.length,
        backend: config.mediaBackend,
        path: storagePath,
        metadata: JSON.stringify(cacheParams),
      },
    });

    return { cached: false, url: storeResult.url, key: cacheKey };
  });
}
