import fp from 'fastify-plugin';
import { logger } from '../lib/logger.js';

// Idempotency-Key support for mutating endpoints.
//
// Opt-in per route via `config: { idempotency: true }` in the route options.
// Client sends `Idempotency-Key: <uuid>` header; backend caches the response
// in-memory for 5min keyed by `(userId, idempotencyKey)`. Retries with the
// same key replay the cached response instead of re-executing the handler.
//
// In-memory store is sufficient for single-instance Cloud Run (no horizontal
// sharing needed). TTL is 5min — enough to dedup retries/network hiccups,
// short enough to not bloat memory.

const PENDING_TTL_MS = 60 * 1000;
const COMPLETED_TTL_MS = 5 * 60 * 1000;
const PENDING_MARKER = '__pending__';
const MAX_ENTRIES = 10_000;

const store = new Map();

function cleanupIfNeeded() {
  if (store.size <= MAX_ENTRIES) return;
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.expiresAt < now) store.delete(key);
  }
  // If still over limit after TTL cleanup, evict oldest
  if (store.size > MAX_ENTRIES) {
    const firstKey = store.keys().next().value;
    store.delete(firstKey);
  }
}

function buildKey(userId, idemKey) {
  return `${userId}:${idemKey}`;
}

export const idempotencyPlugin = fp(async function (fastify) {
  fastify.addHook('preHandler', async (request, reply) => {
    if (!request.routeOptions?.config?.idempotency) return;
    const idemKey = request.headers['idempotency-key'];
    if (!idemKey || typeof idemKey !== 'string') return;
    if (!request.user?.id) return;

    const key = buildKey(request.user.id, idemKey);
    const existing = store.get(key);
    const now = Date.now();

    if (existing) {
      if (existing.expiresAt < now) {
        store.delete(key);
        // Expired — fall through to claim
      } else if (existing.value === PENDING_MARKER) {
        return reply.code(409).send({
          error: 'Conflict',
          message: 'Request with this Idempotency-Key is still in progress',
          idempotencyKey: idemKey,
        });
      } else {
        // Replay cached response
        const parsed = existing.value;
        reply.code(parsed.statusCode);
        if (parsed.contentType) reply.header('content-type', parsed.contentType);
        reply.header('idempotent-replay', 'true');
        return reply.send(parsed.body);
      }
    }

    // Claim with pending marker
    cleanupIfNeeded();
    store.set(key, { value: PENDING_MARKER, expiresAt: now + PENDING_TTL_MS });
    request.idempotencyKey = key;
  });

  fastify.addHook('onSend', async (request, reply, payload) => {
    const key = request.idempotencyKey;
    if (!key) return payload;

    // Non-2xx: release the pending lock so a retry can proceed immediately.
    if (reply.statusCode < 200 || reply.statusCode >= 300) {
      store.delete(key);
      return payload;
    }

    try {
      let body;
      if (typeof payload === 'string') {
        try {
          body = JSON.parse(payload);
        } catch {
          store.delete(key);
          return payload;
        }
      } else if (payload && typeof payload === 'object' && !Buffer.isBuffer(payload)) {
        body = payload;
      } else {
        store.delete(key);
        return payload;
      }

      store.set(key, {
        value: {
          statusCode: reply.statusCode,
          contentType: reply.getHeader('content-type') || 'application/json; charset=utf-8',
          body,
        },
        expiresAt: Date.now() + COMPLETED_TTL_MS,
      });
    } catch (err) {
      logger.warn({ err }, '[idempotency] cache write failed — response still sent');
    }

    return payload;
  });
});
