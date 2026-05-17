// Admin panel — CampaignQuest + CampaignQuestObjective + CampaignQuestPrerequisite CRUD.

import { prisma } from '../../lib/prisma.js';
import { withSnapshot } from '../../services/campaignSnapshot.js';
import { serializeAdminPayload } from './serialization.js';

const CAMPAIGN_PARAM = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'string', format: 'uuid' } },
};

const QUEST_PARAM = {
  type: 'object',
  required: ['id', 'questId'],
  properties: {
    id: { type: 'string', format: 'uuid' },
    questId: { type: 'string', format: 'uuid' },
  },
};

const OBJECTIVE_PARAM = {
  type: 'object',
  required: ['id', 'questId', 'objId'],
  properties: {
    id: { type: 'string', format: 'uuid' },
    questId: { type: 'string', format: 'uuid' },
    objId: { type: 'string' },
  },
};

const QUEST_FIELDS = [
  'questId', 'name', 'type', 'description', 'completionCondition',
  'questGiverId', 'turnInNpcId', 'locationId',
  'reward', 'status', 'completedAt', 'forcedGiver', 'mutationLog',
];

const OBJECTIVE_FIELDS = [
  'displayOrder', 'description', 'progress', 'targetAmount',
  'status', 'metadata', 'nodeKey',
];

function pick(body, allowed) {
  const out = {};
  for (const k of allowed) {
    if (body[k] !== undefined) out[k] = body[k];
  }
  return out;
}

export async function adminQuestRoutes(fastify) {
  // ── List quests ──
  fastify.get('/:id/quests', { schema: { params: CAMPAIGN_PARAM } }, async (request) => {
    const { id } = request.params;
    const quests = await prisma.campaignQuest.findMany({
      where: { campaignId: id },
      include: { objectives: { orderBy: { displayOrder: 'asc' } } },
      orderBy: { name: 'asc' },
    });
    return serializeAdminPayload(quests);
  });

  // ── Get one quest with objectives + prerequisites ──
  fastify.get('/:id/quests/:questId', { schema: { params: QUEST_PARAM } }, async (request, reply) => {
    const { id, questId } = request.params;
    const quest = await prisma.campaignQuest.findFirst({
      where: { id: questId, campaignId: id },
      include: {
        objectives: { orderBy: { displayOrder: 'asc' } },
        prerequisites: true,
      },
    });
    if (!quest) return reply.code(404).send({ error: 'Quest not found' });
    return serializeAdminPayload(quest);
  });

  // ── Create quest ──
  fastify.post('/:id/quests', {
    schema: {
      params: CAMPAIGN_PARAM,
      body: { type: 'object', required: ['questId', 'name'], additionalProperties: true },
    },
  }, async (request, reply) => {
    const { id } = request.params;
    const data = pick(request.body || {}, QUEST_FIELDS);
    if (!data.questId || !data.name) {
      return reply.code(400).send({ error: 'questId and name required' });
    }
    const created = await withSnapshot(
      id,
      { reason: 'admin-create-quest', createdBy: request.user.id },
      () => prisma.campaignQuest.create({ data: { ...data, campaignId: id } }),
    );
    return created;
  });

  // ── Update quest ──
  fastify.patch('/:id/quests/:questId', {
    schema: {
      params: QUEST_PARAM,
      body: { type: 'object', additionalProperties: true },
    },
  }, async (request, reply) => {
    const { id, questId } = request.params;
    const data = pick(request.body || {}, QUEST_FIELDS);
    if (Object.keys(data).length === 0) {
      return reply.code(400).send({ error: 'No editable fields provided' });
    }
    const exists = await prisma.campaignQuest.findFirst({
      where: { id: questId, campaignId: id }, select: { id: true },
    });
    if (!exists) return reply.code(404).send({ error: 'Quest not found' });

    const updated = await withSnapshot(
      id,
      { reason: 'admin-edit-quest', createdBy: request.user.id },
      () => prisma.campaignQuest.update({ where: { id: questId }, data }),
    );
    return updated;
  });

  // ── Delete quest ──
  fastify.delete('/:id/quests/:questId', { schema: { params: QUEST_PARAM } }, async (request, reply) => {
    const { id, questId } = request.params;
    const exists = await prisma.campaignQuest.findFirst({
      where: { id: questId, campaignId: id }, select: { id: true },
    });
    if (!exists) return reply.code(404).send({ error: 'Quest not found' });

    await withSnapshot(
      id,
      { reason: 'admin-delete-quest', createdBy: request.user.id },
      () => prisma.campaignQuest.delete({ where: { id: questId } }),
    );
    return { ok: true };
  });

  // ── Objective CRUD ──
  fastify.post('/:id/quests/:questId/objectives', {
    schema: {
      params: QUEST_PARAM,
      body: { type: 'object', required: ['description'], additionalProperties: true },
    },
  }, async (request, reply) => {
    const { id, questId } = request.params;
    const data = pick(request.body || {}, OBJECTIVE_FIELDS);
    if (!data.description) return reply.code(400).send({ error: 'description required' });
    const exists = await prisma.campaignQuest.findFirst({
      where: { id: questId, campaignId: id }, select: { id: true },
    });
    if (!exists) return reply.code(404).send({ error: 'Quest not found' });

    const created = await withSnapshot(
      id,
      { reason: 'admin-create-objective', createdBy: request.user.id },
      () => prisma.campaignQuestObjective.create({ data: { ...data, questId } }),
    );
    // BigInt id — stringify for JSON.
    return { ...created, id: String(created.id) };
  });

  fastify.patch('/:id/quests/:questId/objectives/:objId', {
    schema: {
      params: OBJECTIVE_PARAM,
      body: { type: 'object', additionalProperties: true },
    },
  }, async (request, reply) => {
    const { id, questId, objId } = request.params;
    const data = pick(request.body || {}, OBJECTIVE_FIELDS);
    if (Object.keys(data).length === 0) {
      return reply.code(400).send({ error: 'No editable fields provided' });
    }
    const objIdBigInt = (() => {
      try { return BigInt(objId); } catch { return null; }
    })();
    if (objIdBigInt === null) return reply.code(400).send({ error: 'Invalid objId' });

    const exists = await prisma.campaignQuestObjective.findFirst({
      where: { id: objIdBigInt, questId }, select: { id: true },
    });
    if (!exists) return reply.code(404).send({ error: 'Objective not found' });

    const updated = await withSnapshot(
      id,
      { reason: 'admin-edit-objective', createdBy: request.user.id },
      () => prisma.campaignQuestObjective.update({ where: { id: objIdBigInt }, data }),
    );
    return { ...updated, id: String(updated.id) };
  });

  fastify.delete('/:id/quests/:questId/objectives/:objId', { schema: { params: OBJECTIVE_PARAM } }, async (request, reply) => {
    const { id, questId, objId } = request.params;
    const objIdBigInt = (() => { try { return BigInt(objId); } catch { return null; } })();
    if (objIdBigInt === null) return reply.code(400).send({ error: 'Invalid objId' });
    const exists = await prisma.campaignQuestObjective.findFirst({
      where: { id: objIdBigInt, questId }, select: { id: true },
    });
    if (!exists) return reply.code(404).send({ error: 'Objective not found' });

    await withSnapshot(
      id,
      { reason: 'admin-delete-objective', createdBy: request.user.id },
      () => prisma.campaignQuestObjective.delete({ where: { id: objIdBigInt } }),
    );
    return { ok: true };
  });

  // ── Replace prerequisites for a quest ──
  // Body: { prerequisiteIds: string[] (CampaignQuest.id[]) }
  fastify.put('/:id/quests/:questId/prerequisites', {
    schema: {
      params: QUEST_PARAM,
      body: {
        type: 'object',
        required: ['prerequisiteIds'],
        properties: {
          prerequisiteIds: {
            type: 'array',
            items: { type: 'string', format: 'uuid' },
            uniqueItems: true,
          },
        },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    const { id, questId } = request.params;
    const { prerequisiteIds } = request.body;
    const exists = await prisma.campaignQuest.findFirst({
      where: { id: questId, campaignId: id }, select: { id: true },
    });
    if (!exists) return reply.code(404).send({ error: 'Quest not found' });

    // Validate: every prerequisiteId is a quest in same campaign + not self.
    const valid = await prisma.campaignQuest.findMany({
      where: { id: { in: prerequisiteIds }, campaignId: id }, select: { id: true },
    });
    const validIds = new Set(valid.map((v) => v.id));
    for (const pid of prerequisiteIds) {
      if (pid === questId) {
        return reply.code(400).send({ error: `Quest cannot be its own prerequisite` });
      }
      if (!validIds.has(pid)) {
        return reply.code(400).send({ error: `Prerequisite ${pid} not found in this campaign` });
      }
    }

    await withSnapshot(
      id,
      { reason: 'admin-replace-prereqs', createdBy: request.user.id },
      () => prisma.$transaction([
        prisma.campaignQuestPrerequisite.deleteMany({ where: { questId } }),
        prisma.campaignQuestPrerequisite.createMany({
          data: prerequisiteIds.map((prereqId) => ({ questId, prerequisiteId: prereqId })),
          skipDuplicates: true,
        }),
      ]),
    );
    return { ok: true, prerequisiteIds };
  });
}
