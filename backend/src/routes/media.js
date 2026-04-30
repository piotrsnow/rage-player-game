import { prisma } from '../lib/prisma.js';
import { UUID_PATTERN } from '../lib/validators.js';
import { createMediaStore } from '../services/mediaStore.js';
import { generateKey, toUuid } from '../services/hashService.js';
import { config } from '../config.js';
const store = createMediaStore(config);

const EXT_CONTENT_TYPES = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  webp: 'image/webp', gif: 'image/gif', mp3: 'audio/mpeg',
  glb: 'model/gltf-binary',
};

const CHECK_BODY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['type', 'params'],
  properties: {
    type: { type: 'string', maxLength: 64 },
    params: { type: 'object', additionalProperties: true },
    campaignId: { type: 'string', pattern: UUID_PATTERN },
  },
};

const STORE_BODY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['key', 'type', 'contentType', 'data'],
  properties: {
    key: { type: 'string', maxLength: 512 },
    type: { type: 'string', maxLength: 64 },
    contentType: { type: 'string', maxLength: 128 },
    metadata: { type: 'object', additionalProperties: true },
    data: { type: 'string' },
    campaignId: { type: 'string', pattern: UUID_PATTERN },
  },
};

export async function mediaRoutes(fastify) {
  // Public read by storage path (opaque hashed paths) — needed for shared campaign viewers without JWT.
  fastify.get('/file/*', async (request, reply) => {
    const path = request.params['*'];

    const asset = await prisma.mediaAsset.findFirst({ where: { path } });
    if (asset) {
      prisma.mediaAsset.update({
        where: { key: asset.key },
        data: { lastAccessedAt: new Date() },
      }).catch((err) => fastify.log.warn(err, `mediaAsset.update lastAccessedAt failed (${asset.key})`));
    }

    const result = await store.get(path);
    if (!result) return reply.code(404).send({ error: 'Media file not found' });

    const ext = path.split('.').pop()?.toLowerCase();
    const contentType = asset?.contentType || EXT_CONTENT_TYPES[ext] || 'application/octet-stream';
    reply.header('Content-Type', contentType);
    reply.header('Cache-Control', 'public, max-age=86400');
    reply.header('Cross-Origin-Resource-Policy', 'cross-origin');
    return reply.send(result.buffer);
  });

  await fastify.register(async function mediaAuthedRoutes(f) {
    f.addHook('onRequest', f.authenticate);

    f.post('/check', { schema: { body: CHECK_BODY_SCHEMA } }, async (request) => {
      const { type, params, campaignId } = request.body;
      const key = generateKey(type, params, campaignId);

      const asset = await prisma.mediaAsset.findUnique({ where: { key } });
      if (asset) {
        await prisma.mediaAsset.update({
          where: { key },
          data: { lastAccessedAt: new Date() },
        });
        const url = await store.getUrl(asset.path);
        return { cached: true, key, url, metadata: asset.metadata };
      }

      return { cached: false, key };
    });

    f.post('/store', { schema: { body: STORE_BODY_SCHEMA } }, async (request) => {
      const { key, type, contentType, metadata, data, campaignId } = request.body;

      const buffer = Buffer.from(data, 'base64');
      const rawExt = (contentType.split('/')[1] || 'bin').replace(/[^a-zA-Z0-9]/g, '');
      const ext = rawExt.substring(0, 10);
      const rawBaseName = (key.split('/').pop() || key).replace(/[^a-zA-Z0-9_\-]/g, '');
      const baseName = rawBaseName.substring(0, 100) || 'file';
      const safeCampaignId = campaignId ? campaignId.replace(/[^a-zA-Z0-9_\-]/g, '') : null;
      const safeType = (type || 'file').replace(/[^a-zA-Z0-9_\-]/g, '');
      const storagePath = safeCampaignId
        ? `campaigns/${safeCampaignId}/${safeType}s/${baseName}.${ext}`
        : `${safeType}s/${baseName}.${ext}`;

      const result = await store.put(storagePath, buffer, contentType);

      const asset = await prisma.mediaAsset.upsert({
        where: { key },
        create: {
          userId: request.user.id,
          campaignId: toUuid(campaignId),
          key,
          type,
          contentType,
          size: buffer.length,
          backend: config.mediaBackend,
          path: storagePath,
          metadata: metadata || {},
        },
        update: {
          size: buffer.length,
          path: storagePath,
          metadata: metadata || {},
          lastAccessedAt: new Date(),
        },
      });

      return { key: asset.key, url: result.url, size: asset.size };
    });

    f.get('/:key', async (request, reply) => {
      const key = request.params.key;

      const asset = await prisma.mediaAsset.findFirst({
        where: {
          key,
          userId: request.user.id,
        },
      });
      if (!asset) return reply.code(404).send({ error: 'Media not found' });

      await prisma.mediaAsset.update({
        where: { key: asset.key },
        data: { lastAccessedAt: new Date() },
      });

      const result = await store.get(asset.path);
      if (!result) return reply.code(404).send({ error: 'Media file not found' });

      reply.header('Content-Type', asset.contentType);
      reply.header('Cache-Control', 'public, max-age=86400');
      reply.header('Cross-Origin-Resource-Policy', 'cross-origin');
      return reply.send(result.buffer);
    });

    f.delete('/:key', async (request) => {
      const asset = await prisma.mediaAsset.findFirst({
        where: {
          key: request.params.key,
          userId: request.user.id,
        },
      });
      if (!asset) return { success: false, error: 'Not found' };

      await store.delete(asset.path);
      await prisma.mediaAsset.delete({ where: { key: asset.key } });
      return { success: true };
    });

    f.get('/stats/summary', async (request) => {
      const assets = await prisma.mediaAsset.findMany({
        where: { userId: request.user.id },
        select: { type: true, size: true },
      });

      const stats = { total: 0, totalSize: 0, byType: {} };
      for (const asset of assets) {
        stats.total++;
        stats.totalSize += asset.size;
        if (!stats.byType[asset.type]) {
          stats.byType[asset.type] = { count: 0, size: 0 };
        }
        stats.byType[asset.type].count++;
        stats.byType[asset.type].size += asset.size;
      }

      return stats;
    });
  });
}
