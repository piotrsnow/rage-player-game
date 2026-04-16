import crypto from 'node:crypto';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';

// Refresh-token service backing the /v1/auth/* cookie flow. Opaque random
// tokens (NOT JWTs) stored in MongoDB so revocation is O(1): deleteMany.
//
// Storage: RefreshToken collection with TTL index on expiresAt (Mongo reaps
// expired docs every ~60s). Code also checks expiresAt eagerly on verify.
//
// Cookie format: `<userId>.<tokenId>` — kept for backward compat even though
// the tokenId alone is unique. userId in cookie lets us do cheap sanity checks.

const REFRESH_TTL_SEC = 30 * 24 * 60 * 60;

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
      // TTL index reaps every ~60s; catch eagerly here
      await prisma.refreshToken.delete({ where: { tokenId: parsed.tokenId } }).catch(() => {});
      return null;
    }
    // Sanity: cookie userId must match stored userId
    if (record.userId !== parsed.userId) return null;
    return { userId: parsed.userId, tokenId: parsed.tokenId, record };
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

export const __testInternals = {
  parseCookieValue,
  REFRESH_TTL_SEC,
};
