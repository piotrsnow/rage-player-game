import crypto from 'node:crypto';
import { prisma } from '../../lib/prisma.js';
import { childLogger } from '../../lib/logger.js';
import {
  SCENE_CLIENT_SELECT,
  buildDistinctSceneCountMap,
  dedupeScenesByIndexAsc,
  extractTotalCost,
  stripNormalizedFromCoreState,
} from '../../services/campaignSerialize.js';
import {
  withRetry,
  fetchCampaignCharacters,
  reconstructFromNormalized,
  syncNPCsToNormalized,
  syncKnowledgeToNormalized,
  syncQuestsToNormalized,
} from '../../services/campaignSync.js';
import { CAMPAIGN_WRITE_SCHEMA } from './schemas.js';

const log = childLogger({ module: 'campaigns' });

export async function crudCampaignRoutes(app) {
  app.get('/', async (request) => {
    const campaigns = await prisma.campaign.findMany({
      where: { userId: request.user.id },
      select: {
        id: true, name: true, genre: true, tone: true,
        characterIds: true, totalCost: true,
        lastSaved: true, createdAt: true,
      },
      orderBy: { lastSaved: 'desc' },
    });

    const campaignIds = campaigns.map((c) => c.id);
    const sceneCounts = await prisma.campaignScene.groupBy({
      by: ['campaignId', 'sceneIndex'],
      where: { campaignId: { in: campaignIds } },
    });
    const sceneCountMap = buildDistinctSceneCountMap(sceneCounts);

    const allFirstIds = campaigns
      .map((c) => (Array.isArray(c.characterIds) && c.characterIds.length > 0 ? c.characterIds[0] : null))
      .filter(Boolean);
    const firstChars = allFirstIds.length > 0
      ? await prisma.character.findMany({
          where: { id: { in: allFirstIds } },
          select: { id: true, name: true, species: true, characterLevel: true },
        })
      : [];
    const charById = new Map(firstChars.map((c) => [c.id, c]));

    return campaigns.map((c) => {
      const firstId = Array.isArray(c.characterIds) && c.characterIds.length > 0 ? c.characterIds[0] : null;
      const firstChar = firstId ? charById.get(firstId) : null;
      return {
        id: c.id,
        name: c.name,
        genre: c.genre,
        tone: c.tone,
        lastSaved: c.lastSaved,
        createdAt: c.createdAt,
        characterIds: c.characterIds || [],
        characterName: firstChar?.name || '',
        characterSpecies: firstChar?.species || '',
        characterLevel: firstChar?.characterLevel || 1,
        sceneCount: sceneCountMap[c.id] || 0,
        totalCost: c.totalCost || 0,
      };
    });
  });

  app.get('/:id', async (request, reply) => {
    const campaign = await prisma.campaign.findFirst({
      where: { id: request.params.id, userId: request.user.id },
    });
    if (!campaign) return reply.code(404).send({ error: 'Campaign not found' });

    let coreState = {};
    try { coreState = JSON.parse(campaign.coreState); } catch { /* corrupted data */ }

    await reconstructFromNormalized(campaign.id, coreState);

    const [scenes, characters] = await Promise.all([
      prisma.campaignScene.findMany({
        where: { campaignId: campaign.id },
        orderBy: { sceneIndex: 'asc' },
        select: SCENE_CLIENT_SELECT,
      }),
      fetchCampaignCharacters(campaign.characterIds || []),
    ]);
    const dedupedScenes = dedupeScenesByIndexAsc(scenes);

    return {
      ...campaign,
      coreState,
      scenes: dedupedScenes,
      characters,
    };
  });

  app.post('/', {
    schema: { body: CAMPAIGN_WRITE_SCHEMA },
    config: { idempotency: true },
  }, async (request, reply) => {
    const { name, genre, tone, coreState: rawCoreState, characterIds: rawCharIds } = request.body;
    const parsed = typeof rawCoreState === 'object' ? rawCoreState : JSON.parse(rawCoreState || '{}');

    const { slim, npcs, knowledgeEvents, knowledgeDecisions, quests } =
      stripNormalizedFromCoreState(parsed);

    const characterIds = Array.isArray(rawCharIds) ? rawCharIds.filter((id) => typeof id === 'string' && id) : [];
    if (characterIds.length > 0) {
      const owned = await prisma.character.findMany({
        where: { id: { in: characterIds }, userId: request.user.id },
        select: { id: true },
      });
      const ownedSet = new Set(owned.map((c) => c.id));
      for (const id of characterIds) {
        if (!ownedSet.has(id)) {
          return reply.code(403).send({ error: `Character ${id} not found or not owned by user` });
        }
      }
    }

    const campaign = await prisma.campaign.create({
      data: {
        userId: request.user.id,
        name: name || '',
        genre: genre || '',
        tone: tone || '',
        coreState: JSON.stringify(slim),
        characterIds,
        totalCost: extractTotalCost(slim),
        lastSaved: new Date(),
        shareToken: crypto.randomUUID(),
      },
    });

    await syncNPCsToNormalized(campaign.id, npcs).catch((err) => log.error({ err, campaignId: campaign.id }, 'NPC sync wrapper failed'));
    await syncKnowledgeToNormalized(campaign.id, knowledgeEvents, knowledgeDecisions).catch((err) => log.error({ err, campaignId: campaign.id }, 'Knowledge sync wrapper failed'));
    await syncQuestsToNormalized(campaign.id, quests).catch((err) => log.error({ err, campaignId: campaign.id }, 'Quest sync wrapper failed'));

    const fullState = { ...slim };
    if (npcs.length > 0) { if (!fullState.world) fullState.world = {}; fullState.world.npcs = npcs; }
    if (quests.active?.length || quests.completed?.length) fullState.quests = quests;

    const characters = await fetchCampaignCharacters(characterIds);
    return { ...campaign, coreState: fullState, scenes: [], characters };
  });

  app.put('/:id', { schema: { body: CAMPAIGN_WRITE_SCHEMA } }, async (request, reply) => {
    const existing = await prisma.campaign.findFirst({
      where: { id: request.params.id, userId: request.user.id },
    });
    if (!existing) return reply.code(404).send({ error: 'Campaign not found' });

    const { name, genre, tone, coreState: rawCoreState, characterIds: rawCharIds } = request.body;

    const updateData = { lastSaved: new Date() };

    if (name !== undefined) updateData.name = name;
    if (genre !== undefined) updateData.genre = genre;
    if (tone !== undefined) updateData.tone = tone;

    if (Array.isArray(rawCharIds)) {
      const ids = rawCharIds.filter((id) => typeof id === 'string' && id);
      if (ids.length > 0) {
        const owned = await prisma.character.findMany({
          where: { id: { in: ids }, userId: request.user.id },
          select: { id: true },
        });
        const ownedSet = new Set(owned.map((c) => c.id));
        for (const id of ids) {
          if (!ownedSet.has(id)) {
            return reply.code(400).send({ error: `Character ${id} not found or not owned by user` });
          }
        }
      }
      updateData.characterIds = ids;
    }

    let pendingSync = null;

    if (rawCoreState !== undefined) {
      const parsed = typeof rawCoreState === 'object' ? rawCoreState : JSON.parse(rawCoreState || '{}');
      const { slim, npcs, knowledgeEvents, knowledgeDecisions, quests } =
        stripNormalizedFromCoreState(parsed);

      updateData.coreState = JSON.stringify(slim);
      updateData.totalCost = extractTotalCost(slim);

      pendingSync = { campaignId: request.params.id, npcs, knowledgeEvents, knowledgeDecisions, quests };
    }

    const campaign = await withRetry(() =>
      prisma.campaign.update({
        where: { id: request.params.id },
        data: updateData,
      }),
    );

    if (pendingSync) {
      const { campaignId, npcs, knowledgeEvents, knowledgeDecisions, quests } = pendingSync;
      await syncNPCsToNormalized(campaignId, npcs).catch((err) => log.error({ err, campaignId }, 'NPC sync wrapper failed'));
      await syncKnowledgeToNormalized(campaignId, knowledgeEvents, knowledgeDecisions).catch((err) => log.error({ err, campaignId }, 'Knowledge sync wrapper failed'));
      await syncQuestsToNormalized(campaignId, quests).catch((err) => log.error({ err, campaignId }, 'Quest sync wrapper failed'));
    }

    let parsedCoreState = {};
    try { parsedCoreState = JSON.parse(campaign.coreState); } catch { /* corrupted data */ }
    return { ...campaign, coreState: parsedCoreState };
  });

  app.delete('/:id', async (request, reply) => {
    const existing = await prisma.campaign.findFirst({
      where: { id: request.params.id, userId: request.user.id },
    });
    if (!existing) return reply.code(404).send({ error: 'Campaign not found' });

    await Promise.all([
      prisma.campaignScene.deleteMany({ where: { campaignId: request.params.id } }),
      prisma.campaignNPC.deleteMany({ where: { campaignId: request.params.id } }),
      prisma.campaignKnowledge.deleteMany({ where: { campaignId: request.params.id } }),
      prisma.campaignCodex.deleteMany({ where: { campaignId: request.params.id } }),
      prisma.campaignQuest.deleteMany({ where: { campaignId: request.params.id } }),
    ]);
    await prisma.campaign.delete({ where: { id: request.params.id } });
    return { success: true };
  });
}
