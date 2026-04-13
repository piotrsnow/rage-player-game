import { generateSceneStream } from '../services/sceneGenerator.js';
import { generateStoryPrompt } from '../services/storyPromptGenerator.js';
import { generateCampaignStream } from '../services/campaignGenerator.js';
import { prisma } from '../lib/prisma.js';
import { resolveSseCorsOrigin } from '../plugins/cors.js';
import {
  embedText,
  buildSceneEmbeddingText,
  buildKnowledgeEmbeddingText,
  buildNPCEmbeddingText,
  buildCodexEmbeddingText,
} from '../services/embeddingService.js';
import { writeEmbedding } from '../services/vectorSearchService.js';

function writeSseHead(request, reply) {
  const origin = resolveSseCorsOrigin(request.headers.origin);
  if (origin === false) {
    reply.code(403).send({ error: 'Origin not allowed' });
    return false;
  }
  const headers = {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  };
  if (origin) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Credentials'] = 'true';
  }
  reply.raw.writeHead(200, headers);
  return true;
}

const PROVIDER_SCHEMA = { type: 'string', maxLength: 40 };
const MODEL_SCHEMA = { type: ['string', 'null'], maxLength: 200 };
const LANGUAGE_SCHEMA = { type: 'string', maxLength: 10 };

const STORY_PROMPT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    genre: { type: 'string', maxLength: 100 },
    tone: { type: 'string', maxLength: 100 },
    style: { type: 'string', maxLength: 100 },
    seedText: { type: 'string', maxLength: 2000 },
    language: LANGUAGE_SCHEMA,
    provider: PROVIDER_SCHEMA,
    model: MODEL_SCHEMA,
  },
};

const GENERATE_CAMPAIGN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    settings: { type: 'object' },
    language: LANGUAGE_SCHEMA,
    provider: PROVIDER_SCHEMA,
    model: MODEL_SCHEMA,
  },
};

const GENERATE_SCENE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    playerAction: { type: ['string', 'null'], maxLength: 4000 },
    provider: PROVIDER_SCHEMA,
    model: MODEL_SCHEMA,
    language: LANGUAGE_SCHEMA,
    dmSettings: { type: 'object' },
    resolvedMechanics: { type: ['object', 'null'] },
    needsSystemEnabled: { type: 'boolean' },
    characterNeeds: { type: ['object', 'null'] },
    isFirstScene: { type: 'boolean' },
    sceneCount: { type: 'number' },
    isCustomAction: { type: 'boolean' },
    fromAutoPlayer: { type: 'boolean' },
  },
};

export async function aiRoutes(fastify) {
  fastify.addHook('onRequest', fastify.authenticate);

  /**
   * POST /ai/generate-story-prompt
   *
   * Generate a random story premise for the campaign creator.
   * Non-streaming — response is a single JSON object.
   */
  fastify.post('/generate-story-prompt', { schema: { body: STORY_PROMPT_SCHEMA } }, async (request, reply) => {
    const { genre, tone, style, seedText, language, provider, model } = request.body || {};
    try {
      const result = await generateStoryPrompt({ genre, tone, style, seedText, language, provider, model });
      return result;
    } catch (err) {
      const status = err.statusCode || 502;
      return reply.code(status).send({ error: err.message, code: err.code || 'AI_REQUEST_FAILED' });
    }
  });

  /**
   * POST /ai/generate-campaign
   *
   * Generate a new campaign with SSE streaming.
   * Events: chunk (raw JSON text), complete (full parsed result), error
   */
  fastify.post('/generate-campaign', { schema: { body: GENERATE_CAMPAIGN_SCHEMA } }, async (request, reply) => {
    const { settings, language, provider, model } = request.body || {};

    if (!writeSseHead(request, reply)) return;

    await generateCampaignStream(
      settings || {},
      { provider, model, language },
      (event) => {
        try {
          reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
        } catch { /* client disconnected */ }
      },
    );

    reply.raw.end();
  });

  /**
   * POST /ai/campaigns/:id/generate-scene-stream
   *
   * Generate a new scene with SSE streaming.
   * Events: intent, context_ready, chunk, complete, error
   */
  fastify.post('/campaigns/:id/generate-scene-stream', { schema: { body: GENERATE_SCENE_SCHEMA } }, async (request, reply) => {
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
    if (!writeSseHead(request, reply)) return;

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
