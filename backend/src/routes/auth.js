import { prisma } from '../lib/prisma.js';
import bcrypt from 'bcrypt';
import { resolveApiKey } from '../services/apiKeyService.js';
const SALT_ROUNDS = 12;

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
    const keyNames = ['openai', 'anthropic', 'elevenlabs', 'stability', 'suno'];
    for (const name of keyNames) {
      const key = resolveApiKey(user?.apiKeys || '{}', name);
      resolved[name] = key ? '••••' + key.slice(-4) : '';
    }
    return resolved;
  });
}
