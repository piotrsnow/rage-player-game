import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import fastifyCookie from '@fastify/cookie';
import { csrfPlugin, generateCsrfToken, CSRF_COOKIE } from './csrf.js';

async function buildApp() {
  const app = Fastify();
  await app.register(fastifyCookie);
  await app.register(csrfPlugin);

  app.post('/protected', { config: { csrf: true } }, async () => ({ ok: true }));
  app.post('/unprotected', async () => ({ ok: true }));
  app.get('/protected-get', { config: { csrf: true } }, async () => ({ ok: true }));

  await app.ready();
  return app;
}

describe('csrfPlugin (double-submit cookie)', () => {
  let app;

  beforeEach(async () => {
    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('generateCsrfToken returns a 43-char base64url string (32 random bytes)', () => {
    const token = generateCsrfToken();
    expect(typeof token).toBe('string');
    expect(token.length).toBe(43);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('allows a POST when cookie and header match', async () => {
    const token = 'match-me-same-value';
    const res = await app.inject({
      method: 'POST',
      url: '/protected',
      headers: {
        cookie: `${CSRF_COOKIE}=${token}`,
        'x-csrf-token': token,
      },
      payload: {},
    });
    expect(res.statusCode).toBe(200);
  });

  it('rejects a POST when the header is missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/protected',
      headers: { cookie: `${CSRF_COOKIE}=abc` },
      payload: {},
    });
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).message).toMatch(/missing/i);
  });

  it('rejects a POST when the cookie is missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/protected',
      headers: { 'x-csrf-token': 'abc' },
      payload: {},
    });
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).message).toMatch(/missing/i);
  });

  it('rejects a POST when header and cookie do not match', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/protected',
      headers: {
        cookie: `${CSRF_COOKIE}=cookie-value`,
        'x-csrf-token': 'header-value',
      },
      payload: {},
    });
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).message).toMatch(/mismatch/i);
  });

  it('skips the check entirely on routes without config.csrf', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/unprotected',
      payload: {},
    });
    expect(res.statusCode).toBe(200);
  });

  it('skips the check on safe methods (GET) even when config.csrf is set', async () => {
    const res = await app.inject({ method: 'GET', url: '/protected-get' });
    expect(res.statusCode).toBe(200);
  });

  it('rejects when header length differs from cookie (constant-time compare edge case)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/protected',
      headers: {
        cookie: `${CSRF_COOKIE}=short`,
        'x-csrf-token': 'much-longer-value',
      },
      payload: {},
    });
    expect(res.statusCode).toBe(403);
  });
});
