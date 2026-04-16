import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Fastify from 'fastify';

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

describe('idempotencyPlugin (in-memory)', () => {
  let app;

  beforeEach(async () => {
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
  });

  it('skips the plugin when header is missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/idem',
      headers: { 'x-test-user-id': 'u1' },
      payload: { hello: 'world' },
    });
    expect(res.statusCode).toBe(200);
  });

  it('skips the plugin for unauthenticated requests even with header', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/idem',
      headers: { 'idempotency-key': 'abc' },
      payload: { hello: 'world' },
    });
    expect(res.statusCode).toBe(200);
  });

  it('first request succeeds and second replays the cached response', async () => {
    const headers = { 'x-test-user-id': 'u1', 'idempotency-key': 'key1' };

    const first = await app.inject({
      method: 'POST',
      url: '/idem',
      headers,
      payload: { hello: 'world' },
    });
    expect(first.statusCode).toBe(200);
    expect(JSON.parse(first.payload)).toEqual({ ok: true, received: { hello: 'world' } });

    const second = await app.inject({
      method: 'POST',
      url: '/idem',
      headers,
      payload: { different: 'body' },
    });
    expect(second.statusCode).toBe(200);
    expect(JSON.parse(second.payload)).toEqual({ ok: true, received: { hello: 'world' } });
    expect(second.headers['idempotent-replay']).toBe('true');
  });

  it('releases the pending lock on non-2xx response so retries can proceed', async () => {
    const headers = { 'x-test-user-id': 'u1', 'idempotency-key': 'err-key' };

    const first = await app.inject({
      method: 'POST',
      url: '/idem-400',
      headers,
      payload: {},
    });
    expect(first.statusCode).toBe(400);

    // Retry should be able to run the handler again (not replay)
    const second = await app.inject({
      method: 'POST',
      url: '/idem-400',
      headers,
      payload: {},
    });
    expect(second.statusCode).toBe(400);
    expect(second.headers['idempotent-replay']).toBeUndefined();
  });

  it('namespaces key per user — same idempotency-key for different users does not collide', async () => {
    const res1 = await app.inject({
      method: 'POST',
      url: '/idem',
      headers: { 'x-test-user-id': 'u1', 'idempotency-key': 'same-uuid' },
      payload: { user: 'one' },
    });
    const res2 = await app.inject({
      method: 'POST',
      url: '/idem',
      headers: { 'x-test-user-id': 'u2', 'idempotency-key': 'same-uuid' },
      payload: { user: 'two' },
    });

    expect(JSON.parse(res1.payload).received.user).toBe('one');
    expect(JSON.parse(res2.payload).received.user).toBe('two');
  });
});
