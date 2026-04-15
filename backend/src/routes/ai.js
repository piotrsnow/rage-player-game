import { generateSceneStream } from '../services/sceneGenerator.js';
import { generateStoryPrompt } from '../services/storyPromptGenerator.js';
import { generateCampaignStream } from '../services/campaignGenerator.js';
import { generateCombatCommentary } from '../services/combatCommentary.js';
import { verifyObjective } from '../services/objectiveVerifier.js';
import { generateRecap } from '../services/recapGenerator.js';
import { prisma } from '../lib/prisma.js';
import { childLogger } from '../lib/logger.js';
import { resolveSseCorsOrigin } from '../plugins/cors.js';
import crypto from 'crypto';
import { enqueueJob, findJobAcrossQueues } from '../services/queues/aiQueue.js';
import { isRedisEnabled, getRedisClient } from '../services/redisClient.js';
import { sceneJobChannel } from '../workers/aiWorker.js';
import { loadUserApiKeys } from '../services/apiKeyService.js';

const log = childLogger({ module: 'ai' });
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
  // Tell Fastify we're taking over this response — stops the onSend
  // lifecycle from running, which is what @fastify/compress hooks into.
  // Without hijack, compress buffers all writes and only flushes on
  // response end, making SSE look like a one-shot JSON response to the
  // browser (the whole stream arrives at once after ~30s).
  reply.hijack();
  const headers = {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
    // Defense-in-depth: explicitly opt out of any compression middleware
    // that might still see the response.
    'Content-Encoding': 'identity',
  };
  if (origin) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Credentials'] = 'true';
  }
  reply.raw.writeHead(200, headers);
  // Disable Nagle's algorithm so small SSE frames flush immediately
  // instead of waiting for ~40ms to batch with the next write.
  request.raw.socket?.setNoDelay(true);
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

const COMBAT_COMMENTARY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    gameState: { type: 'object' },
    combatSnapshot: { type: 'object' },
    language: LANGUAGE_SCHEMA,
    provider: PROVIDER_SCHEMA,
    model: MODEL_SCHEMA,
    modelTier: { type: 'string', maxLength: 20 },
  },
  required: ['combatSnapshot'],
};

const VERIFY_OBJECTIVE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    storyContext: { type: 'string', maxLength: 60000 },
    questName: { type: 'string', maxLength: 500 },
    questDescription: { type: 'string', maxLength: 4000 },
    objectiveDescription: { type: 'string', maxLength: 2000 },
    language: LANGUAGE_SCHEMA,
    provider: PROVIDER_SCHEMA,
    model: MODEL_SCHEMA,
    modelTier: { type: 'string', maxLength: 20 },
  },
  required: ['questName', 'objectiveDescription'],
};

const RECAP_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    scenes: { type: 'array', maxItems: 500 },
    language: LANGUAGE_SCHEMA,
    provider: PROVIDER_SCHEMA,
    model: MODEL_SCHEMA,
    modelTier: { type: 'string', maxLength: 20 },
    sentencesPerScene: { type: 'number' },
    summaryStyle: { type: ['object', 'null'] },
  },
  required: ['scenes'],
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
    combatResult: { type: ['object', 'null'] },
    achievementState: { type: ['object', 'null'] },
  },
};

const SCENE_BODY_SCHEMA = {
  type: 'object',
  additionalProperties: true,
  properties: {
    id: { type: 'string', maxLength: 200 },
    sceneIndex: { type: 'number' },
    narrative: { type: 'string', maxLength: 20000 },
    chosenAction: { type: ['string', 'null'], maxLength: 4000 },
    suggestedActions: { type: 'array', maxItems: 20 },
    actions: { type: 'array', maxItems: 20 },
    dialogueSegments: { type: 'array', maxItems: 200 },
    imagePrompt: { type: ['string', 'null'], maxLength: 4000 },
    imageUrl: { type: ['string', 'null'], maxLength: 4000 },
    image: { type: ['string', 'null'], maxLength: 4000 },
    soundEffect: { type: ['string', 'null'], maxLength: 200 },
    diceRoll: { type: ['object', 'null'] },
    stateChanges: { type: ['object', 'null'] },
    scenePacing: { type: 'string', maxLength: 50 },
  },
};

const SCENE_BULK_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    scenes: {
      type: 'array',
      maxItems: 200,
      items: SCENE_BODY_SCHEMA,
    },
  },
  required: ['scenes'],
};

const CORE_STATE_PATCH_SCHEMA = {
  type: 'object',
  additionalProperties: true,
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
    const userApiKeys = await loadUserApiKeys(prisma, request.user?.id);
    try {
      const result = await generateStoryPrompt({ genre, tone, style, seedText, language, provider, model, userApiKeys });
      return result;
    } catch (err) {
      const status = err.statusCode || 502;
      return reply.code(status).send({ error: err.message, code: err.code || 'AI_REQUEST_FAILED' });
    }
  });

  /**
   * POST /ai/combat-commentary
   *
   * Generate mid-combat narration + battle cries for an active fight.
   * Single-shot AI call. Returns { result: { narration, battleCries }, usage }.
   */
  fastify.post('/combat-commentary', { schema: { body: COMBAT_COMMENTARY_SCHEMA } }, async (request, reply) => {
    const { gameState = {}, combatSnapshot, language = 'en', provider = 'openai', model, modelTier = 'premium' } = request.body || {};
    const userApiKeys = await loadUserApiKeys(prisma, request.user?.id);
    try {
      return await generateCombatCommentary({ gameState, combatSnapshot, language, provider, model, modelTier, userApiKeys });
    } catch (err) {
      const status = err.statusCode || 502;
      return reply.code(status).send({ error: err.message, code: err.code || 'AI_REQUEST_FAILED' });
    }
  });

  /**
   * POST /ai/verify-objective
   *
   * Classify whether a quest objective has been fulfilled given a story context.
   * Returns { result: { fulfilled, reasoning }, usage }.
   */
  fastify.post('/verify-objective', { schema: { body: VERIFY_OBJECTIVE_SCHEMA } }, async (request, reply) => {
    const {
      storyContext = '',
      questName = '',
      questDescription = '',
      objectiveDescription = '',
      language = 'en',
      provider = 'openai',
      model,
      modelTier = 'premium',
    } = request.body || {};
    const userApiKeys = await loadUserApiKeys(prisma, request.user?.id);
    try {
      return await verifyObjective({
        storyContext,
        questName,
        questDescription,
        objectiveDescription,
        language,
        provider,
        model,
        modelTier,
        userApiKeys,
      });
    } catch (err) {
      const status = err.statusCode || 502;
      return reply.code(status).send({ error: err.message, code: err.code || 'AI_REQUEST_FAILED' });
    }
  });

  /**
   * POST /ai/generate-recap
   *
   * Generate a "Previously on..." campaign recap. Chunks long histories and
   * merges. Returns { result: { recap, meta? }, usage }.
   */
  fastify.post('/generate-recap', { schema: { body: RECAP_SCHEMA } }, async (request, reply) => {
    const {
      scenes = [],
      language = 'en',
      provider = 'openai',
      model,
      modelTier = 'premium',
      sentencesPerScene = 1,
      summaryStyle = null,
    } = request.body || {};
    const userApiKeys = await loadUserApiKeys(prisma, request.user?.id);
    try {
      return await generateRecap({
        scenes,
        language,
        provider,
        model,
        modelTier,
        sentencesPerScene,
        summaryStyle,
        userApiKeys,
      });
    } catch (err) {
      const status = err.statusCode || 502;
      return reply.code(status).send({ error: err.message, code: err.code || 'AI_REQUEST_FAILED' });
    }
  });

  /**
   * POST /ai/generate-campaign
   *
   * Inline SSE — streams campaign generation chunks directly to the client
   * so the FE can reveal `firstScene` as soon as it's parseable mid-stream
   * (typically ~20-30s in) instead of waiting for the full 8k-token payload.
   * Originally migrated to BullMQ for retry/observability, reverted because
   * the spinner-only delay that came with the queue path (60-200s) crushed
   * the campaign-creator UX. Scene-gen stays on the queue because its
   * pub/sub bridge preserves streaming.
   */
  fastify.post('/generate-campaign', { schema: { body: GENERATE_CAMPAIGN_SCHEMA } }, async (request, reply) => {
    const { settings, language, provider, model } = request.body || {};
    const userApiKeys = await loadUserApiKeys(prisma, request.user?.id);

    if (!writeSseHead(request, reply)) return;

    await generateCampaignStream(
      settings || {},
      { provider, model, language, userApiKeys },
      (event) => {
        try {
          reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
        } catch { /* client disconnected */ }
      },
    );

    reply.raw.end();
  });

  /**
   * GET /ai/jobs/:id
   *
   * Poll a queued job's status. Returns state + result when complete.
   * 404 if the job doesn't exist in any queue (expired or never created).
   */
  fastify.get('/jobs/:id', async (request, reply) => {
    if (!isRedisEnabled()) {
      return reply.code(503).send({ error: 'Job queue disabled — Redis unavailable' });
    }
    const jobId = request.params.id;
    const status = await findJobAcrossQueues(jobId);
    if (!status) return reply.code(404).send({ error: 'Job not found' });
    return status;
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
      combatResult = null,
      achievementState = null,
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

    const userApiKeys = await loadUserApiKeys(prisma, request.user?.id);

    const opts = {
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
      userApiKeys,
      combatResult,
      achievementState,
    };

    const writeEvent = (event) => {
      try {
        reply.raw.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
      } catch {
        // client disconnected
      }
    };

    // Queue path — worker runs generateSceneStream and publishes every
    // event to a per-job Redis pub/sub channel. This handler subscribes
    // to that channel (BEFORE enqueueing, with a pre-generated jobId, so
    // there is no subscribe-after-publish race) and forwards each event
    // to the SSE client. Closes the stream on `complete` or `error`.
    //
    // When Redis is off, falls back to the legacy inline path below.
    if (isRedisEnabled()) {
      const jobId = crypto.randomUUID();
      const channel = sceneJobChannel(jobId);
      const subscriber = getRedisClient().duplicate();

      let closed = false;
      let resolveDone;
      const done = new Promise((resolve) => { resolveDone = resolve; });

      const cleanup = async () => {
        if (closed) return;
        closed = true;
        try { await subscriber.unsubscribe(channel); } catch { /* ignore */ }
        try { await subscriber.quit(); } catch { /* ignore */ }
        try { reply.raw.end(); } catch { /* ignore */ }
        resolveDone();
      };

      subscriber.on('message', (ch, msg) => {
        if (ch !== channel) return;
        try {
          reply.raw.write(`data: ${msg}\n\n`);
        } catch { /* ignore */ }
        try {
          const event = JSON.parse(msg);
          if (event.type === 'complete' || event.type === 'error') {
            cleanup();
          }
        } catch { /* ignore */ }
      });

      request.raw.on('close', () => { cleanup(); });

      // 5-minute safety timeout — scene gen is usually 15-30s, if nothing
      // arrives in 5min the worker crashed or got stuck on a retry.
      const timeoutHandle = setTimeout(() => {
        writeEvent({ type: 'error', error: 'Scene job timed out', code: 'JOB_TIMEOUT' });
        cleanup();
      }, 5 * 60 * 1000);
      timeoutHandle.unref?.();

      let enqueueFailed = false;
      try {
        await subscriber.subscribe(channel);
        await enqueueJob(
          'generate-scene',
          { campaignId, playerAction: playerAction || '[FIRST_SCENE]', opts },
          { provider, userId: request.user?.id, jobId },
        );
      } catch (err) {
        log.warn({ err }, 'Failed to start scene job — falling back to inline');
        enqueueFailed = true;
        clearTimeout(timeoutHandle);
        await cleanup();
      }

      if (!enqueueFailed) {
        await done;
        clearTimeout(timeoutHandle);
        return;
      }
    }

    // Legacy inline fallback (Redis disabled or enqueue failed).
    await generateSceneStream(
      campaignId,
      playerAction || '[FIRST_SCENE]',
      opts,
      writeEvent,
    );

    reply.raw.end();
  });

  /**
   * POST /ai/campaigns/:id/scenes
   *
   * Save a scene (created by frontend) to the normalized collection.
   * Generates embedding asynchronously.
   */
  fastify.post('/campaigns/:id/scenes', {
    schema: { body: SCENE_BODY_SCHEMA },
    config: { idempotency: true },
  }, async (request, reply) => {
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
        .catch((err) => log.error({ err }, 'Scene embedding failed'));
    }

    return { sceneId: savedScene.id, sceneIndex: savedScene.sceneIndex };
  });

  /**
   * POST /ai/campaigns/:id/scenes/bulk
   *
   * Save multiple scenes in one request. DB writes run with bounded
   * concurrency (5) instead of sequentially. Embeddings are fire-and-forget.
   */
  fastify.post('/campaigns/:id/scenes/bulk', {
    schema: { body: SCENE_BULK_SCHEMA },
    config: { idempotency: true },
  }, async (request, reply) => {
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
                  .catch((err) => log.error({ err }, 'Scene embedding failed'));
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
  fastify.patch('/campaigns/:id/core', { schema: { body: CORE_STATE_PATCH_SCHEMA } }, async (request, reply) => {
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
