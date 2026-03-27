const TOKEN_KEY = 'nikczemny_krzemuch_auth_token';

let _baseUrl = '';
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
    const url = `${_baseUrl}${path}`;
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

  post(path, body) {
    return this.request(path, { method: 'POST', body });
  },

  put(path, body) {
    return this.request(path, { method: 'PUT', body });
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

    const base = this.getBaseUrl();
    const token = this.getToken();

    // Convert legacy GCS signed URLs to stable /media/file/ paths.
    // Signed URLs expire after 24h; the /media/file/* route proxies from GCS indefinitely.
    const gcsMatch = url.match(/^https:\/\/storage\.googleapis\.com\/[^/]+\/(.+?)(?:\?|$)/);
    if (gcsMatch) {
      url = `/media/file/${gcsMatch[1]}`;
    }

    if (url.startsWith('/media/') || url.startsWith('/proxy/')) {
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
