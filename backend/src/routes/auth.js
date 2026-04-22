import bcrypt from 'bcrypt';
import { ObjectId } from 'mongodb';
import { prisma } from '../lib/prisma.js';
import { resolveApiKey } from '../services/apiKeyService.js';
import { getCollection } from '../services/mongoNative.js';
import {
  issueRefreshToken,
  verifyRefreshToken,
  revokeRefreshToken,
} from '../services/refreshTokenService.js';
import { generateCsrfToken, CSRF_COOKIE } from '../plugins/csrf.js';

// /v1/auth — cookie-based refresh token flow (formerly /v2/auth, collapsed
// 2026-04-14 since there's no prod to maintain backward compat for).
//
//   - POST /register, /login → returns short-lived access token in JSON body,
//     sets httpOnly `refreshToken` cookie + non-httpOnly `csrf-token` cookie
//   - POST /refresh           → CSRF-protected, swaps refresh cookie for new
//     access token (+ rotated CSRF cookie)
//   - POST /logout            → CSRF-protected, revokes the refresh token row
//     from Redis and clears both cookies
//   - GET  /me                → bearer-auth, returns the authed user
//   - PUT  /settings          → bearer-auth, patches user settings + API keys
//   - GET  /api-keys          → bearer-auth, returns masked key previews
//
// Refresh tokens are stored in MongoDB with a TTL index — no Redis dependency.

const SALT_ROUNDS = 12;
const ACCESS_TOKEN_TTL = '15m';
const REFRESH_COOKIE = 'refreshToken';
const REFRESH_COOKIE_MAX_AGE = 30 * 24 * 60 * 60; // 30d in seconds
const REFRESH_COOKIE_PATH = '/v1/auth';

function cookieBase() {
  return {
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
  };
}

function setRefreshCookie(reply, cookieValue) {
  reply.setCookie(REFRESH_COOKIE, cookieValue, {
    ...cookieBase(),
    httpOnly: true,
    path: REFRESH_COOKIE_PATH,
    maxAge: REFRESH_COOKIE_MAX_AGE,
  });
}

function setCsrfCookie(reply, csrfToken) {
  reply.setCookie(CSRF_COOKIE, csrfToken, {
    ...cookieBase(),
    httpOnly: false,
    path: '/',
    maxAge: REFRESH_COOKIE_MAX_AGE,
  });
}

function clearAuthCookies(reply) {
  reply.clearCookie(REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH });
  reply.clearCookie(CSRF_COOKIE, { path: '/' });
}

function signAccessToken(fastify, user) {
  // isAdmin is minted into the JWT so `requireAdmin` can check a claim
  // instead of hitting Prisma on every admin request. Role changes take at
  // most one access-token TTL (15 min) to propagate.
  return fastify.jwt.sign(
    { id: user.id, email: user.email, isAdmin: user.isAdmin === true },
    { expiresIn: ACCESS_TOKEN_TTL },
  );
}

async function completeAuthResponse(fastify, reply, user, deviceInfo) {
  const refresh = await issueRefreshToken(user.id, { deviceInfo });
  if (!refresh) {
    return reply.code(503).send({ error: 'Failed to issue refresh token' });
  }

  const accessToken = signAccessToken(fastify, user);
  const csrfToken = generateCsrfToken();

  setRefreshCookie(reply, refresh.cookieValue);
  setCsrfCookie(reply, csrfToken);

  return {
    accessToken,
    csrfToken,
    user: { id: user.id, email: user.email },
  };
}

async function updateUserSettingsDocument(userId, data) {
  const users = await getCollection('User');
  const update = {
    ...data,
    updatedAt: new Date(),
  };

  const result = await users.findOneAndUpdate(
    { _id: new ObjectId(userId) },
    { $set: update },
    {
      returnDocument: 'after',
      projection: { _id: 1, email: 1, settings: 1 },
    },
  );

  const user = result && typeof result === 'object' && 'value' in result
    ? result.value
    : result;
  if (!user) {
    throw { statusCode: 404, message: 'User not found' };
  }

  return {
    id: user._id.toString(),
    email: user.email,
    settings: user.settings,
  };
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
    const user = await prisma.user.create({ data: { email, passwordHash } });

    return completeAuthResponse(fastify, reply, user, request.headers['user-agent'] || '');
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

    return completeAuthResponse(fastify, reply, user, request.headers['user-agent'] || '');
  });

  fastify.post('/refresh', {
    config: { csrf: true },
  }, async (request, reply) => {
    const cookieValue = request.cookies?.[REFRESH_COOKIE];
    if (!cookieValue) {
      return reply.code(401).send({ error: 'No refresh token' });
    }

    const verified = await verifyRefreshToken(cookieValue);
    if (!verified) {
      clearAuthCookies(reply);
      return reply.code(401).send({ error: 'Invalid or expired refresh token' });
    }

    const user = await prisma.user.findUnique({
      where: { id: verified.userId },
      select: { id: true, email: true, isAdmin: true },
    });
    if (!user) {
      await revokeRefreshToken(cookieValue);
      clearAuthCookies(reply);
      return reply.code(401).send({ error: 'User not found' });
    }

    const accessToken = signAccessToken(fastify, user);
    const csrfToken = generateCsrfToken();
    setCsrfCookie(reply, csrfToken);

    return {
      accessToken,
      csrfToken,
      user: { id: user.id, email: user.email },
    };
  });

  fastify.post('/logout', {
    config: { csrf: true },
  }, async (request, reply) => {
    const cookieValue = request.cookies?.[REFRESH_COOKIE];
    if (cookieValue) {
      await revokeRefreshToken(cookieValue).catch(() => {});
    }
    clearAuthCookies(reply);
    return { ok: true };
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

  fastify.put('/settings', {
    onRequest: [fastify.authenticate],
    schema: {
      body: {
        type: 'object',
        additionalProperties: false,
        properties: {
          settings: { type: 'object' },
          apiKeys: { type: 'object' },
        },
      },
    },
  }, async (request, reply) => {
    const { settings, apiKeys } = request.body;
    const data = {};

    if (settings !== undefined) {
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

    const user = await updateUserSettingsDocument(request.user.id, data);

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
