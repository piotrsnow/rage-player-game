import fp from 'fastify-plugin';
import { getRedisClient, isRedisEnabled } from '../services/redisClient.js';
import { logger } from '../lib/logger.js';

// Idempotency-Key support for mutating endpoints.
//
// Opt-in per route via `config: { idempotency: true }` in the route options.
// Client sends `Idempotency-Key: <uuid>` header; backend caches the response
// in Redis for 24h keyed by `(userId, idempotencyKey)`. Retries with the
// same key replay the cached response instead of re-executing the handler.
//
// Race handling:
//   1. First request claims the Redis key atomically via SET NX with a
//      short-lived "pending" marker (60s). The handler then runs; on
//      completion the onSend hook overwrites the marker with the serialized
//      response (24h TTL).
//   2. A concurrent request arriving while the first is still running sees
//      the pending marker and gets a 409 Conflict with a hint to retry.
//   3. If the first request crashes or times out, the 60s pending TTL
//      ensures a later retry can re-claim the key and proceed.
//
// Limitations (known, accepted in v1):
//   - Only JSON responses. Binary bodies and SSE streams are not cached;
//     the plugin silently no-ops for those paths.
//   - Requires authentication (`request.user.id`). Unauthenticated requests
//     bypass idempotency entirely — we do not want to cache per-IP and risk
//     cross-user cache poisoning.
//   - When Redis is disabled, the plugin is a transparent no-op — routes
//     with `config.idempotency: true` still work, they just lose dedup.

const PENDING_TTL_SEC = 60;
const COMPLETED_TTL_SEC = 24 * 60 * 60;
const PENDING_MARKER = '__pending__';

function buildRedisKey(userId, idemKey) {
  return `idem:${userId}:${idemKey}`;
}

export const idempotencyPlugin = fp(async function (fastify) {
  fastify.addHook('preHandler', async (request, reply) => {
    if (!request.routeOptions?.config?.idempotency) return;
    const idemKey = request.headers['idempotency-key'];
    if (!idemKey || typeof idemKey !== 'string') return;
    if (!isRedisEnabled()) return;
    if (!request.user?.id) return;

    const redis = getRedisClient();
    if (!redis) return;

    const key = buildRedisKey(request.user.id, idemKey);

    try {
      // Claim the key atomically. ioredis returns 'OK' on success or null if
      // another holder already has it.
      const setResult = await redis.set(key, PENDING_MARKER, 'EX', PENDING_TTL_SEC, 'NX');

      if (setResult === 'OK') {
        request.idempotencyRedisKey = key;
        return;
      }

      const existing = await redis.get(key);
      if (!existing || existing === PENDING_MARKER) {
        return reply.code(409).send({
          error: 'Conflict',
          message: 'Request with this Idempotency-Key is still in progress',
          idempotencyKey: idemKey,
        });
      }

      // Replay cached response.
      const parsed = JSON.parse(existing);
      reply.code(parsed.statusCode);
      if (parsed.contentType) reply.header('content-type', parsed.contentType);
      reply.header('idempotent-replay', 'true');
      return reply.send(parsed.body);
    } catch (err) {
      logger.warn({ err }, '[idempotency] redis lookup failed — proceeding without dedup');
    }
  });

  fastify.addHook('onSend', async (request, reply, payload) => {
    const key = request.idempotencyRedisKey;
    if (!key) return payload;

    const redis = getRedisClient();
    if (!redis) return payload;

    // Non-2xx: release the pending lock so a retry can proceed immediately.
    // Caching a 4xx/5xx would lock the client into the same error for 24h.
    if (reply.statusCode < 200 || reply.statusCode >= 300) {
      try {
        await redis.del(key);
      } catch (err) {
        logger.warn({ err }, '[idempotency] redis DEL on error-path failed');
      }
      return payload;
    }

    try {
      // Parse the serialized body back to an object so replay produces
      // identical bytes via the standard reply.send() JSON serialization.
      // Binary/non-JSON payloads are not supported — we skip caching and
      // release the claim so retries are still possible.
      let body;
      if (typeof payload === 'string') {
        try {
          body = JSON.parse(payload);
        } catch {
          await redis.del(key);
          return payload;
        }
      } else if (payload && typeof payload === 'object' && !Buffer.isBuffer(payload)) {
        body = payload;
      } else {
        await redis.del(key);
        return payload;
      }

      const cached = JSON.stringify({
        statusCode: reply.statusCode,
        contentType: reply.getHeader('content-type') || 'application/json; charset=utf-8',
        body,
      });

      await redis.set(key, cached, 'EX', COMPLETED_TTL_SEC);
    } catch (err) {
      logger.warn({ err }, '[idempotency] redis cache write failed — response still sent');
    }

    return payload;
  });
});
