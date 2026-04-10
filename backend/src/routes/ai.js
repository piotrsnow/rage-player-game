import { generateSceneStream } from '../services/sceneGenerator.js';
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
   * POST /ai/campaigns/:id/generate-scene-stream
   *
   * Generate a new scene with SSE streaming.
   * Events: intent, context_ready, chunk, complete, error
   */
  fastify.post('/campaigns/:id/generate-scene-stream', async (request, reply) => {
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
      sceneCount = 0,
      isCustomAction = false,
      fromAutoPlayer = false,
    } = request.body;

    if ((playerAction === undefined || playerAction === null) && !isFirstScene) {
      return reply.code(400).send({ error: 'playerAction is required' });
    }

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

    // SSE headers (must include CORS manually since writeHead bypasses Fastify hooks)
    const origin = request.headers.origin || '*';
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Credentials': 'true',
    });

    await generateSceneStream(
      campaignId,
      playerAction || '[FIRST_SCENE]',
      {
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
        sceneCount,
        isCustomAction,
        fromAutoPlayer,
      },
      (event) => {
        try {
          reply.raw.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
        } catch {
          // client disconnected
        }
      },
    );

    reply.raw.end();
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
   * POST /ai/campaigns/:id/scenes/bulk
   *
   * Save multiple scenes in one request. DB writes run with bounded
   * concurrency (5) instead of sequentially. Embeddings are fire-and-forget.
   */
  fastify.post('/campaigns/:id/scenes/bulk', async (request, reply) => {
    const campaignId = request.params.id;
    const scenes = request.body?.scenes;

    if (!Array.isArray(scenes) || scenes.length === 0) {
      return reply.code(400).send({ error: 'scenes array is required' });
    }

    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { userId: true },
    });

    if (!campaign || campaign.userId !== request.user.id) {
      return reply.code(403).send({ error: 'Not authorized' });
    }

    const existingScenes = await prisma.campaignScene.findMany({
      where: {
        campaignId,
        sceneIndex: { in: scenes.map((s) => Number.isInteger(s.sceneIndex) ? s.sceneIndex : -1) },
      },
      select: { id: true, sceneIndex: true },
    });
    const existingByIndex = new Map(existingScenes.map((s) => [s.sceneIndex, s.id]));

    const CONCURRENCY = 5;
    const results = [];
    let i = 0;

    while (i < scenes.length) {
      const batch = scenes.slice(i, i + CONCURRENCY);
      const settled = await Promise.allSettled(
        batch.map((scene) => {
          const sceneIndex = Number.isInteger(scene.sceneIndex) ? scene.sceneIndex : 0;
          const normalizedSuggestedActions = Array.isArray(scene.suggestedActions)
            ? scene.suggestedActions
            : (Array.isArray(scene.actions) ? scene.actions : []);

          const payload = {
            campaignId,
            sceneIndex,
            narrative: scene.narrative || '',
            chosenAction: scene.chosenAction || null,
            suggestedActions: JSON.stringify(normalizedSuggestedActions),
            dialogueSegments: JSON.stringify(scene.dialogueSegments || []),
            imagePrompt: scene.imagePrompt || null,
            imageUrl: scene.imageUrl || scene.image || null,
            soundEffect: scene.soundEffect || null,
            diceRoll: scene.diceRoll ? JSON.stringify(scene.diceRoll) : null,
            stateChanges: scene.stateChanges ? JSON.stringify(scene.stateChanges) : null,
            scenePacing: scene.scenePacing || 'exploration',
          };

          const existingId = existingByIndex.get(sceneIndex);
          const dbOp = existingId
            ? prisma.campaignScene.update({ where: { id: existingId }, data: payload })
            : prisma.campaignScene.create({ data: payload });

          return dbOp.then((saved) => {
            if (!existingId) {
              const embeddingText = buildSceneEmbeddingText(saved);
              if (embeddingText) {
                embedText(embeddingText)
                  .then((emb) => {
                    if (emb) writeEmbedding('CampaignScene', saved.id, emb, embeddingText);
                  })
                  .catch((err) => console.error('Scene embedding failed:', err.message));
              }
            }
            return { sceneId: saved.id, sceneIndex: saved.sceneIndex };
          });
        }),
      );

      for (const r of settled) {
        results.push(
          r.status === 'fulfilled'
            ? r.value
            : { error: r.reason?.message || 'save failed' },
        );
      }
      i += CONCURRENCY;
    }

    return { saved: results.filter((r) => !r.error).length, total: scenes.length, results };
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
    const updates = request.body || {};

    // Character data lives in the Character collection now. Reject any
    // attempt to write character state through the campaign endpoint.
    if ('character' in updates) {
      return reply.code(400).send({
        error: 'Character data must be saved via /characters endpoints, not /ai/campaigns/:id/core. Use PATCH /characters/:id/state-changes for AI deltas or PUT /characters/:id for full snapshots.',
      });
    }

    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { userId: true, coreState: true },
    });

    if (!campaign || campaign.userId !== request.user.id) {
      return reply.code(403).send({ error: 'Not authorized' });
    }

    const currentState = JSON.parse(campaign.coreState);
    const data = {
      lastSaved: new Date(),
      coreState: JSON.stringify(deepMerge(currentState, updates)),
    };

    await prisma.campaign.update({
      where: { id: campaignId },
      data,
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
