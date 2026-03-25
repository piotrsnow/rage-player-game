import { prisma } from '../lib/prisma.js';
import bcrypt from 'bcrypt';
import { resolveApiKey } from '../services/apiKeyService.js';
const SALT_ROUNDS = 12;
const SHARED_VOICE_SCOPE = 'voices';
const SHARED_VOICE_KEYS = ['elevenlabsVoiceId', 'elevenlabsVoiceName', 'characterVoices'];
const MAX_SHARED_VOICE_SETTINGS_SIZE = 16 * 1024;

function sanitizeSharedVoiceSettings(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const narratorVoiceId = typeof source.elevenlabsVoiceId === 'string' ? source.elevenlabsVoiceId.trim() : '';
  const narratorVoiceName = typeof source.elevenlabsVoiceName === 'string' ? source.elevenlabsVoiceName.trim() : '';
  const characterVoices = Array.isArray(source.characterVoices)
    ? source.characterVoices
        .filter((entry) => entry && typeof entry === 'object' && !Array.isArray(entry))
        .map((entry) => ({
          voiceId: typeof entry.voiceId === 'string' ? entry.voiceId.trim() : '',
          voiceName: typeof entry.voiceName === 'string' ? entry.voiceName.trim() : '',
          gender: entry.gender === 'female' ? 'female' : 'male',
        }))
        .filter((entry) => entry.voiceId && entry.voiceName)
    : [];

  const dedupedCharacterVoices = [];
  const seenVoiceIds = new Set();
  for (const voice of characterVoices) {
    if (seenVoiceIds.has(voice.voiceId)) continue;
    seenVoiceIds.add(voice.voiceId);
    dedupedCharacterVoices.push(voice);
  }

  return {
    elevenlabsVoiceId: narratorVoiceId,
    elevenlabsVoiceName: narratorVoiceName,
    characterVoices: dedupedCharacterVoices,
  };
}

function extractSharedVoiceSettings(settings) {
  const source = settings && typeof settings === 'object' && !Array.isArray(settings) ? settings : {};
  const subset = {};
  for (const key of SHARED_VOICE_KEYS) {
    if (source[key] !== undefined) {
      subset[key] = source[key];
    }
  }
  return sanitizeSharedVoiceSettings(subset);
}

async function getOrCreateSharedVoiceSettings(userId) {
  const existing = await prisma.sharedConfig.findUnique({
    where: { scope: SHARED_VOICE_SCOPE },
  });
  if (existing) {
    try {
      return sanitizeSharedVoiceSettings(JSON.parse(existing.value || '{}'));
    } catch {
      return sanitizeSharedVoiceSettings({});
    }
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { settings: true },
  });

  let initialSettings = {};
  try {
    initialSettings = extractSharedVoiceSettings(JSON.parse(user?.settings || '{}'));
  } catch {
    initialSettings = sanitizeSharedVoiceSettings({});
  }

  try {
    await prisma.sharedConfig.create({
      data: {
        scope: SHARED_VOICE_SCOPE,
        value: JSON.stringify(initialSettings),
        updatedByUserId: userId,
      },
    });
    return initialSettings;
  } catch (error) {
    const retry = await prisma.sharedConfig.findUnique({
      where: { scope: SHARED_VOICE_SCOPE },
    });
    if (retry) {
      try {
        return sanitizeSharedVoiceSettings(JSON.parse(retry.value || '{}'));
      } catch {
        return sanitizeSharedVoiceSettings({});
      }
    }
    throw error;
  }
}

export async function authRoutes(fastify) {
  fastify.post('/register', {
    schema: {
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 6 },
        },
      },
    },
  }, async (request, reply) => {
    const { email, password } = request.body;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return reply.code(409).send({ error: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const user = await prisma.user.create({
      data: { email, passwordHash },
    });

    const token = fastify.jwt.sign({ id: user.id, email: user.email });
    return { token, user: { id: user.id, email: user.email } };
  });

  fastify.post('/login', {
    schema: {
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string' },
          password: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const { email, password } = request.body;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return reply.code(401).send({ error: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return reply.code(401).send({ error: 'Invalid credentials' });
    }

    const token = fastify.jwt.sign({ id: user.id, email: user.email });
    return { token, user: { id: user.id, email: user.email } };
  });

  fastify.get('/me', { onRequest: [fastify.authenticate] }, async (request) => {
    const user = await prisma.user.findUnique({
      where: { id: request.user.id },
      select: { id: true, email: true, settings: true, createdAt: true },
    });
    if (!user) throw { statusCode: 404, message: 'User not found' };

    return {
      ...user,
      settings: JSON.parse(user.settings),
    };
  });

  fastify.get('/shared-voices', { onRequest: [fastify.authenticate] }, async (request) => {
    return getOrCreateSharedVoiceSettings(request.user.id);
  });

  fastify.put('/shared-voices', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const settings = sanitizeSharedVoiceSettings(request.body);
    const serialized = JSON.stringify(settings);
    if (serialized.length > MAX_SHARED_VOICE_SETTINGS_SIZE) {
      return reply.code(400).send({ error: 'Shared voice settings payload too large' });
    }

    await getOrCreateSharedVoiceSettings(request.user.id);
    await prisma.sharedConfig.update({
      where: { scope: SHARED_VOICE_SCOPE },
      data: {
        value: serialized,
        updatedByUserId: request.user.id,
      },
    });

    return settings;
  });

  fastify.put('/settings', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const { settings, apiKeys } = request.body;
    const data = {};

    if (settings !== undefined) {
      if (typeof settings !== 'object' || settings === null || Array.isArray(settings)) {
        return reply.code(400).send({ error: 'Settings must be a JSON object' });
      }
      const MAX_SETTINGS_SIZE = 64 * 1024;
      const serialized = JSON.stringify(settings);
      if (serialized.length > MAX_SETTINGS_SIZE) {
        return reply.code(400).send({ error: 'Settings payload too large' });
      }
      data.settings = serialized;
    }

    if (apiKeys !== undefined) {
      const { encrypt } = await import('../services/apiKeyService.js');
      data.apiKeys = encrypt(JSON.stringify(apiKeys));
    }

    const user = await prisma.user.update({
      where: { id: request.user.id },
      data,
      select: { id: true, email: true, settings: true },
    });

    return { ...user, settings: JSON.parse(user.settings) };
  });

  fastify.get('/api-keys', { onRequest: [fastify.authenticate] }, async (request) => {
    const user = await prisma.user.findUnique({
      where: { id: request.user.id },
      select: { apiKeys: true },
    });

    const resolved = {};
    const keyNames = ['openai', 'anthropic', 'elevenlabs', 'stability', 'gemini'];
    for (const name of keyNames) {
      const key = resolveApiKey(user?.apiKeys || '{}', name);
      resolved[name] = key ? '••••' + key.slice(-4) : '';
    }
    return resolved;
  });
}
