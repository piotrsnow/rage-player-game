import { prisma } from '../lib/prisma.js';

const SINGLETON_ID = 'singleton';

async function getSceneModelConfig() {
  const row = await prisma.serverSettings.findUnique({ where: { id: SINGLETON_ID } });
  return row?.sceneModelConfig || {};
}

const providerEntrySchema = {
  type: 'object',
  properties: {
    enabled: { type: 'boolean' },
    pricePerScene: { type: 'number', minimum: 0 },
  },
  additionalProperties: false,
};

export async function sceneModelConfigRoutes(fastify) {
  fastify.addHook('onRequest', fastify.authenticate);

  fastify.get('/', async () => {
    return getSceneModelConfig();
  });

  fastify.put('/', {
    preHandler: [fastify.requireAdmin],
    schema: {
      body: {
        type: 'object',
        properties: {
          tts: {
            type: 'object',
            properties: {
              elevenlabs: providerEntrySchema,
              xtts: providerEntrySchema,
            },
            additionalProperties: false,
          },
          image: {
            type: 'object',
            properties: {
              dalle: providerEntrySchema,
              'gpt-image': providerEntrySchema,
              stability: providerEntrySchema,
              gemini: providerEntrySchema,
              'sd-webui': providerEntrySchema,
            },
            additionalProperties: false,
          },
        },
        additionalProperties: false,
      },
    },
  }, async (request) => {
    const patch = request.body;
    const current = await getSceneModelConfig();

    const merged = { ...current };
    for (const category of ['tts', 'image']) {
      if (!patch[category]) continue;
      merged[category] = { ...(current[category] || {}) };
      for (const [provider, entry] of Object.entries(patch[category])) {
        merged[category][provider] = { ...(merged[category][provider] || {}), ...entry };
      }
    }

    await prisma.serverSettings.upsert({
      where: { id: SINGLETON_ID },
      create: { id: SINGLETON_ID, sceneModelConfig: merged },
      update: { sceneModelConfig: merged },
    });

    return merged;
  });
}
