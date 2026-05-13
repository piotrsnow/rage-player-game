import { prisma } from '../lib/prisma.js';

export async function galleryRoutes(fastify) {
  /**
   * GET /v1/gallery/feed — cursor-paginated public scene feed.
   * Returns scenes with images from public campaigns.
   */
  fastify.get('/feed', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          cursor: { type: 'string' },
          offset: { type: 'integer', minimum: 0, default: 0 },
          limit: { type: 'integer', minimum: 1, maximum: 50, default: 20 },
          sort: { type: 'string', enum: ['newest', 'popular'], default: 'newest' },
          genre: { type: 'string' },
          tone: { type: 'string' },
        },
      },
    },
  }, async (request) => {
    const { cursor, offset = 0, limit = 20, sort = 'newest', genre, tone } = request.query;

    const campaignWhere = { isPublic: true };
    if (genre) campaignWhere.genre = genre;
    if (tone) campaignWhere.tone = tone;

    const sceneWhere = {
      imageUrl: { not: null },
      campaign: campaignWhere,
    };

    const sceneSelect = {
      id: true,
      imageUrl: true,
      narrative: true,
      chosenAction: true,
      sceneIndex: true,
      campaignId: true,
      createdAt: true,
      campaign: { select: { name: true, genre: true, tone: true } },
      _count: { select: { favoritedBy: true } },
    };

    let scenes;
    let nextCursorValue = null;

    if (sort === 'popular') {
      const popularOffset = cursor ? Number(cursor) || 0 : offset;
      scenes = await prisma.campaignScene.findMany({
        where: sceneWhere,
        select: sceneSelect,
        orderBy: [
          { favoritedBy: { _count: 'desc' } },
          { createdAt: 'desc' },
        ],
        skip: popularOffset,
        take: limit + 1,
      });
      const hasMore = scenes.length > limit;
      if (hasMore) scenes.pop();
      nextCursorValue = hasMore ? String(popularOffset + limit) : null;
    } else {
      if (cursor) sceneWhere.id = { lt: cursor };
      scenes = await prisma.campaignScene.findMany({
        where: sceneWhere,
        select: sceneSelect,
        orderBy: { createdAt: 'desc' },
        take: limit + 1,
      });
      const hasMore = scenes.length > limit;
      if (hasMore) scenes.pop();
      nextCursorValue = hasMore ? scenes[scenes.length - 1].id : null;
    }

    const campaignIds = [...new Set(scenes.map((s) => s.campaignId))];
    const participants = campaignIds.length
      ? await prisma.campaignParticipant.findMany({
          where: { campaignId: { in: campaignIds } },
          select: {
            campaignId: true,
            character: { select: { name: true } },
          },
          distinct: ['campaignId'],
          orderBy: { joinedAt: 'asc' },
        })
      : [];
    const charNameMap = new Map(participants.map((p) => [p.campaignId, p.character?.name || '']));

    return {
      scenes: scenes.map((s) => ({
        id: s.id,
        imageUrl: s.imageUrl,
        narrative: s.narrative ? s.narrative.substring(0, 200) : '',
        chosenAction: s.chosenAction || '',
        sceneIndex: s.sceneIndex,
        campaignId: s.campaignId,
        campaignName: s.campaign.name,
        genre: s.campaign.genre,
        tone: s.campaign.tone,
        characterName: charNameMap.get(s.campaignId) || '',
        createdAt: s.createdAt,
        likeCount: s._count.favoritedBy,
      })),
      nextCursor: nextCursorValue,
    };
  });

  /**
   * GET /v1/gallery/my-chronicles — auth-required, user's scenes grouped by campaign.
   */
  fastify.get('/my-chronicles', {
    preHandler: [fastify.authenticate],
    schema: {
      querystring: {
        type: 'object',
        properties: {
          characterId: { type: 'string' },
          campaignId: { type: 'string' },
          offset: { type: 'integer', minimum: 0, default: 0 },
          limit: { type: 'integer', minimum: 1, maximum: 50, default: 20 },
        },
      },
    },
  }, async (request) => {
    const userId = request.user.id;
    const { characterId, campaignId: expandCampaignId, offset = 0, limit = 20 } = request.query;

    if (expandCampaignId) {
      const campaign = await prisma.campaign.findFirst({
        where: { id: expandCampaignId, userId },
        select: { id: true, name: true, genre: true, tone: true },
      });
      if (!campaign) return { campaigns: [] };

      const scenes = await prisma.campaignScene.findMany({
        where: { campaignId: expandCampaignId },
        orderBy: { sceneIndex: 'asc' },
        select: {
          id: true, sceneIndex: true, imageUrl: true, narrative: true,
          chosenAction: true, createdAt: true,
        },
        skip: offset,
        take: limit,
      });

      let favoriteIds = new Set();
      if (characterId) {
        const favs = await prisma.favoriteScene.findMany({
          where: { characterId, sceneId: { in: scenes.map((s) => s.id) } },
          select: { sceneId: true },
        });
        favoriteIds = new Set(favs.map((f) => f.sceneId));
      }

      return {
        campaigns: [{
          id: campaign.id,
          name: campaign.name,
          genre: campaign.genre,
          tone: campaign.tone,
          sceneCount: scenes.length,
          scenes: scenes.map((s) => ({
            id: s.id,
            sceneIndex: s.sceneIndex,
            imageUrl: s.imageUrl,
            narrative: s.narrative ? s.narrative.substring(0, 200) : '',
            chosenAction: s.chosenAction || '',
            createdAt: s.createdAt,
            isFavorite: favoriteIds.has(s.id),
          })),
        }],
      };
    }

    const recentCampaigns = await prisma.campaign.findMany({
      where: { userId },
      orderBy: { lastSaved: 'desc' },
      take: 5,
      select: { id: true, name: true, genre: true, tone: true },
    });

    if (!recentCampaigns.length) return { campaigns: [] };

    const campaignIds = recentCampaigns.map((c) => c.id);

    const scenesRaw = await prisma.campaignScene.findMany({
      where: { campaignId: { in: campaignIds } },
      orderBy: { sceneIndex: 'asc' },
      select: {
        id: true, sceneIndex: true, imageUrl: true, narrative: true,
        chosenAction: true, createdAt: true, campaignId: true,
      },
    });

    const scenesByCampaign = new Map();
    for (const s of scenesRaw) {
      if (!scenesByCampaign.has(s.campaignId)) scenesByCampaign.set(s.campaignId, []);
      scenesByCampaign.get(s.campaignId).push(s);
    }

    let favoriteIds = new Set();
    if (characterId) {
      const allSceneIds = scenesRaw.map((s) => s.id);
      if (allSceneIds.length) {
        const favs = await prisma.favoriteScene.findMany({
          where: { characterId, sceneId: { in: allSceneIds } },
          select: { sceneId: true },
        });
        favoriteIds = new Set(favs.map((f) => f.sceneId));
      }
    }

    const sceneCountMap = new Map();
    for (const [cId, arr] of scenesByCampaign) sceneCountMap.set(cId, arr.length);

    return {
      campaigns: recentCampaigns.map((c) => {
        const allScenes = scenesByCampaign.get(c.id) || [];
        const capped = allScenes.slice(0, 20);
        return {
          id: c.id,
          name: c.name,
          genre: c.genre,
          tone: c.tone,
          sceneCount: sceneCountMap.get(c.id) || 0,
          scenes: capped.map((s) => ({
            id: s.id,
            sceneIndex: s.sceneIndex,
            imageUrl: s.imageUrl,
            narrative: s.narrative ? s.narrative.substring(0, 200) : '',
            chosenAction: s.chosenAction || '',
            createdAt: s.createdAt,
            isFavorite: favoriteIds.has(s.id),
          })),
        };
      }),
    };
  });
}
