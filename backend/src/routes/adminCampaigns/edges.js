// Admin panel — LocationEdge + CampaignEdge CRUD.

import { prisma } from '../../lib/prisma.js';
import { withSnapshot } from '../../services/campaignSnapshot.js';

const CAMPAIGN_PARAM = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'string', format: 'uuid' } },
};

const EDGE_PARAM = {
  type: 'object',
  required: ['id', 'edgeId'],
  properties: {
    id: { type: 'string', format: 'uuid' },
    edgeId: { type: 'string', format: 'uuid' },
  },
};

const LOCATION_EDGE_FIELDS = [
  'fromKind', 'fromId', 'toKind', 'toId', 'edgeType', 'category',
  'bidirectional', 'weight', 'metadata', 'discoveryState',
  'confidence', 'createdBy', 'isActive',
];

const CAMPAIGN_EDGE_FIELDS = [
  'fromKind', 'fromId', 'toKind', 'toId', 'relationType',
  'bidirectional', 'distance', 'difficulty', 'metadata',
  'visibility', 'risk', 'travelTime', 'edgeDescription', 'confidence',
];

function pick(body, allowed) {
  const out = {};
  for (const k of allowed) {
    if (body[k] !== undefined) out[k] = body[k];
  }
  return out;
}

export async function adminEdgeRoutes(fastify) {
  // ── LocationEdge (semantic edges between locations) ──
  fastify.get('/:id/edges', { schema: { params: CAMPAIGN_PARAM } }, async (request) => {
    const { id } = request.params;
    return prisma.locationEdge.findMany({
      where: { campaignId: id },
      orderBy: { createdAt: 'desc' },
    });
  });

  fastify.post('/:id/edges', {
    schema: {
      params: CAMPAIGN_PARAM,
      body: {
        type: 'object',
        required: ['fromKind', 'fromId', 'toKind', 'toId', 'edgeType', 'category'],
        additionalProperties: true,
      },
    },
  }, async (request) => {
    const { id } = request.params;
    const data = pick(request.body || {}, LOCATION_EDGE_FIELDS);
    return withSnapshot(
      id,
      { reason: 'admin-create-edge', createdBy: request.user.id },
      () => prisma.locationEdge.create({ data: { ...data, campaignId: id } }),
    );
  });

  fastify.patch('/:id/edges/:edgeId', {
    schema: {
      params: EDGE_PARAM,
      body: { type: 'object', additionalProperties: true },
    },
  }, async (request, reply) => {
    const { id, edgeId } = request.params;
    const data = pick(request.body || {}, LOCATION_EDGE_FIELDS);
    if (Object.keys(data).length === 0) {
      return reply.code(400).send({ error: 'No editable fields provided' });
    }
    const exists = await prisma.locationEdge.findFirst({
      where: { id: edgeId, campaignId: id }, select: { id: true },
    });
    if (!exists) return reply.code(404).send({ error: 'LocationEdge not found' });

    const updated = await withSnapshot(
      id,
      { reason: 'admin-edit-edge', createdBy: request.user.id },
      () => prisma.locationEdge.update({ where: { id: edgeId }, data }),
    );
    return updated;
  });

  fastify.delete('/:id/edges/:edgeId', { schema: { params: EDGE_PARAM } }, async (request, reply) => {
    const { id, edgeId } = request.params;
    const exists = await prisma.locationEdge.findFirst({
      where: { id: edgeId, campaignId: id }, select: { id: true },
    });
    if (!exists) return reply.code(404).send({ error: 'LocationEdge not found' });

    await withSnapshot(
      id,
      { reason: 'admin-delete-edge', createdBy: request.user.id },
      () => prisma.locationEdge.delete({ where: { id: edgeId } }),
    );
    return { ok: true };
  });

  // ── CampaignEdge (rumor + travel-graph edges) ──
  fastify.get('/:id/campaign-edges', { schema: { params: CAMPAIGN_PARAM } }, async (request) => {
    const { id } = request.params;
    return prisma.campaignEdge.findMany({
      where: { campaignId: id },
      orderBy: { createdAt: 'desc' },
    });
  });

  fastify.post('/:id/campaign-edges', {
    schema: {
      params: CAMPAIGN_PARAM,
      body: {
        type: 'object',
        required: ['fromKind', 'fromId', 'toKind', 'toId'],
        additionalProperties: true,
      },
    },
  }, async (request) => {
    const { id } = request.params;
    const data = pick(request.body || {}, CAMPAIGN_EDGE_FIELDS);
    return withSnapshot(
      id,
      { reason: 'admin-create-campaign-edge', createdBy: request.user.id },
      () => prisma.campaignEdge.create({ data: { ...data, campaignId: id } }),
    );
  });

  fastify.patch('/:id/campaign-edges/:edgeId', {
    schema: {
      params: EDGE_PARAM,
      body: { type: 'object', additionalProperties: true },
    },
  }, async (request, reply) => {
    const { id, edgeId } = request.params;
    const data = pick(request.body || {}, CAMPAIGN_EDGE_FIELDS);
    if (Object.keys(data).length === 0) {
      return reply.code(400).send({ error: 'No editable fields provided' });
    }
    const exists = await prisma.campaignEdge.findFirst({
      where: { id: edgeId, campaignId: id }, select: { id: true },
    });
    if (!exists) return reply.code(404).send({ error: 'CampaignEdge not found' });

    const updated = await withSnapshot(
      id,
      { reason: 'admin-edit-campaign-edge', createdBy: request.user.id },
      () => prisma.campaignEdge.update({ where: { id: edgeId }, data }),
    );
    return updated;
  });

  fastify.delete('/:id/campaign-edges/:edgeId', { schema: { params: EDGE_PARAM } }, async (request, reply) => {
    const { id, edgeId } = request.params;
    const exists = await prisma.campaignEdge.findFirst({
      where: { id: edgeId, campaignId: id }, select: { id: true },
    });
    if (!exists) return reply.code(404).send({ error: 'CampaignEdge not found' });

    await withSnapshot(
      id,
      { reason: 'admin-delete-campaign-edge', createdBy: request.user.id },
      () => prisma.campaignEdge.delete({ where: { id: edgeId } }),
    );
    return { ok: true };
  });
}
