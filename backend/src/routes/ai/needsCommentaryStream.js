import { prisma } from '../../lib/prisma.js';
import { loadUserApiKeys } from '../../services/apiKeyService.js';
import { runNeedsCommentary } from '../../services/sceneGenerator/needsCommentary.js';
import { writeSseHead } from './sseBoilerplate.js';
import { NEEDS_COMMENTARY_SCHEMA } from './schemas.js';

/**
 * POST /ai/campaigns/:id/needs-commentary-stream
 *
 * Post-scene needs commentary. Fires nano for a snarky quip when character
 * needs are critically low. Persists to CampaignNeedsCommentary.
 * Events: complete, error.
 */
export async function needsCommentaryStreamRoutes(fastify) {
  fastify.post(
    '/campaigns/:id/needs-commentary-stream',
    {
      schema: { body: NEEDS_COMMENTARY_SCHEMA },
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const campaignId = request.params.id;
      const {
        characterNeeds,
        characterName = null,
        provider = 'openai',
        language = 'pl',
        dmSettings = {},
        sceneIndex = null,
        characterId = null,
      } = request.body;

      const campaign = await prisma.campaign.findUnique({
        where: { id: campaignId },
        select: { userId: true },
      });
      if (!campaign) return reply.code(404).send({ error: 'Campaign not found' });
      if (campaign.userId !== request.user.id) {
        return reply.code(403).send({ error: 'Not authorized' });
      }

      if (!writeSseHead(request, reply)) return;

      const userApiKeys = await loadUserApiKeys(prisma, request.user?.id);
      const llmNanoTimeoutMs = Number(dmSettings?.llmNanoTimeoutMs) || 15000;

      const writeEvent = (event) => {
        try {
          reply.raw.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
        } catch { /* client disconnected */ }
      };

      const result = await runNeedsCommentary(campaignId, {
        characterNeeds,
        characterName,
        provider,
        language,
        userApiKeys,
        llmNanoTimeoutMs,
        sceneIndex,
        characterId,
      });

      if (result) {
        writeEvent({ type: 'complete', data: result });
      } else {
        writeEvent({ type: 'error', error: 'No commentary generated', code: 'NO_COMMENTARY' });
      }

      reply.raw.end();
    },
  );
}
