const DEBUG_KEY = 'rpgon_scene3d_debug';

function isEnabled() {
  try {
    return localStorage.getItem(DEBUG_KEY) === 'true';
  } catch {
    return false;
  }
}

function log(category, message, data) {
  if (!isEnabled()) return;
  const prefix = `[3D:${category}]`;
  if (data !== undefined) {
    console.log(prefix, message, data);
  } else {
    console.log(prefix, message);
  }
}

export const scene3dDebug = {
  enable() { try { localStorage.setItem(DEBUG_KEY, 'true'); } catch { /* noop */ } },
  disable() { try { localStorage.removeItem(DEBUG_KEY); } catch { /* noop */ } },
  isEnabled,

  sceneCommand(cmd) { log('SceneCmd', 'Scene command generated', cmd); },
  assetResolve(key, result) { log('Asset', `Resolve "${key}" → ${result}`); },
  cacheHit(key) { log('Cache', `HIT: ${key}`); },
  cacheMiss(key) { log('Cache', `MISS: ${key}`); },
  cacheStore(key) { log('Cache', `STORE: ${key}`); },
  meshyRequest(prompt, key) { log('Meshy', `Request for "${key}": ${prompt}`); },
  meshyStatus(taskId, status) { log('Meshy', `Task ${taskId}: ${status}`); },
  meshyComplete(taskId, key) { log('Meshy', `Task ${taskId} complete → cached as "${key}"`); },
  meshyError(taskId, error) { log('Meshy', `Task ${taskId} FAILED: ${error}`); },
  spawn(entityType, id, anchor) { log('Render', `Spawn ${entityType} "${id}" at anchor "${anchor}"`); },
  animTransition(id, from, to) { log('Anim', `"${id}": ${from} → ${to}`); },
  cameraChange(mode, targets) { log('Camera', `Mode: ${mode}, targets: ${targets?.join(', ') || 'none'}`); },
  anchorFallback(id, requestedAnchor) { log('Anchor', `Fallback for "${id}": anchor "${requestedAnchor}" not found, using room_center`); },
};

if (typeof window !== 'undefined') {
  window.__scene3dDebug = scene3dDebug;
}
