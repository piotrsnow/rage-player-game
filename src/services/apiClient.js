const SETTINGS_STORAGE_KEY = 'nikczemny_krzemuch_settings';
export const API_VERSION = '/v1';

// /v1/auth — cookie-based refresh flow. FE holds the short-lived access
// token in memory only and relies on the httpOnly `refreshToken` cookie to
// survive page reloads. The `csrf-token` cookie is readable by JS so we can
// echo it in `X-CSRF-Token` on mutating requests.
const AUTH_LOGIN = '/v1/auth/login';
const AUTH_REGISTER = '/v1/auth/register';
const AUTH_REFRESH = '/v1/auth/refresh';
const AUTH_LOGOUT = '/v1/auth/logout';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function withVersion(path) {
  if (!path) return API_VERSION;
  if (path.startsWith(API_VERSION + '/') || path === API_VERSION) return path;
  return API_VERSION + (path.startsWith('/') ? path : `/${path}`);
}

function readCsrfTokenFromCookie() {
  if (typeof document === 'undefined' || !document.cookie) return '';
  const match = document.cookie.match(/(?:^|;\s*)csrf-token=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : '';
}

// Build an Idempotency-Key header when the caller opted in. Two forms:
//   { idempotent: true }            → generate a fresh UUID per call
//   { idempotencyKey: '<uuid>' }    → caller provides a stable key
function buildIdempotencyHeader(options = {}) {
  if (options.idempotencyKey) {
    return { 'Idempotency-Key': options.idempotencyKey };
  }
  if (options.idempotent) {
    const key = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
      ? crypto.randomUUID()
      : `idem-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return { 'Idempotency-Key': key };
  }
  return null;
}

function getSettingsBackendUrl() {
  if (typeof window === 'undefined') return '';
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return '';
    const s = JSON.parse(raw);
    if (!s?.useBackend) return '';
    const u = s?.backendUrl;
    return typeof u === 'string' ? u.replace(/\/+$/, '') : '';
  } catch {
    return '';
  }
}

let _baseUrl = getSettingsBackendUrl();
let _accessToken = '';
let _user = null;
let _refreshInFlight = null;
let _authListeners = new Set();

function notifyAuthChange() {
  for (const listener of _authListeners) {
    try { listener({ accessToken: _accessToken, user: _user }); }
    catch { /* ignore */ }
  }
}

function clearAuthState() {
  _accessToken = '';
  _user = null;
  notifyAuthChange();
}

export const apiClient = {
  configure({ baseUrl, token }) {
    if (baseUrl !== undefined) _baseUrl = baseUrl.replace(/\/+$/, '');
    if (token !== undefined) {
      _accessToken = token;
      if (!token) _user = null;
      notifyAuthChange();
    }
  },

  getBaseUrl() {
    return _baseUrl;
  },

  // Return the current in-memory access token. Callers that snapshot this
  // value (WebSocket upgrade, SSE query param) get whatever was freshest at
  // call time; if the token later expires mid-connection, the snapshot is
  // stale — refresh before reopening the connection.
  getToken() {
    return _accessToken;
  },

  getUser() {
    return _user;
  },

  onAuthChange(listener) {
    _authListeners.add(listener);
    return () => _authListeners.delete(listener);
  },

  isConnected() {
    return !!_accessToken;
  },

  // On app boot, try to exchange the httpOnly refresh cookie for a fresh
  // access token. Called by SettingsContext; callers outside the auth flow
  // should just let the 401 retry in `request()` take care of refresh.
  async bootstrapAuth() {
    try {
      return await this.refreshAccessToken();
    } catch {
      clearAuthState();
      return null;
    }
  },

  // Swap the refresh cookie for a new access token. Deduped via a shared
  // in-flight promise so React Strict Mode double-effect or two parallel
  // 401 retries only hit the backend once.
  async refreshAccessToken() {
    if (_refreshInFlight) return _refreshInFlight;
    _refreshInFlight = (async () => {
      try {
        const csrf = readCsrfTokenFromCookie();
        const res = await fetch(`${_baseUrl}${AUTH_REFRESH}`, {
          method: 'POST',
          credentials: 'include',
          headers: csrf ? { 'X-CSRF-Token': csrf } : {},
        });
        if (!res.ok) {
          throw new Error(`refresh failed: ${res.status}`);
        }
        const data = await res.json();
        _accessToken = data.accessToken || '';
        _user = data.user || null;
        notifyAuthChange();
        return data;
      } finally {
        _refreshInFlight = null;
      }
    })();
    return _refreshInFlight;
  },

  async request(path, options = {}, _isRetry = false) {
    const url = `${_baseUrl}${withVersion(path)}`;

    const headers = { ...options.headers };
    let body = options.body;
    if (body && typeof body === 'object' && !(body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(body);
    }
    if (_accessToken) {
      headers['Authorization'] = `Bearer ${_accessToken}`;
    }

    const method = String(options.method || 'GET').toUpperCase();
    if (!SAFE_METHODS.has(method)) {
      const csrf = readCsrfTokenFromCookie();
      if (csrf) headers['X-CSRF-Token'] = csrf;
    }

    const response = await fetch(url, {
      ...options,
      method,
      body,
      headers,
      credentials: 'include',
    });

    // Auto-refresh on 401, once. Skip the retry loop when the failing call
    // IS the refresh endpoint itself (defensive — refreshAccessToken goes
    // through raw fetch, not this method, but paranoia is cheap here).
    if (
      response.status === 401 &&
      !_isRetry &&
      !path.includes('/auth/refresh')
    ) {
      try {
        await this.refreshAccessToken();
      } catch {
        clearAuthState();
        throw new Error('Session expired. Please log in again.');
      }
      return this.request(path, options, true);
    }

    if (response.status === 401) {
      clearAuthState();
      throw new Error('Session expired. Please log in again.');
    }

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || err.message || `API error: ${response.status}`);
    }

    const contentType = response.headers.get('content-type');
    if (contentType?.includes('application/json')) {
      return response.json();
    }
    return response;
  },

  // Low-level fetch that mirrors the refresh-on-401 behavior of `request()`
  // but returns the raw Response. Use for SSE streams and other endpoints
  // where the body is consumed by the caller (not parsed as JSON). Re-reads
  // `_accessToken` on each attempt so a refresh between attempts is picked up.
  async fetchAuthed(absoluteUrl, options = {}, _isRetry = false) {
    const headers = { ...options.headers };
    if (_accessToken) {
      headers['Authorization'] = `Bearer ${_accessToken}`;
    }

    const method = String(options.method || 'GET').toUpperCase();
    if (!SAFE_METHODS.has(method)) {
      const csrf = readCsrfTokenFromCookie();
      if (csrf) headers['X-CSRF-Token'] = csrf;
    }

    const response = await fetch(absoluteUrl, {
      ...options,
      method,
      headers,
      credentials: 'include',
    });

    if (response.status === 401 && !_isRetry && !absoluteUrl.includes('/auth/refresh')) {
      try {
        await this.refreshAccessToken();
      } catch {
        clearAuthState();
        throw new Error('Session expired. Please log in again.');
      }
      return this.fetchAuthed(absoluteUrl, options, true);
    }

    if (response.status === 401) {
      clearAuthState();
      throw new Error('Session expired. Please log in again.');
    }

    return response;
  },

  get(path) {
    return this.request(path, { method: 'GET' });
  },

  post(path, body, options = {}) {
    const idemHeader = buildIdempotencyHeader(options);
    return this.request(path, {
      method: 'POST',
      body,
      headers: idemHeader || undefined,
    });
  },

  put(path, body, options = {}) {
    const idemHeader = buildIdempotencyHeader(options);
    return this.request(path, {
      method: 'PUT',
      body,
      headers: idemHeader || undefined,
    });
  },

  patch(path, body, options = {}) {
    const idemHeader = buildIdempotencyHeader(options);
    return this.request(path, {
      method: 'PATCH',
      body,
      headers: idemHeader || undefined,
    });
  },

  del(path) {
    return this.request(path, { method: 'DELETE' });
  },

  async login(email, password) {
    const res = await fetch(`${_baseUrl}${AUTH_LOGIN}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || err.message || `Login failed: ${res.status}`);
    }
    const data = await res.json();
    _accessToken = data.accessToken || '';
    _user = data.user || null;
    notifyAuthChange();
    return { ...data, token: data.accessToken };
  },

  async register(email, password) {
    const res = await fetch(`${_baseUrl}${AUTH_REGISTER}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || err.message || `Register failed: ${res.status}`);
    }
    const data = await res.json();
    _accessToken = data.accessToken || '';
    _user = data.user || null;
    notifyAuthChange();
    return { ...data, token: data.accessToken };
  },

  async logout() {
    const csrf = readCsrfTokenFromCookie();
    try {
      await fetch(`${_baseUrl}${AUTH_LOGOUT}`, {
        method: 'POST',
        credentials: 'include',
        headers: csrf ? { 'X-CSRF-Token': csrf } : {},
      });
    } catch {
      /* best-effort; still clear local state */
    }
    clearAuthState();
  },

  resolveMediaUrl(url) {
    if (!url || url.startsWith('data:')) return url;

    const base = this.getBaseUrl() || getSettingsBackendUrl();
    const token = this.getToken();

    // Convert legacy GCS signed URLs to stable /v1/media/file/ paths.
    // Signed URLs expire after 24h; the /v1/media/file/* route proxies from GCS indefinitely.
    const gcsMatch = url.match(/^https:\/\/storage\.googleapis\.com\/[^/]+\/(.+?)(?:\?|$)/);
    if (gcsMatch) {
      url = `${API_VERSION}/media/file/${gcsMatch[1]}`;
    } else if (url.startsWith('/media/') || url.startsWith('/proxy/')) {
      // Legacy DB records may hold pre-versioned paths. Hoist them onto /v1.
      url = `${API_VERSION}${url}`;
    }

    if (url.startsWith(`${API_VERSION}/media/`) || url.startsWith(`${API_VERSION}/proxy/`)) {
      const origin = base || (typeof window !== 'undefined' ? window.location.origin : '');
      if (!origin) return url;

      try {
        const resolved = new URL(url, origin);
        resolved.searchParams.delete('token');
        if (token) resolved.searchParams.set('token', token);
        return resolved.toString();
      } catch {
        return url;
      }
    }

    if (base && url.startsWith(base)) {
      try {
        const u = new URL(url);
        if (u.pathname.startsWith('/media/') || u.pathname.startsWith('/proxy/')) {
          u.pathname = API_VERSION + u.pathname;
        }
        u.searchParams.delete('token');
        if (token) u.searchParams.set('token', token);
        return u.toString();
      } catch {
        return url;
      }
    }

    return url;
  },
};
