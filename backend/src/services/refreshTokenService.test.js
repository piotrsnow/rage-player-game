import { describe, it, expect, beforeEach, vi } from 'vitest';

// In-memory fake redis used by the mocked redisClient. Mirrors the subset of
// ioredis we actually use: set/get/del/scan.
const store = new Map();
const fakeRedis = {
  set: vi.fn(async (key, value /*, 'EX', _ttl */) => {
    store.set(key, value);
    return 'OK';
  }),
  get: vi.fn(async (key) => (store.has(key) ? store.get(key) : null)),
  del: vi.fn(async (...keys) => {
    let count = 0;
    for (const k of keys) if (store.delete(k)) count++;
    return count;
  }),
  scan: vi.fn(async (cursor, _match, pattern /*, 'COUNT', 100 */) => {
    const prefix = pattern.replace(/\*$/, '');
    const keys = [...store.keys()].filter((k) => k.startsWith(prefix));
    return ['0', keys];
  }),
};

vi.mock('./redisClient.js', () => ({
  isRedisEnabled: vi.fn(() => true),
  getRedisClient: vi.fn(() => fakeRedis),
}));

import {
  issueRefreshToken,
  verifyRefreshToken,
  revokeRefreshToken,
  revokeAllUserRefreshTokens,
  __testInternals,
} from './refreshTokenService.js';
import { isRedisEnabled, getRedisClient } from './redisClient.js';

describe('refreshTokenService', () => {
  beforeEach(() => {
    store.clear();
    fakeRedis.set.mockClear();
    fakeRedis.get.mockClear();
    fakeRedis.del.mockClear();
    fakeRedis.scan.mockClear();
    isRedisEnabled.mockReturnValue(true);
    getRedisClient.mockReturnValue(fakeRedis);
  });

  it('issues a token, stores a Redis row, and returns a dot-joined cookie value', async () => {
    const out = await issueRefreshToken('user_1', { deviceInfo: 'jest' });
    expect(out).toBeTruthy();
    expect(out.cookieValue).toMatch(/^user_1\.[0-9a-f-]{36}$/);
    expect(out.ttlSec).toBe(30 * 24 * 60 * 60);
    expect(fakeRedis.set).toHaveBeenCalledOnce();
    const [key, payload, ex, ttl] = fakeRedis.set.mock.calls[0];
    expect(key).toBe(__testInternals.buildKey('user_1', out.tokenId));
    expect(ex).toBe('EX');
    expect(ttl).toBe(30 * 24 * 60 * 60);
    const parsed = JSON.parse(payload);
    expect(parsed.userId).toBe('user_1');
    expect(parsed.deviceInfo).toBe('jest');
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

  it('verifyRefreshToken returns null and evicts when the row has expired', async () => {
    const issued = await issueRefreshToken('user_3');
    // Hand-rewrite the stored value with expiresAt in the past
    const key = __testInternals.buildKey('user_3', issued.tokenId);
    const raw = JSON.parse(store.get(key));
    raw.expiresAt = Date.now() - 1000;
    store.set(key, JSON.stringify(raw));

    const verified = await verifyRefreshToken(issued.cookieValue);
    expect(verified).toBeNull();
    expect(store.has(key)).toBe(false);
  });

  it('revokeRefreshToken deletes the Redis row for the given cookie', async () => {
    const issued = await issueRefreshToken('user_4');
    const before = await verifyRefreshToken(issued.cookieValue);
    expect(before).not.toBeNull();

    const ok = await revokeRefreshToken(issued.cookieValue);
    expect(ok).toBe(true);

    const after = await verifyRefreshToken(issued.cookieValue);
    expect(after).toBeNull();
  });

  it('revokeAllUserRefreshTokens wipes every active session for a user', async () => {
    await issueRefreshToken('user_5');
    await issueRefreshToken('user_5');
    await issueRefreshToken('user_5');
    await issueRefreshToken('user_6'); // sibling row that must survive

    const deleted = await revokeAllUserRefreshTokens('user_5');
    expect(deleted).toBe(3);
    expect([...store.keys()].some((k) => k.startsWith('user:user_5:'))).toBe(false);
    expect([...store.keys()].some((k) => k.startsWith('user:user_6:'))).toBe(true);
  });

  it('returns null when Redis is disabled', async () => {
    isRedisEnabled.mockReturnValue(false);
    expect(await issueRefreshToken('user_7')).toBeNull();
    expect(await verifyRefreshToken('user_7.abc')).toBeNull();
    expect(await revokeRefreshToken('user_7.abc')).toBe(false);
    expect(await revokeAllUserRefreshTokens('user_7')).toBe(0);
  });

  it('distinct users with distinct tokens do not collide in the keyspace', async () => {
    const a = await issueRefreshToken('user_A');
    const b = await issueRefreshToken('user_B');
    expect(a.cookieValue).not.toBe(b.cookieValue);
    const verA = await verifyRefreshToken(a.cookieValue);
    const verB = await verifyRefreshToken(b.cookieValue);
    expect(verA.userId).toBe('user_A');
    expect(verB.userId).toBe('user_B');
  });
});
