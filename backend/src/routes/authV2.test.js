import { describe, it, expect, beforeEach, vi } from 'vitest';
import Fastify from 'fastify';
import jwt from '@fastify/jwt';
import fastifyCookie from '@fastify/cookie';
import bcrypt from 'bcrypt';

vi.mock('../config.js', () => ({
  config: {
    jwtSecret: 'unit-test-jwt-secret-at-least-32-chars-long-abc',
    jwtExpiresIn: '1h',
    apiKeyEncryptionSecret: 'unit-test-encryption-secret-passphrase-256',
    apiKeys: {},
  },
}));

const JWT_TEST_SECRET = 'unit-test-jwt-secret-at-least-32-chars-long-abc';

const userStore = new Map();
vi.mock('../lib/prisma.js', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(async ({ where, select }) => {
        let user = null;
        if (where?.email) user = userStore.get(where.email) || null;
        if (where?.id) {
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

// Fake refresh token service — deterministic cookie values so we can assert
// on the exact format and verify round-trips.
const refreshStore = new Map();
vi.mock('../services/refreshTokenService.js', () => ({
  issueRefreshToken: vi.fn(async (userId, { deviceInfo = '' } = {}) => {
    const tokenId = `tok_${refreshStore.size + 1}`;
    const cookieValue = `${userId}.${tokenId}`;
    refreshStore.set(cookieValue, { userId, tokenId, deviceInfo, expiresAt: Date.now() + 1e9 });
    return { tokenId, cookieValue, expiresAt: Date.now() + 1e9, ttlSec: 2_592_000 };
  }),
  verifyRefreshToken: vi.fn(async (cookieValue) => {
    const row = refreshStore.get(cookieValue);
    if (!row) return null;
    return { userId: row.userId, tokenId: row.tokenId, record: row };
  }),
  revokeRefreshToken: vi.fn(async (cookieValue) => refreshStore.delete(cookieValue)),
  revokeAllUserRefreshTokens: vi.fn(async () => 0),
}));

vi.mock('../services/redisClient.js', () => ({
  isRedisEnabled: vi.fn(() => true),
  getRedisClient: vi.fn(() => null),
}));

import { authV2Routes } from './authV2.js';
import { csrfPlugin } from '../plugins/csrf.js';
import { isRedisEnabled } from '../services/redisClient.js';

async function buildApp() {
  const app = Fastify();
  await app.register(jwt, { secret: JWT_TEST_SECRET });
  app.decorate('authenticate', async (request, reply) => {
    try { await request.jwtVerify(); } catch (err) {
      reply.code(401).send({ error: 'Unauthorized' });
    }
  });
  await app.register(fastifyCookie);
  await app.register(csrfPlugin);
  await app.register(authV2Routes, { prefix: '/v2/auth' });
  await app.ready();
  return app;
}

function parseSetCookies(headers) {
  const raw = headers['set-cookie'];
  if (!raw) return {};
  const arr = Array.isArray(raw) ? raw : [raw];
  const out = {};
  for (const line of arr) {
    const [pair] = line.split(';');
    const eq = pair.indexOf('=');
    if (eq < 0) continue;
    out[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
  }
  return out;
}

describe('/v2/auth routes', () => {
  beforeEach(() => {
    userStore.clear();
    refreshStore.clear();
    isRedisEnabled.mockReturnValue(true);
  });

  it('POST /v2/auth/register returns access+csrf tokens and sets both cookies', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v2/auth/register',
      payload: { email: 'alice@example.com', password: 'hunter2' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.accessToken).toBeTypeOf('string');
    expect(body.accessToken.split('.').length).toBe(3);
    expect(body.csrfToken).toBeTypeOf('string');
    expect(body.user.email).toBe('alice@example.com');

    const cookies = parseSetCookies(res.headers);
    expect(cookies.refreshToken).toMatch(/^user_1\.tok_1$/);
    expect(cookies['csrf-token']).toBe(body.csrfToken);

    // Password hashed, not plaintext
    const stored = userStore.get('alice@example.com');
    expect(await bcrypt.compare('hunter2', stored.passwordHash)).toBe(true);

    await app.close();
  });

  it('POST /v2/auth/register rejects duplicate email with 409', async () => {
    const app = await buildApp();
    await app.inject({
      method: 'POST',
      url: '/v2/auth/register',
      payload: { email: 'dup@example.com', password: 'secret1' },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/v2/auth/register',
      payload: { email: 'dup@example.com', password: 'other2' },
    });
    expect(res.statusCode).toBe(409);
    await app.close();
  });

  it('POST /v2/auth/login accepts correct password and issues a refresh cookie', async () => {
    const app = await buildApp();
    await app.inject({
      method: 'POST',
      url: '/v2/auth/register',
      payload: { email: 'bob@example.com', password: 'correct-horse' },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/v2/auth/login',
      payload: { email: 'bob@example.com', password: 'correct-horse' },
    });
    expect(res.statusCode).toBe(200);
    const cookies = parseSetCookies(res.headers);
    expect(cookies.refreshToken).toBeTruthy();
    expect(cookies['csrf-token']).toBeTruthy();
    await app.close();
  });

  it('POST /v2/auth/login rejects wrong password with 401', async () => {
    const app = await buildApp();
    await app.inject({
      method: 'POST',
      url: '/v2/auth/register',
      payload: { email: 'eve@example.com', password: 'real-pass' },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/v2/auth/login',
      payload: { email: 'eve@example.com', password: 'wrong' },
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('POST /v2/auth/refresh issues a new access token when cookie+CSRF valid', async () => {
    const app = await buildApp();
    const reg = await app.inject({
      method: 'POST',
      url: '/v2/auth/register',
      payload: { email: 'carol@example.com', password: 'hunter2' },
    });
    const cookies = parseSetCookies(reg.headers);
    const refreshCookie = cookies.refreshToken;
    const csrfCookie = cookies['csrf-token'];

    const res = await app.inject({
      method: 'POST',
      url: '/v2/auth/refresh',
      headers: {
        cookie: `refreshToken=${refreshCookie}; csrf-token=${csrfCookie}`,
        'x-csrf-token': csrfCookie,
      },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.accessToken).toBeTypeOf('string');
    expect(body.user.email).toBe('carol@example.com');
    // CSRF rotates
    const newCookies = parseSetCookies(res.headers);
    expect(newCookies['csrf-token']).toBeTypeOf('string');
    await app.close();
  });

  it('POST /v2/auth/refresh returns 403 without a matching CSRF header', async () => {
    const app = await buildApp();
    const reg = await app.inject({
      method: 'POST',
      url: '/v2/auth/register',
      payload: { email: 'dan@example.com', password: 'hunter2' },
    });
    const cookies = parseSetCookies(reg.headers);

    const res = await app.inject({
      method: 'POST',
      url: '/v2/auth/refresh',
      headers: {
        cookie: `refreshToken=${cookies.refreshToken}; csrf-token=${cookies['csrf-token']}`,
      },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('POST /v2/auth/refresh returns 401 without a refresh cookie', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v2/auth/refresh',
      headers: {
        cookie: 'csrf-token=abc',
        'x-csrf-token': 'abc',
      },
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('POST /v2/auth/logout revokes the refresh token and clears cookies', async () => {
    const app = await buildApp();
    const reg = await app.inject({
      method: 'POST',
      url: '/v2/auth/register',
      payload: { email: 'frank@example.com', password: 'hunter2' },
    });
    const cookies = parseSetCookies(reg.headers);
    expect(refreshStore.has(cookies.refreshToken)).toBe(true);

    const res = await app.inject({
      method: 'POST',
      url: '/v2/auth/logout',
      headers: {
        cookie: `refreshToken=${cookies.refreshToken}; csrf-token=${cookies['csrf-token']}`,
        'x-csrf-token': cookies['csrf-token'],
      },
    });
    expect(res.statusCode).toBe(200);
    expect(refreshStore.has(cookies.refreshToken)).toBe(false);

    // Expired cookies present in Set-Cookie with Max-Age=0 / expired date
    const cleared = res.headers['set-cookie'];
    expect(cleared).toBeDefined();
    const flat = Array.isArray(cleared) ? cleared.join('|') : cleared;
    expect(flat).toMatch(/refreshToken=/);
    expect(flat).toMatch(/csrf-token=/);
    await app.close();
  });

  it('POST /v2/auth/login returns 503 when Redis is disabled', async () => {
    isRedisEnabled.mockReturnValue(false);
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v2/auth/login',
      payload: { email: 'x@example.com', password: 'whatever' },
    });
    expect(res.statusCode).toBe(503);
    await app.close();
  });

  it('GET /v2/auth/me returns the user when the access token verifies', async () => {
    const app = await buildApp();
    const reg = await app.inject({
      method: 'POST',
      url: '/v2/auth/register',
      payload: { email: 'grace@example.com', password: 'hunter2' },
    });
    const { accessToken } = JSON.parse(reg.body);

    const res = await app.inject({
      method: 'GET',
      url: '/v2/auth/me',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.email).toBe('grace@example.com');
    expect(body.settings).toEqual({});
    await app.close();
  });
});
