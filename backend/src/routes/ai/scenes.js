import { prisma } from '../../lib/prisma.js';
import { childLogger } from '../../lib/logger.js';
import { embedText, buildSceneEmbeddingText } from '../../services/embeddingService.js';
import { writeEmbedding } from '../../services/embeddingWrite.js';
import { enqueuePostSceneWork } from '../../services/cloudTasks.js';
import { toCanonicalStoragePath } from '../../services/urlCanonical.js';
import { SCENE_BODY_SCHEMA, SCENE_BULK_SCHEMA } from './schemas.js';

const log = childLogger({ module: 'ai' });

/**
 * Scene CRUD — save single, bulk save, list. Embeddings are fire-and-forget
 * on save paths.
 */
export async function sceneRoutes(fastify) {
  /**
   * POST /ai/campaigns/:id/scenes — save a single scene (created by frontend).
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
    const rawImageUrl = scene.imageUrl || scene.image || null;
    const normalizedImageUrl = rawImageUrl ? toCanonicalStoragePath(rawImageUrl) : null;

    const existingScene = await prisma.campaignScene.findFirst({
      where: { campaignId, sceneIndex },
      select: { id: true },
    });

    const payload = {
      campaignId,
      sceneIndex,
      narrative: scene.narrative || '',
      chosenAction: scene.chosenAction || null,
      suggestedActions: normalizedSuggestedActions,
      dialogueSegments: scene.dialogueSegments || [],
      imagePrompt: scene.imagePrompt || null,
      imageUrl: normalizedImageUrl,
      soundEffect: scene.soundEffect || null,
      diceRoll: scene.diceRoll ?? null,
      stateChanges: scene.stateChanges ?? null,
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
   * POST /ai/campaigns/:id/scenes/bulk — batch save with concurrency 5.
   * Embeddings fire-and-forget after each save.
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

    // Track newly-created scenes so we can enqueue post-scene work for the
    // intro-scene case below. Updates don't need to re-fire nano extraction.
    const createdSceneIds = [];

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

          const rawBulkImageUrl = scene.imageUrl || scene.image || null;
          const payload = {
            campaignId,
            sceneIndex,
            narrative: scene.narrative || '',
            chosenAction: scene.chosenAction || null,
            suggestedActions: normalizedSuggestedActions,
            dialogueSegments: scene.dialogueSegments || [],
            imagePrompt: scene.imagePrompt || null,
            imageUrl: rawBulkImageUrl ? toCanonicalStoragePath(rawBulkImageUrl) : null,
            soundEffect: scene.soundEffect || null,
            diceRoll: scene.diceRoll ?? null,
            stateChanges: scene.stateChanges ?? null,
            scenePacing: scene.scenePacing || 'exploration',
          };

          const existingId = existingByIndex.get(sceneIndex);
          const dbOp = existingId
            ? prisma.campaignScene.update({ where: { id: existingId }, data: payload })
            : prisma.campaignScene.create({ data: payload });

          return dbOp.then((saved) => {
            if (!existingId) {
              createdSceneIds.push({ sceneId: saved.id, sceneIndex: saved.sceneIndex });
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

    // Intro-scene nano extraction. The firstScene is authored by
    // `campaignGenerator` and saved here at sceneIndex=0 right after campaign
    // creation — it never goes through `generateSceneStream`, so the standard
    // post-scene pipeline (embedding/processStateChanges/compressSceneToSummary/
    // location summary) wouldn't otherwise run for it. Without compress, the
    // next scene's prompt has no `gameStateSummary` facts about the opening
    // (and `Last Scene` uses the legacy `narrative` field which premium leaves
    // empty), so the questgiver re-greets the player. Enqueue post-scene work
    // for the freshly-created sceneIndex=0 so nano extracts journal/dmMemory/
    // codex/knowledge/needs from the firstScene transcript. Best-effort —
    // failures don't fail the save.
    const introScene = createdSceneIds.find((s) => s.sceneIndex === 0);
    if (introScene) {
      const campaignRow = await prisma.campaign.findUnique({
        where: { id: campaignId },
        select: { currentLocationName: true },
      }).catch(() => null);
      enqueuePostSceneWork({
        sceneId: introScene.sceneId,
        campaignId,
        playerAction: '',
        provider: 'openai',
        newLoc: campaignRow?.currentLocationName || null,
        prevLoc: null,
        wrapupText: null,
        llmNanoTimeoutMs: undefined,
      }).catch((err) => log.error({ err, sceneId: introScene.sceneId }, 'Failed to enqueue post-scene work for firstScene'));
    }

    return { saved: results.filter((r) => !r.error).length, total: scenes.length, results };
  });

  /**
   * GET /ai/campaigns/:id/scenes — paginated list. `limit` and `offset` are
   * parsed with explicit base 10; Fastify doesn't auto-coerce query strings
   * here because no schema is attached.
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
      take: parseInt(limit, 10),
      skip: parseInt(offset, 10),
    });
    const dedupedByIndex = new Map();
    for (const s of scenes) {
      if (!dedupedByIndex.has(s.sceneIndex)) {
        dedupedByIndex.set(s.sceneIndex, s);
      }
    }
    const uniqueScenes = Array.from(dedupedByIndex.values());

    return uniqueScenes;
  });
}
