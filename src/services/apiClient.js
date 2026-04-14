const TOKEN_KEY = 'nikczemny_krzemuch_auth_token';
const SETTINGS_STORAGE_KEY = 'nikczemny_krzemuch_settings';
export const API_VERSION = '/v1';

function withVersion(path) {
  if (!path) return API_VERSION;
  if (path.startsWith(API_VERSION + '/') || path === API_VERSION) return path;
  return API_VERSION + (path.startsWith('/') ? path : `/${path}`);
}

// Build an Idempotency-Key header when the caller opted in. Two forms:
//   { idempotent: true }            → generate a fresh UUID per call. Covers
//                                     double-click and React Strict Mode
//                                     double-render via the backend's SET NX
//                                     pending lock (second concurrent call
//                                     gets 409).
//   { idempotencyKey: '<uuid>' }    → caller provides a stable key. Use this
//                                     when you need "retry with the same key"
//                                     across network failures — generate once
//                                     and pass the same key on every attempt.
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
let _token = '';

export const apiClient = {
  configure({ baseUrl, token }) {
    if (baseUrl !== undefined) _baseUrl = baseUrl.replace(/\/+$/, '');
    if (token !== undefined) {
      _token = token;
      if (token) {
        localStorage.setItem(TOKEN_KEY, token);
      } else {
        localStorage.removeItem(TOKEN_KEY);
      }
    }
  },

  getBaseUrl() {
    return _baseUrl;
  },

  getToken() {
    if (!_token) {
      _token = localStorage.getItem(TOKEN_KEY) || '';
    }
    return _token;
  },

  isConnected() {
    return !!(this.getBaseUrl() && this.getToken());
  },

  async request(path, options = {}) {
    const url = `${_baseUrl}${withVersion(path)}`;
    const token = this.getToken();

    const headers = {
      ...options.headers,
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(options.body);
    }

    const response = await fetch(url, { ...options, headers });

    if (response.status === 401) {
      _token = '';
      localStorage.removeItem(TOKEN_KEY);
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
    const data = await this.request('/auth/login', {
      method: 'POST',
      body: { email, password },
    });
    this.configure({ token: data.token });
    return data;
  },

  async register(email, password) {
    const data = await this.request('/auth/register', {
      method: 'POST',
      body: { email, password },
    });
    this.configure({ token: data.token });
    return data;
  },

  resolveMediaUrl(url) {
    if (!url || url.startsWith('data:')) return url;

    // Same source as CampaignViewer fetch: settings.backendUrl when "use backend" is off
    // still leaves apiClient base empty — media must resolve against the API host anyway.
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
        // Hoist legacy full URLs (stored pre-versioning) onto /v1.
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

  logout() {
    this.configure({ token: '' });
  },
};
