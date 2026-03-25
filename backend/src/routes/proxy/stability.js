import multipart from '@fastify/multipart';
import { prisma } from '../../lib/prisma.js';
import { resolveApiKey } from '../../services/apiKeyService.js';
import { generateKey, toObjectId } from '../../services/hashService.js';
import { createMediaStore } from '../../services/mediaStore.js';
import { config } from '../../config.js';

const store = createMediaStore(config);

export async function stabilityProxyRoutes(fastify) {
  await fastify.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } });
  fastify.addHook('onRequest', fastify.authenticate);

  fastify.post('/generate', async (request, reply) => {
    const user = await prisma.user.findUnique({
      where: { id: request.user.id },
      select: { apiKeys: true },
    });
    const apiKey = resolveApiKey(user?.apiKeys || '{}', 'stability');
    if (!apiKey) return reply.code(400).send({ error: 'Stability API key not configured' });

    const { prompt, negativePrompt, model, aspectRatio, campaignId } = request.body;

    const cacheParams = { provider: 'stability', prompt };
    const cacheKey = generateKey('image', cacheParams, campaignId);

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
        campaignId: toObjectId(campaignId),
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

  fastify.post('/portrait', async (request, reply) => {
    const user = await prisma.user.findUnique({
      where: { id: request.user.id },
      select: { apiKeys: true },
    });
    const apiKey = resolveApiKey(user?.apiKeys || '{}', 'stability');
    if (!apiKey) return reply.code(400).send({ error: 'Stability API key not configured' });

    const parts = request.parts();
    let imageBuffer = null;
    let prompt = '';
    let strength = '0.45';

    for await (const part of parts) {
      if (part.type === 'file' && part.fieldname === 'image') {
        imageBuffer = await part.toBuffer();
      } else if (part.type === 'field') {
        if (part.fieldname === 'prompt') prompt = part.value;
        if (part.fieldname === 'strength') strength = part.value;
      }
    }

    if (!imageBuffer || !prompt) {
      return reply.code(400).send({ error: 'Image file and prompt are required' });
    }

    const formData = new FormData();
    formData.append('image', new Blob([imageBuffer], { type: 'image/jpeg' }), 'photo.jpg');
    formData.append('prompt', prompt);
    formData.append('negative_prompt', 'blurry, low quality, text, watermark, signature, deformed face, extra limbs, bad anatomy');
    formData.append('strength', strength);
    formData.append('mode', 'image-to-image');
    formData.append('model', 'sd3.5-large-turbo');
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
    if (data.finish_reason === 'CONTENT_FILTERED') {
      return reply.code(422).send({ error: 'Content was filtered by the AI safety system. Please try again.' });
    }

    const resultBuffer = Buffer.from(data.image, 'base64');
    const cacheParams = { provider: 'stability', type: 'portrait', prompt };
    const cacheKey = generateKey('image', cacheParams);
    const storagePath = cacheKey.replace('.png', '.jpg');
    const storeResult = await store.put(storagePath, resultBuffer, 'image/jpeg');

    await prisma.mediaAsset.create({
      data: {
        userId: request.user.id,
        key: cacheKey,
        type: 'image',
        contentType: 'image/jpeg',
        size: resultBuffer.length,
        backend: config.mediaBackend,
        path: storagePath,
        metadata: JSON.stringify(cacheParams),
      },
    });

    return { url: storeResult.url, key: cacheKey };
  });
}
