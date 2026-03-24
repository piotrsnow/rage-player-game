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

export const corsPlugin = fp(async function (fastify) {
  await fastify.register(cors, {
    origin: parseCorsOrigin(config.corsOrigin),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });
});
