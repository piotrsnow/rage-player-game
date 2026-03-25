import { prisma } from '../../lib/prisma.js';
import { resolveApiKey } from '../../services/apiKeyService.js';
import { generateKey, toObjectId } from '../../services/hashService.js';
import { createMediaStore } from '../../services/mediaStore.js';
import { config } from '../../config.js';

const MESHY_API_BASE = 'https://api.meshy.ai/openapi/v2';
const store = createMediaStore(config);
const TARGET_FORMATS = ['glb'];

function buildCacheParams(prompt, assetKey, cacheVersion) {
  return {
    provider: 'meshy',
    prompt: prompt || '',
    assetKey: assetKey || '',
    cacheVersion: cacheVersion || 'legacy',
  };
}

export async function meshyProxyRoutes(fastify) {
  fastify.addHook('onRequest', fastify.authenticate);

  async function getMeshyKey(request, reply) {
    const user = await prisma.user.findUnique({
      where: { id: request.user.id },
      select: { apiKeys: true },
    });
    const apiKey = resolveApiKey(user?.apiKeys || '{}', 'meshy');
    if (!apiKey) {
      reply.code(400).send({ error: 'Meshy API key not configured' });
      return null;
    }
    return apiKey;
  }

  fastify.post('/text-to-3d', async (request, reply) => {
    const apiKey = await getMeshyKey(request, reply);
    if (!apiKey) return;

    const { prompt, assetKey, campaignId, cacheVersion } = request.body;
    if (!prompt) return reply.code(400).send({ error: 'Prompt is required' });

    const cacheParams = buildCacheParams(prompt, assetKey, cacheVersion);
    const cacheKey = generateKey('model3d', cacheParams, campaignId);

    const existing = await prisma.mediaAsset.findUnique({ where: { key: cacheKey } });
    if (existing) {
      const url = await store.getUrl(existing.path);
      return { cached: true, url, key: cacheKey, taskId: null };
    }

    const response = await fetch(`${MESHY_API_BASE}/text-to-3d`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        mode: 'preview',
        prompt,
        art_style: 'realistic',
        should_remesh: true,
        target_formats: TARGET_FORMATS,
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      fastify.log.error({ err, status: response.status }, 'Meshy text-to-3d failed');
      return reply.code(response.status).send({
        error: err.message || `Meshy API error: ${response.status}`,
      });
    }

    const data = await response.json();
    return { cached: false, taskId: data.result, key: cacheKey };
  });

  fastify.post('/refine', async (request, reply) => {
    const apiKey = await getMeshyKey(request, reply);
    if (!apiKey) return;

    const { previewTaskId } = request.body;
    if (!previewTaskId) return reply.code(400).send({ error: 'previewTaskId is required' });

    const response = await fetch(`${MESHY_API_BASE}/text-to-3d`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        mode: 'refine',
        preview_task_id: previewTaskId,
        target_formats: TARGET_FORMATS,
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      fastify.log.error({ err, status: response.status }, 'Meshy refine failed');
      return reply.code(response.status).send({
        error: err.message || `Meshy API error: ${response.status}`,
      });
    }

    const data = await response.json();
    return { taskId: data.result };
  });

  fastify.get('/tasks/:taskId', async (request, reply) => {
    const apiKey = await getMeshyKey(request, reply);
    if (!apiKey) return;

    const { taskId } = request.params;
    if (!taskId) return reply.code(400).send({ error: 'Task ID is required' });

    const response = await fetch(`${MESHY_API_BASE}/text-to-3d/${taskId}`, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      fastify.log.error({ err, status: response.status }, 'Meshy task poll failed');
      return reply.code(response.status).send({
        error: err.message || `Meshy API error: ${response.status}`,
      });
    }

    const data = await response.json();
    return {
      status: data.status,
      progress: data.progress || 0,
      model_urls: data.model_urls || null,
    };
  });

  fastify.post('/store', async (request, reply) => {
    const { glbUrl, cacheKey, assetKey, campaignId, prompt, cacheVersion } = request.body;
    if (!glbUrl || !cacheKey) {
      return reply.code(400).send({ error: 'glbUrl and cacheKey are required' });
    }

    const existing = await prisma.mediaAsset.findUnique({ where: { key: cacheKey } });
    if (existing) {
      const url = await store.getUrl(existing.path);
      return { cached: true, url, key: cacheKey };
    }

    const glbResponse = await fetch(glbUrl);
    if (!glbResponse.ok) {
      return reply.code(502).send({ error: `Failed to download GLB: ${glbResponse.status}` });
    }
    const arrayBuffer = await glbResponse.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const storagePath = cacheKey;
    const storeResult = await store.put(storagePath, buffer, 'model/gltf-binary');

    await prisma.mediaAsset.create({
      data: {
        userId: request.user.id,
        campaignId: toObjectId(campaignId),
        key: cacheKey,
        type: 'model3d',
        contentType: 'model/gltf-binary',
        size: buffer.length,
        backend: config.mediaBackend,
        path: storagePath,
        metadata: JSON.stringify({
          provider: 'meshy',
          prompt: prompt || '',
          assetKey: assetKey || '',
          cacheVersion: cacheVersion || 'legacy',
        }),
      },
    });

    return { cached: false, url: storeResult.url, key: cacheKey };
  });

  fastify.post('/check', async (request, reply) => {
    const { prompt, assetKey, campaignId, cacheVersion } = request.body;
    const cacheParams = buildCacheParams(prompt, assetKey, cacheVersion);
    const cacheKey = generateKey('model3d', cacheParams, campaignId);

    const existing = await prisma.mediaAsset.findUnique({ where: { key: cacheKey } });
    if (existing) {
      const url = await store.getUrl(existing.path);
      return { cached: true, url, key: cacheKey };
    }

    return { cached: false, key: cacheKey };
  });

  fastify.get('/prefabs/:category/:file', async (request, reply) => {
    const { category, file } = request.params;
    if (!category || !file) {
      return reply.code(400).send({ error: 'category and file are required' });
    }

    const safeCategory = String(category).replace(/[^a-zA-Z0-9_-]/g, '');
    const safeFile = String(file).replace(/[^a-zA-Z0-9_.-]/g, '');
    const storagePath = `prefabs/${safeCategory}/${safeFile}`;
    const result = await store.get(storagePath);

    if (!result?.buffer) {
      return reply.code(404).send({ error: 'Prefab model not found' });
    }

    reply.header('Content-Type', 'model/gltf-binary');
    reply.header('Cache-Control', 'public, max-age=86400');
    return reply.send(result.buffer);
  });
}
