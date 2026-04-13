import multipart from '@fastify/multipart';
import { prisma } from '../../lib/prisma.js';
import { requireServerApiKey } from '../../services/apiKeyService.js';
import { generateKey, toObjectId } from '../../services/hashService.js';
import { downscaleGeneratedImage, GENERATED_IMAGE_SCALE } from '../../services/imageResize.js';
import { createMediaStore } from '../../services/mediaStore.js';
import { config } from '../../config.js';
import { AIServiceError, parseProviderError, toClientAiError } from '../../services/aiErrors.js';

const store = createMediaStore(config);

async function fetchPortraitBuffer(portraitUrl) {
  if (!portraitUrl) return null;
  const localPrefix = '/media/file/';
  if (portraitUrl.startsWith(localPrefix)) {
    const storagePath = portraitUrl.slice(localPrefix.length);
    const result = await store.get(storagePath);
    return result?.buffer ?? null;
  }
  const resp = await fetch(portraitUrl);
  if (!resp.ok) return null;
  return Buffer.from(await resp.arrayBuffer());
}

export async function openaiProxyRoutes(fastify) {
  await fastify.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } });
  fastify.addHook('onRequest', fastify.authenticate);

  fastify.post('/chat', async (request, reply) => {
    let apiKey;
    try {
      apiKey = requireServerApiKey('openai', 'OpenAI');
    } catch (err) {
      const clientErr = toClientAiError(err, 'OpenAI API key not configured');
      return reply.code(err instanceof AIServiceError ? err.statusCode : 503).send({
        error: clientErr.message,
        code: clientErr.code,
      });
    }

    const { messages, model, temperature, response_format, max_completion_tokens } = request.body;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model || config.aiModels.premium.openai,
        messages,
        temperature: temperature ?? 0.8,
        ...(response_format ? { response_format } : {}),
        ...(max_completion_tokens ? { max_completion_tokens } : {}),
      }),
    });

    if (!response.ok) {
      try {
        await parseProviderError(response, 'openai');
      } catch (err) {
        const clientErr = toClientAiError(err, 'OpenAI request failed.');
        return reply.code(err instanceof AIServiceError ? err.statusCode : response.status).send({
          error: clientErr.message,
          code: clientErr.code,
        });
      }
    }

    const data = await response.json();
    return data;
  });

  fastify.post('/images', async (request, reply) => {
    let apiKey;
    try {
      apiKey = requireServerApiKey('openai', 'OpenAI');
    } catch (err) {
      const clientErr = toClientAiError(err, 'OpenAI API key not configured');
      return reply.code(err instanceof AIServiceError ? err.statusCode : 503).send({
        error: clientErr.message,
        code: clientErr.code,
      });
    }

    const { prompt, size, quality, campaignId, forceNew = false, model: requestedModel } = request.body;

    const isGptImage = requestedModel === 'gpt-image-1.5';
    const imageModel = isGptImage ? 'gpt-image-1.5' : 'dall-e-3';

    const cacheParams = {
      provider: isGptImage ? 'gpt-image' : 'dalle',
      prompt,
      resolutionScale: GENERATED_IMAGE_SCALE,
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

    const bodyPayload = isGptImage
      ? { model: imageModel, prompt, n: 1, size: size || '1536x1024', quality: quality || 'medium' }
      : { model: imageModel, prompt, n: 1, size: size || '1792x1024', quality: quality || 'standard', response_format: 'b64_json' };

    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(bodyPayload),
    });

    if (!response.ok) {
      try {
        await parseProviderError(response, 'openai');
      } catch (err) {
        const clientErr = toClientAiError(err, `${isGptImage ? 'GPT Image' : 'DALL-E'} request failed.`);
        return reply.code(err instanceof AIServiceError ? err.statusCode : response.status).send({
          error: clientErr.message,
          code: clientErr.code,
        });
      }
    }

    const data = await response.json();
    const b64 = data.data[0]?.b64_json;
    if (!b64) return reply.code(500).send({ error: `No image returned from ${isGptImage ? 'GPT Image' : 'DALL-E'}` });

    const originalBuffer = Buffer.from(b64, 'base64');
    const buffer = await downscaleGeneratedImage(originalBuffer);
    const storagePath = cacheKey;
    const storeResult = await store.put(storagePath, buffer, 'image/png');

    await prisma.mediaAsset.upsert({
      where: { key: cacheKey },
      create: {
        userId: request.user.id,
        campaignId: toObjectId(campaignId),
        key: cacheKey,
        type: 'image',
        contentType: 'image/png',
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
    let apiKey;
    try {
      apiKey = requireServerApiKey('openai', 'OpenAI');
    } catch (err) {
      const clientErr = toClientAiError(err, 'OpenAI API key not configured');
      return reply.code(err instanceof AIServiceError ? err.statusCode : 503).send({
        error: clientErr.message,
        code: clientErr.code,
      });
    }

    const parts = request.parts();
    let imageBuffer = null;
    let prompt = '';
    let size = '1024x1024';
    let quality = 'medium';
    let inputFidelity = 'high';

    for await (const part of parts) {
      if (part.type === 'file' && part.fieldname === 'image') {
        imageBuffer = await part.toBuffer();
      } else if (part.type === 'field') {
        if (part.fieldname === 'prompt') prompt = part.value;
        if (part.fieldname === 'size') size = part.value;
        if (part.fieldname === 'quality') quality = part.value;
        if (part.fieldname === 'inputFidelity') inputFidelity = part.value;
      }
    }

    if (!imageBuffer || !prompt) {
      return reply.code(400).send({ error: 'Image file and prompt are required' });
    }

    const b64Image = imageBuffer.toString('base64');
    const dataUrl = `data:image/jpeg;base64,${b64Image}`;

    const response = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-image-1.5',
        images: [{ image_url: dataUrl }],
        prompt,
        n: 1,
        size,
        quality,
        input_fidelity: inputFidelity,
      }),
    });

    if (!response.ok) {
      try {
        await parseProviderError(response, 'openai');
      } catch (err) {
        const clientErr = toClientAiError(err, 'GPT Image portrait edit failed.');
        return reply.code(err instanceof AIServiceError ? err.statusCode : response.status).send({
          error: clientErr.message,
          code: clientErr.code,
        });
      }
    }

    const data = await response.json();
    const b64 = data.data[0]?.b64_json;
    if (!b64) return reply.code(500).send({ error: 'No image returned from GPT Image edit' });

    const resultBuffer = await downscaleGeneratedImage(Buffer.from(b64, 'base64'));
    const cacheParams = { provider: 'gpt-image', type: 'portrait-edit', prompt };
    const cacheKey = generateKey('image', cacheParams);
    const storeResult = await store.put(cacheKey, resultBuffer, 'image/png');

    await prisma.mediaAsset.upsert({
      where: { key: cacheKey },
      create: {
        userId: request.user.id,
        key: cacheKey,
        type: 'image',
        contentType: 'image/png',
        size: resultBuffer.length,
        backend: config.mediaBackend,
        path: cacheKey,
        metadata: JSON.stringify(cacheParams),
      },
      update: {},
    });

    return { url: storeResult.url, key: cacheKey };
  });

  fastify.post('/images/edits', async (request, reply) => {
    let apiKey;
    try {
      apiKey = requireServerApiKey('openai', 'OpenAI');
    } catch (err) {
      const clientErr = toClientAiError(err, 'OpenAI API key not configured');
      return reply.code(err instanceof AIServiceError ? err.statusCode : 503).send({
        error: clientErr.message,
        code: clientErr.code,
      });
    }

    const { prompt, portraitUrl, size, quality, campaignId, forceNew = false, inputFidelity = 'low' } = request.body;

    if (!prompt) {
      return reply.code(400).send({ error: 'Prompt is required' });
    }

    const cacheParams = {
      provider: 'gpt-image',
      type: 'scene-edit',
      prompt,
      portraitUrl: portraitUrl || '',
      resolutionScale: GENERATED_IMAGE_SCALE,
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

    const images = [];
    if (portraitUrl) {
      const portraitBuffer = await fetchPortraitBuffer(portraitUrl);
      if (portraitBuffer) {
        const b64Portrait = portraitBuffer.toString('base64');
        images.push({ image_url: `data:image/png;base64,${b64Portrait}` });
      }
    }

    const oaiBody = {
      model: 'gpt-image-1.5',
      prompt,
      n: 1,
      size: size || '1536x1024',
      quality: quality || 'medium',
    };
    if (images.length > 0) {
      oaiBody.images = images;
      oaiBody.input_fidelity = inputFidelity;
    }

    const response = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(oaiBody),
    });

    if (!response.ok) {
      try {
        await parseProviderError(response, 'openai');
      } catch (err) {
        const clientErr = toClientAiError(err, 'GPT Image scene edit failed.');
        return reply.code(err instanceof AIServiceError ? err.statusCode : response.status).send({
          error: clientErr.message,
          code: clientErr.code,
        });
      }
    }

    const data = await response.json();
    const b64 = data.data[0]?.b64_json;
    if (!b64) return reply.code(500).send({ error: 'No image returned from GPT Image edit' });

    const originalBuffer = Buffer.from(b64, 'base64');
    const buffer = await downscaleGeneratedImage(originalBuffer);
    const storeResult = await store.put(cacheKey, buffer, 'image/png');

    await prisma.mediaAsset.upsert({
      where: { key: cacheKey },
      create: {
        userId: request.user.id,
        campaignId: toObjectId(campaignId),
        key: cacheKey,
        type: 'image',
        contentType: 'image/png',
        size: buffer.length,
        backend: config.mediaBackend,
        path: cacheKey,
        metadata: JSON.stringify(cacheParams),
      },
      update: {},
    });

    return { cached: false, url: storeResult.url, key: cacheKey };
  });
}
