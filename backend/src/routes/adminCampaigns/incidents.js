// Admin panel — CampaignIncident read-only browser. Retry-correction is
// out of scope for v1: the incident pipeline is in routes/ai/incidents.js
// and replays would need to hook into the LLM provider chain. For now the
// admin can only view incidents and (via the snapshot tab) roll back if a
// correction went wrong.

import { prisma } from '../../lib/prisma.js';

const CAMPAIGN_PARAM = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'string', format: 'uuid' } },
};

const INCIDENT_PARAM = {
  type: 'object',
  required: ['id', 'incidentId'],
  properties: {
    id: { type: 'string', format: 'uuid' },
    incidentId: { type: 'string', format: 'uuid' },
  },
};

export async function adminIncidentRoutes(fastify) {
  fastify.get('/:id/incidents', { schema: { params: CAMPAIGN_PARAM } }, async (request) => {
    const { id } = request.params;
    return prisma.campaignIncident.findMany({
      where: { campaignId: id },
      orderBy: { sceneIndex: 'desc' },
    });
  });

  fastify.get('/:id/incidents/:incidentId', { schema: { params: INCIDENT_PARAM } }, async (request, reply) => {
    const { id, incidentId } = request.params;
    const incident = await prisma.campaignIncident.findFirst({
      where: { id: incidentId, campaignId: id },
    });
    if (!incident) return reply.code(404).send({ error: 'Incident not found' });
    return incident;
  });
}
