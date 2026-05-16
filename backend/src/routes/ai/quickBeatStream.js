import { prisma } from '../../lib/prisma.js';
import { loadUserApiKeys } from '../../services/apiKeyService.js';
import { runQuickBeat } from '../../services/sceneGenerator/quickBeat.js';
import { writeSseHead } from './sseBoilerplate.js';
import { QUICK_BEAT_SCHEMA } from './schemas.js';

/**
 * POST /ai/campaigns/:id/quick-beat-stream
 *
 * Lightweight RP-beat. Skips the full scene-gen pipeline (nano model, no
 * postSceneWork, no imageGen, no scene-index bump). Persists to
 * CampaignQuickBeat. Events: complete, escalate, error.
 */
export async function quickBeatStreamRoutes(fastify) {
  fastify.post(
    '/campaigns/:id/quick-beat-stream',
    {
      schema: { body: QUICK_BEAT_SCHEMA },
      // Per-user rate limit; quick beats fan out to nano so cost is low,
      // but they're cheap to spam — bound it. The 5-streak gate enforced
      // server-side inside runQuickBeat handles the streak limit; this is
      // strictly anti-abuse.
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const campaignId = request.params.id;
      const {
        playerAction,
        provider = 'openai',
        language = 'pl',
        characterId = null,
        entityTags = null,
        boardContext = null,
        dmSettings = {},
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

      await runQuickBeat(
        campaignId,
        playerAction,
        {
          provider,
          language,
          userApiKeys,
          llmNanoTimeoutMs,
          entityTags,
          characterId,
          boardContext,
        },
        writeEvent,
      );

      reply.raw.end();
    },
  );
}
