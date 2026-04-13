import cors from '@fastify/cors';
import fp from 'fastify-plugin';
import { config } from '../config.js';

function parseCorsOrigin(raw) {
  if (process.env.NODE_ENV === 'production' && (!raw || raw === 'true' || raw === '*')) {
    console.warn('[CORS] WARNING: CORS_ORIGIN is not explicitly set in production. Defaulting to false (no cross-origin). Set CORS_ORIGIN to the frontend URL.');
    return false;
  }
  if (!raw || raw === 'true' || raw === '*') return true;
  if (raw.includes(',')) return raw.split(',').map((s) => s.trim());
  return raw;
}

const allowlist = parseCorsOrigin(config.corsOrigin);

/**
 * Resolve CORS origin for SSE endpoints which bypass Fastify's cors plugin
 * (reply.raw.writeHead writes headers directly). Returns:
 *   - string: origin is allowed, use this value in Access-Control-Allow-Origin
 *   - null:   no origin header — same-origin or non-browser, skip CORS headers
 *   - false:  origin is explicitly rejected, caller should 403
 */
export function resolveSseCorsOrigin(requestOrigin) {
  if (!requestOrigin) return null;
  if (allowlist === true) return requestOrigin;
  if (allowlist === false) return false;
  if (Array.isArray(allowlist)) {
    return allowlist.includes(requestOrigin) ? requestOrigin : false;
  }
  if (typeof allowlist === 'string') {
    return allowlist === requestOrigin ? requestOrigin : false;
  }
  return false;
}

export const corsPlugin = fp(async function (fastify) {
  await fastify.register(cors, {
    origin: allowlist,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });
});
