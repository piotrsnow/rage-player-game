import { prisma } from '../../lib/prisma.js';
import { config } from '../../config.js';
import { generateKey } from '../../services/hashService.js';
import { createMediaStore } from '../../services/mediaStore.js';
import {
  SCENE_CLIENT_SELECT,
  buildDistinctSceneCountMap,
  dedupeScenesByIndexAsc,
} from '../../services/campaignSerialize.js';
import {
  withRetry,
  fetchCampaignCharacters,
  reconstructFromNormalized,
  getCampaignCharacterIds,
  getCharacterIdsForCampaigns,
} from '../../services/campaignSync.js';

const ELEVENLABS_URL = 'https://api.elevenlabs.io/v1';

export async function publicCampaignRoutes(fastify) {
  const store = createMediaStore(config);

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
          coreState: true, createdAt: true,
          user: { select: { email: true } },
        },
        orderBy,
        take: Math.min(Number(limit) || 50, 100),
        skip: Number(offset) || 0,
      }),
      prisma.campaign.count({ where }),
    ]);

    const campaignIds = campaigns.map((c) => c.id);
    const [sceneCounts, charIdsByCampaign] = await Promise.all([
      prisma.campaignScene.groupBy({
        by: ['campaignId', 'sceneIndex'],
        where: { campaignId: { in: campaignIds } },
      }),
      getCharacterIdsForCampaigns(campaignIds),
    ]);
    const sceneCountMap = buildDistinctSceneCountMap(sceneCounts);

    const firstCharIds = [...new Set(
      [...charIdsByCampaign.values()].map((ids) => ids[0]).filter(Boolean),
    )];
    const firstChars = firstCharIds.length > 0
      ? await prisma.character.findMany({
          where: { id: { in: firstCharIds } },
          select: { id: true, name: true, species: true, characterLevel: true, portraitUrl: true },
        })
      : [];
    const charById = new Map(firstChars.map((c) => [c.id, c]));

    return {
      campaigns: campaigns.map((c) => {
        const parsed = c.coreState || {};
        const characterIds = charIdsByCampaign.get(c.id) || [];
        const firstChar = characterIds[0] ? charById.get(characterIds[0]) : null;
        return {
          id: c.id,
          name: c.name,
          genre: c.genre,
          tone: c.tone,
          rating: c.rating,
          playCount: c.playCount,
          createdAt: c.createdAt,
          author: c.user?.email ? c.user.email.slice(0, 2) + '***' : 'Anonymous',
          sceneCount: sceneCountMap[c.id] || 0,
          worldDescription: parsed.campaign?.worldDescription?.substring(0, 300) || '',
          hook: parsed.campaign?.hook?.substring(0, 200) || '',
          characterName: firstChar?.name || '',
          characterSpecies: firstChar?.species || '',
          characterLevel: firstChar?.characterLevel || 1,
          characterPortraitUrl: firstChar?.portraitUrl || '',
        };
      }),
      total,
    };
  });

  fastify.get('/public/:id', async (request, reply) => {
    const campaign = await prisma.campaign.findFirst({
      where: { id: request.params.id, isPublic: true },
    });
    if (!campaign) return reply.code(404).send({ error: 'Campaign not found' });

    await withRetry(() =>
      prisma.campaign.update({
        where: { id: campaign.id },
        data: { playCount: { increment: 1 } },
      }),
    );

    const coreState = campaign.coreState || {};
    await reconstructFromNormalized(campaign.id, coreState);

    const characterIds = await getCampaignCharacterIds(campaign.id);
    const [scenes, characters] = await Promise.all([
      prisma.campaignScene.findMany({
        where: { campaignId: campaign.id },
        orderBy: { sceneIndex: 'asc' },
        select: SCENE_CLIENT_SELECT,
      }),
      fetchCampaignCharacters(characterIds),
    ]);
    const dedupedScenes = dedupeScenesByIndexAsc(scenes);

    return { ...campaign, coreState, characterIds, scenes: dedupedScenes, characters };
  });

  fastify.get('/share/:token', async (request, reply) => {
    const campaign = await prisma.campaign.findUnique({
      where: { shareToken: request.params.token },
      select: {
        id: true, name: true, genre: true, tone: true,
        coreState: true, createdAt: true,
        user: { select: { email: true } },
      },
    });
    if (!campaign) return reply.code(404).send({ error: 'Campaign not found or link expired' });

    const coreState = campaign.coreState || {};
    await reconstructFromNormalized(campaign.id, coreState);

    if (!coreState.narratorVoiceId && config.elevenlabsDefaultVoiceId) {
      coreState.narratorVoiceId = config.elevenlabsDefaultVoiceId;
    }

    const characterIds = await getCampaignCharacterIds(campaign.id);
    const [scenes, characters] = await Promise.all([
      prisma.campaignScene.findMany({
        where: { campaignId: campaign.id },
        orderBy: { sceneIndex: 'asc' },
        select: SCENE_CLIENT_SELECT,
      }),
      fetchCampaignCharacters(characterIds),
    ]);
    const dedupedScenes = dedupeScenesByIndexAsc(scenes);

    return {
      id: campaign.id,
      name: campaign.name,
      genre: campaign.genre,
      tone: campaign.tone,
      createdAt: campaign.createdAt,
      author: campaign.user?.email ? campaign.user.email.slice(0, 2) + '***' : 'Anonymous',
      coreState,
      scenes: dedupedScenes,
      characters,
    };
  });

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
      const meta = existing.metadata || {};
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

    await prisma.mediaAsset.upsert({
      where: { key: cacheKey },
      create: {
        userId: campaign.userId,
        campaignId: campaign.id,
        key: cacheKey,
        type: 'tts',
        contentType: 'audio/mpeg',
        size: audioBytes.length,
        backend: config.mediaBackend,
        path: cacheKey,
        metadata: { ...cacheParams, alignment: data.alignment },
      },
      update: {},
    });

    return { url, alignment: data.alignment || null };
  });
}
