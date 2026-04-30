import { config } from '../../config.js';

// POST /ai/test-key/:provider — ping the upstream AI provider with the env
// API key so the user can verify it's valid from the Keys modal. We keep this
// cheap: OpenAI → GET /v1/models, Anthropic → a 1-token claude-haiku message.
// Timeout is aggressive (8s) because this is user-facing.

const TEST_TIMEOUT_MS = 8000;

async function withTimeout(ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, cancel: () => clearTimeout(timer) };
}

async function testOpenAI(apiKey) {
  const { signal, cancel } = await withTimeout(TEST_TIMEOUT_MS);
  const start = Date.now();
  try {
    const res = await fetch('https://api.openai.com/v1/models', {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}` },
      signal,
    });
    const latencyMs = Date.now() - start;
    if (res.ok) {
      const body = await res.json().catch(() => ({}));
      const modelCount = Array.isArray(body?.data) ? body.data.length : 0;
      return { ok: true, latencyMs, modelCount };
    }
    const text = await res.text().catch(() => '');
    return { ok: false, status: res.status, error: text.slice(0, 300) || res.statusText };
  } catch (err) {
    return { ok: false, error: err.name === 'AbortError' ? 'Timed out' : err.message };
  } finally {
    cancel();
  }
}

async function testAnthropic(apiKey) {
  const { signal, cancel } = await withTimeout(TEST_TIMEOUT_MS);
  const start = Date.now();
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-3-5-haiku-latest',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'ping' }],
      }),
      signal,
    });
    const latencyMs = Date.now() - start;
    if (res.ok) {
      return { ok: true, latencyMs };
    }
    // 401 = invalid key. 400 with a recognizable body still means the key
    // was accepted by the auth layer, so treat it as "connected" to avoid
    // false negatives on minor body validation quirks.
    const text = await res.text().catch(() => '');
    if (res.status === 400 && /model|messages/i.test(text)) {
      return { ok: true, latencyMs, note: 'Reachable (validation 400)' };
    }
    return { ok: false, status: res.status, error: text.slice(0, 300) || res.statusText };
  } catch (err) {
    return { ok: false, error: err.name === 'AbortError' ? 'Timed out' : err.message };
  } finally {
    cancel();
  }
}

export async function keyTestRoutes(fastify) {
  fastify.post('/test-key/openai', async (_request, reply) => {
    const apiKey = config.apiKeys.openai;
    if (!apiKey) {
      return reply.code(503).send({ ok: false, error: 'OPENAI_API_KEY is not set on the server' });
    }
    const result = await testOpenAI(apiKey);
    return result;
  });

  fastify.post('/test-key/anthropic', async (_request, reply) => {
    const apiKey = config.apiKeys.anthropic;
    if (!apiKey) {
      return reply.code(503).send({ ok: false, error: 'ANTHROPIC_API_KEY is not set on the server' });
    }
    const result = await testAnthropic(apiKey);
    return result;
  });
}
