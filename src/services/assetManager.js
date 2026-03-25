import { getCharacterPrefab, getObjectPrefab } from '../data/prefabs';
import { getCachedAsset, storeCachedAsset, createAssetBlobUrl, evictOldest } from './assetCache';
import { generateAsset, isGenerating, buildMeshyPrompt, checkBackendCache } from './meshyClient';
import { apiClient } from './apiClient';
import { scene3dDebug } from './scene3dDebug';

/** @type {Map<string, string>} assetKey -> blob URL or backend URL */
const urlCache = new Map();

/** @type {Map<string, Set<Function>>} assetKey -> listeners for when asset becomes ready */
const pendingListeners = new Map();

// Keep Meshy integration code intact, but stop launching new text-to-3d jobs.
const ON_DEMAND_MESHY_GENERATION_ENABLED = false;

/**
 * @typedef {Object} ResolvedAsset
 * @property {'prefab'|'cached'|'generating'|'placeholder'} source
 * @property {string|null} url - Blob URL for cached/generated GLB or backend URL, null for prefab
 * @property {Object|null} prefab - Prefab geometry description
 * @property {boolean} loading - True if asset is being generated
 */

/**
 * Build a canonical asset key from category and type.
 * @param {'char'|'obj'|'env'} category
 * @param {string} type
 * @returns {string}
 */
export function buildAssetKey(category, type) {
  return `${category}:${type}`;
}

/**
 * Synchronously resolve an asset. Returns immediately with prefab or cached data.
 * If Meshy is enabled and no cache hit, triggers async generation.
 *
 * @param {string} assetKey
 * @param {Object} options
 * @param {boolean} [options.meshyEnabled=false]
 * @param {string} [options.meshyApiKey='']
 * @param {string|null} [options.campaignId=null]
 * @param {Function} [options.onReady] - Called when a generating asset becomes available
 * @returns {ResolvedAsset}
 */
export function resolveAssetSync(assetKey, options = {}) {
  const { meshyEnabled = false, meshyApiKey = '', campaignId = null, onReady } = options;
  const [category] = assetKey.split(':');
  const type = assetKey.slice(assetKey.indexOf(':') + 1);

  if (urlCache.has(assetKey)) {
    scene3dDebug.assetResolve(assetKey, 'url (memory)');
    return { source: 'cached', url: urlCache.get(assetKey), prefab: null, loading: false };
  }

  const prefab = category === 'char' ? getCharacterPrefab(type) :
                 category === 'obj' ? getObjectPrefab(type) : null;

  if (isGenerating(assetKey)) {
    if (onReady) {
      addPendingListener(assetKey, onReady);
    }
    scene3dDebug.assetResolve(assetKey, 'generating (placeholder)');
    return { source: 'generating', url: null, prefab, loading: true };
  }

  if (ON_DEMAND_MESHY_GENERATION_ENABLED && meshyEnabled && meshyApiKey) {
    loadFromCacheOrGenerate(assetKey, meshyApiKey, campaignId, onReady);
  }

  scene3dDebug.assetResolve(assetKey, 'prefab');
  return { source: 'prefab', url: null, prefab, loading: false };
}

/**
 * Resolve a scene model that may already point at a concrete backend/GCP URL.
 * Falls back to Meshy-backed asset resolution when only an asset key is available.
 *
 * @param {Object} modelRef
 * @param {string|null} [modelRef.directUrl]
 * @param {string|null} [modelRef.assetKey]
 * @param {'char'|'obj'|'env'} [modelRef.category]
 * @param {string|null} [modelRef.type]
 * @param {Object} options
 * @returns {ResolvedAsset}
 */
export function resolveSceneModelSync(modelRef = {}, options = {}) {
  const { directUrl = null, assetKey = null } = modelRef;
  if (directUrl) {
    return {
      source: 'cached',
      url: apiClient.resolveMediaUrl(directUrl),
      prefab: null,
      loading: false,
    };
  }
  if (assetKey) {
    return resolveAssetSync(assetKey, options);
  }

  const category = modelRef.category || 'obj';
  const type = modelRef.type || '';
  const prefab = category === 'char' ? getCharacterPrefab(type) :
    category === 'obj' ? getObjectPrefab(type) : null;

  return { source: 'prefab', url: null, prefab, loading: false };
}

/**
 * Async resolve — checks backend, then local cache, then optionally generates.
 * @param {string} assetKey
 * @param {Object} options
 * @param {boolean} [options.meshyEnabled=false]
 * @param {string} [options.meshyApiKey='']
 * @param {string|null} [options.campaignId=null]
 * @returns {Promise<ResolvedAsset>}
 */
export async function resolveAsset(assetKey, options = {}) {
  const { meshyEnabled = false, meshyApiKey = '', campaignId = null } = options;
  const [category] = assetKey.split(':');
  const type = assetKey.slice(assetKey.indexOf(':') + 1);

  if (urlCache.has(assetKey)) {
    scene3dDebug.assetResolve(assetKey, 'url (memory)');
    return { source: 'cached', url: urlCache.get(assetKey), prefab: null, loading: false };
  }

  const prompt = buildMeshyPrompt(assetKey);
  if (apiClient.isConnected()) {
    const backendResult = await checkBackendCache(prompt, assetKey, campaignId);
    if (backendResult.cached && backendResult.url) {
      const url = apiClient.resolveMediaUrl(backendResult.url);
      urlCache.set(assetKey, url);
      scene3dDebug.assetResolve(assetKey, 'cached (backend/GCP)');
      return { source: 'cached', url, prefab: null, loading: false };
    }
  }

  const cached = await getCachedAsset(assetKey);
  if (cached?.blob) {
    const url = createAssetBlobUrl(cached);
    urlCache.set(assetKey, url);
    scene3dDebug.assetResolve(assetKey, 'cached (IndexedDB)');
    return { source: 'cached', url, prefab: null, loading: false };
  }

  const prefab = category === 'char' ? getCharacterPrefab(type) :
                 category === 'obj' ? getObjectPrefab(type) : null;

  if (!meshyEnabled || !meshyApiKey || !ON_DEMAND_MESHY_GENERATION_ENABLED) {
    scene3dDebug.assetResolve(assetKey, 'prefab (Meshy disabled)');
    return { source: 'prefab', url: null, prefab, loading: false };
  }

  if (isGenerating(assetKey)) {
    scene3dDebug.assetResolve(assetKey, 'generating');
    return { source: 'generating', url: null, prefab, loading: true };
  }

  try {
    const { blob, mimeType, storedUrl } = await generateAsset(assetKey, prompt, meshyApiKey, campaignId);

    if (storedUrl) {
      const url = apiClient.isConnected() ? apiClient.resolveMediaUrl(storedUrl) : storedUrl;
      urlCache.set(assetKey, url);
      notifyPendingListeners(assetKey, url);
      if (blob) {
        await evictOldest();
        await storeCachedAsset(assetKey, blob, mimeType, prompt);
      }
      return { source: 'cached', url, prefab: null, loading: false };
    }

    if (blob) {
      await evictOldest();
      await storeCachedAsset(assetKey, blob, mimeType, prompt);
      const url = URL.createObjectURL(blob);
      urlCache.set(assetKey, url);
      notifyPendingListeners(assetKey, url);
      return { source: 'cached', url, prefab: null, loading: false };
    }
  } catch (err) {
    console.warn(`[AssetManager] Meshy generation failed for ${assetKey}:`, err.message);
  }

  return { source: 'prefab', url: null, prefab, loading: false };
}

async function loadFromCacheOrGenerate(assetKey, meshyApiKey, campaignId, onReady) {
  try {
    if (!ON_DEMAND_MESHY_GENERATION_ENABLED) {
      return;
    }

    const prompt = buildMeshyPrompt(assetKey);

    if (apiClient.isConnected()) {
      const backendResult = await checkBackendCache(prompt, assetKey, campaignId);
      if (backendResult.cached && backendResult.url) {
        const url = apiClient.resolveMediaUrl(backendResult.url);
        urlCache.set(assetKey, url);
        scene3dDebug.assetResolve(assetKey, 'cached (backend/GCP async)');
        onReady?.(url);
        notifyPendingListeners(assetKey, url);
        return;
      }
    }

    const cached = await getCachedAsset(assetKey);
    if (cached?.blob) {
      const url = createAssetBlobUrl(cached);
      urlCache.set(assetKey, url);
      scene3dDebug.assetResolve(assetKey, 'cached (IndexedDB async)');
      onReady?.(url);
      notifyPendingListeners(assetKey, url);
      return;
    }

    if (isGenerating(assetKey)) return;

    const { blob, mimeType, storedUrl } = await generateAsset(assetKey, prompt, meshyApiKey, campaignId);

    if (storedUrl) {
      const url = apiClient.isConnected() ? apiClient.resolveMediaUrl(storedUrl) : storedUrl;
      urlCache.set(assetKey, url);
      if (blob) {
        await evictOldest();
        await storeCachedAsset(assetKey, blob, mimeType, prompt);
      }
      onReady?.(url);
      notifyPendingListeners(assetKey, url);
      return;
    }

    if (blob) {
      await evictOldest();
      await storeCachedAsset(assetKey, blob, mimeType, prompt);
      const url = URL.createObjectURL(blob);
      urlCache.set(assetKey, url);
      onReady?.(url);
      notifyPendingListeners(assetKey, url);
    }
  } catch (err) {
    console.warn(`[AssetManager] Background generation failed for ${assetKey}:`, err.message);
  }
}

function addPendingListener(assetKey, listener) {
  if (!pendingListeners.has(assetKey)) {
    pendingListeners.set(assetKey, new Set());
  }
  pendingListeners.get(assetKey).add(listener);
}

function notifyPendingListeners(assetKey, url) {
  const listeners = pendingListeners.get(assetKey);
  if (listeners) {
    for (const fn of listeners) {
      try { fn(url); } catch { /* ignore */ }
    }
    pendingListeners.delete(assetKey);
  }
}

/**
 * Revoke all blob URLs (call on cleanup). Does not revoke backend URLs.
 */
export function revokeAllBlobUrls() {
  for (const url of urlCache.values()) {
    if (url.startsWith('blob:')) {
      URL.revokeObjectURL(url);
    }
  }
  urlCache.clear();
}
