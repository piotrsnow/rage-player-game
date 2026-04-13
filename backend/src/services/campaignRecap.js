export const SUMMARY_CACHE_MAX_ITEMS = 40;

export function normalizeRecapCacheKey(rawKey) {
  const key = typeof rawKey === 'string' ? rawKey.trim() : '';
  if (!key) return '';
  return key.replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 180);
}

export function buildRecapAssetKey(campaignId, cacheKey) {
  return `recap/${campaignId}/${cacheKey}`;
}

export function parseRecapMetadata(raw) {
  try {
    const parsed = JSON.parse(raw || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}
