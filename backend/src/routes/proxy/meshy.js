import { prisma } from '../../lib/prisma.js';
import { UUID_PATTERN } from '../../lib/validators.js';
import { resolveApiKey } from '../../services/apiKeyService.js';
import { generateKey, toUuid } from '../../services/hashService.js';
import { createMediaStore } from '../../services/mediaStore.js';
import { config } from '../../config.js';

const MESHY_API_BASE = 'https://api.meshy.ai/openapi/v2';
const store = createMediaStore(config);
const TARGET_FORMATS = ['glb'];

const TEXT_TO_3D_BODY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['prompt'],
  properties: {
    prompt: { type: 'string', maxLength: 2000 },
    assetKey: { type: 'string', maxLength: 256 },
    campaignId: { type: 'string', pattern: UUID_PATTERN },
    cacheVersion: { type: 'string', maxLength: 64 },
  },
};

const REFINE_BODY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['previewTaskId'],
  properties: {
    previewTaskId: { type: 'string', maxLength: 128 },
  },
};

const STORE_BODY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['glbUrl', 'cacheKey'],
  properties: {
    glbUrl: { type: 'string', maxLength: 2048 },
    cacheKey: { type: 'string', maxLength: 512 },
    assetKey: { type: 'string', maxLength: 256 },
    campaignId: { type: 'string', pattern: UUID_PATTERN },
    prompt: { type: 'string', maxLength: 2000 },
    cacheVersion: { type: 'string', maxLength: 64 },
  },
};

const CHECK_BODY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    prompt: { type: 'string', maxLength: 2000 },
    assetKey: { type: 'string', maxLength: 256 },
    campaignId: { type: 'string', pattern: UUID_PATTERN },
    cacheVersion: { type: 'string', maxLength: 64 },
  },
};

function normalizeIdPart(value) {
  return String(value || '')
    .replace(/\.glb$/i, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

function titleFromFile(file) {
  return String(file || '')
    .replace(/\.glb$/i, '')
    .replace(/_/g, ' ')
    .trim();
}

function aliasTokensFromFile(file) {
  const raw = String(file || '').replace(/\.glb$/i, '');
  const parts = raw
    .split(/[_\s-]+/)
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);

  const aliases = new Set();
  if (parts.length) {
    aliases.add(parts.join(' '));
    if (parts.length > 1) {
      aliases.add(parts[parts.length - 1]);
    }
  }
  return [...aliases];
}

function toCatalogEntry(prefabAsset) {
  const metadata = prefabAsset.metadata || {};
  const file = prefabAsset.fileName || prefabAsset.path.split('/').pop() || '';
  const category = prefabAsset.category || 'misc';
  const aliases = Array.from(new Set([
    ...(Array.isArray(metadata.aliases) ? metadata.aliases : []),
    ...aliasTokensFromFile(file),
  ]));

  return {
    id: metadata.modelId || `${normalizeIdPart(category)}:${normalizeIdPart(file)}`,
    category,
    file,
    title: metadata.title || titleFromFile(file),
    prompt: metadata.prompt || '',
    aliases,
    storagePath: prefabAsset.path,
    updatedAt: prefabAsset.updatedAt,
  };
}

function buildCacheParams(prompt, assetKey, cacheVersion) {
  return {
    provider: 'meshy',
    prompt: prompt || '',
    assetKey: assetKey || '',
    cacheVersion: cacheVersion || 'legacy',
  };
}

function sanitizeStoragePath(value) {
  const normalized = String(value || '')
    .replace(/\\/g, '/')
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (!normalized.length) {
    return '';
  }

  if (normalized.some((segment) => segment === '.' || segment === '..')) {
    return '';
  }

  if (normalized.some((segment) => /[\u0000-\u001F\u007F]/.test(segment))) {
    return '';
  }

  return normalized.join('/');
}

export async function meshyProxyRoutes(fastify) {
  fastify.addHook('onRequest', fastify.authenticate);

  async function sendPrefabByStoragePath(storagePath, reply) {
    const prefab = await prisma.prefabAsset.findUnique({
      where: { path: storagePath },
    });

    if (prefab) {
      await prisma.prefabAsset.update({
        where: { path: storagePath },
        data: { lastAccessedAt: new Date() },
      });
    }

    const result = await store.get(storagePath);

    if (!result?.buffer) {
      if (prefab) {
        await prisma.prefabAsset.delete({
          where: { path: storagePath },
        });
        fastify.log.warn({ storagePath }, 'Removed stale prefabAsset after missing storage object');
      }
      return reply.code(404).send({ error: 'Prefab model not found' });
    }

    reply.header('Content-Type', 'model/gltf-binary');
    reply.header('Cache-Control', 'public, max-age=86400');
    return reply.send(result.buffer);
  }

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

  fastify.post('/text-to-3d', { schema: { body: TEXT_TO_3D_BODY_SCHEMA } }, async (request, reply) => {
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

  fastify.post('/refine', { schema: { body: REFINE_BODY_SCHEMA } }, async (request, reply) => {
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

  fastify.post('/store', { schema: { body: STORE_BODY_SCHEMA } }, async (request, reply) => {
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

    await prisma.mediaAsset.upsert({
      where: { key: cacheKey },
      create: {
        userId: request.user.id,
        campaignId: toUuid(campaignId),
        key: cacheKey,
        type: 'model3d',
        contentType: 'model/gltf-binary',
        size: buffer.length,
        backend: config.mediaBackend,
        path: storagePath,
        metadata: {
          provider: 'meshy',
          prompt: prompt || '',
          assetKey: assetKey || '',
          cacheVersion: cacheVersion || 'legacy',
        },
      },
      update: {},
    });

    return { cached: false, url: storeResult.url, key: cacheKey };
  });

  fastify.post('/check', { schema: { body: CHECK_BODY_SCHEMA } }, async (request, reply) => {
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

  fastify.get('/prefabs/catalog', async () => {
    const prefabs = await prisma.prefabAsset.findMany({
      orderBy: [
        { category: 'asc' },
        { fileName: 'asc' },
      ],
    });

    return {
      items: prefabs.map(toCatalogEntry),
      total: prefabs.length,
      source: 'prefabAsset',
    };
  });

  fastify.get('/prefabs', async (request, reply) => {
    const storagePath = sanitizeStoragePath(request.query?.path);
    if (!storagePath) {
      return reply.code(400).send({ error: 'path query param is required' });
    }

    if (!storagePath.startsWith('prefabs/')) {
      return reply.code(400).send({ error: 'Invalid prefab path' });
    }

    return sendPrefabByStoragePath(storagePath, reply);
  });

  fastify.get('/prefabs/:category/:file', async (request, reply) => {
    const { category, file } = request.params;
    if (!category || !file) {
      return reply.code(400).send({ error: 'category and file are required' });
    }

    const safeCategory = String(category).replace(/[^a-zA-Z0-9_-]/g, '');
    const safeFile = String(file).replace(/[^a-zA-Z0-9_.-]/g, '');
    const storagePath = `prefabs/${safeCategory}/${safeFile}`;
    return sendPrefabByStoragePath(storagePath, reply);
  });
}
