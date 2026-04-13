import { prisma } from '../../lib/prisma.js';
import { withRetry } from '../../services/campaignSync.js';
import {
  SUMMARY_CACHE_MAX_ITEMS,
  normalizeRecapCacheKey,
  buildRecapAssetKey,
  parseRecapMetadata,
} from '../../services/campaignRecap.js';
import { RECAP_SAVE_SCHEMA } from './schemas.js';

export async function recapCampaignRoutes(app) {
  app.get('/:id/recaps', async (request, reply) => {
    const key = normalizeRecapCacheKey(request.query?.key);
    if (!key) return reply.code(400).send({ error: 'key is required' });

    const campaign = await prisma.campaign.findFirst({
      where: { id: request.params.id, userId: request.user.id },
      select: { id: true },
    });
    if (!campaign) return reply.code(404).send({ error: 'Campaign not found' });

    const assetKey = buildRecapAssetKey(campaign.id, key);
    const existing = await prisma.mediaAsset.findUnique({
      where: { key: assetKey },
      select: { metadata: true, createdAt: true },
    });
    if (!existing) return { found: false };

    const metadata = parseRecapMetadata(existing.metadata);
    const recap = typeof metadata.recap === 'string' ? metadata.recap.trim() : '';
    if (!recap) return { found: false };

    return {
      found: true,
      recap,
      cachedAt: existing.createdAt,
      meta: metadata.meta && typeof metadata.meta === 'object' ? metadata.meta : {},
    };
  });

  app.post('/:id/recaps', { schema: { body: RECAP_SAVE_SCHEMA } }, async (request, reply) => {
    const key = normalizeRecapCacheKey(request.body?.key);
    const recap = typeof request.body?.recap === 'string' ? request.body.recap.trim() : '';
    const meta = request.body?.meta && typeof request.body.meta === 'object' ? request.body.meta : {};

    if (!key) return reply.code(400).send({ error: 'key is required' });
    if (!recap) return reply.code(400).send({ error: 'recap is required' });

    const existing = await prisma.campaign.findFirst({
      where: { id: request.params.id, userId: request.user.id },
      select: { id: true, userId: true },
    });
    if (!existing) return reply.code(404).send({ error: 'Campaign not found' });

    const assetKey = buildRecapAssetKey(existing.id, key);
    const metadata = JSON.stringify({
      recap,
      meta,
      cachedAt: new Date().toISOString(),
    });

    await withRetry(() =>
      prisma.mediaAsset.upsert({
        where: { key: assetKey },
        create: {
          userId: existing.userId,
          campaignId: existing.id,
          key: assetKey,
          type: 'recap',
          contentType: 'application/json',
          size: Buffer.byteLength(recap, 'utf8'),
          backend: 'db',
          path: assetKey,
          metadata,
        },
        update: {
          size: Buffer.byteLength(recap, 'utf8'),
          metadata,
          lastAccessedAt: new Date(),
        },
      }),
    );

    const oldEntries = await prisma.mediaAsset.findMany({
      where: {
        userId: existing.userId,
        campaignId: existing.id,
        type: 'recap',
      },
      orderBy: { createdAt: 'desc' },
      skip: SUMMARY_CACHE_MAX_ITEMS,
      select: { id: true },
    });

    if (oldEntries.length > 0) {
      await prisma.mediaAsset.deleteMany({
        where: { id: { in: oldEntries.map((entry) => entry.id) } },
      });
    }

    return { ok: true };
  });
}
