import { prisma } from '../lib/prisma.js';

const CREATE_BODY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['seedText', 'generatedTopic'],
  properties: {
    seedText: { type: 'string', minLength: 1, maxLength: 2000 },
    generatedTopic: { type: 'string', minLength: 1, maxLength: 4000 },
    genre: { type: 'string', maxLength: 100 },
    tone: { type: 'string', maxLength: 100 },
  },
};

const LIST_QUERYSTRING_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    page: { type: 'integer', minimum: 1, default: 1 },
    pageSize: { type: 'integer', minimum: 1, maximum: 50, default: 20 },
  },
};

function toClientEntry(row) {
  return {
    id: row.id,
    seedText: row.seedText,
    generatedTopic: row.generatedTopic,
    genre: row.genre,
    tone: row.tone,
    createdAt: row.createdAt,
  };
}

export async function topicHistoryRoutes(fastify) {
  fastify.addHook('onRequest', fastify.authenticate);

  fastify.post('/', { schema: { body: CREATE_BODY_SCHEMA } }, async (request) => {
    const { seedText, generatedTopic, genre = '', tone = '' } = request.body;

    const entry = await prisma.topicHistory.create({
      data: {
        userId: request.user.id,
        seedText,
        generatedTopic,
        genre,
        tone,
      },
    });

    return { entry: toClientEntry(entry) };
  });

  fastify.get('/', { schema: { querystring: LIST_QUERYSTRING_SCHEMA } }, async (request) => {
    const page = request.query.page || 1;
    const pageSize = request.query.pageSize || 20;

    const where = { userId: request.user.id };

    const [total, rows] = await Promise.all([
      prisma.topicHistory.count({ where }),
      prisma.topicHistory.findMany({
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

  fastify.delete('/:id', async (request, reply) => {
    const { id } = request.params;
    const entry = await prisma.topicHistory.findFirst({
      where: { id, userId: request.user.id },
    });
    if (!entry) return reply.code(404).send({ error: 'Topic history entry not found' });

    await prisma.topicHistory.delete({ where: { id: entry.id } });
    return { success: true };
  });
}
