import { describe, it, expect, beforeEach, vi } from 'vitest';

// In-memory fake Prisma store for RefreshToken collection.
const store = new Map();
let idCounter = 0;

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    refreshToken: {
      create: vi.fn(async ({ data }) => {
        const id = `rt_${++idCounter}`;
        const record = { id, ...data, createdAt: new Date() };
        store.set(data.tokenId, record);
        return record;
      }),
      findUnique: vi.fn(async ({ where }) => {
        if (where.tokenId) return store.get(where.tokenId) || null;
        return null;
      }),
      delete: vi.fn(async ({ where }) => {
        const existed = store.has(where.tokenId);
        store.delete(where.tokenId);
        return existed ? { tokenId: where.tokenId } : null;
      }),
      deleteMany: vi.fn(async ({ where }) => {
        let count = 0;
        if (where.tokenId) {
          if (store.delete(where.tokenId)) count++;
        } else if (where.userId) {
          for (const [key, val] of store) {
            if (val.userId === where.userId) { store.delete(key); count++; }
          }
        }
        return { count };
      }),
    },
  },
}));

import {
  issueRefreshToken,
  verifyRefreshToken,
  revokeRefreshToken,
  revokeAllUserRefreshTokens,
  __testInternals,
} from './refreshTokenService.js';

describe('refreshTokenService (Mongo-backed)', () => {
  beforeEach(() => {
    store.clear();
    idCounter = 0;
  });

  it('issues a token, stores a Mongo row, and returns a dot-joined cookie value', async () => {
    const out = await issueRefreshToken('user_1', { deviceInfo: 'vitest' });
    expect(out).toBeTruthy();
    expect(out.cookieValue).toMatch(/^user_1\.[0-9a-f-]{36}$/);
    expect(out.ttlSec).toBe(30 * 24 * 60 * 60);
    expect(store.size).toBe(1);
    const record = store.get(out.tokenId);
    expect(record.userId).toBe('user_1');
    expect(record.deviceInfo).toBe('vitest');
    expect(record.expiresAt).toBeInstanceOf(Date);
  });

  it('verifyRefreshToken returns the userId for a valid, unexpired token', async () => {
    const issued = await issueRefreshToken('user_42');
    const verified = await verifyRefreshToken(issued.cookieValue);
    expect(verified).toMatchObject({ userId: 'user_42', tokenId: issued.tokenId });
  });

  it('verifyRefreshToken returns null when the cookie is malformed', async () => {
    expect(await verifyRefreshToken('not-a-valid-cookie')).toBeNull();
    expect(await verifyRefreshToken('')).toBeNull();
    expect(await verifyRefreshToken('user_1.')).toBeNull();
    expect(await verifyRefreshToken('.missing-user')).toBeNull();
  });

  it('verifyRefreshToken returns null and cleans up when the row has expired', async () => {
    const issued = await issueRefreshToken('user_3');
    // Hand-rewrite the stored record with expiresAt in the past
    const record = store.get(issued.tokenId);
    record.expiresAt = new Date(Date.now() - 1000);

    const verified = await verifyRefreshToken(issued.cookieValue);
    expect(verified).toBeNull();
    expect(store.has(issued.tokenId)).toBe(false);
  });

  it('verifyRefreshToken returns null if cookie userId mismatches stored userId', async () => {
    const issued = await issueRefreshToken('user_real');
    // Forge a cookie with a different userId but same tokenId
    const forgedCookie = `user_fake.${issued.tokenId}`;
    const verified = await verifyRefreshToken(forgedCookie);
    expect(verified).toBeNull();
  });

  it('revokeRefreshToken deletes the Mongo row for the given cookie', async () => {
    const issued = await issueRefreshToken('user_4');
    expect(await verifyRefreshToken(issued.cookieValue)).not.toBeNull();

    const ok = await revokeRefreshToken(issued.cookieValue);
    expect(ok).toBe(true);

    expect(await verifyRefreshToken(issued.cookieValue)).toBeNull();
  });

  it('revokeAllUserRefreshTokens wipes every active session for a user', async () => {
    await issueRefreshToken('user_5');
    await issueRefreshToken('user_5');
    await issueRefreshToken('user_5');
    await issueRefreshToken('user_6'); // sibling row that must survive

    const deleted = await revokeAllUserRefreshTokens('user_5');
    expect(deleted).toBe(3);
    expect([...store.values()].some((r) => r.userId === 'user_5')).toBe(false);
    expect([...store.values()].some((r) => r.userId === 'user_6')).toBe(true);
  });

  it('distinct users with distinct tokens do not collide', async () => {
    const a = await issueRefreshToken('user_A');
    const b = await issueRefreshToken('user_B');
    expect(a.cookieValue).not.toBe(b.cookieValue);
    const verA = await verifyRefreshToken(a.cookieValue);
    const verB = await verifyRefreshToken(b.cookieValue);
    expect(verA.userId).toBe('user_A');
    expect(verB.userId).toBe('user_B');
  });
});
