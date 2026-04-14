import fp from 'fastify-plugin';
import crypto from 'node:crypto';

// Double-submit cookie CSRF protection for cookie-authed routes.
//
// The backend sets a `csrf-token` cookie (NOT httpOnly — must be readable by
// JS so the SPA can echo it). The client reads it and sends `X-CSRF-Token`
// on every mutating request. The plugin compares the header vs the cookie
// and rejects on mismatch.
//
// Why this is safe: an attacker on evil.com cannot read the cookie value
// (same-origin policy) and cannot set X-CSRF-Token on a cross-origin fetch
// without a CORS preflight, which our allowlist rejects. So they cannot
// forge a matching request even though the browser would attach our
// refresh cookie automatically.
//
// Opt-in per route via `config: { csrf: true }`. Applied to /v1/auth/refresh
// and /v1/auth/logout where the refresh cookie is the authentication
// material. Pure bearer-token routes do not need CSRF because cross-origin
// JS cannot read the in-memory access token.

export const CSRF_COOKIE = 'csrf-token';
export const CSRF_HEADER = 'x-csrf-token';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function generateCsrfToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function constantTimeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export const csrfPlugin = fp(async function (fastify) {
  fastify.addHook('preHandler', async (request, reply) => {
    if (!request.routeOptions?.config?.csrf) return;
    if (SAFE_METHODS.has(request.method)) return;

    const headerToken = request.headers[CSRF_HEADER];
    const cookieToken = request.cookies?.[CSRF_COOKIE];

    if (!headerToken || !cookieToken || typeof headerToken !== 'string') {
      return reply.code(403).send({
        error: 'Forbidden',
        message: 'Missing CSRF token',
      });
    }

    if (!constantTimeEqual(headerToken, cookieToken)) {
      return reply.code(403).send({
        error: 'Forbidden',
        message: 'CSRF token mismatch',
      });
    }
  });
});
