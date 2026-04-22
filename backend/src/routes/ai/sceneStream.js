import { prisma } from '../../lib/prisma.js';
import { loadUserApiKeys } from '../../services/apiKeyService.js';
import { generateSceneStream } from '../../services/sceneGenerator.js';
import { writeSseHead } from './sseBoilerplate.js';
import { GENERATE_SCENE_SCHEMA } from './schemas.js';

/**
 * POST /ai/campaigns/:id/generate-scene-stream
 *
 * Generate a new scene with SSE streaming.
 * Events: intent, context_ready, chunk, complete, error
 */
export async function sceneStreamRoutes(fastify) {
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

    if (!writeSseHead(request, reply)) return;

    const userApiKeys = await loadUserApiKeys(prisma, request.user?.id);

    const opts = {
      provider, model, language, dmSettings, resolvedMechanics,
      needsSystemEnabled, characterNeeds, isFirstScene, sceneCount,
      isCustomAction, fromAutoPlayer, userApiKeys, combatResult, achievementState,
    };

    const writeEvent = (event) => {
      try {
        reply.raw.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
      } catch { /* client disconnected */ }
    };

    await generateSceneStream(
      campaignId,
      playerAction || '[FIRST_SCENE]',
      opts,
      writeEvent,
    );

    reply.raw.end();
  });
}
