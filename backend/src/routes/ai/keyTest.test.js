import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Fastify from 'fastify';

// Config mock — we flip the env key on/off per test by mutating this object.
const configMock = {
  config: {
    apiKeys: {
      openai: 'sk-test-openai',
      anthropic: 'ak-test-anthropic',
    },
  },
};

vi.mock('../../config.js', () => configMock);

const { keyTestRoutes } = await import('./keyTest.js');

async function buildApp() {
  const app = Fastify();
  // keyTest.js doesn't call `fastify.authenticate` directly — auth is
  // applied at the parent scope in ai/index.js. Tests hit the handler
  // unauthenticated on purpose.
  await app.register(keyTestRoutes, { prefix: '/ai' });
  await app.ready();
  return app;
}

describe('POST /ai/test-key/:provider', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    configMock.config.apiKeys.openai = 'sk-test-openai';
    configMock.config.apiKeys.anthropic = 'ak-test-anthropic';
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('returns ok:true with latency when OpenAI /v1/models succeeds', async () => {
    globalThis.fetch = vi.fn(async (url, opts) => {
      expect(url).toBe('https://api.openai.com/v1/models');
      expect(opts.headers.Authorization).toBe('Bearer sk-test-openai');
      return new Response(JSON.stringify({ data: [{ id: 'gpt-4o' }, { id: 'gpt-4' }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/ai/test-key/openai' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(true);
    expect(body.modelCount).toBe(2);
    expect(typeof body.latencyMs).toBe('number');
    await app.close();
  });

  it('returns ok:false with status when OpenAI returns 401', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response('Invalid key', { status: 401 }));

    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/ai/test-key/openai' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(false);
    expect(body.status).toBe(401);
    await app.close();
  });

  it('returns 503 when the OpenAI env key is missing', async () => {
    configMock.config.apiKeys.openai = '';
    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/ai/test-key/openai' });
    expect(res.statusCode).toBe(503);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/OPENAI_API_KEY/);
    await app.close();
  });

  it('returns ok:true on Anthropic 200', async () => {
    globalThis.fetch = vi.fn(async (url, opts) => {
      expect(url).toBe('https://api.anthropic.com/v1/messages');
      expect(opts.headers['x-api-key']).toBe('ak-test-anthropic');
      return new Response(JSON.stringify({ id: 'msg_x' }), { status: 200 });
    });

    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/ai/test-key/anthropic' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(true);
    await app.close();
  });

  it('treats Anthropic 400 with "model" validation error as reachable (auth still worked)', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ error: { type: 'invalid_request_error', message: 'model: invalid' } }), {
        status: 400,
      }));

    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/ai/test-key/anthropic' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(true);
    expect(body.note).toMatch(/Reachable/);
    await app.close();
  });

  it('returns ok:false when Anthropic returns 401', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response('unauthorized', { status: 401 }));

    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/ai/test-key/anthropic' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(false);
    expect(body.status).toBe(401);
    await app.close();
  });
});
