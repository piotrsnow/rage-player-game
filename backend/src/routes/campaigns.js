import crypto from 'node:crypto';
import { prisma } from '../lib/prisma.js';

const MAX_RETRIES = 3;
const RETRY_BASE_MS = 50;

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
  });
}
