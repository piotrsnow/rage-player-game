import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';

// apiClient reads `localStorage` at module load (for the stored token and
// settings-backed base URL). Node's default Vitest env has neither — so we
// stub both BEFORE the dynamic import pulls in the module. `crypto.randomUUID`
// is already present on the Node 20+ global `crypto`, no stub needed there.

function makeStorage() {
  const store = new Map();
  return {
    getItem(k) { return store.has(k) ? store.get(k) : null; },
    setItem(k, v) { store.set(k, String(v)); },
    removeItem(k) { store.delete(k); },
    clear() { store.clear(); },
  };
}

let apiClient;
let fetchMock;

beforeAll(async () => {
  globalThis.localStorage = makeStorage();
  ({ apiClient } = await import('./apiClient.js'));
});

beforeEach(() => {
  fetchMock = vi.fn(() =>
    Promise.resolve({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: () => Promise.resolve({ ok: true }),
    }),
  );
  globalThis.fetch = fetchMock;
  apiClient.configure({ baseUrl: 'http://test', token: 'test-token' });
});

afterEach(() => {
  delete globalThis.fetch;
  globalThis.localStorage.clear();
  apiClient.configure({ baseUrl: '', token: '' });
});

function lastCallHeaders() {
  const [, init] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
  return init.headers;
}

describe('apiClient.post idempotency', () => {
  it('does not send Idempotency-Key by default', async () => {
    await apiClient.post('/campaigns', { name: 'Test' });
    const headers = lastCallHeaders();
    expect(headers['Idempotency-Key']).toBeUndefined();
  });

  it('auto-generates a UUID header when { idempotent: true }', async () => {
    await apiClient.post('/campaigns', { name: 'Test' }, { idempotent: true });
    const headers = lastCallHeaders();
    expect(headers['Idempotency-Key']).toBeDefined();
    // RFC 4122 v4 UUID or fallback `idem-<ts>-<suffix>`
    expect(headers['Idempotency-Key']).toMatch(/^([0-9a-f-]{36}|idem-\d+-[a-z0-9]+)$/);
  });

  it('generates a different UUID for each { idempotent: true } call', async () => {
    await apiClient.post('/a', {}, { idempotent: true });
    const first = lastCallHeaders()['Idempotency-Key'];
    await apiClient.post('/b', {}, { idempotent: true });
    const second = lastCallHeaders()['Idempotency-Key'];
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    expect(first).not.toBe(second);
  });

  it('uses the caller-provided idempotencyKey verbatim', async () => {
    await apiClient.post('/campaigns', {}, { idempotencyKey: 'stable-key-123' });
    expect(lastCallHeaders()['Idempotency-Key']).toBe('stable-key-123');
  });

  it('prefers explicit idempotencyKey over idempotent flag', async () => {
    await apiClient.post('/campaigns', {}, { idempotent: true, idempotencyKey: 'wins' });
    expect(lastCallHeaders()['Idempotency-Key']).toBe('wins');
  });

  it('still sends the Authorization header alongside Idempotency-Key', async () => {
    await apiClient.post('/campaigns', {}, { idempotent: true });
    const headers = lastCallHeaders();
    expect(headers.Authorization).toBe('Bearer test-token');
    expect(headers['Idempotency-Key']).toBeDefined();
  });

  it('put() and patch() also honor the idempotent option', async () => {
    await apiClient.put('/campaigns/abc', {}, { idempotent: true });
    expect(lastCallHeaders()['Idempotency-Key']).toBeDefined();

    await apiClient.patch('/campaigns/abc', {}, { idempotent: true });
    expect(lastCallHeaders()['Idempotency-Key']).toBeDefined();
  });

  it('post() without options still works (backward compat)', async () => {
    const res = await apiClient.post('/auth/login', { email: 'a@b.com', password: 'x' });
    expect(res).toEqual({ ok: true });
    expect(lastCallHeaders()['Idempotency-Key']).toBeUndefined();
  });
});
