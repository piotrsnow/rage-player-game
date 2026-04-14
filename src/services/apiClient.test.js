import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';

// apiClient reads `localStorage` at module load (for the stored settings).
// Node's default Vitest env doesn't have it — stub before dynamic import.
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
let cookieValue = '';

beforeAll(async () => {
  globalThis.localStorage = makeStorage();
  // Minimal document stub for readCsrfTokenFromCookie (lives in the browser
  // but the unit under test is isomorphic).
  globalThis.document = {
    get cookie() { return cookieValue; },
    set cookie(v) { cookieValue = v; },
  };
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
  cookieValue = '';
  apiClient.configure({ baseUrl: 'http://test', token: 'test-token' });
});

afterEach(() => {
  delete globalThis.fetch;
  globalThis.localStorage.clear();
  cookieValue = '';
  apiClient.configure({ baseUrl: '', token: '' });
});

function lastCall() {
  return fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
}
function lastCallHeaders() {
  const [, init] = lastCall();
  return init.headers;
}
function lastCallInit() {
  const [, init] = lastCall();
  return init;
}

describe('apiClient.post idempotency', () => {
  it('does not send Idempotency-Key by default', async () => {
    await apiClient.post('/campaigns', { name: 'Test' });
    expect(lastCallHeaders()['Idempotency-Key']).toBeUndefined();
  });

  it('auto-generates a UUID header when { idempotent: true }', async () => {
    await apiClient.post('/campaigns', { name: 'Test' }, { idempotent: true });
    const headers = lastCallHeaders();
    expect(headers['Idempotency-Key']).toBeDefined();
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

describe('apiClient cookie-based auth (v2)', () => {
  it('attaches credentials: include on every fetch', async () => {
    await apiClient.get('/campaigns');
    expect(lastCallInit().credentials).toBe('include');
  });

  it('sends X-CSRF-Token header on mutating requests when the cookie is set', async () => {
    cookieValue = 'csrf-token=my-csrf-value; other=bar';
    await apiClient.post('/campaigns', { name: 'X' });
    expect(lastCallHeaders()['X-CSRF-Token']).toBe('my-csrf-value');
  });

  it('omits X-CSRF-Token on safe (GET) requests even when cookie is set', async () => {
    cookieValue = 'csrf-token=my-csrf-value';
    await apiClient.get('/campaigns');
    expect(lastCallHeaders()['X-CSRF-Token']).toBeUndefined();
  });

  it('omits X-CSRF-Token when no csrf-token cookie is present', async () => {
    cookieValue = '';
    await apiClient.post('/campaigns', {});
    expect(lastCallHeaders()['X-CSRF-Token']).toBeUndefined();
  });

  it('retries original request after refreshing on 401', async () => {
    // Sequence: first call → 401. Refresh call → 200. Retry → 200.
    const responses = [
      { ok: false, status: 401, headers: { get: () => 'application/json' }, json: async () => ({ error: 'expired' }) },
      { ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => ({ accessToken: 'fresh', csrfToken: 'c', user: { id: 'u1' } }) },
      { ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => ({ ok: true, retried: true }) },
    ];
    fetchMock.mockImplementation(() => Promise.resolve(responses.shift()));

    const result = await apiClient.get('/campaigns');
    expect(result).toEqual({ ok: true, retried: true });
    expect(fetchMock.mock.calls.length).toBe(3);

    // Second call was to the refresh endpoint
    expect(fetchMock.mock.calls[1][0]).toContain('/v2/auth/refresh');
    // Third call (retry) carries the fresh access token
    expect(fetchMock.mock.calls[2][1].headers.Authorization).toBe('Bearer fresh');
  });

  it('throws and clears state when refresh itself fails', async () => {
    const responses = [
      { ok: false, status: 401, headers: { get: () => 'application/json' }, json: async () => ({ error: 'expired' }) },
      { ok: false, status: 401, headers: { get: () => 'application/json' }, json: async () => ({ error: 'no refresh' }) },
    ];
    fetchMock.mockImplementation(() => Promise.resolve(responses.shift()));

    await expect(apiClient.get('/campaigns')).rejects.toThrow(/session expired/i);
    expect(apiClient.getToken()).toBe('');
  });

  it('does not infinite-loop on a 401 from /v2/auth/refresh itself', async () => {
    // direct call through request() to /v2/auth/refresh returning 401
    fetchMock.mockImplementation(() =>
      Promise.resolve({
        ok: false,
        status: 401,
        headers: { get: () => 'application/json' },
        json: async () => ({ error: 'no cookie' }),
      }),
    );
    await expect(apiClient.request('/v2/auth/refresh', { method: 'POST' })).rejects.toThrow(/session expired/i);
    expect(fetchMock.mock.calls.length).toBe(1);
  });

  it('/v2/... paths are passed through without the /v1 prefix', async () => {
    await apiClient.request('/v2/auth/me', { method: 'GET' });
    const [url] = lastCall();
    expect(url).toBe('http://test/v2/auth/me');
  });

  it('/v1 paths remain prefixed as before', async () => {
    await apiClient.get('/campaigns');
    const [url] = lastCall();
    expect(url).toBe('http://test/v1/campaigns');
  });

  it('login() POSTs /v2/auth/login and stores the access token in memory', async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => ({ accessToken: 'new-access', csrfToken: 'csrf', user: { id: 'u1', email: 'a@b.com' } }),
      }),
    );
    apiClient.configure({ token: '' });
    const data = await apiClient.login('a@b.com', 'secret');
    expect(data.accessToken).toBe('new-access');
    expect(data.token).toBe('new-access'); // back-compat alias
    expect(apiClient.getToken()).toBe('new-access');
    expect(fetchMock.mock.calls[0][0]).toContain('/v2/auth/login');
    expect(fetchMock.mock.calls[0][1].credentials).toBe('include');
  });

  it('logout() POSTs /v2/auth/logout and clears in-memory state', async () => {
    cookieValue = 'csrf-token=my-csrf';
    apiClient.configure({ token: 'still-valid' });
    await apiClient.logout();
    expect(apiClient.getToken()).toBe('');
    expect(fetchMock.mock.calls[0][0]).toContain('/v2/auth/logout');
    expect(fetchMock.mock.calls[0][1].headers['X-CSRF-Token']).toBe('my-csrf');
  });

  it('onAuthChange fires when login sets a new token', async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => ({ accessToken: 't', csrfToken: 'c', user: { id: 'u', email: 'a@b.com' } }),
      }),
    );
    const observed = [];
    const unsubscribe = apiClient.onAuthChange((state) => observed.push(state.accessToken));
    await apiClient.login('a@b.com', 'x');
    unsubscribe();
    expect(observed).toContain('t');
  });
});
