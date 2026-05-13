// Admin panel — CampaignNPC + WorldNPC CRUD.

import { prisma } from '../../lib/prisma.js';
import { withSnapshot } from '../../services/campaignSnapshot.js';
import { serializeAdminPayload } from './serialization.js';

const CAMPAIGN_PARAM = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'string', format: 'uuid' } },
};

const NPC_PARAM = {
  type: 'object',
  required: ['id', 'npcId'],
  properties: {
    id: { type: 'string', format: 'uuid' },
    npcId: { type: 'string', format: 'uuid' },
  },
};

const WORLD_NPC_PARAM = {
  type: 'object',
  required: ['npcId'],
  properties: { npcId: { type: 'string', format: 'uuid' } },
};

const NPC_FIELDS = [
  'name', 'gender', 'role', 'personality', 'attitude', 'disposition',
  'alive', 'lastLocation', 'lastLocationKind', 'lastLocationId',
  'factionId', 'notes', 'worldNpcId', 'isAgent', 'category',
  'pendingIntroHint', 'activeGoal', 'goalProgress', 'race', 'creatureKind',
  'level', 'stats', 'portraitUrl', 'spriteUrl',
];

const WORLD_NPC_FIELDS = [
  'name', 'role', 'personality', 'alignment', 'alive',
  'currentLocationId', 'homeLocationId', 'category', 'keyNpc',
  'activeGoal', 'goalProgress', 'schedule',
  'race', 'creatureKind', 'level', 'stats', 'spriteUrl',
];

function pick(body, allowed) {
  const out = {};
  for (const k of allowed) {
    if (body[k] !== undefined) out[k] = body[k];
  }
  return out;
}

export async function adminNpcRoutes(fastify) {
  // ── Campaign NPCs ──
  fastify.get('/:id/npcs', { schema: { params: CAMPAIGN_PARAM } }, async (request) => {
    const { id } = request.params;
    return prisma.campaignNPC.findMany({
      where: { campaignId: id },
      orderBy: { name: 'asc' },
    });
  });

  fastify.get('/:id/npcs/:npcId', { schema: { params: NPC_PARAM } }, async (request, reply) => {
    const { id, npcId } = request.params;
    const npc = await prisma.campaignNPC.findFirst({
      where: { id: npcId, campaignId: id },
      include: { relationships: true, experiences: { orderBy: { addedAt: 'desc' }, take: 20 } },
    });
    if (!npc) return reply.code(404).send({ error: 'NPC not found' });
    return serializeAdminPayload({
      ...npc,
    });
  });

  fastify.post('/:id/npcs', {
    schema: {
      params: CAMPAIGN_PARAM,
      body: { type: 'object', required: ['name'], additionalProperties: true },
    },
  }, async (request, reply) => {
    const { id } = request.params;
    const data = pick(request.body || {}, NPC_FIELDS);
    if (!data.name) return reply.code(400).send({ error: 'name required' });
    // Auto-derive npcId from name if not provided.
    const npcId = (request.body.npcId || data.name).toString().toLowerCase().replace(/\s+/g, '_');
    const created = await withSnapshot(
      id,
      { reason: 'admin-create-npc', createdBy: request.user.id },
      () => prisma.campaignNPC.create({ data: { ...data, campaignId: id, npcId } }),
    );
    return created;
  });

  fastify.patch('/:id/npcs/:npcId', {
    schema: {
      params: NPC_PARAM,
      body: { type: 'object', additionalProperties: true },
    },
  }, async (request, reply) => {
    const { id, npcId } = request.params;
    const data = pick(request.body || {}, NPC_FIELDS);
    if (Object.keys(data).length === 0) {
      return reply.code(400).send({ error: 'No editable fields provided' });
    }
    const exists = await prisma.campaignNPC.findFirst({
      where: { id: npcId, campaignId: id }, select: { id: true },
    });
    if (!exists) return reply.code(404).send({ error: 'NPC not found' });

    const updated = await withSnapshot(
      id,
      { reason: 'admin-edit-npc', createdBy: request.user.id },
      () => prisma.campaignNPC.update({ where: { id: npcId }, data }),
    );
    return updated;
  });

  fastify.delete('/:id/npcs/:npcId', { schema: { params: NPC_PARAM } }, async (request, reply) => {
    const { id, npcId } = request.params;
    const exists = await prisma.campaignNPC.findFirst({
      where: { id: npcId, campaignId: id }, select: { id: true },
    });
    if (!exists) return reply.code(404).send({ error: 'NPC not found' });

    await withSnapshot(
      id,
      { reason: 'admin-delete-npc', createdBy: request.user.id },
      () => prisma.campaignNPC.delete({ where: { id: npcId } }),
    );
    return { ok: true };
  });

  // ── WorldNPCs (canonical, not scoped to a campaign) ──
  fastify.get('/world-npcs', {
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
    return prisma.worldNPC.findMany({
      where: search ? { name: { contains: search, mode: 'insensitive' } } : {},
      orderBy: { name: 'asc' },
      take: limit,
    });
  });

  fastify.get('/world-npcs/:npcId', { schema: { params: WORLD_NPC_PARAM } }, async (request, reply) => {
    const { npcId } = request.params;
    const npc = await prisma.worldNPC.findUnique({ where: { id: npcId } });
    if (!npc) return reply.code(404).send({ error: 'WorldNPC not found' });
    return npc;
  });

  fastify.patch('/world-npcs/:npcId', {
    schema: {
      params: WORLD_NPC_PARAM,
      body: { type: 'object', additionalProperties: true },
    },
  }, async (request, reply) => {
    const { npcId } = request.params;
    const data = pick(request.body || {}, WORLD_NPC_FIELDS);
    if (Object.keys(data).length === 0) {
      return reply.code(400).send({ error: 'No editable fields provided' });
    }
    const exists = await prisma.worldNPC.findUnique({ where: { id: npcId }, select: { id: true } });
    if (!exists) return reply.code(404).send({ error: 'WorldNPC not found' });

    // No snapshot — WorldNPC is not scoped to a single campaign. Edit lands
    // in living-world audit log via WorldNpcAttribution if needed (out of scope).
    return prisma.worldNPC.update({ where: { id: npcId }, data });
  });
}
