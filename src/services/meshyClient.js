import { scene3dDebug } from './scene3dDebug';
import { apiClient } from './apiClient';

const MESHY_API_BASE = 'https://api.meshy.ai/openapi/v2';
const POLL_INTERVAL_MS = 5000;
const MAX_POLL_ATTEMPTS = 120;
const MAX_CONCURRENT = 2;
const CACHE_VERSION = 'textured-v2';
const TARGET_FORMATS = ['glb'];

/** @type {Map<string, MeshyTask>} */
const activeTasks = new Map();

/** @type {Array<{assetKey: string, prompt: string, campaignId: string|null, resolve: Function, reject: Function}>} */
const queue = [];

let runningCount = 0;

/**
 * @typedef {Object} MeshyTask
 * @property {string} taskId
 * @property {string} assetKey
 * @property {'pending'|'generating'|'ready'|'failed'} status
 * @property {string|null} glbUrl
 * @property {string|null} storedUrl - Backend-stored persistent URL
 * @property {string|null} error
 * @property {number} createdAt
 */

/**
 * @param {string} prompt
 * @param {string} apiKey
 * @param {string} assetKey
 * @param {string|null} campaignId
 * @returns {Promise<{taskId: string|null, cacheKey: string, cached: boolean, url: string|null}>}
 */
async function createTextTo3DTask(prompt, apiKey, assetKey, campaignId) {
  if (apiClient.isConnected()) {
    const data = await apiClient.post('/proxy/meshy/text-to-3d', {
      prompt,
      assetKey,
      campaignId,
      cacheVersion: CACHE_VERSION,
    });
    return { taskId: data.taskId, cacheKey: data.key, cached: !!data.cached, url: data.url || null };
  }

  const response = await fetch(`${MESHY_API_BASE}/text-to-3d`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      mode: 'preview',
      prompt,
      art_style: 'realistic',
      should_remesh: true,
      target_formats: TARGET_FORMATS,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || `Meshy API error: ${response.status}`);
  }

  const data = await response.json();
  return { taskId: data.result, cacheKey: null, cached: false, url: null };
}

/**
 * @param {string} previewTaskId
 * @param {string} apiKey
 * @returns {Promise<string>}
 */
async function createRefineTask(previewTaskId, apiKey) {
  if (apiClient.isConnected()) {
    const data = await apiClient.post('/proxy/meshy/refine', { previewTaskId });
    return data.taskId;
  }

  const response = await fetch(`${MESHY_API_BASE}/text-to-3d`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      mode: 'refine',
      preview_task_id: previewTaskId,
      target_formats: TARGET_FORMATS,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || `Meshy refine error: ${response.status}`);
  }

  const data = await response.json();
  if (!data.result) throw new Error('No refine task ID returned from Meshy');
  return data.result;
}

/**
 * @param {string} taskId
 * @param {string} apiKey
 * @returns {Promise<{status: string, glbUrl: string|null, progress: number}>}
 */
async function pollTaskStatus(taskId, apiKey) {
  if (apiClient.isConnected()) {
    const data = await apiClient.get(`/proxy/meshy/tasks/${taskId}`);
    return {
      status: data.status,
      glbUrl: data.model_urls?.glb || null,
      progress: data.progress || 0,
    };
  }

  const response = await fetch(`${MESHY_API_BASE}/text-to-3d/${taskId}`, {
    headers: { 'Authorization': `Bearer ${apiKey}` },
  });

  if (!response.ok) {
    throw new Error(`Meshy poll error: ${response.status}`);
  }

  const data = await response.json();
  return {
    status: data.status,
    glbUrl: data.model_urls?.glb || null,
    progress: data.progress || 0,
  };
}

/**
 * Poll a Meshy task until it succeeds or fails.
 * @param {string} taskId
 * @param {string} apiKey
 * @param {(message: string) => void} onStatus
 * @param {string} timeoutLabel
 * @returns {Promise<{status: string, glbUrl: string|null, progress: number}>}
 */
async function waitForTaskCompletion(taskId, apiKey, onStatus, timeoutLabel) {
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));

    const result = await pollTaskStatus(taskId, apiKey);
    onStatus(`${result.status} (${result.progress}%)`);

    if (result.status === 'SUCCEEDED') {
      return result;
    }

    if (result.status === 'FAILED' || result.status === 'EXPIRED') {
      throw new Error(`Task ${result.status}`);
    }
  }

  throw new Error(timeoutLabel);
}

/**
 * Store the generated GLB to backend for persistent campaign storage.
 * @param {string} glbUrl - Meshy CDN URL for the GLB
 * @param {string} cacheKey - Backend cache key
 * @param {string} assetKey - Canonical asset key
 * @param {string|null} campaignId
 * @param {string} prompt
 * @returns {Promise<string|null>} Backend-stored persistent URL
 */
async function storeToBackend(glbUrl, cacheKey, assetKey, campaignId, prompt) {
  if (!apiClient.isConnected()) return null;

  try {
    const data = await apiClient.post('/proxy/meshy/store', {
      glbUrl,
      cacheKey,
      assetKey,
      campaignId,
      prompt,
      cacheVersion: CACHE_VERSION,
    });
    return data.url || null;
  } catch (err) {
    console.warn('[MeshyClient] Failed to store GLB to backend:', err.message);
    return null;
  }
}

/**
 * Check backend for an already-stored 3D asset.
 * @param {string} prompt
 * @param {string} assetKey
 * @param {string|null} campaignId
 * @returns {Promise<{cached: boolean, url: string|null, key: string}>}
 */
export async function checkBackendCache(prompt, assetKey, campaignId) {
  if (!apiClient.isConnected()) return { cached: false, url: null, key: '' };

  try {
    const data = await apiClient.post('/proxy/meshy/check', {
      prompt,
      assetKey,
      campaignId,
      cacheVersion: CACHE_VERSION,
    });
    return { cached: !!data.cached, url: data.url || null, key: data.key || '' };
  } catch {
    return { cached: false, url: null, key: '' };
  }
}

/**
 * Download a GLB file as a Blob.
 * @param {string} url
 * @returns {Promise<Blob>}
 */
async function downloadGLB(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to download GLB: ${response.status}`);
  return response.blob();
}

function processQueue(apiKey, campaignId) {
  while (runningCount < MAX_CONCURRENT && queue.length > 0) {
    const job = queue.shift();
    runningCount++;
    executeGeneration(job.assetKey, job.prompt, apiKey, job.campaignId || campaignId)
      .then(job.resolve)
      .catch(job.reject)
      .finally(() => {
        runningCount--;
        processQueue(apiKey, campaignId);
      });
  }
}

/**
 * @param {string} assetKey
 * @param {string} prompt
 * @param {string} apiKey
 * @param {string|null} campaignId
 * @returns {Promise<{blob: Blob|null, mimeType: string, storedUrl: string|null}>}
 */
async function executeGeneration(assetKey, prompt, apiKey, campaignId) {
  scene3dDebug.meshyRequest(prompt, assetKey);

  const previewResult = await createTextTo3DTask(prompt, apiKey, assetKey, campaignId);

  if (previewResult.cached && previewResult.url) {
    const task = {
      taskId: '', assetKey, status: 'ready',
      glbUrl: null, storedUrl: previewResult.url, error: null, createdAt: Date.now(),
    };
    activeTasks.set(assetKey, task);
    scene3dDebug.meshyComplete('(cached)', assetKey);
    return { blob: null, mimeType: 'model/gltf-binary', storedUrl: previewResult.url };
  }

  const previewTaskId = previewResult.taskId;
  if (!previewTaskId) throw new Error('No preview task ID returned from Meshy');

  const task = {
    taskId: previewTaskId, assetKey, status: 'generating',
    glbUrl: null, storedUrl: null, error: null, createdAt: Date.now(),
  };
  activeTasks.set(assetKey, task);
  scene3dDebug.meshyStatus(previewTaskId, 'preview');

  try {
    await waitForTaskCompletion(
      previewTaskId,
      apiKey,
      (message) => scene3dDebug.meshyStatus(previewTaskId, `preview ${message}`),
      'Timed out waiting for preview generation'
    );

    const refineTaskId = await createRefineTask(previewTaskId, apiKey);
    task.taskId = refineTaskId;
    scene3dDebug.meshyStatus(refineTaskId, 'refine');

    const refineStatus = await waitForTaskCompletion(
      refineTaskId,
      apiKey,
      (message) => scene3dDebug.meshyStatus(refineTaskId, `refine ${message}`),
      'Timed out waiting for refine generation'
    );

    if (!refineStatus.glbUrl) {
      throw new Error('Refine task succeeded without a GLB URL');
    }

    const storedUrl = await storeToBackend(
      refineStatus.glbUrl,
      previewResult.cacheKey || `${assetKey}:${CACHE_VERSION}`,
      assetKey,
      campaignId,
      prompt
    );

    const blob = await downloadGLB(storedUrl || refineStatus.glbUrl);
    task.status = 'ready';
    task.glbUrl = refineStatus.glbUrl;
    task.storedUrl = storedUrl;
    scene3dDebug.meshyComplete(refineTaskId, assetKey);
    return { blob, mimeType: 'model/gltf-binary', storedUrl };
  } catch (err) {
    task.status = 'failed';
    task.error = err.message || 'Meshy generation failed';
    scene3dDebug.meshyError(task.taskId || previewTaskId, task.error);
    throw err;
  }
}

/**
 * Request 3D asset generation via Meshy.
 * Returns a promise that resolves when the GLB is ready.
 * Deduplicates concurrent requests for the same assetKey.
 *
 * @param {string} assetKey
 * @param {string} prompt
 * @param {string} apiKey
 * @param {string|null} [campaignId=null]
 * @returns {Promise<{blob: Blob|null, mimeType: string, storedUrl: string|null}>}
 */
export function generateAsset(assetKey, prompt, apiKey, campaignId = null) {
  const existing = activeTasks.get(assetKey);
  if (existing && (existing.status === 'generating' || existing.status === 'pending')) {
    return new Promise((resolve, reject) => {
      const check = setInterval(() => {
        const t = activeTasks.get(assetKey);
        if (!t || t.status === 'failed') {
          clearInterval(check);
          reject(new Error(t?.error || 'Generation failed'));
        } else if (t.status === 'ready') {
          clearInterval(check);
          resolve({ blob: null, mimeType: 'model/gltf-binary', storedUrl: t.storedUrl });
        }
      }, 2000);
    });
  }

  activeTasks.set(assetKey, {
    taskId: '', assetKey, status: 'pending',
    glbUrl: null, storedUrl: null, error: null, createdAt: Date.now(),
  });

  return new Promise((resolve, reject) => {
    queue.push({ assetKey, prompt, campaignId, resolve, reject });
    processQueue(apiKey, campaignId);
  });
}

/**
 * Get the current status of a generation task.
 * @param {string} assetKey
 * @returns {MeshyTask|null}
 */
export function getTaskStatus(assetKey) {
  return activeTasks.get(assetKey) || null;
}

/**
 * Check if an asset is currently generating.
 * @param {string} assetKey
 * @returns {boolean}
 */
export function isGenerating(assetKey) {
  const task = activeTasks.get(assetKey);
  return task != null && (task.status === 'pending' || task.status === 'generating');
}

/**
 * Cancel all pending/generating tasks.
 */
export function cancelAll() {
  queue.length = 0;
  activeTasks.clear();
  runningCount = 0;
}

/**
 * Known archetype suffixes used by resolveCharacterArchetype.
 * Anything before these tokens in a char key is treated as the character's name.
 */
const SPECIES_TOKENS = ['human', 'dwarf', 'elf', 'halfling', 'ogre', 'troll', 'goblin', 'orc', 'skeleton', 'zombie', 'wolf', 'horse', 'rat', 'generic'];

/**
 * Build a Meshy-optimized prompt from an archetype or object type.
 * For character-specific keys (e.g. "char:barnaba_human_male_warrior"),
 * the character name is extracted and included for unique generation.
 * @param {string} assetKey - e.g. "char:barnaba_human_male_warrior" or "obj:weapon_sword"
 * @returns {string}
 */
export function buildMeshyPrompt(assetKey) {
  const [category, type] = assetKey.split(':');
  const readable = (type || assetKey).replace(/_/g, ' ');

  if (category === 'char') {
    const parts = (type || '').split('_');
    const speciesIdx = parts.findIndex(p => SPECIES_TOKENS.includes(p));
    if (speciesIdx > 0) {
      const name = parts.slice(0, speciesIdx).join(' ');
      const archetype = parts.slice(speciesIdx).join(' ');
      return `Fantasy RPG character named "${name}", ${archetype}, Warhammer Fantasy style, low-poly game asset, T-pose, full body, unique appearance`;
    }
    return `Fantasy RPG character, ${readable}, Warhammer Fantasy style, low-poly game asset, T-pose, full body`;
  }
  if (category === 'obj') {
    return `Fantasy RPG item, ${readable}, Warhammer Fantasy style, low-poly game asset, centered`;
  }
  if (category === 'env') {
    return `Fantasy RPG environment prop, ${readable}, Warhammer Fantasy style, low-poly, medieval dark fantasy`;
  }
  return `Fantasy RPG asset, ${readable}, low-poly, medieval dark fantasy style`;
}
