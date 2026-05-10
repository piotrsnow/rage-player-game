import { prisma } from '../lib/prisma.js';

const SINGLETON_ID = 'singleton';

const EMPTY_PROVIDER = {
  narratorVoiceId: '',
  narratorVoiceName: '',
  maleVoices: [],
  femaleVoices: [],
};

async function getVoiceConfig() {
  const row = await prisma.serverSettings.findUnique({ where: { id: SINGLETON_ID } });
  return row?.voiceConfig || {};
}

export async function voiceSettingsRoutes(fastify) {
  fastify.addHook('onRequest', fastify.authenticate);

  fastify.get('/', async () => {
    return getVoiceConfig();
  });

  fastify.put('/', {
    preHandler: [fastify.requireAdmin],
    schema: {
      body: {
        type: 'object',
        required: ['provider'],
        properties: {
          provider: { type: 'string', enum: ['elevenlabs', 'xtts'] },
          narratorVoiceId: { type: 'string' },
          narratorVoiceName: { type: 'string' },
          maleVoices: {
            type: 'array',
            items: {
              type: 'object',
              required: ['voiceId', 'voiceName'],
              properties: {
                voiceId: { type: 'string' },
                voiceName: { type: 'string' },
              },
            },
          },
          femaleVoices: {
            type: 'array',
            items: {
              type: 'object',
              required: ['voiceId', 'voiceName'],
              properties: {
                voiceId: { type: 'string' },
                voiceName: { type: 'string' },
              },
            },
          },
        },
        additionalProperties: false,
      },
    },
  }, async (request) => {
    const { provider, ...data } = request.body;
    const current = await getVoiceConfig();
    const providerConfig = { ...EMPTY_PROVIDER, ...current[provider], ...data };
    const updated = { ...current, [provider]: providerConfig };

    await prisma.serverSettings.upsert({
      where: { id: SINGLETON_ID },
      create: { id: SINGLETON_ID, voiceConfig: updated },
      update: { voiceConfig: updated },
    });

    return updated;
  });

  fastify.put('/per-voice-volume', {
    preHandler: [fastify.requireAdmin],
    schema: {
      body: {
        type: 'object',
        required: ['voiceId', 'volume'],
        properties: {
          voiceId: { type: 'string', minLength: 1 },
          volume: { type: 'integer', minimum: 0, maximum: 100 },
        },
        additionalProperties: false,
      },
    },
  }, async (request) => {
    const { voiceId, volume } = request.body;
    const current = await getVoiceConfig();
    const perVoiceVolumes = { ...(current.perVoiceVolumes || {}), [voiceId]: volume };
    if (volume === 100) delete perVoiceVolumes[voiceId];
    const updated = { ...current, perVoiceVolumes };

    await prisma.serverSettings.upsert({
      where: { id: SINGLETON_ID },
      create: { id: SINGLETON_ID, voiceConfig: updated },
      update: { voiceConfig: updated },
    });

    return updated;
  });
}
