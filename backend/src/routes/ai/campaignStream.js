import { prisma } from '../../lib/prisma.js';
import { loadUserApiKeys } from '../../services/apiKeyService.js';
import { generateCampaignStream } from '../../services/campaignGenerator.js';
import { writeSseHead } from './sseBoilerplate.js';
import { GENERATE_CAMPAIGN_SCHEMA } from './schemas.js';

/**
 * POST /ai/generate-campaign — SSE stream of campaign generation events.
 *
 * Inline — generateCampaignStream runs in-process and streams events
 * directly to the client. Client disconnect is detected via reply.raw
 * write failure (swallowed).
 */
export async function campaignStreamRoutes(fastify) {
  fastify.post('/generate-campaign', { schema: { body: GENERATE_CAMPAIGN_SCHEMA } }, async (request, reply) => {
    const { settings, language, provider, model } = request.body || {};
    const userApiKeys = await loadUserApiKeys(prisma, request.user?.id);

    if (!writeSseHead(request, reply)) return;

    const opts = { provider, model, language, userApiKeys, userId: request.user?.id };
    const writeEvent = (event) => {
      try {
        reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
      } catch { /* client disconnected */ }
    };

    await generateCampaignStream(settings || {}, opts, writeEvent);
    reply.raw.end();
  });
}
