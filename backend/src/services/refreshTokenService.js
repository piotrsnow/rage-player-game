import crypto from 'node:crypto';
import { getRedisClient, isRedisEnabled } from './redisClient.js';
import { logger } from '../lib/logger.js';

// Refresh-token service backing the /v2/auth/* routes. Opaque random tokens
// (NOT JWTs) stored in Redis so revocation is O(1): DEL the key.
//
// Storage layout:
//   user:<userId>:refresh:<tokenId> → JSON { userId, createdAt, expiresAt, deviceInfo }
//   TTL                              → REFRESH_TTL_SEC (30 days)
//
// Cookie format: `<userId>.<tokenId>` so we can look up the Redis key from
// the cookie alone without a second index. The tokenId is a random UUID,
// never derivable from userId, so possession of a cookie is still proof of
// authentication (owner of the refresh token row).
//
// Redis is REQUIRED — v2 auth routes return 503 when disabled. This is the
// intentional break from the rest of the post-merge infra which runs with
// optional Redis + fallbacks: refresh tokens have no sensible in-memory
// fallback (would be lost on restart, defeating the point of refresh).

const REFRESH_TTL_SEC = 30 * 24 * 60 * 60;
const KEY_PREFIX = 'user:';

function buildKey(userId, tokenId) {
  return `${KEY_PREFIX}${userId}:refresh:${tokenId}`;
}

function parseCookieValue(cookieValue) {
  if (!cookieValue || typeof cookieValue !== 'string') return null;
  const idx = cookieValue.indexOf('.');
  if (idx <= 0 || idx === cookieValue.length - 1) return null;
  const userId = cookieValue.slice(0, idx);
  const tokenId = cookieValue.slice(idx + 1);
  return { userId, tokenId };
}

export async function issueRefreshToken(userId, { deviceInfo = '' } = {}) {
  if (!isRedisEnabled()) return null;
  const redis = getRedisClient();
  if (!redis) return null;

  const tokenId = crypto.randomUUID();
  const now = Date.now();
  const expiresAt = now + REFRESH_TTL_SEC * 1000;

  const payload = JSON.stringify({
    userId,
    createdAt: now,
    expiresAt,
    deviceInfo: String(deviceInfo || '').slice(0, 256),
  });

  try {
    await redis.set(buildKey(userId, tokenId), payload, 'EX', REFRESH_TTL_SEC);
    return {
      tokenId,
      cookieValue: `${userId}.${tokenId}`,
      expiresAt,
      ttlSec: REFRESH_TTL_SEC,
    };
  } catch (err) {
    logger.warn({ err }, '[refreshToken] issue failed');
    return null;
  }
}

export async function verifyRefreshToken(cookieValue) {
  if (!isRedisEnabled()) return null;
  const redis = getRedisClient();
  if (!redis) return null;

  const parsed = parseCookieValue(cookieValue);
  if (!parsed) return null;

  const key = buildKey(parsed.userId, parsed.tokenId);
  try {
    const raw = await redis.get(key);
    if (!raw) return null;
    const record = JSON.parse(raw);
    if (record.expiresAt && record.expiresAt < Date.now()) {
      await redis.del(key);
      return null;
    }
    return { userId: parsed.userId, tokenId: parsed.tokenId, record };
  } catch (err) {
    logger.warn({ err }, '[refreshToken] verify failed');
    return null;
  }
}

export async function revokeRefreshToken(cookieValue) {
  if (!isRedisEnabled()) return false;
  const redis = getRedisClient();
  if (!redis) return false;

  const parsed = parseCookieValue(cookieValue);
  if (!parsed) return false;

  try {
    const result = await redis.del(buildKey(parsed.userId, parsed.tokenId));
    return result > 0;
  } catch (err) {
    logger.warn({ err }, '[refreshToken] revoke failed');
    return false;
  }
}

export async function revokeAllUserRefreshTokens(userId) {
  if (!isRedisEnabled()) return 0;
  const redis = getRedisClient();
  if (!redis) return 0;

  const pattern = `${KEY_PREFIX}${userId}:refresh:*`;
  let cursor = '0';
  let deleted = 0;
  try {
    do {
      const [next, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = next;
      if (keys.length > 0) {
        deleted += await redis.del(...keys);
      }
    } while (cursor !== '0');
  } catch (err) {
    logger.warn({ err }, '[refreshToken] revokeAll failed');
  }
  return deleted;
}

export const __testInternals = {
  buildKey,
  parseCookieValue,
  REFRESH_TTL_SEC,
};
