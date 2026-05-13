import { prisma } from '../../lib/prisma.js';
import { loadUserApiKeys } from '../../services/apiKeyService.js';
import { generateCreatureEncounter } from '../../services/sceneGenerator/creatureEncounter.js';
import { writeSseHead } from './sseBoilerplate.js';
import { CREATURE_ENCOUNTER_SCHEMA } from './schemas.js';

/**
 * POST /ai/campaigns/:id/creature-encounter
 *
 * Triggers a random magical creature encounter. Uses nano model for a short
 * narration (2-3 sentences). Events: complete, error.
 */
export async function creatureEncounterStreamRoutes(fastify) {
  fastify.post(
    '/campaigns/:id/creature-encounter',
    {
      schema: { body: CREATURE_ENCOUNTER_SCHEMA },
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const campaignId = request.params.id;
      const {
        provider = 'openai',
        language = 'pl',
        dmSettings = {},
        encounterKind: forcedKind,
      } = request.body || {};

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

      await generateCreatureEncounter(
        campaignId,
        { provider, language, userApiKeys, llmNanoTimeoutMs, encounterKind: forcedKind },
        writeEvent,
      );

      reply.raw.end();
    },
  );
}
