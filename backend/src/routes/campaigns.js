import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function campaignRoutes(fastify) {
  fastify.addHook('onRequest', fastify.authenticate);

  fastify.get('/', async (request) => {
    const campaigns = await prisma.campaign.findMany({
      where: { userId: request.user.id },
      select: { id: true, name: true, genre: true, tone: true, lastSaved: true, createdAt: true },
      orderBy: { lastSaved: 'desc' },
    });
    return campaigns;
  });

  fastify.get('/:id', async (request, reply) => {
    const campaign = await prisma.campaign.findFirst({
      where: { id: request.params.id, userId: request.user.id },
    });
    if (!campaign) return reply.code(404).send({ error: 'Campaign not found' });

    return { ...campaign, data: JSON.parse(campaign.data) };
  });

  fastify.post('/', async (request) => {
    const { name, genre, tone, data } = request.body;

    const campaign = await prisma.campaign.create({
      data: {
        userId: request.user.id,
        name: name || '',
        genre: genre || '',
        tone: tone || '',
        data: JSON.stringify(data || {}),
        lastSaved: new Date(),
      },
    });

    return { ...campaign, data: JSON.parse(campaign.data) };
  });

  fastify.put('/:id', async (request, reply) => {
    const existing = await prisma.campaign.findFirst({
      where: { id: request.params.id, userId: request.user.id },
    });
    if (!existing) return reply.code(404).send({ error: 'Campaign not found' });

    const { name, genre, tone, data } = request.body;
    const updateData = { lastSaved: new Date() };

    if (name !== undefined) updateData.name = name;
    if (genre !== undefined) updateData.genre = genre;
    if (tone !== undefined) updateData.tone = tone;
    if (data !== undefined) updateData.data = JSON.stringify(data);

    const campaign = await prisma.campaign.update({
      where: { id: request.params.id },
      data: updateData,
    });

    return { ...campaign, data: JSON.parse(campaign.data) };
  });

  fastify.delete('/:id', async (request, reply) => {
    const existing = await prisma.campaign.findFirst({
      where: { id: request.params.id, userId: request.user.id },
    });
    if (!existing) return reply.code(404).send({ error: 'Campaign not found' });

    await prisma.campaign.delete({ where: { id: request.params.id } });
    return { success: true };
  });
}
