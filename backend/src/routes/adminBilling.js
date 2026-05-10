import { prisma } from '../lib/prisma.js';

const SINGLETON_ID = 'singleton';
const FAKE_TOPUP_AMOUNTS = [200, 500, 1000];

export async function adminBillingRoutes(fastify) {
  fastify.addHook('onRequest', fastify.authenticate);
  fastify.addHook('onRequest', fastify.requireAdmin);

  fastify.get('/', async () => {
    const row = await prisma.serverSettings.findUnique({
      where: { id: SINGLETON_ID },
      select: { billingEnabled: true },
    });
    return { billingEnabled: !!row?.billingEnabled };
  });

  fastify.put('/', {
    schema: {
      body: {
        type: 'object',
        required: ['billingEnabled'],
        properties: { billingEnabled: { type: 'boolean' } },
        additionalProperties: false,
      },
    },
  }, async (request) => {
    const { billingEnabled } = request.body;

    const row = await prisma.serverSettings.upsert({
      where: { id: SINGLETON_ID },
      create: { id: SINGLETON_ID, billingEnabled },
      update: { billingEnabled },
      select: { billingEnabled: true },
    });

    return { billingEnabled: row.billingEnabled };
  });

  fastify.post('/fake-topup', {
    schema: {
      body: {
        type: 'object',
        required: ['amountCents'],
        properties: {
          amountCents: { type: 'integer', enum: FAKE_TOPUP_AMOUNTS },
        },
        additionalProperties: false,
      },
    },
  }, async (request) => {
    const { amountCents } = request.body;

    const user = await prisma.user.update({
      where: { id: request.user.id },
      data: { credits: { increment: amountCents } },
      select: { credits: true },
    });

    request.log.info({ userId: request.user.id, amountCents }, 'Admin fake top-up');
    return { credits: user.credits };
  });
}
