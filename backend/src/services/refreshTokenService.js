import crypto from 'node:crypto';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';

// Refresh-token service backing the /v1/auth/* cookie flow. Opaque random
// tokens (NOT JWTs) stored in Postgres so revocation is O(1): deleteMany.
//
// Storage: RefreshToken row with btree index on expiresAt. Postgres has no
// TTL reaper, so `startPeriodicCleanup` reaps expired rows every 10 min.
// Verify also reaps eagerly to short-circuit reuse of an expired cookie
// between cleanup ticks.
//
// Cookie format: `<userId>.<tokenId>` — kept for backward compat even though
// the tokenId alone is unique. userId in cookie lets us do cheap sanity checks.

const REFRESH_TTL_SEC = 30 * 24 * 60 * 60;
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000;
const GRACE_PERIOD_MS = 30_000;

function parseCookieValue(cookieValue) {
  if (!cookieValue || typeof cookieValue !== 'string') return null;
  const idx = cookieValue.indexOf('.');
  if (idx <= 0 || idx === cookieValue.length - 1) return null;
  const userId = cookieValue.slice(0, idx);
  const tokenId = cookieValue.slice(idx + 1);
  return { userId, tokenId };
}

export async function issueRefreshToken(userId, { deviceInfo = '' } = {}) {
  const tokenId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + REFRESH_TTL_SEC * 1000);

  try {
    await prisma.refreshToken.create({
      data: {
        tokenId,
        userId,
        deviceInfo: String(deviceInfo || '').slice(0, 256),
        expiresAt,
      },
    });
    return {
      tokenId,
      cookieValue: `${userId}.${tokenId}`,
      expiresAt: expiresAt.getTime(),
      ttlSec: REFRESH_TTL_SEC,
    };
  } catch (err) {
    logger.warn({ err }, '[refreshToken] issue failed');
    return null;
  }
}

export async function verifyRefreshToken(cookieValue) {
  const parsed = parseCookieValue(cookieValue);
  if (!parsed) return null;

  try {
    const record = await prisma.refreshToken.findUnique({
      where: { tokenId: parsed.tokenId },
    });
    if (!record) return null;
    if (record.expiresAt < new Date()) {
      await prisma.refreshToken.delete({ where: { tokenId: parsed.tokenId } }).catch(() => {});
      return null;
    }
    if (record.userId !== parsed.userId) return null;

    // Already-rotated token — allow only during grace period
    if (record.replacedAt) {
      if (record.gracePeriodUntil && record.gracePeriodUntil > new Date()) {
        return { userId: parsed.userId, tokenId: parsed.tokenId, record, rotatedToken: null };
      }
      return null;
    }

    // Fresh token → rotate atomically: mark old, create new
    const newTokenId = crypto.randomUUID();
    const now = new Date();
    const newExpiresAt = new Date(now.getTime() + REFRESH_TTL_SEC * 1000);

    const [, created] = await prisma.$transaction([
      prisma.refreshToken.update({
        where: { tokenId: parsed.tokenId },
        data: {
          replacedAt: now,
          gracePeriodUntil: new Date(now.getTime() + GRACE_PERIOD_MS),
        },
      }),
      prisma.refreshToken.create({
        data: {
          tokenId: newTokenId,
          userId: record.userId,
          deviceInfo: record.deviceInfo,
          expiresAt: newExpiresAt,
        },
      }),
    ]);

    const newCookieValue = `${record.userId}.${created.tokenId}`;
    return {
      userId: parsed.userId,
      tokenId: created.tokenId,
      record: created,
      rotatedToken: { cookieValue: newCookieValue, expiresAt: newExpiresAt.getTime() },
    };
  } catch (err) {
    logger.warn({ err }, '[refreshToken] verify failed');
    return null;
  }
}

export async function revokeRefreshToken(cookieValue) {
  const parsed = parseCookieValue(cookieValue);
  if (!parsed) return false;

  try {
    const result = await prisma.refreshToken.deleteMany({
      where: { tokenId: parsed.tokenId },
    });
    return result.count > 0;
  } catch (err) {
    logger.warn({ err }, '[refreshToken] revoke failed');
    return false;
  }
}

export async function revokeAllUserRefreshTokens(userId) {
  try {
    const result = await prisma.refreshToken.deleteMany({
      where: { userId },
    });
    return result.count;
  } catch (err) {
    logger.warn({ err }, '[refreshToken] revokeAll failed');
    return 0;
  }
}

export async function reapExpiredRefreshTokens() {
  try {
    const now = new Date();
    const result = await prisma.refreshToken.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: now } },
          { gracePeriodUntil: { lt: now } },
        ],
      },
    });
    if (result.count > 0) {
      logger.info({ deleted: result.count }, '[refreshToken] reaped expired tokens');
    }
    return result.count;
  } catch (err) {
    logger.warn({ err }, '[refreshToken] reap failed');
    return 0;
  }
}

let cleanupTimer = null;
export function startPeriodicCleanup() {
  if (cleanupTimer) return cleanupTimer;
  cleanupTimer = setInterval(() => {
    reapExpiredRefreshTokens().catch(() => {});
  }, CLEANUP_INTERVAL_MS);
  cleanupTimer.unref();
  return cleanupTimer;
}

export function stopPeriodicCleanup() {
  if (!cleanupTimer) return;
  clearInterval(cleanupTimer);
  cleanupTimer = null;
}

export const __testInternals = {
  parseCookieValue,
  REFRESH_TTL_SEC,
  CLEANUP_INTERVAL_MS,
  GRACE_PERIOD_MS,
};
