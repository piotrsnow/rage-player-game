// Admin panel — consistency validate endpoint.

import { validateCampaign } from '../../services/adminConsistencyValidator.js';
import { prisma } from '../../lib/prisma.js';

const CAMPAIGN_PARAM = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'string', format: 'uuid' } },
};

export async function adminValidateRoutes(fastify) {
  fastify.post('/:id/validate', { schema: { params: CAMPAIGN_PARAM } }, async (request, reply) => {
    const { id } = request.params;
    const exists = await prisma.campaign.findUnique({ where: { id }, select: { id: true } });
    if (!exists) return reply.code(404).send({ error: 'Campaign not found' });

    return validateCampaign(id);
  });
}
