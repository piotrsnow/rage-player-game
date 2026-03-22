import cors from '@fastify/cors';
import fp from 'fastify-plugin';
import { config } from '../config.js';

function parseCorsOrigin(raw) {
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
