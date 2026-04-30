/**
 * Canonical asset URL normalizer (backend mirror of
 * `src/services/apiClient.js#toCanonicalStoragePath`).
 *
 * Strips origin (host:port) and any `?token=<JWT>` query string from stored
 * asset URLs so what we keep in DB is a relative path like
 * `/v1/media/file/<path>` that stays valid across hosts and users.
 *
 * Idempotent — safe to apply to values that are already canonical. Used as a
 * safety net when reading legacy records and when accepting writes that may
 * still contain hydrated URLs (older FE clients).
 */

const API_VERSION = '/v1';

export function toCanonicalStoragePath(url) {
  if (!url || typeof url !== 'string') return url;
  if (url.startsWith('data:') || url.startsWith('blob:')) return url;

  // Legacy GCS signed URLs → stable /v1/media/file/<path>.
  const gcsMatch = url.match(/^https:\/\/storage\.googleapis\.com\/[^/]+\/(.+?)(?:\?|$)/);
  if (gcsMatch) {
    return `${API_VERSION}/media/file/${gcsMatch[1]}`;
  }

  if (/^https?:\/\//i.test(url)) {
    try {
      const u = new URL(url);
      let pathname = u.pathname;
      if (pathname.startsWith('/media/') || pathname.startsWith('/proxy/')) {
        pathname = `${API_VERSION}${pathname}`;
      }
      if (
        pathname.startsWith(`${API_VERSION}/media/`) ||
        pathname.startsWith(`${API_VERSION}/proxy/`)
      ) {
        return pathname;
      }
      return url;
    } catch {
      return url;
    }
  }

  if (url.startsWith('/media/') || url.startsWith('/proxy/')) {
    return `${API_VERSION}${url}`;
  }

  return url;
}

/**
 * Apply `toCanonicalStoragePath` in-place on selected fields of an object.
 * Silently ignores missing fields. Returns the same reference.
 */
export function canonicalizeFields(obj, fields) {
  if (!obj || typeof obj !== 'object') return obj;
  for (const field of fields) {
    const val = obj[field];
    if (typeof val === 'string' && val) {
      obj[field] = toCanonicalStoragePath(val);
    }
  }
  return obj;
}
