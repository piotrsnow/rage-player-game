import { randomUUID } from 'crypto';
import { prisma } from '../lib/prisma.js';

const CANONICAL_MEDIA_PATTERN = '^/v1/media/file/[A-Za-z0-9._/\\-]+$';
const PROVIDER_ENUM = ['dalle', 'gpt-image', 'stability', 'gemini', 'sd-webui'];

const CREATE_BODY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['imageUrl', 'prompt', 'provider'],
  properties: {
    imageUrl: { type: 'string', maxLength: 2048, pattern: CANONICAL_MEDIA_PATTERN },
    referenceImageUrl: {
      type: ['string', 'null'],
      maxLength: 2048,
      pattern: CANONICAL_MEDIA_PATTERN,
    },
    prompt: { type: 'string', maxLength: 8000 },
    keywords: { type: ['string', 'null'], maxLength: 500 },
    provider: { type: 'string', enum: PROVIDER_ENUM },
    sdModel: { type: ['string', 'null'], maxLength: 200 },
    sdSeed: { type: ['integer', 'null'] },
  },
};

const LIST_QUERYSTRING_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    page: { type: 'integer', minimum: 1, default: 1 },
    pageSize: { type: 'integer', minimum: 1, maximum: 50, default: 5 },
  },
};

const PLAYGROUND_TYPE = 'playground-history';

function toClientEntry(asset) {
  const meta = asset.metadata || {};
  return {
    id: asset.id,
    createdAt: asset.createdAt,
    imageUrl: meta.imageUrl || null,
    referenceImageUrl: meta.referenceImageUrl || null,
    prompt: meta.prompt || '',
    keywords: meta.keywords || '',
    provider: meta.provider || 'dalle',
    sdModel: meta.sdModel || null,
    sdSeed: Number.isInteger(meta.sdSeed) ? meta.sdSeed : null,
  };
}

export async function playgroundRoutes(fastify) {
  fastify.addHook('onRequest', fastify.authenticate);

  fastify.post('/history', { schema: { body: CREATE_BODY_SCHEMA } }, async (request) => {
    const {
      imageUrl,
      referenceImageUrl = null,
      prompt,
      keywords = '',
      provider,
      sdModel = null,
      sdSeed = null,
    } = request.body;

    const key = `playground-history:${request.user.id}:${Date.now()}:${randomUUID().slice(0, 8)}`;

    const asset = await prisma.mediaAsset.create({
      data: {
        userId: request.user.id,
        key,
        type: PLAYGROUND_TYPE,
        contentType: 'application/json',
        size: 0,
        backend: 'metadata',
        path: '',
        metadata: {
          imageUrl,
          referenceImageUrl,
          prompt,
          keywords,
          provider,
          sdModel,
          sdSeed,
          createdAt: new Date().toISOString(),
        },
      },
    });

    return { entry: toClientEntry(asset) };
  });

  fastify.get('/history', { schema: { querystring: LIST_QUERYSTRING_SCHEMA } }, async (request) => {
    const page = request.query.page || 1;
    const pageSize = request.query.pageSize || 5;

    const where = { userId: request.user.id, type: PLAYGROUND_TYPE };

    const [total, rows] = await Promise.all([
      prisma.mediaAsset.count({ where }),
      prisma.mediaAsset.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      items: rows.map(toClientEntry),
      page,
      pageSize,
      total,
    };
  });

  fastify.delete('/history/:id', async (request, reply) => {
    const { id } = request.params;
    const asset = await prisma.mediaAsset.findFirst({
      where: { id, userId: request.user.id, type: PLAYGROUND_TYPE },
    });
    if (!asset) return reply.code(404).send({ error: 'History entry not found' });

    await prisma.mediaAsset.delete({ where: { id: asset.id } });
    return { success: true };
  });
}
