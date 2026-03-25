import { scene3dDebug } from './scene3dDebug';

const DB_NAME = 'rpgon_asset_cache';
const DB_VERSION = 1;
const STORE_NAME = 'assets';

/** @type {IDBDatabase|null} */
let dbInstance = null;

function openDB() {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'assetKey' });
        store.createIndex('createdAt', 'createdAt', { unique: false });
        store.createIndex('lastAccessed', 'lastAccessed', { unique: false });
      }
    };

    request.onsuccess = (event) => {
      dbInstance = event.target.result;
      dbInstance.onclose = () => { dbInstance = null; };
      resolve(dbInstance);
    };

    request.onerror = () => {
      console.warn('[AssetCache] Failed to open IndexedDB:', request.error);
      reject(request.error);
    };
  });
}

/**
 * @typedef {Object} CachedAsset
 * @property {string} assetKey
 * @property {Blob} blob
 * @property {string} mimeType
 * @property {string} [blobUrl]
 * @property {string} prompt
 * @property {number} createdAt
 * @property {number} lastAccessed
 * @property {number} size
 */

/**
 * Retrieve a cached asset by key.
 * @param {string} assetKey
 * @returns {Promise<CachedAsset|null>}
 */
export async function getCachedAsset(assetKey) {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(assetKey);

      request.onsuccess = () => {
        const result = request.result;
        if (!result) {
          scene3dDebug.cacheMiss(assetKey);
          resolve(null);
          return;
        }
        scene3dDebug.cacheHit(assetKey);
        result.lastAccessed = Date.now();
        store.put(result);
        resolve(result);
      };

      request.onerror = () => {
        scene3dDebug.cacheMiss(assetKey);
        resolve(null);
      };
    });
  } catch {
    return null;
  }
}

/**
 * Store an asset in the cache.
 * @param {string} assetKey
 * @param {Blob} blob
 * @param {string} mimeType
 * @param {string} [prompt='']
 * @returns {Promise<void>}
 */
export async function storeCachedAsset(assetKey, blob, mimeType, prompt = '') {
  try {
    const db = await openDB();
    const now = Date.now();
    const entry = {
      assetKey,
      blob,
      mimeType,
      prompt,
      createdAt: now,
      lastAccessed: now,
      size: blob.size,
    };

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.put(entry);

      request.onsuccess = () => {
        scene3dDebug.cacheStore(assetKey);
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.warn('[AssetCache] Failed to store asset:', err);
  }
}

/**
 * Check if an asset exists in cache (without loading blob).
 * @param {string} assetKey
 * @returns {Promise<boolean>}
 */
export async function hasAsset(assetKey) {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.count(assetKey);
      request.onsuccess = () => resolve(request.result > 0);
      request.onerror = () => resolve(false);
    });
  } catch {
    return false;
  }
}

/**
 * Delete an asset from cache.
 * @param {string} assetKey
 * @returns {Promise<void>}
 */
export async function deleteCachedAsset(assetKey) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.delete(assetKey);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch {
    /* ignore */
  }
}

/**
 * Get total cache size in bytes.
 * @returns {Promise<number>}
 */
export async function getCacheSize() {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.openCursor();
      let total = 0;

      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          total += cursor.value.size || 0;
          cursor.continue();
        } else {
          resolve(total);
        }
      };
      request.onerror = () => resolve(0);
    });
  } catch {
    return 0;
  }
}

/**
 * Clear entire cache.
 * @returns {Promise<void>}
 */
export async function clearCache() {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch {
    /* ignore */
  }
}

/**
 * Evict oldest entries until cache is under maxSizeBytes.
 * @param {number} maxSizeBytes
 * @returns {Promise<number>} number of entries evicted
 */
export async function evictOldest(maxSizeBytes = 200 * 1024 * 1024) {
  const currentSize = await getCacheSize();
  if (currentSize <= maxSizeBytes) return 0;

  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const index = store.index('lastAccessed');
      const request = index.openCursor();
      let removed = 0;
      let remaining = currentSize;

      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor && remaining > maxSizeBytes) {
          remaining -= cursor.value.size || 0;
          cursor.delete();
          removed++;
          cursor.continue();
        } else {
          resolve(removed);
        }
      };
      request.onerror = () => resolve(removed);
    });
  } catch {
    return 0;
  }
}

/**
 * Create a blob URL for a cached asset. Caller must revoke when done.
 * @param {CachedAsset} asset
 * @returns {string}
 */
export function createAssetBlobUrl(asset) {
  if (!asset?.blob) return '';
  return URL.createObjectURL(asset.blob);
}
