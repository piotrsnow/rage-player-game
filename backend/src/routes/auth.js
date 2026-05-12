import bcrypt from 'bcrypt';
import { prisma } from '../lib/prisma.js';
import { config } from '../config.js';
import {
  issueRefreshToken,
  verifyRefreshToken,
  revokeRefreshToken,
} from '../services/refreshTokenService.js';
import { generateCsrfToken, CSRF_COOKIE } from '../plugins/csrf.js';
import { issueWsTicket } from '../services/wsTicketService.js';
import { encrypt, decrypt } from '../services/apiKeyService.js';

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
//   - PUT  /settings          → bearer-auth, patches user settings
//   - GET  /api-keys          → bearer-auth, returns env-key availability
//
// Refresh tokens are stored in Postgres; expired rows swept periodically by
// `startPeriodicCleanup` in refreshTokenService (no Redis dependency).

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
    user: { id: user.id, email: user.email, isAdmin: !!user.isAdmin, credits: user.credits ?? 0 },
  };
}

function isEnvAdmin(email) {
  return config.adminEmail && email.toLowerCase() === config.adminEmail;
}

async function maybePromoteEnvAdmin(user) {
  if (!user.isAdmin && isEnvAdmin(user.email)) {
    return prisma.user.update({
      where: { id: user.id },
      data: { isAdmin: true },
      select: { id: true, email: true, isAdmin: true, credits: true },
    });
  }
  return user;
}

async function updateUserSettingsDocument(userId, data) {
  const user = await prisma.user.update({
    where: { id: userId },
    data,
    select: { id: true, email: true, settings: true },
  });
  return user;
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
    const isAdmin = isEnvAdmin(email);
    const user = await prisma.user.create({
      data: { email, passwordHash, isAdmin },
      select: { id: true, email: true, isAdmin: true, credits: true },
    });

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
    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return reply.code(401).send({ error: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return reply.code(401).send({ error: 'Invalid credentials' });
    }

    user = await maybePromoteEnvAdmin(user);

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

    let user = await prisma.user.findUnique({
      where: { id: verified.userId },
      select: { id: true, email: true, isAdmin: true, credits: true },
    });
    if (!user) {
      await revokeRefreshToken(cookieValue);
      clearAuthCookies(reply);
      return reply.code(401).send({ error: 'User not found' });
    }

    user = await maybePromoteEnvAdmin(user);

    if (verified.rotatedToken) {
      setRefreshCookie(reply, verified.rotatedToken.cookieValue);
    }

    const accessToken = signAccessToken(fastify, user);
    const csrfToken = generateCsrfToken();
    setCsrfCookie(reply, csrfToken);

    return {
      accessToken,
      csrfToken,
      user: { id: user.id, email: user.email, isAdmin: !!user.isAdmin, credits: user.credits ?? 0 },
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
      select: { id: true, email: true, isAdmin: true, settings: true, credits: true, createdAt: true },
    });
    if (!user) throw { statusCode: 404, message: 'User not found' };

    return user;
  });

  fastify.put('/settings', {
    onRequest: [fastify.authenticate],
    schema: {
      body: {
        type: 'object',
        additionalProperties: false,
        properties: {
          settings: { type: 'object' },
        },
      },
    },
  }, async (request, reply) => {
    const { settings } = request.body;
    const data = {};

    if (settings !== undefined) {
      const MAX_SETTINGS_SIZE = 64 * 1024;
      if (JSON.stringify(settings).length > MAX_SETTINGS_SIZE) {
        return reply.code(400).send({ error: 'Settings payload too large' });
      }
      data.settings = settings;
    }

    const user = await updateUserSettingsDocument(request.user.id, data);

    return user;
  });

  // Availability view for the Keys modal. Shows env-based key status and
  // per-user override status (admin only sees overrides).
  const OVERRIDABLE_KEY_NAMES = ['openai', 'anthropic', 'elevenlabs', 'stability', 'gemini', 'meshy'];

  fastify.get('/api-keys', { onRequest: [fastify.authenticate] }, async (request) => {
    const resolved = {};
    for (const name of OVERRIDABLE_KEY_NAMES) {
      const key = config.apiKeys[name] || '';
      resolved[name] = key
        ? { configured: true, masked: '••••' + key.slice(-4) }
        : { configured: false };
    }

    const plKey = config.pixellabApiKey || '';
    resolved['pixellab'] = plKey
      ? { configured: true, masked: '••••' + plKey.slice(-4) }
      : { configured: false };

    if (config.sdWebui?.url) {
      let masked = config.sdWebui.url;
      try { masked = new URL(config.sdWebui.url).host; } catch { /* keep raw */ }
      resolved['sd-webui'] = { configured: true, masked };
    } else {
      resolved['sd-webui'] = { configured: false };
    }

    if (config.xttsUrl) {
      let masked = config.xttsUrl;
      try { masked = new URL(config.xttsUrl).host; } catch { /* keep raw */ }
      resolved['xtts'] = { configured: true, masked };
    } else {
      resolved['xtts'] = { configured: false };
    }

    // Per-user override status (admin-only).
    let userOverrides = {};
    if (request.user?.isAdmin) {
      const user = await prisma.user.findUnique({
        where: { id: request.user.id },
        select: { apiKeys: true },
      });
      if (user?.apiKeys && user.apiKeys !== '{}') {
        try {
          const parsed = JSON.parse(decrypt(user.apiKeys));
          for (const name of OVERRIDABLE_KEY_NAMES) {
            if (parsed[name]) {
              userOverrides[name] = { configured: true, masked: '••••' + parsed[name].slice(-4) };
            }
          }
        } catch { /* corrupted bundle — ignore */ }
      }
    }

    return { env: resolved, userOverrides };
  });

  // Admin-only: save per-user API key overrides. Empty string clears a key.
  fastify.put('/api-keys', {
    onRequest: [fastify.authenticate, fastify.requireAdmin],
    schema: {
      body: {
        type: 'object',
        required: ['keys'],
        additionalProperties: false,
        properties: {
          keys: {
            type: 'object',
            additionalProperties: false,
            properties: Object.fromEntries(
              OVERRIDABLE_KEY_NAMES.map((k) => [k, { type: 'string' }]),
            ),
          },
        },
      },
    },
  }, async (request) => {
    const { keys } = request.body;

    // Load existing bundle so we can patch (not replace) individual keys.
    const user = await prisma.user.findUnique({
      where: { id: request.user.id },
      select: { apiKeys: true },
    });
    let existing = {};
    if (user?.apiKeys && user.apiKeys !== '{}') {
      try { existing = JSON.parse(decrypt(user.apiKeys)); } catch { /* start fresh */ }
    }

    for (const name of OVERRIDABLE_KEY_NAMES) {
      if (name in keys) {
        if (keys[name]) {
          existing[name] = keys[name];
        } else {
          delete existing[name];
        }
      }
    }

    const hasKeys = Object.keys(existing).length > 0;
    const encrypted = hasKeys ? encrypt(JSON.stringify(existing)) : '{}';
    await prisma.user.update({
      where: { id: request.user.id },
      data: { apiKeys: encrypted },
    });

    // Return masked versions so the UI can update without re-fetching.
    const result = {};
    for (const name of OVERRIDABLE_KEY_NAMES) {
      if (existing[name]) {
        result[name] = { configured: true, masked: '••••' + existing[name].slice(-4) };
      }
    }
    return { userOverrides: result };
  });

  fastify.post('/ws-ticket', { onRequest: [fastify.authenticate] }, async (request) => {
    return { ticket: issueWsTicket(request.user.id) };
  });
}
