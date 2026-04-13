import { describe, it, expect, beforeEach, vi } from 'vitest';
import Fastify from 'fastify';
import jwt from '@fastify/jwt';
import bcrypt from 'bcrypt';

// Stable test secret for both JWT signing and API key encryption. vi.mock
// factories are hoisted to the top of the file, so the secret has to be
// inlined inside the factory — outer refs hit the temporal dead zone.
vi.mock('../config.js', () => ({
  config: {
    jwtSecret: 'unit-test-jwt-secret-at-least-32-chars-long-abc',
    jwtExpiresIn: '1h',
    apiKeyEncryptionSecret: 'unit-test-encryption-secret-passphrase-256',
    apiKeys: { openai: 'sk-server', anthropic: 'ck-server' },
  },
}));

const JWT_TEST_SECRET = 'unit-test-jwt-secret-at-least-32-chars-long-abc';

// In-memory user store used by the prisma + mongoNative mocks. Reset between tests.
const userStore = new Map();

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(async ({ where, select }) => {
        let user = null;
        if (where.email) user = userStore.get(where.email) || null;
        if (where.id) {
          for (const u of userStore.values()) {
            if (u.id === where.id) { user = u; break; }
          }
        }
        if (!user || !select) return user;
        const picked = {};
        for (const k of Object.keys(select)) if (select[k]) picked[k] = user[k];
        return picked;
      }),
      create: vi.fn(async ({ data }) => {
        const id = `user_${userStore.size + 1}`;
        const user = {
          id,
          email: data.email,
          passwordHash: data.passwordHash,
          settings: '{}',
          apiKeys: '{}',
          createdAt: new Date(),
        };
        userStore.set(data.email, user);
        return user;
      }),
    },
  },
}));

// /settings uses the native Mongo client (findOneAndUpdate) to patch the
// User document. Mock it to update the same in-memory store.
vi.mock('../services/mongoNative.js', () => ({
  getCollection: vi.fn(async () => ({
    findOneAndUpdate: vi.fn(async (filter, update) => {
      const targetId = filter._id.toString();
      for (const user of userStore.values()) {
        if (user.id === targetId) {
          Object.assign(user, update.$set);
          return { _id: { toString: () => user.id }, email: user.email, settings: user.settings };
        }
      }
      return null;
    }),
  })),
}));

// mongodb.ObjectId: the real one needs a 24-char hex string; our mock user
// ids look like "user_1". Stub ObjectId with a shim that stores the raw id.
vi.mock('mongodb', () => ({
  ObjectId: class {
    constructor(id) { this.id = id; }
    toString() { return this.id; }
  },
}));

import { authRoutes } from './auth.js';

async function buildApp() {
  const app = Fastify();
  await app.register(jwt, { secret: JWT_TEST_SECRET });
  app.decorate('authenticate', async (request, reply) => {
    try { await request.jwtVerify(); } catch (err) {
      reply.code(401).send({ error: 'Unauthorized' });
    }
  });
  await app.register(authRoutes, { prefix: '/auth' });
  await app.ready();
  return app;
}

describe('auth routes (integration via fastify.inject)', () => {
  beforeEach(() => {
    userStore.clear();
  });

  it('POST /auth/register creates a user and returns a signed JWT', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'alice@example.com', password: 'hunter2' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.user.email).toBe('alice@example.com');
    expect(typeof body.token).toBe('string');
    expect(body.token.split('.').length).toBe(3); // JWT format
    // Password must be stored hashed, not plaintext
    const stored = userStore.get('alice@example.com');
    expect(stored.passwordHash).not.toBe('hunter2');
    expect(await bcrypt.compare('hunter2', stored.passwordHash)).toBe(true);
    await app.close();
  });

  it('POST /auth/register rejects duplicate email with 409', async () => {
    const app = await buildApp();
    await app.inject({
      method: 'POST', url: '/auth/register',
      payload: { email: 'dup@example.com', password: 'secret1' },
    });
    const res = await app.inject({
      method: 'POST', url: '/auth/register',
      payload: { email: 'dup@example.com', password: 'otherpass' },
    });
    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body).error).toMatch(/already/i);
    await app.close();
  });

  it('POST /auth/register rejects short password via schema (400)', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST', url: '/auth/register',
      payload: { email: 'bob@example.com', password: '123' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('POST /auth/login accepts correct password', async () => {
    const app = await buildApp();
    await app.inject({
      method: 'POST', url: '/auth/register',
      payload: { email: 'carol@example.com', password: 'correct-horse' },
    });
    const res = await app.inject({
      method: 'POST', url: '/auth/login',
      payload: { email: 'carol@example.com', password: 'correct-horse' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.user.email).toBe('carol@example.com');
    expect(typeof body.token).toBe('string');
    await app.close();
  });

  it('POST /auth/login rejects wrong password with 401', async () => {
    const app = await buildApp();
    await app.inject({
      method: 'POST', url: '/auth/register',
      payload: { email: 'dan@example.com', password: 'correct-horse' },
    });
    const res = await app.inject({
      method: 'POST', url: '/auth/login',
      payload: { email: 'dan@example.com', password: 'wrong' },
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('POST /auth/login rejects unknown email with 401 (no user enumeration)', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST', url: '/auth/login',
      payload: { email: 'nobody@example.com', password: 'anything' },
    });
    expect(res.statusCode).toBe(401);
    // Same error shape as wrong password — callers cannot distinguish
    expect(JSON.parse(res.body).error).toMatch(/invalid/i);
    await app.close();
  });

  it('GET /auth/me requires a valid bearer token', async () => {
    const app = await buildApp();
    const unauth = await app.inject({ method: 'GET', url: '/auth/me' });
    expect(unauth.statusCode).toBe(401);
    await app.close();
  });

  it('PUT /auth/settings rejects oversized settings payload (>64KB)', async () => {
    const app = await buildApp();
    const reg = await app.inject({
      method: 'POST', url: '/auth/register',
      payload: { email: 'eve@example.com', password: 'longpass' },
    });
    const token = JSON.parse(reg.body).token;

    // Settings object whose serialized length exceeds 64KB
    const huge = { blob: 'x'.repeat(65 * 1024) };
    const res = await app.inject({
      method: 'PUT', url: '/auth/settings',
      headers: { authorization: `Bearer ${token}` },
      payload: { settings: huge },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/too large/i);
    await app.close();
  });
});
