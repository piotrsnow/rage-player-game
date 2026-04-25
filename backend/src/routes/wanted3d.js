import { prisma } from '../lib/prisma.js';
import { hashFromParams, toUuid } from '../services/hashService.js';

const REPORT_BODY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    campaignId: { type: ['string', 'null'], maxLength: 100 },
    entries: {
      type: 'array',
      maxItems: 500,
      items: {
        type: 'object',
        additionalProperties: true,
        properties: {
          entityKind: { type: 'string', maxLength: 50 },
          sceneId: { type: 'string', maxLength: 200 },
          objectId: { type: 'string', maxLength: 200 },
          objectName: { type: 'string', maxLength: 300 },
          objectType: { type: 'string', maxLength: 100 },
          objectDescription: { type: 'string', maxLength: 4000 },
          sceneText: { type: 'string', maxLength: 8000 },
          suggestedModelId: { type: 'string', maxLength: 200 },
          suggestedCategory: { type: 'string', maxLength: 100 },
          suggestedFile: { type: 'string', maxLength: 500 },
          matchScore: { type: 'number' },
          alreadyExists: { type: 'boolean' },
          status: { type: 'string', maxLength: 20 },
        },
      },
    },
  },
  required: ['entries'],
};

function normalizeEntry(entry) {
  return {
    entityKind: String(entry.entityKind || 'object'),
    sceneId: String(entry.sceneId || ''),
    objectId: String(entry.objectId || ''),
    objectName: String(entry.objectName || ''),
    objectType: String(entry.objectType || ''),
    objectDescription: String(entry.objectDescription || ''),
    sceneText: String(entry.sceneText || ''),
    suggestedModelId: String(entry.suggestedModelId || ''),
    suggestedCategory: String(entry.suggestedCategory || ''),
    suggestedFile: String(entry.suggestedFile || ''),
    matchScore: Math.max(0, Math.round(Number(entry.matchScore) || 0)),
    alreadyExists: !!entry.alreadyExists,
    status: ['matched', 'review', 'missing'].includes(entry.status) ? entry.status : 'review',
  };
}

export async function wanted3dRoutes(fastify) {
  fastify.addHook('onRequest', fastify.authenticate);

  fastify.post('/report', { schema: { body: REPORT_BODY_SCHEMA } }, async (request, reply) => {
    const { campaignId, entries } = request.body || {};
    if (!Array.isArray(entries) || entries.length === 0) {
      return reply.code(400).send({ error: 'entries array is required' });
    }

    const normalizedCampaignId = toUuid(campaignId);
    const results = [];

    for (const rawEntry of entries) {
      const entry = normalizeEntry(rawEntry);
      if (!entry.objectName) continue;

      const objectKey = hashFromParams({
        userId: request.user.id,
        campaignId: normalizedCampaignId || '',
        entityKind: entry.entityKind,
        objectId: entry.objectId,
        objectName: entry.objectName.toLowerCase(),
        objectType: entry.objectType.toLowerCase(),
      });

      const saved = await prisma.wanted3D.upsert({
        where: { objectKey },
        create: {
          userId: request.user.id,
          campaignId: normalizedCampaignId,
          objectKey,
          ...entry,
        },
        update: {
          entityKind: entry.entityKind,
          objectDescription: entry.objectDescription,
          sceneId: entry.sceneId,
          sceneText: entry.sceneText,
          suggestedModelId: entry.suggestedModelId,
          suggestedCategory: entry.suggestedCategory,
          suggestedFile: entry.suggestedFile,
          matchScore: entry.matchScore,
          alreadyExists: entry.alreadyExists,
          status: entry.status,
          requestCount: { increment: 1 },
          lastSeenAt: new Date(),
        },
      });

      results.push({ id: saved.id, objectKey, status: saved.status });
    }

    return { success: true, count: results.length, items: results };
  });
}
