import { prisma } from '../../lib/prisma.js';
import { CORE_STATE_PATCH_SCHEMA } from './schemas.js';

/**
 * Deep merge two objects (target <- source). Arrays are replaced, not merged.
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

/**
 * PATCH /ai/campaigns/:id/core — partial update of campaign core state.
 * Character data lives in the Character collection; any attempt to write
 * it through this endpoint is rejected.
 */
export async function coreStateRoutes(fastify) {
  fastify.patch('/campaigns/:id/core', { schema: { body: CORE_STATE_PATCH_SCHEMA } }, async (request, reply) => {
    const campaignId = request.params.id;
    const updates = request.body || {};

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

    const currentState = (campaign.coreState && typeof campaign.coreState === 'object')
      ? campaign.coreState
      : {};

    await prisma.campaign.update({
      where: { id: campaignId },
      data: {
        lastSaved: new Date(),
        coreState: deepMerge(currentState, updates),
      },
    });

    return { ok: true };
  });
}
