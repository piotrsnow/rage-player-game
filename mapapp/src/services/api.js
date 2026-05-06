// Thin fetch wrapper for /v1/map-studio/*.
// Relies on cookie-based auth set by the main RPGon app (same origin in prod,
// Vite proxy to :3001 in dev). No Authorization header; JWT travels via the
// refresh-cookie flow already installed on the backend.

const BASE = '/v1/map-studio';

async function request(method, path, body, { signal } = {}) {
  const init = {
    method,
    credentials: 'include',
    headers: { Accept: 'application/json' },
    signal,
  };
  if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  const res = await fetch(`${BASE}${path}`, init);
  const text = await res.text();
  const data = text ? safeJson(text) : null;
  if (!res.ok) {
    const err = new Error(
      (data && (data.error || data.message)) || `HTTP ${res.status}`
    );
    err.status = res.status;
    err.body = data;
    throw err;
  }
  return data;
}

function safeJson(text) {
  try { return JSON.parse(text); } catch { return text; }
}

/**
 * XHR-based POST that reports upload progress — `fetch` doesn't expose
 * upload bytes, and import payloads can be several MB of base64. `onProgress`
 * receives { loaded, total, phase }:
 *   - phase 'upload'     → bytes sent by browser
 *   - phase 'processing' → upload finished, waiting on server response
 *   - phase 'done'       → response received
 */
function requestWithProgress(method, path, body, { onProgress, signal } = {}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, `${BASE}${path}`, true);
    xhr.withCredentials = true;
    xhr.setRequestHeader('Accept', 'application/json');
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.responseType = 'text';

    if (xhr.upload && onProgress) {
      // Some browsers don't fire `xhr.upload.load` reliably (or fire it much
      // later than the final `progress` event), which would leave the bar
      // pinned at "upload 100%" while the server is actually processing.
      // Dedupe here so whichever event lands first flips us to 'processing'.
      let processingEmitted = false;
      const emitProcessing = () => {
        if (processingEmitted) return;
        processingEmitted = true;
        // loaded:0 / total:100 = "processing started at bar floor 0%" — lets
        // ImportProgress run its full ETA curve from scratch for the dropzone
        // flow. Callers that pre-scale an overall bar (like packZip's ZIP
        // import) set their own floor via explicit loaded/total values.
        onProgress({ loaded: 0, total: 100, phase: 'processing' });
      };
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable && e.total > 0 && e.loaded >= e.total) {
          emitProcessing();
          return;
        }
        onProgress({
          loaded: e.loaded,
          total: e.lengthComputable ? e.total : 0,
          phase: 'upload',
        });
      });
      xhr.upload.addEventListener('load', emitProcessing);
    }

    xhr.addEventListener('load', () => {
      const data = xhr.responseText ? safeJson(xhr.responseText) : null;
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.({ loaded: 100, total: 100, phase: 'done' });
        resolve(data);
      } else {
        const err = new Error(
          (data && (data.error || data.message)) || `HTTP ${xhr.status}`
        );
        err.status = xhr.status;
        err.body = data;
        reject(err);
      }
    });
    xhr.addEventListener('error', () => reject(new Error('Network error')));
    xhr.addEventListener('abort', () => reject(new Error('Aborted')));

    if (signal) {
      if (signal.aborted) { xhr.abort(); return; }
      signal.addEventListener('abort', () => xhr.abort());
    }

    xhr.send(JSON.stringify(body));
  });
}

export const api = {
  get: (path, opts) => request('GET', path, undefined, opts),
  post: (path, body, opts) => request('POST', path, body, opts),
  patch: (path, body, opts) => request('PATCH', path, body, opts),
  put: (path, body, opts) => request('PUT', path, body, opts),
  del: (path, opts) => request('DELETE', path, undefined, opts),

  // Map Studio convenience shortcuts
  listPacks: () => request('GET', '/packs'),
  getPack: (id) => request('GET', `/packs/${id}`),
  listTilesets: (packId) => request('GET', `/tilesets?packId=${encodeURIComponent(packId)}`),
  getTileset: (id) => request('GET', `/tilesets/${id}`),
  listTiles: (tilesetId) => request('GET', `/tiles?tilesetId=${encodeURIComponent(tilesetId)}`),
  bulkPatchTiles: (payload) => request('PATCH', '/tiles/bulk', payload),
  listAutotileGroups: (tilesetId) =>
    request('GET', `/autotile?tilesetId=${encodeURIComponent(tilesetId)}`),
  createAutotileGroup: (payload) => request('POST', '/autotile', payload),
  updateAutotileGroup: (id, payload) => request('PATCH', `/autotile/${id}`, payload),
  deleteAutotileGroup: (id) => request('DELETE', `/autotile/${id}`),
  importPack: (payload, opts) =>
    opts?.onProgress
      ? requestWithProgress('POST', '/import', payload, opts)
      : request('POST', '/import', payload),
  deletePack: (id) => request('DELETE', `/packs/${encodeURIComponent(id)}`),

  lintPack: (packId) => request('GET', `/packs/${encodeURIComponent(packId)}/lint`),

  listRules: (packId) => request('GET', `/rules?packId=${encodeURIComponent(packId)}`),
  createRule: (payload) => request('POST', '/rules', payload),
  updateRule: (id, payload) => request('PATCH', `/rules/${id}`, payload),
  deleteRule: (id) => request('DELETE', `/rules/${id}`),

  listMaps: () => request('GET', '/maps'),
  getMap: (id) => request('GET', `/maps/${id}`),
  createMap: (payload) => request('POST', '/maps', payload),
  updateMap: (id, payload) => request('PUT', `/maps/${id}`, payload),
  deleteMap: (id) => request('DELETE', `/maps/${id}`),

  listActors: () => request('GET', '/actors'),
  getActor: (id) => request('GET', `/actors/${id}`),
  createActor: (payload) => request('POST', '/actors', payload),
  updateActor: (id, payload) => request('PUT', `/actors/${id}`, payload),
  deleteActor: (id) => request('DELETE', `/actors/${id}`),

  renderVariant: (tilesetId, target, opts = {}) => {
    const params = new URLSearchParams({ target: String(target) });
    if (opts.algo) params.set('algo', opts.algo);
    if (opts.force) params.set('force', '1');
    return request('POST', `/tilesets/${tilesetId}/render?${params.toString()}`);
  },
};

// Resolve a MediaAsset image key to a fetchable URL.
// Cookies attach automatically; the backend's /v1/media/file/:key returns the
// original PNG (or a rendered variant once we reference variants explicitly).
export function mediaUrlForKey(key) {
  if (!key) return '';
  return `/v1/media/file/${encodeURIComponent(key)}`;
}
