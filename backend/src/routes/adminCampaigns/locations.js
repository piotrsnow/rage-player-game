// Admin panel — WorldLocation (canonical) + CampaignLocation (per-campaign sandbox).

import { prisma } from '../../lib/prisma.js';
import { withSnapshot } from '../../services/campaignSnapshot.js';

const CAMPAIGN_PARAM = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'string', format: 'uuid' } },
};

const CAMPAIGN_LOC_PARAM = {
  type: 'object',
  required: ['id', 'locId'],
  properties: {
    id: { type: 'string', format: 'uuid' },
    locId: { type: 'string', format: 'uuid' },
  },
};

const WORLD_LOC_PARAM = {
  type: 'object',
  required: ['locId'],
  properties: { locId: { type: 'string', format: 'uuid' } },
};

const WORLD_LOC_FIELDS = [
  'canonicalName', 'displayName', 'description', 'category', 'region',
  'parentLocationId', 'locationType', 'slotType', 'slotKind',
  'maxKeyNpcs', 'maxSubLocations', 'regionX', 'regionY', 'positionConfidence',
  'subGridX', 'subGridY', 'knownByDefault', 'dangerLevel',
  'aliases', 'roomMetadata', 'tags', 'atmosphere', 'narrativeRoles', 'scale',
  'nodeShape', 'nodeIcon', 'nodeImageUrl',
  'tacticalGrid', 'biome', 'anchorType', 'visitCount', 'npcsEncountered',
  'modificationsLog', 'dungeonState', 'liberatedAt',
];

const CAMPAIGN_LOC_FIELDS = [
  'name', 'canonicalSlug', 'description', 'category', 'locationType',
  'region', 'aliases', 'regionX', 'regionY', 'positionConfidence',
  'subGridX', 'subGridY', 'parentLocationKind', 'parentLocationId',
  'maxKeyNpcs', 'maxSubLocations', 'slotType', 'slotKind', 'dangerLevel',
  'roomMetadata', 'tags', 'atmosphere', 'narrativeRoles', 'scale',
  'nodeShape', 'nodeIcon', 'nodeImageUrl',
  'tacticalGrid', 'biome', 'anchorType', 'visitCount', 'npcsEncountered',
  'modificationsLog', 'dungeonState', 'liberatedAt',
];

function pick(body, allowed) {
  const out = {};
  for (const k of allowed) {
    if (body[k] !== undefined) out[k] = body[k];
  }
  return out;
}

export async function adminLocationRoutes(fastify) {
  // ── World locations ──
  fastify.get('/world-locations', {
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
    return prisma.worldLocation.findMany({
      where: search
        ? {
            OR: [
              { canonicalName: { contains: search, mode: 'insensitive' } },
              { displayName: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {},
      orderBy: { canonicalName: 'asc' },
      take: limit,
    });
  });

  fastify.get('/world-locations/:locId', { schema: { params: WORLD_LOC_PARAM } }, async (request, reply) => {
    const { locId } = request.params;
    const loc = await prisma.worldLocation.findUnique({ where: { id: locId } });
    if (!loc) return reply.code(404).send({ error: 'WorldLocation not found' });
    return loc;
  });

  fastify.patch('/world-locations/:locId', {
    schema: {
      params: WORLD_LOC_PARAM,
      body: { type: 'object', additionalProperties: true },
    },
  }, async (request, reply) => {
    const { locId } = request.params;
    const data = pick(request.body || {}, WORLD_LOC_FIELDS);
    if (Object.keys(data).length === 0) {
      return reply.code(400).send({ error: 'No editable fields provided' });
    }
    const exists = await prisma.worldLocation.findUnique({ where: { id: locId }, select: { id: true } });
    if (!exists) return reply.code(404).send({ error: 'WorldLocation not found' });
    return prisma.worldLocation.update({ where: { id: locId }, data });
  });

  // ── Campaign-scoped locations ──
  fastify.get('/:id/locations', { schema: { params: CAMPAIGN_PARAM } }, async (request) => {
    const { id } = request.params;
    return prisma.campaignLocation.findMany({
      where: { campaignId: id },
      orderBy: { name: 'asc' },
    });
  });

  fastify.get('/:id/locations/:locId', { schema: { params: CAMPAIGN_LOC_PARAM } }, async (request, reply) => {
    const { id, locId } = request.params;
    const loc = await prisma.campaignLocation.findFirst({
      where: { id: locId, campaignId: id },
    });
    if (!loc) return reply.code(404).send({ error: 'CampaignLocation not found' });
    return loc;
  });

  fastify.post('/:id/locations', {
    schema: {
      params: CAMPAIGN_PARAM,
      body: { type: 'object', required: ['name', 'canonicalSlug'], additionalProperties: true },
    },
  }, async (request, reply) => {
    const { id } = request.params;
    const data = pick(request.body || {}, CAMPAIGN_LOC_FIELDS);
    if (!data.name || !data.canonicalSlug) {
      return reply.code(400).send({ error: 'name and canonicalSlug required' });
    }
    const created = await withSnapshot(
      id,
      { reason: 'admin-create-location', createdBy: request.user.id },
      () => prisma.campaignLocation.create({ data: { ...data, campaignId: id } }),
    );
    return created;
  });

  fastify.patch('/:id/locations/:locId', {
    schema: {
      params: CAMPAIGN_LOC_PARAM,
      body: { type: 'object', additionalProperties: true },
    },
  }, async (request, reply) => {
    const { id, locId } = request.params;
    const data = pick(request.body || {}, CAMPAIGN_LOC_FIELDS);
    if (Object.keys(data).length === 0) {
      return reply.code(400).send({ error: 'No editable fields provided' });
    }
    const exists = await prisma.campaignLocation.findFirst({
      where: { id: locId, campaignId: id }, select: { id: true },
    });
    if (!exists) return reply.code(404).send({ error: 'CampaignLocation not found' });

    const updated = await withSnapshot(
      id,
      { reason: 'admin-edit-location', createdBy: request.user.id },
      () => prisma.campaignLocation.update({ where: { id: locId }, data }),
    );
    return updated;
  });

  fastify.delete('/:id/locations/:locId', { schema: { params: CAMPAIGN_LOC_PARAM } }, async (request, reply) => {
    const { id, locId } = request.params;
    const exists = await prisma.campaignLocation.findFirst({
      where: { id: locId, campaignId: id }, select: { id: true },
    });
    if (!exists) return reply.code(404).send({ error: 'CampaignLocation not found' });

    await withSnapshot(
      id,
      { reason: 'admin-delete-location', createdBy: request.user.id },
      () => prisma.campaignLocation.delete({ where: { id: locId } }),
    );
    return { ok: true };
  });
}
