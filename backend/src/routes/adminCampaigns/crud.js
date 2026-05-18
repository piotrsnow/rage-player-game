// Admin panel — Campaign CRUD (top-level list + per-campaign full payload + patch).

import { prisma } from '../../lib/prisma.js';
import { withSnapshot } from '../../services/campaignSnapshot.js';
import { serializeAdminPayload } from './serialization.js';

const ID_PARAM = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'string', format: 'uuid' } },
};

// Scalar fields that PATCH /:id is allowed to write. Anything outside this set
// belongs to a child-table endpoint (quests, npcs, etc).
const ALLOWED_PATCH_FIELDS = new Set([
  'name', 'genre', 'tone', 'coreState', 'isPublic',
  'currentLocationName', 'currentLocationId',
  'currentX', 'currentY', 'pendingSlip', 'pendingProvidence',
  'livingWorldEnabled', 'questGraphEnabled', 'worldTimeRatio',
  'worldTimeMaxGapDays', 'difficultyTier', 'settlementCaps',
  'boundsMinX', 'boundsMaxX', 'boundsMinY', 'boundsMaxY',
]);

export async function adminCrudRoutes(fastify) {
  // ── Global wipe (all campaigns) ──
  fastify.post('/wipe-all', {
    schema: {
      body: {
        type: 'object',
        required: ['confirm'],
        properties: {
          confirm: { type: 'string', minLength: 1, maxLength: 200 },
        },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    const { confirm } = request.body;
    if (confirm !== 'WIPE_ALL_CAMPAIGNS') {
      return reply.code(400).send({ error: 'Invalid confirmation token' });
    }

    const campaignIds = await prisma.campaign.findMany({
      select: { id: true },
    });
    const ids = campaignIds.map((c) => c.id);

    if (ids.length > 0) {
      await prisma.character.updateMany({
        where: { lockedCampaignId: { in: ids } },
        data: { lockedCampaignId: null, lockedCampaignName: null, lockedLocation: null },
      });
    }

    const deleted = await prisma.campaign.deleteMany({});
    return { success: true, deletedCampaigns: deleted.count };
  });

  // ── List campaigns ──
  fastify.get('/', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          search: { type: 'string', maxLength: 200 },
          limit: { type: 'integer', minimum: 1, maximum: 200, default: 50 },
        },
        additionalProperties: false,
      },
    },
  }, async (request) => {
    const { search, limit = 50 } = request.query;
    const where = search
      ? { OR: [{ name: { contains: search, mode: 'insensitive' } }, { id: { equals: search } }] }
      : {};
    const rows = await prisma.campaign.findMany({
      where,
      orderBy: { lastSaved: 'desc' },
      take: limit,
      select: {
        id: true,
        name: true,
        genre: true,
        userId: true,
        lastSaved: true,
        createdAt: true,
        livingWorldEnabled: true,
        questGraphEnabled: true,
        currentLocationName: true,
        _count: {
          select: { scenes: true, npcs: true, quests: true, snapshots: true },
        },
      },
    });
    return rows;
  });

  // ── Get one campaign with all relations ──
  fastify.get('/:id', { schema: { params: ID_PARAM } }, async (request, reply) => {
    const { id } = request.params;
    const [
      campaign, participants, npcs, quests, objectives, prerequisites,
      campaignLocations, edges, campaignEdges, scenes, incidents,
    ] = await Promise.all([
      prisma.campaign.findUnique({ where: { id } }),
      prisma.campaignParticipant.findMany({ where: { campaignId: id } }),
      prisma.npc.findMany({ where: { campaignId: id }, orderBy: { name: 'asc' } }),
      prisma.campaignQuest.findMany({ where: { campaignId: id }, orderBy: { name: 'asc' } }),
      prisma.campaignQuestObjective.findMany({ where: { quest: { campaignId: id } } }),
      prisma.campaignQuestPrerequisite.findMany({ where: { quest: { campaignId: id } } }),
      prisma.location.findMany({ where: { campaignId: id }, orderBy: { name: 'asc' } }),
      prisma.locationEdge.findMany({ where: { campaignId: id } }),
      prisma.campaignEdge.findMany({ where: { campaignId: id } }),
      prisma.campaignScene.findMany({
        where: { campaignId: id },
        orderBy: { sceneIndex: 'asc' },
        select: {
          id: true, sceneIndex: true, narrative: true, chosenAction: true,
          imageUrl: true, soundEffect: true, createdAt: true,
        },
      }),
      prisma.campaignIncident.findMany({ where: { campaignId: id }, orderBy: { sceneIndex: 'desc' } }),
    ]);
    if (!campaign) return reply.code(404).send({ error: 'Campaign not found' });

    // Hydrate characters via participants.
    const characterIds = participants.map((p) => p.characterId);
    const characters = characterIds.length > 0
      ? await prisma.character.findMany({
          where: { id: { in: characterIds } },
          include: {
            inventoryItems: { orderBy: { addedAt: 'asc' } },
            characterSkills: true,
            materials: true,
          },
        })
      : [];

    return serializeAdminPayload({
      campaign,
      participants,
      npcs,
      quests,
      objectives,
      prerequisites,
      campaignLocations,
      locationEdges: edges,
      campaignEdges,
      scenes,
      incidents,
      characters,
    });
  });

  // ── Patch campaign scalars / coreState ──
  fastify.patch('/:id', {
    schema: {
      params: ID_PARAM,
      body: {
        type: 'object',
        additionalProperties: true, // we whitelist below
      },
    },
  }, async (request, reply) => {
    const { id } = request.params;
    const body = request.body || {};

    const data = {};
    for (const [k, v] of Object.entries(body)) {
      if (ALLOWED_PATCH_FIELDS.has(k)) data[k] = v;
    }
    if (Object.keys(data).length === 0) {
      return reply.code(400).send({ error: 'No editable fields provided' });
    }

    const exists = await prisma.campaign.findUnique({ where: { id }, select: { id: true } });
    if (!exists) return reply.code(404).send({ error: 'Campaign not found' });

    const updated = await withSnapshot(
      id,
      { reason: 'admin-edit-campaign', createdBy: request.user.id },
      () => prisma.campaign.update({ where: { id }, data }),
    );
    return updated;
  });

  // ── Clear story data in one campaign (keep campaign row) ──
  fastify.post('/:id/clear-story', {
    schema: { params: ID_PARAM },
  }, async (request, reply) => {
    const { id } = request.params;
    const exists = await prisma.campaign.findUnique({ where: { id }, select: { id: true } });
    if (!exists) return reply.code(404).send({ error: 'Campaign not found' });

    const result = await withSnapshot(
      id,
      { reason: 'admin-clear-story', createdBy: request.user.id },
      async () => prisma.$transaction(async (tx) => {
        await tx.campaignQuickBeat.deleteMany({ where: { campaignId: id } });
        await tx.campaignScene.deleteMany({ where: { campaignId: id } });
        await tx.npc.deleteMany({ where: { campaignId: id } });
        await tx.campaignQuest.deleteMany({ where: { campaignId: id } });
        await tx.location.deleteMany({ where: { campaignId: id } });
        await tx.campaignLocationSummary.deleteMany({ where: { campaignId: id } });
        await tx.locationEdge.deleteMany({ where: { campaignId: id } });
        await tx.campaignEdge.deleteMany({ where: { campaignId: id } });
        await tx.campaignKnowledge.deleteMany({ where: { campaignId: id } });
        await tx.campaignCodex.deleteMany({ where: { campaignId: id } });
        await tx.campaignIncident.deleteMany({ where: { campaignId: id } });
        await tx.discoveredLocation.deleteMany({ where: { campaignId: id } });
        await tx.campaignEdgeDiscovery.deleteMany({ where: { campaignId: id } });
        await tx.campaignDmAgent.deleteMany({ where: { campaignId: id } });

        await tx.campaign.update({
          where: { id },
          data: {
            coreState: {},
            totalCost: 0,
            currentLocationName: null,
            currentLocationId: null,
            currentX: null,
            currentY: null,
            pendingSlip: null,
            pendingProvidence: null,
            lastSaved: new Date(),
          },
        });

        return { success: true };
      }),
    );

    return result;
  });

  // ── Delete one campaign ──
  fastify.delete('/:id', {
    schema: { params: ID_PARAM },
  }, async (request, reply) => {
    const { id } = request.params;
    const exists = await prisma.campaign.findUnique({ where: { id }, select: { id: true } });
    if (!exists) return reply.code(404).send({ error: 'Campaign not found' });

    await withSnapshot(
      id,
      { reason: 'admin-delete-campaign', createdBy: request.user.id },
      async () => prisma.$transaction([
        prisma.character.updateMany({
          where: { lockedCampaignId: id },
          data: { lockedCampaignId: null, lockedCampaignName: null, lockedLocation: null },
        }),
        prisma.campaign.delete({ where: { id } }),
      ]),
    );

    return { success: true };
  });
}
