import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Fastify from 'fastify';

// Fake Redis client shared across tests. Reset in beforeEach.
const fakeRedis = {
  set: vi.fn(),
  get: vi.fn(),
  del: vi.fn(),
};

vi.mock('../services/redisClient.js', () => ({
  isRedisEnabled: vi.fn(() => true),
  getRedisClient: vi.fn(() => fakeRedis),
}));

import { idempotencyPlugin } from './idempotency.js';

// Build a tiny Fastify app with:
//   - Fake auth decorator that sets request.user from a header
//   - Idempotency plugin registered
//   - Two opt-in routes (one that returns 200, one that returns 400)
//   - One non-opt-in route (control: idempotency should not apply)
async function buildApp() {
  const app = Fastify();
  app.decorate('authenticate', async (request, reply) => {
    const uid = request.headers['x-test-user-id'];
    if (uid) {
      request.user = { id: uid };
    }
  });
  await app.register(idempotencyPlugin);

  app.post('/idem', {
    onRequest: [app.authenticate],
    config: { idempotency: true },
  }, async (request) => {
    return { ok: true, received: request.body };
  });

  app.post('/idem-400', {
    onRequest: [app.authenticate],
    config: { idempotency: true },
  }, async (request, reply) => {
    return reply.code(400).send({ error: 'bad input' });
  });

  app.post('/no-idem', {
    onRequest: [app.authenticate],
  }, async () => ({ ok: true }));

  await app.ready();
  return app;
}

describe('idempotencyPlugin', () => {
  let app;

  beforeEach(async () => {
    fakeRedis.set.mockReset();
    fakeRedis.get.mockReset();
    fakeRedis.del.mockReset();
    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('skips the plugin entirely when route config.idempotency is absent', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/no-idem',
      headers: { 'x-test-user-id': 'u1', 'idempotency-key': 'abc' },
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    expect(fakeRedis.set).not.toHaveBeenCalled();
    expect(fakeRedis.get).not.toHaveBeenCalled();
  });

  it('skips the plugin when header is missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/idem',
      headers: { 'x-test-user-id': 'u1' },
      payload: { hello: 'world' },
    });
    expect(res.statusCode).toBe(200);
    expect(fakeRedis.set).not.toHaveBeenCalled();
  });

  it('skips the plugin for unauthenticated requests even with header', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/idem',
      headers: { 'idempotency-key': 'abc' },
      payload: { hello: 'world' },
    });
    expect(res.statusCode).toBe(200);
    expect(fakeRedis.set).not.toHaveBeenCalled();
  });

  it('first request claims the key with SET NX + pending marker', async () => {
    fakeRedis.set.mockResolvedValueOnce('OK'); // the NX claim
    fakeRedis.set.mockResolvedValueOnce('OK'); // the completed write in onSend

    const res = await app.inject({
      method: 'POST',
      url: '/idem',
      headers: { 'x-test-user-id': 'u1', 'idempotency-key': 'abc' },
      payload: { hello: 'world' },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload)).toEqual({ ok: true, received: { hello: 'world' } });

    // First call: the NX claim with pending marker, 60s TTL.
    const [claimKey, claimValue, ex1, ttl1, nx] = fakeRedis.set.mock.calls[0];
    expect(claimKey).toBe('idem:u1:abc');
    expect(claimValue).toBe('__pending__');
    expect(ex1).toBe('EX');
    expect(ttl1).toBe(60);
    expect(nx).toBe('NX');

    // Second call: the completed cache write, 24h TTL, no NX (overwrite).
    const [cacheKey, cacheValue, ex2, ttl2] = fakeRedis.set.mock.calls[1];
    expect(cacheKey).toBe('idem:u1:abc');
    const parsed = JSON.parse(cacheValue);
    expect(parsed.statusCode).toBe(200);
    expect(parsed.body).toEqual({ ok: true, received: { hello: 'world' } });
    expect(ex2).toBe('EX');
    expect(ttl2).toBe(24 * 60 * 60);
  });

  it('second request with completed cache replays the cached response', async () => {
    // Claim fails (NX returns null) — key already exists.
    fakeRedis.set.mockResolvedValueOnce(null);
    // GET returns the completed cache.
    fakeRedis.get.mockResolvedValueOnce(JSON.stringify({
      statusCode: 200,
      contentType: 'application/json; charset=utf-8',
      body: { ok: true, received: { replayed: true } },
    }));

    const res = await app.inject({
      method: 'POST',
      url: '/idem',
      headers: { 'x-test-user-id': 'u1', 'idempotency-key': 'abc' },
      payload: { hello: 'world' },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload)).toEqual({ ok: true, received: { replayed: true } });
    expect(res.headers['idempotent-replay']).toBe('true');
  });

  it('second request while first is pending returns 409 Conflict', async () => {
    fakeRedis.set.mockResolvedValueOnce(null);
    fakeRedis.get.mockResolvedValueOnce('__pending__');

    const res = await app.inject({
      method: 'POST',
      url: '/idem',
      headers: { 'x-test-user-id': 'u1', 'idempotency-key': 'abc' },
      payload: { hello: 'world' },
    });

    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.payload);
    expect(body.error).toBe('Conflict');
    expect(body.idempotencyKey).toBe('abc');
  });

  it('releases the pending lock on non-2xx response so retries can proceed', async () => {
    fakeRedis.set.mockResolvedValueOnce('OK');
    fakeRedis.del.mockResolvedValueOnce(1);

    const res = await app.inject({
      method: 'POST',
      url: '/idem-400',
      headers: { 'x-test-user-id': 'u1', 'idempotency-key': 'abc' },
      payload: {},
    });

    expect(res.statusCode).toBe(400);
    expect(fakeRedis.del).toHaveBeenCalledWith('idem:u1:abc');
    // Only the initial claim — no completed write.
    expect(fakeRedis.set).toHaveBeenCalledTimes(1);
  });

  it('namespaces key per user — same idempotency-key for different users does not collide', async () => {
    fakeRedis.set.mockResolvedValue('OK');

    await app.inject({
      method: 'POST',
      url: '/idem',
      headers: { 'x-test-user-id': 'u1', 'idempotency-key': 'same-uuid' },
      payload: {},
    });
    await app.inject({
      method: 'POST',
      url: '/idem',
      headers: { 'x-test-user-id': 'u2', 'idempotency-key': 'same-uuid' },
      payload: {},
    });

    const claimKeys = fakeRedis.set.mock.calls
      .filter((call) => call[4] === 'NX')
      .map((call) => call[0]);
    expect(claimKeys).toContain('idem:u1:same-uuid');
    expect(claimKeys).toContain('idem:u2:same-uuid');
  });

  it('falls through without dedup when redis.set throws during claim', async () => {
    fakeRedis.set.mockRejectedValueOnce(new Error('connection refused'));

    const res = await app.inject({
      method: 'POST',
      url: '/idem',
      headers: { 'x-test-user-id': 'u1', 'idempotency-key': 'abc' },
      payload: { hello: 'world' },
    });

    // Handler still ran — plugin degraded gracefully.
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload)).toEqual({ ok: true, received: { hello: 'world' } });
  });
});
