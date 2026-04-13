import multipart from '@fastify/multipart';
import { prisma } from '../../lib/prisma.js';
import { resolveApiKey } from '../../services/apiKeyService.js';
import { generateKey, toObjectId } from '../../services/hashService.js';
import { downscaleGeneratedImage, getGeneratedImageScale } from '../../services/imageResize.js';
import { createMediaStore } from '../../services/mediaStore.js';
import { config } from '../../config.js';

const store = createMediaStore(config);
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent';

const OBJECT_ID_PATTERN = '^[a-f0-9]{24}$';

const GENERATE_BODY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['prompt'],
  properties: {
    prompt: { type: 'string', maxLength: 4000 },
    campaignId: { type: 'string', pattern: OBJECT_ID_PATTERN },
    forceNew: { type: 'boolean' },
  },
};

function extractImageFromResponse(data) {
  const parts = data.candidates?.[0]?.content?.parts;
  if (!parts) return null;
  const imagePart = parts.find((p) => p.inlineData);
  if (!imagePart) return null;
  return imagePart.inlineData;
}

export async function geminiProxyRoutes(fastify) {
  await fastify.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } });
  fastify.addHook('onRequest', fastify.authenticate);

  fastify.post('/generate', { schema: { body: GENERATE_BODY_SCHEMA } }, async (request, reply) => {
    const user = await prisma.user.findUnique({
      where: { id: request.user.id },
      select: { apiKeys: true },
    });
    const apiKey = resolveApiKey(user?.apiKeys || '{}', 'gemini');
    if (!apiKey) return reply.code(400).send({ error: 'Google AI API key not configured' });

    const { prompt, campaignId, forceNew = false } = request.body;

    const resolutionScale = getGeneratedImageScale('gemini');
    const cacheParams = {
      provider: 'gemini',
      prompt,
      resolutionScale,
      ...(forceNew ? { requestTs: Date.now() } : {}),
    };
    const cacheKey = generateKey('image', cacheParams, campaignId);

    if (!forceNew) {
      const existing = await prisma.mediaAsset.findUnique({ where: { key: cacheKey } });
      if (existing) {
        const url = await store.getUrl(existing.path);
        return { cached: true, url, key: cacheKey };
      }
    }

    const response = await fetch(`${GEMINI_API_URL}?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseModalities: ['TEXT', 'IMAGE'],
          imageConfig: { aspectRatio: '16:9', imageSize: '2K' },
        },
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      const msg = err.error?.message || `Gemini API error: ${response.status}`;
      return reply.code(response.status).send({ error: msg });
    }

    const data = await response.json();
    const imageData = extractImageFromResponse(data);
    if (!imageData) {
      return reply.code(422).send({ error: 'Gemini returned no image' });
    }

    const originalBuffer = Buffer.from(imageData.data, 'base64');
    const buffer = await downscaleGeneratedImage(originalBuffer, resolutionScale);
    const isPng = (imageData.mimeType || '').includes('png');
    const ext = isPng ? '.png' : '.jpg';
    const contentType = isPng ? 'image/png' : 'image/jpeg';

    const storagePath = cacheKey.replace('.png', ext);
    const storeResult = await store.put(storagePath, buffer, contentType);

    await prisma.mediaAsset.upsert({
      where: { key: cacheKey },
      create: {
        userId: request.user.id,
        campaignId: toObjectId(campaignId),
        key: cacheKey,
        type: 'image',
        contentType,
        size: buffer.length,
        backend: config.mediaBackend,
        path: storagePath,
        metadata: JSON.stringify(cacheParams),
      },
      update: {},
    });

    return { cached: false, url: storeResult.url, key: cacheKey };
  });

  fastify.post('/portrait', async (request, reply) => {
    const user = await prisma.user.findUnique({
      where: { id: request.user.id },
      select: { apiKeys: true },
    });
    const apiKey = resolveApiKey(user?.apiKeys || '{}', 'gemini');
    if (!apiKey) return reply.code(400).send({ error: 'Google AI API key not configured' });

    const contentType = request.headers['content-type'] || '';
    let prompt = '';
    let imageBuffer = null;

    if (contentType.includes('multipart')) {
      const parts = request.parts();
      for await (const part of parts) {
        if (part.type === 'file' && part.fieldname === 'image') {
          imageBuffer = await part.toBuffer();
        } else if (part.type === 'field' && part.fieldname === 'prompt') {
          prompt = part.value;
        }
      }
    } else {
      prompt = request.body?.prompt || '';
    }

    if (!prompt) {
      return reply.code(400).send({ error: 'Prompt is required' });
    }

    const resolutionScale = getGeneratedImageScale('gemini');
    const requestParts = [];
    if (imageBuffer) {
      requestParts.push({
        inlineData: {
          mimeType: 'image/jpeg',
          data: imageBuffer.toString('base64'),
        },
      });
    }
    requestParts.push({ text: prompt });

    const response = await fetch(`${GEMINI_API_URL}?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: requestParts }],
        generationConfig: {
          responseModalities: ['TEXT', 'IMAGE'],
          imageConfig: { aspectRatio: '3:4', imageSize: '2K' },
        },
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      const msg = err.error?.message || `Gemini API error: ${response.status}`;
      return reply.code(response.status).send({ error: msg });
    }

    const data = await response.json();
    const imageResultData = extractImageFromResponse(data);
    if (!imageResultData) {
      return reply.code(422).send({ error: 'Gemini returned no image' });
    }

    const originalBuffer = Buffer.from(imageResultData.data, 'base64');
    const resultBuffer = await downscaleGeneratedImage(originalBuffer, resolutionScale);
    const isPng = (imageResultData.mimeType || '').includes('png');
    const ext = isPng ? '.png' : '.jpg';
    const resultContentType = isPng ? 'image/png' : 'image/jpeg';

    const cacheParams = { provider: 'gemini', type: 'portrait', prompt, resolutionScale };
    const cacheKey = generateKey('image', cacheParams);
    const storagePath = cacheKey.replace('.png', ext);
    const storeResult = await store.put(storagePath, resultBuffer, resultContentType);

    await prisma.mediaAsset.upsert({
      where: { key: cacheKey },
      create: {
        userId: request.user.id,
        key: cacheKey,
        type: 'image',
        contentType: resultContentType,
        size: resultBuffer.length,
        backend: config.mediaBackend,
        path: storagePath,
        metadata: JSON.stringify(cacheParams),
      },
      update: {},
    });

    return { url: storeResult.url, key: cacheKey };
  });
}
