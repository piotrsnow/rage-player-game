import { prisma } from '../../lib/prisma.js';
import { loadUserApiKeys } from '../../services/apiKeyService.js';
import { analyzeIncident } from '../../services/incidentAnalyzer.js';

const REPORT_INCIDENT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['complaint'],
  properties: {
    complaint: { type: 'string', minLength: 10, maxLength: 2000 },
  },
};

const INCIDENTS_PARAMS = {
  type: 'object',
  properties: {
    campaignId: { type: 'string', format: 'uuid' },
  },
  required: ['campaignId'],
};

export async function incidentRoutes(fastify) {
  // POST /campaigns/:campaignId/incidents — report an incident
  fastify.post(
    '/campaigns/:campaignId/incidents',
    {
      schema: { params: INCIDENTS_PARAMS, body: REPORT_INCIDENT_SCHEMA },
      config: { rateLimit: { max: 5, timeWindow: '10 minutes' } },
    },
    async (request, reply) => {
      const { campaignId } = request.params;
      const { complaint } = request.body;
      const userId = request.user.id;

      // Verify ownership
      const campaign = await prisma.campaign.findFirst({
        where: { id: campaignId, userId },
        select: { id: true, coreState: true },
      });
      if (!campaign) {
        return reply.code(404).send({ error: 'Campaign not found' });
      }

      // Load last 5 scenes
      const recentScenes = await prisma.campaignScene.findMany({
        where: { campaignId },
        orderBy: { sceneIndex: 'desc' },
        take: 5,
        select: {
          sceneIndex: true,
          narrative: true,
          chosenAction: true,
          stateChanges: true,
        },
      });

      if (recentScenes.length === 0) {
        return reply.code(400).send({ error: 'No scenes to analyze' });
      }

      // Reverse so they're in chronological order
      recentScenes.reverse();

      const currentSceneIndex = recentScenes[recentScenes.length - 1].sceneIndex;

      const userApiKeys = await loadUserApiKeys(prisma, userId);

      try {
        const { verdict, isPlayerRight, technicalDetails, corrections, narrativeComment } = await analyzeIncident({
          recentScenes,
          playerComplaint: complaint,
          campaignState: campaign.coreState,
          userApiKeys,
          userId,
        });

        // Store in DB
        const incident = await prisma.campaignIncident.create({
          data: {
            campaignId,
            userId,
            sceneIndex: currentSceneIndex,
            playerComplaint: complaint,
            aiVerdict: verdict,
            isPlayerRight,
            technicalDetails: technicalDetails || null,
            corrections: corrections || undefined,
            narrativeComment: narrativeComment || null,
          },
        });

        // Wrong complaint → character slips next scene
        if (!isPlayerRight) {
          await prisma.campaign.update({
            where: { id: campaignId },
            data: { pendingSlip: complaint },
          });
        }

        return {
          id: incident.id,
          sceneIndex: incident.sceneIndex,
          playerComplaint: incident.playerComplaint,
          aiVerdict: incident.aiVerdict,
          isPlayerRight: incident.isPlayerRight,
          technicalDetails: incident.technicalDetails,
          corrections: incident.corrections,
          narrativeComment: incident.narrativeComment,
          createdAt: incident.createdAt,
        };
      } catch (err) {
        const status = err.statusCode || 502;
        return reply.code(status).send({ error: err.message, code: err.code || 'AI_REQUEST_FAILED' });
      }
    },
  );

  // GET /campaigns/:campaignId/incidents — list past incidents
  fastify.get(
    '/campaigns/:campaignId/incidents',
    { schema: { params: INCIDENTS_PARAMS } },
    async (request, reply) => {
      const { campaignId } = request.params;
      const userId = request.user.id;

      // Verify ownership
      const campaign = await prisma.campaign.findFirst({
        where: { id: campaignId, userId },
        select: { id: true },
      });
      if (!campaign) {
        return reply.code(404).send({ error: 'Campaign not found' });
      }

      const incidents = await prisma.campaignIncident.findMany({
        where: { campaignId },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: {
          id: true,
          sceneIndex: true,
          playerComplaint: true,
          aiVerdict: true,
          isPlayerRight: true,
          technicalDetails: true,
          corrections: true,
          narrativeComment: true,
          createdAt: true,
        },
      });

      return { incidents };
    },
  );
}
