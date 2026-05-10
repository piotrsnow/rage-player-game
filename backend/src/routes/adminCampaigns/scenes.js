// Admin panel — CampaignScene edit (rare; mostly read-only with text overrides).

import { prisma } from '../../lib/prisma.js';
import { withSnapshot } from '../../services/campaignSnapshot.js';

const SCENE_PARAM = {
  type: 'object',
  required: ['id', 'sceneId'],
  properties: {
    id: { type: 'string', format: 'uuid' },
    sceneId: { type: 'string', format: 'uuid' },
  },
};

const SCENE_FIELDS = [
  'narrative', 'chosenAction', 'suggestedActions', 'dialogueSegments',
  'imagePrompt', 'fullImagePrompt', 'imageUrl', 'soundEffect',
  'diceRoll', 'stateChanges', 'scenePacing',
];

function pick(body, allowed) {
  const out = {};
  for (const k of allowed) {
    if (body[k] !== undefined) out[k] = body[k];
  }
  return out;
}

export async function adminSceneRoutes(fastify) {
  fastify.get('/:id/scenes/:sceneId', { schema: { params: SCENE_PARAM } }, async (request, reply) => {
    const { id, sceneId } = request.params;
    const scene = await prisma.campaignScene.findFirst({
      where: { id: sceneId, campaignId: id },
    });
    if (!scene) return reply.code(404).send({ error: 'Scene not found' });
    return scene;
  });

  fastify.patch('/:id/scenes/:sceneId', {
    schema: {
      params: SCENE_PARAM,
      body: { type: 'object', additionalProperties: true },
    },
  }, async (request, reply) => {
    const { id, sceneId } = request.params;
    const data = pick(request.body || {}, SCENE_FIELDS);
    if (Object.keys(data).length === 0) {
      return reply.code(400).send({ error: 'No editable fields provided' });
    }
    const exists = await prisma.campaignScene.findFirst({
      where: { id: sceneId, campaignId: id }, select: { id: true },
    });
    if (!exists) return reply.code(404).send({ error: 'Scene not found' });

    const updated = await withSnapshot(
      id,
      { reason: 'admin-edit-scene', createdBy: request.user.id },
      () => prisma.campaignScene.update({ where: { id: sceneId }, data }),
    );
    return updated;
  });

  fastify.delete('/:id/scenes/:sceneId', { schema: { params: SCENE_PARAM } }, async (request, reply) => {
    const { id, sceneId } = request.params;
    const exists = await prisma.campaignScene.findFirst({
      where: { id: sceneId, campaignId: id }, select: { id: true },
    });
    if (!exists) return reply.code(404).send({ error: 'Scene not found' });

    await withSnapshot(
      id,
      { reason: 'admin-delete-scene', createdBy: request.user.id },
      () => prisma.campaignScene.delete({ where: { id: sceneId } }),
    );
    return { ok: true };
  });
}
