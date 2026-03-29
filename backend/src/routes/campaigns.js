import crypto from 'node:crypto';
import { prisma } from '../lib/prisma.js';
import { generateKey } from '../services/hashService.js';
import { createMediaStore } from '../services/mediaStore.js';
import { config } from '../config.js';

const store = createMediaStore(config);
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 50;
const SUMMARY_CACHE_MAX_ITEMS = 40;

async function withRetry(fn) {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const isRetryable = err.code === 'P2034';
      if (!isRetryable || attempt === MAX_RETRIES - 1) throw err;
      await new Promise((r) => setTimeout(r, RETRY_BASE_MS * 2 ** attempt));
    }
  }
}

function normalizeRecapCacheKey(rawKey) {
  const key = typeof rawKey === 'string' ? rawKey.trim() : '';
  if (!key) return '';
  return key.replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 180);
}

function buildRecapAssetKey(campaignId, cacheKey) {
  return `recap/${campaignId}/${cacheKey}`;
}

function parseRecapMetadata(raw) {
  try {
    const parsed = JSON.parse(raw || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export async function campaignRoutes(fastify) {
  // ── Public routes (no auth) ──────────────────────────────────────────

  fastify.get('/public', async (request) => {
    const { genre, tone, sort = 'newest', q, limit = 50, offset = 0 } = request.query;
    const where = { isPublic: true };
    if (genre) where.genre = genre;
    if (tone) where.tone = tone;
    if (q) where.name = { contains: q, mode: 'insensitive' };

    const orderBy = sort === 'rating'
      ? { rating: 'desc' }
      : sort === 'popular'
        ? { playCount: 'desc' }
        : { createdAt: 'desc' };

    const [campaigns, total] = await Promise.all([
      prisma.campaign.findMany({
        where,
        select: {
          id: true, name: true, genre: true, tone: true,
          rating: true, playCount: true,
          data: true, createdAt: true,
          user: { select: { email: true } },
        },
        orderBy,
        take: Math.min(Number(limit) || 50, 100),
        skip: Number(offset) || 0,
      }),
      prisma.campaign.count({ where }),
    ]);

    return {
      campaigns: campaigns.map((c) => {
        let parsed = {};
        try { parsed = JSON.parse(c.data); } catch { /* empty */ }
        return {
          id: c.id,
          name: c.name,
          genre: c.genre,
          tone: c.tone,
          rating: c.rating,
          playCount: c.playCount,
          createdAt: c.createdAt,
          author: c.user?.email ? c.user.email.slice(0, 2) + '***' : 'Anonymous',
          sceneCount: parsed.scenes?.length || 0,
          worldDescription: parsed.campaign?.worldDescription?.substring(0, 300) || '',
          hook: parsed.campaign?.hook?.substring(0, 200) || '',
          characterName: parsed.character?.name || '',
          characterCareer: parsed.character?.career?.name || '',
        };
      }),
      total,
    };
  });

  fastify.get('/public/:id', async (request, reply) => {
    const campaign = await prisma.campaign.findFirst({
      where: { id: request.params.id, isPublic: true },
      select: {
        id: true, name: true, genre: true, tone: true,
        rating: true, playCount: true,
        data: true, isPublic: true, createdAt: true,
      },
    });
    if (!campaign) return reply.code(404).send({ error: 'Campaign not found' });

    await withRetry(() =>
      prisma.campaign.update({
        where: { id: campaign.id },
        data: { playCount: { increment: 1 } },
      }),
    );

    let parsed = {};
    try { parsed = JSON.parse(campaign.data); } catch { /* corrupted data */ }
    return { ...campaign, data: parsed };
  });

  fastify.get('/share/:token', async (request, reply) => {
    const campaign = await prisma.campaign.findUnique({
      where: { shareToken: request.params.token },
      select: {
        id: true, name: true, genre: true, tone: true,
        data: true, createdAt: true,
        user: { select: { email: true } },
      },
    });
    if (!campaign) return reply.code(404).send({ error: 'Campaign not found or link expired' });

    let parsed = {};
    try { parsed = JSON.parse(campaign.data); } catch { /* corrupted data */ }

    if (!parsed.narratorVoiceId && config.elevenlabsDefaultVoiceId) {
      parsed.narratorVoiceId = config.elevenlabsDefaultVoiceId;
    }

    return {
      id: campaign.id,
      name: campaign.name,
      genre: campaign.genre,
      tone: campaign.tone,
      createdAt: campaign.createdAt,
      author: campaign.user?.email ? campaign.user.email.slice(0, 2) + '***' : 'Anonymous',
      data: parsed,
    };
  });

  const ELEVENLABS_URL = 'https://api.elevenlabs.io/v1';

  // Public TTS for shared campaigns — no auth required, uses server key
  fastify.post('/share/:token/tts', async (request, reply) => {
    const campaign = await prisma.campaign.findUnique({
      where: { shareToken: request.params.token },
      select: { id: true, userId: true },
    });
    if (!campaign) return reply.code(404).send({ error: 'Campaign not found' });

    const { voiceId, text, modelId } = request.body || {};
    if (!voiceId || !text) return reply.code(400).send({ error: 'voiceId and text are required' });

    const model = modelId || 'eleven_multilingual_v2';
    const cacheParams = { voiceId, text, modelId: model };
    const cacheKey = generateKey('tts', cacheParams, campaign.id);

    const existing = await prisma.mediaAsset.findUnique({ where: { key: cacheKey } });
    if (existing) {
      const url = await store.getUrl(existing.path);
      const meta = JSON.parse(existing.metadata);
      return { url, alignment: meta.alignment || null };
    }

    const apiKey = config.apiKeys.elevenlabs;
    if (!apiKey) return reply.code(404).send({ error: 'Audio not cached' });

    const response = await fetch(`${ELEVENLABS_URL}/text-to-speech/${voiceId}/with-timestamps`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'xi-api-key': apiKey },
      body: JSON.stringify({
        text,
        model_id: model,
        voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.0, use_speaker_boost: true },
        output_format: 'mp3_44100_128',
      }),
    });

    if (!response.ok) {
      return reply.code(502).send({ error: 'TTS generation failed' });
    }

    const data = await response.json();
    const audioBytes = Buffer.from(data.audio_base64, 'base64');
    await store.put(cacheKey, audioBytes, 'audio/mpeg');
    const url = await store.getUrl(cacheKey);

    await prisma.mediaAsset.create({
      data: {
        userId: campaign.userId,
        campaignId: campaign.id,
        key: cacheKey,
        type: 'tts',
        contentType: 'audio/mpeg',
        size: audioBytes.length,
        backend: config.mediaBackend,
        path: cacheKey,
        metadata: JSON.stringify({ ...cacheParams, alignment: data.alignment }),
      },
    });

    return { url, alignment: data.alignment || null };
  });

  // ── Authenticated routes (wrapped in a child scope with auth hook) ───

  fastify.register(async function authedCampaignRoutes(app) {
    app.addHook('onRequest', app.authenticate);

    app.get('/', async (request) => {
      const campaigns = await prisma.campaign.findMany({
        where: { userId: request.user.id },
        select: { id: true, name: true, genre: true, tone: true, lastSaved: true, createdAt: true },
        orderBy: { lastSaved: 'desc' },
      });
      return campaigns;
    });

    app.get('/:id', async (request, reply) => {
      const campaign = await prisma.campaign.findFirst({
        where: { id: request.params.id, userId: request.user.id },
      });
      if (!campaign) return reply.code(404).send({ error: 'Campaign not found' });

      let parsed = {};
      try { parsed = JSON.parse(campaign.data); } catch { /* corrupted data */ }
      return { ...campaign, data: parsed };
    });

    app.post('/', async (request) => {
      const { name, genre, tone, data } = request.body;

      const campaign = await prisma.campaign.create({
        data: {
          userId: request.user.id,
          name: name || '',
          genre: genre || '',
          tone: tone || '',
          data: JSON.stringify(data || {}),
          lastSaved: new Date(),
        },
      });

      let parsedData = {};
      try { parsedData = JSON.parse(campaign.data); } catch { /* corrupted data */ }
      return { ...campaign, data: parsedData };
    });

    app.put('/:id', async (request, reply) => {
      const existing = await prisma.campaign.findFirst({
        where: { id: request.params.id, userId: request.user.id },
      });
      if (!existing) return reply.code(404).send({ error: 'Campaign not found' });

      const { name, genre, tone, data } = request.body;
      const updateData = { lastSaved: new Date() };

      if (name !== undefined) updateData.name = name;
      if (genre !== undefined) updateData.genre = genre;
      if (tone !== undefined) updateData.tone = tone;
      if (data !== undefined) updateData.data = JSON.stringify(data);

      const campaign = await withRetry(() =>
        prisma.campaign.update({
          where: { id: request.params.id },
          data: updateData,
        }),
      );

      let parsedPutData = {};
      try { parsedPutData = JSON.parse(campaign.data); } catch { /* corrupted data */ }
      return { ...campaign, data: parsedPutData };
    });

    app.delete('/:id', async (request, reply) => {
      const existing = await prisma.campaign.findFirst({
        where: { id: request.params.id, userId: request.user.id },
      });
      if (!existing) return reply.code(404).send({ error: 'Campaign not found' });

      await prisma.campaign.delete({ where: { id: request.params.id } });
      return { success: true };
    });

    app.post('/:id/share', async (request, reply) => {
      const existing = await prisma.campaign.findFirst({
        where: { id: request.params.id, userId: request.user.id },
      });
      if (!existing) return reply.code(404).send({ error: 'Campaign not found' });

      if (existing.shareToken) {
        return { shareToken: existing.shareToken };
      }

      const shareToken = crypto.randomUUID();
      await withRetry(() =>
        prisma.campaign.update({
          where: { id: request.params.id },
          data: { shareToken },
        }),
      );
      return { shareToken };
    });

    app.delete('/:id/share', async (request, reply) => {
      const existing = await prisma.campaign.findFirst({
        where: { id: request.params.id, userId: request.user.id },
      });
      if (!existing) return reply.code(404).send({ error: 'Campaign not found' });

      await withRetry(() =>
        prisma.campaign.update({
          where: { id: request.params.id },
          data: { shareToken: null },
        }),
      );
      return { success: true };
    });

    app.patch('/:id/publish', async (request, reply) => {
      const existing = await prisma.campaign.findFirst({
        where: { id: request.params.id, userId: request.user.id },
      });
      if (!existing) return reply.code(404).send({ error: 'Campaign not found' });

      const { isPublic } = request.body;
      if (typeof isPublic !== 'boolean') {
        return reply.code(400).send({ error: 'isPublic must be a boolean' });
      }
      const campaign = await withRetry(() =>
        prisma.campaign.update({
          where: { id: request.params.id },
          data: { isPublic },
        }),
      );
      return { id: campaign.id, isPublic: campaign.isPublic };
    });

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

    app.post('/:id/recaps', async (request, reply) => {
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
  });
}
