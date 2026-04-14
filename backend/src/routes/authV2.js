import bcrypt from 'bcrypt';
import { prisma } from '../lib/prisma.js';
import {
  issueRefreshToken,
  verifyRefreshToken,
  revokeRefreshToken,
} from '../services/refreshTokenService.js';
import { generateCsrfToken, CSRF_COOKIE } from '../plugins/csrf.js';
import { isRedisEnabled } from '../services/redisClient.js';

// /v2/auth — cookie-based refresh token flow.
//
//   - POST /login, /register → returns short-lived access token in JSON body,
//     sets httpOnly `refreshToken` cookie + non-httpOnly `csrf-token` cookie
//   - POST /refresh           → CSRF-protected, swaps refresh cookie for new
//     access token (+ rotated CSRF cookie)
//   - POST /logout            → CSRF-protected, revokes the refresh token row
//     from Redis and clears both cookies
//
// /v1/auth/* stays alive for old clients — this route is additive, not a
// replacement. FE migrates to /v2 as part of the same PR.

const SALT_ROUNDS = 12;
const ACCESS_TOKEN_TTL = '15m';
const REFRESH_COOKIE = 'refreshToken';
const REFRESH_COOKIE_MAX_AGE = 30 * 24 * 60 * 60; // 30d in seconds
const REFRESH_COOKIE_PATH = '/v2/auth';

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
  return fastify.jwt.sign(
    { id: user.id, email: user.email },
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

export async function authV2Routes(fastify) {
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
    if (!isRedisEnabled()) {
      return reply.code(503).send({ error: 'Auth v2 unavailable (Redis disabled)' });
    }

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
    if (!isRedisEnabled()) {
      return reply.code(503).send({ error: 'Auth v2 unavailable (Redis disabled)' });
    }

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
    if (!isRedisEnabled()) {
      return reply.code(503).send({ error: 'Auth v2 unavailable (Redis disabled)' });
    }

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
      select: { id: true, email: true },
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

  fastify.get('/me', {
    onRequest: [fastify.authenticate],
  }, async (request) => {
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
}
