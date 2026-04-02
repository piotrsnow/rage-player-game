import { generateScene } from '../services/sceneGenerator.js';
import { prisma } from '../lib/prisma.js';
import {
  embedText,
  buildSceneEmbeddingText,
  buildKnowledgeEmbeddingText,
  buildNPCEmbeddingText,
  buildCodexEmbeddingText,
} from '../services/embeddingService.js';
import { writeEmbedding } from '../services/vectorSearchService.js';

export async function aiRoutes(fastify) {
  fastify.addHook('onRequest', fastify.authenticate);

  /**
   * POST /ai/campaigns/:id/generate-scene
   *
   * Generate a new scene using AI with dynamic context (tool use).
   * AI gets lean base context and can query backend for more information.
   */
  fastify.post('/campaigns/:id/generate-scene', async (request, reply) => {
    const campaignId = request.params.id;
    const {
      playerAction,
      provider = 'openai',
      model,
      language = 'pl',
      dmSettings = {},
      resolvedMechanics = null,
      needsSystemEnabled = false,
      characterNeeds = null,
      dialogue = null,
      dialogueCooldown = 0,
      isFirstScene = false,
      isCustomAction = false,
      fromAutoPlayer = false,
      sceneCount = 0,
    } = request.body;

    if (!playerAction && !isFirstScene) {
      return reply.code(400).send({ error: 'playerAction is required' });
    }

    // Verify campaign ownership
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { userId: true },
    });

    if (!campaign) {
      return reply.code(404).send({ error: 'Campaign not found' });
    }

    if (campaign.userId !== request.user.id) {
      return reply.code(403).send({ error: 'Not authorized' });
    }

    try {
      const result = await generateScene(campaignId, playerAction || '[FIRST_SCENE]', {
        provider,
        model,
        language,
        dmSettings,
        resolvedMechanics,
        needsSystemEnabled,
        characterNeeds,
        dialogue,
        dialogueCooldown,
        isFirstScene,
        isCustomAction,
        fromAutoPlayer,
        sceneCount,
      });

      return {
        scene: result.scene,
        sceneIndex: result.sceneIndex,
        sceneId: result.sceneId,
      };
    } catch (err) {
      console.error('Scene generation error:', err);
      return reply.code(err.statusCode || 500).send({
        error: err.message || 'Scene generation failed',
        code: err.code || 'SCENE_GENERATION_ERROR',
      });
    }
  });

  /**
   * POST /ai/campaigns/:id/scenes
   *
   * Save a scene (created by frontend) to the normalized collection.
   * Generates embedding asynchronously.
   */
  fastify.post('/campaigns/:id/scenes', async (request, reply) => {
    const campaignId = request.params.id;
    const scene = request.body;

    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { userId: true },
    });

    if (!campaign || campaign.userId !== request.user.id) {
      return reply.code(403).send({ error: 'Not authorized' });
    }

    const sceneIndex = Number.isInteger(scene.sceneIndex) ? scene.sceneIndex : 0;
    const normalizedSuggestedActions = Array.isArray(scene.suggestedActions)
      ? scene.suggestedActions
      : (Array.isArray(scene.actions) ? scene.actions : []);
    const normalizedImageUrl = scene.imageUrl || scene.image || null;

    const existingScene = await prisma.campaignScene.findFirst({
      where: { campaignId, sceneIndex },
      select: { id: true },
    });

    const payload = {
      campaignId,
      sceneIndex,
      narrative: scene.narrative || '',
      chosenAction: scene.chosenAction || null,
      suggestedActions: JSON.stringify(normalizedSuggestedActions),
      dialogueSegments: JSON.stringify(scene.dialogueSegments || []),
      imagePrompt: scene.imagePrompt || null,
      imageUrl: normalizedImageUrl,
      soundEffect: scene.soundEffect || null,
      diceRoll: scene.diceRoll ? JSON.stringify(scene.diceRoll) : null,
      stateChanges: scene.stateChanges ? JSON.stringify(scene.stateChanges) : null,
      scenePacing: scene.scenePacing || 'exploration',
    };

    const savedScene = existingScene
      ? await prisma.campaignScene.update({
          where: { id: existingScene.id },
          data: payload,
        })
      : await prisma.campaignScene.create({ data: payload });

    // Generate embedding async
    const embeddingText = buildSceneEmbeddingText(savedScene);
    if (embeddingText) {
      embedText(embeddingText)
        .then((emb) => {
          if (emb) writeEmbedding('CampaignScene', savedScene.id, emb, embeddingText);
        })
        .catch((err) => console.error('Scene embedding failed:', err.message));
    }

    return { sceneId: savedScene.id, sceneIndex: savedScene.sceneIndex };
  });

  /**
   * GET /ai/campaigns/:id/scenes
   *
   * Get scenes for a campaign. Supports pagination.
   */
  fastify.get('/campaigns/:id/scenes', async (request, reply) => {
    const campaignId = request.params.id;
    const { limit = 10, offset = 0 } = request.query;

    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { userId: true },
    });

    if (!campaign || campaign.userId !== request.user.id) {
      return reply.code(403).send({ error: 'Not authorized' });
    }

    const scenes = await prisma.campaignScene.findMany({
      where: { campaignId },
      orderBy: { sceneIndex: 'desc' },
      take: parseInt(limit),
      skip: parseInt(offset),
    });
    const dedupedByIndex = new Map();
    for (const s of scenes) {
      if (!dedupedByIndex.has(s.sceneIndex)) {
        dedupedByIndex.set(s.sceneIndex, s);
      }
    }
    const uniqueScenes = Array.from(dedupedByIndex.values());

    // Parse JSON fields
    return uniqueScenes.map((s) => ({
      ...s,
      suggestedActions: JSON.parse(s.suggestedActions || '[]'),
      dialogueSegments: JSON.parse(s.dialogueSegments || '[]'),
      diceRoll: s.diceRoll ? JSON.parse(s.diceRoll) : null,
      stateChanges: s.stateChanges ? JSON.parse(s.stateChanges) : null,
    }));
  });

  /**
   * PATCH /ai/campaigns/:id/core
   *
   * Update campaign core state (partial update).
   */
  fastify.patch('/campaigns/:id/core', async (request, reply) => {
    const campaignId = request.params.id;
    const updates = request.body;

    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { userId: true, coreState: true },
    });

    if (!campaign || campaign.userId !== request.user.id) {
      return reply.code(403).send({ error: 'Not authorized' });
    }

    const currentState = JSON.parse(campaign.coreState);
    const mergedState = deepMerge(currentState, updates);

    await prisma.campaign.update({
      where: { id: campaignId },
      data: {
        coreState: JSON.stringify(mergedState),
        lastSaved: new Date(),
      },
    });

    return { ok: true };
  });
}

/**
 * Deep merge two objects (target <- source).
 * Arrays are replaced, not merged.
 */
function deepMerge(target, source) {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (
      source[key] &&
      typeof source[key] === 'object' &&
      !Array.isArray(source[key]) &&
      target[key] &&
      typeof target[key] === 'object' &&
      !Array.isArray(target[key])
    ) {
      result[key] = deepMerge(target[key], source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}
