import { PrismaClient } from '@prisma/client';
import { resolveApiKey } from '../../services/apiKeyService.js';
import { generateKey } from '../../services/hashService.js';
import { createMediaStore } from '../../services/mediaStore.js';
import { config } from '../../config.js';

const prisma = new PrismaClient();
const store = createMediaStore(config);

export async function stabilityProxyRoutes(fastify) {
  fastify.addHook('onRequest', fastify.authenticate);

  fastify.post('/generate', async (request, reply) => {
    const user = await prisma.user.findUnique({
      where: { id: request.user.id },
      select: { apiKeys: true },
    });
    const apiKey = resolveApiKey(user?.apiKeys || '{}', 'stability');
    if (!apiKey) return reply.code(400).send({ error: 'Stability API key not configured' });

    const { prompt, negativePrompt, model, aspectRatio } = request.body;

    const cacheParams = { provider: 'stability', prompt };
    const cacheKey = generateKey('image', cacheParams);

    const existing = await prisma.mediaAsset.findUnique({ where: { key: cacheKey } });
    if (existing) {
      const url = await store.getUrl(existing.path);
      return { cached: true, url, key: cacheKey };
    }

    const formData = new FormData();
    formData.append('prompt', prompt);
    formData.append('negative_prompt', negativePrompt || 'painting, drawing, illustration, cartoon, anime, sketch, watercolor, oil painting, digital art, unrealistic, blurry, low quality, text, watermark, signature');
    formData.append('model', model || 'sd3.5-large-turbo');
    formData.append('aspect_ratio', aspectRatio || '16:9');
    formData.append('output_format', 'jpeg');
    formData.append('none', '');

    const response = await fetch('https://api.stability.ai/v2beta/stable-image/generate/sd3', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
      },
      body: formData,
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      const msg = err.errors?.join('; ') || err.message || err.name || `Stability API error: ${response.status}`;
      return reply.code(response.status).send({ error: msg });
    }

    const data = await response.json();
    const buffer = Buffer.from(data.image, 'base64');

    const storagePath = cacheKey.replace('.png', '.jpg');
    const storeResult = await store.put(storagePath, buffer, 'image/jpeg');

    await prisma.mediaAsset.create({
      data: {
        userId: request.user.id,
        key: cacheKey,
        type: 'image',
        contentType: 'image/jpeg',
        size: buffer.length,
        backend: config.mediaBackend,
        path: storagePath,
        metadata: JSON.stringify(cacheParams),
      },
    });

    return { cached: false, url: storeResult.url, key: cacheKey };
  });
}
