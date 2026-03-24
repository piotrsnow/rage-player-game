import { prisma } from '../lib/prisma.js';

function safeJsonParse(raw, fallback = {}) {
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function deserializeCharacter(c) {
  return {
    ...c,
    careerData: safeJsonParse(c.careerData, {}),
    characteristics: safeJsonParse(c.characteristics, {}),
    advances: safeJsonParse(c.advances, {}),
    skills: safeJsonParse(c.skills, {}),
    talents: safeJsonParse(c.talents, []),
    inventory: safeJsonParse(c.inventory, []),
  };
}

export async function characterRoutes(fastify) {
  fastify.addHook('onRequest', fastify.authenticate);

  fastify.get('/', async (request) => {
    const characters = await prisma.character.findMany({
      where: { userId: request.user.id },
      orderBy: { updatedAt: 'desc' },
    });

    return characters.map(deserializeCharacter);
  });

  fastify.get('/:id', async (request, reply) => {
    const character = await prisma.character.findFirst({
      where: { id: request.params.id, userId: request.user.id },
    });
    if (!character) return reply.code(404).send({ error: 'Character not found' });

    return deserializeCharacter(character);
  });

  fastify.post('/', async (request) => {
    const body = request.body;

    const character = await prisma.character.create({
      data: {
        userId: request.user.id,
        name: body.name || 'Adventurer',
        species: body.species || 'Human',
        careerData: JSON.stringify(body.careerData || {}),
        characteristics: JSON.stringify(body.characteristics || {}),
        advances: JSON.stringify(body.advances || {}),
        skills: JSON.stringify(body.skills || {}),
        talents: JSON.stringify(body.talents || []),
        wounds: body.wounds ?? 0,
        maxWounds: body.maxWounds ?? 0,
        movement: body.movement ?? 4,
        fate: body.fate ?? 0,
        resilience: body.resilience ?? 0,
        xp: body.xp ?? 0,
        xpSpent: body.xpSpent ?? 0,
        backstory: body.backstory || '',
        inventory: JSON.stringify(body.inventory || []),
        portraitUrl: body.portraitUrl || '',
        campaignCount: body.campaignCount ?? 0,
      },
    });

    return deserializeCharacter(character);
  });

  fastify.put('/:id', async (request, reply) => {
    const existing = await prisma.character.findFirst({
      where: { id: request.params.id, userId: request.user.id },
    });
    if (!existing) return reply.code(404).send({ error: 'Character not found' });

    const body = request.body;
    const updateData = {};

    if (body.name !== undefined) updateData.name = body.name;
    if (body.species !== undefined) updateData.species = body.species;
    if (body.careerData !== undefined) updateData.careerData = JSON.stringify(body.careerData);
    if (body.characteristics !== undefined) updateData.characteristics = JSON.stringify(body.characteristics);
    if (body.advances !== undefined) updateData.advances = JSON.stringify(body.advances);
    if (body.skills !== undefined) updateData.skills = JSON.stringify(body.skills);
    if (body.talents !== undefined) updateData.talents = JSON.stringify(body.talents);
    if (body.wounds !== undefined) updateData.wounds = body.wounds;
    if (body.maxWounds !== undefined) updateData.maxWounds = body.maxWounds;
    if (body.movement !== undefined) updateData.movement = body.movement;
    if (body.fate !== undefined) updateData.fate = body.fate;
    if (body.resilience !== undefined) updateData.resilience = body.resilience;
    if (body.xp !== undefined) updateData.xp = body.xp;
    if (body.xpSpent !== undefined) updateData.xpSpent = body.xpSpent;
    if (body.backstory !== undefined) updateData.backstory = body.backstory;
    if (body.inventory !== undefined) updateData.inventory = JSON.stringify(body.inventory);
    if (body.portraitUrl !== undefined) updateData.portraitUrl = body.portraitUrl;
    if (body.campaignCount !== undefined) updateData.campaignCount = body.campaignCount;

    const character = await prisma.character.update({
      where: { id: request.params.id },
      data: updateData,
    });

    return deserializeCharacter(character);
  });

  fastify.delete('/:id', async (request, reply) => {
    const existing = await prisma.character.findFirst({
      where: { id: request.params.id, userId: request.user.id },
    });
    if (!existing) return reply.code(404).send({ error: 'Character not found' });

    await prisma.character.delete({ where: { id: request.params.id } });
    return { success: true };
  });
}
