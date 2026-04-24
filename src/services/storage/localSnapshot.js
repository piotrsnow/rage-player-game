import { CAMPAIGNS_KEY, CURRENT_CAMPAIGN_KEY } from './keys.js';

/**
 * Transient single-campaign snapshot in localStorage. Not a backup — this
 * powers offline continue-play when the backend is unreachable. Kept under
 * quota by dropping all but the last 10 scenes (rest are re-fetched on
 * reconnect).
 */
export function saveLocalSnapshot(gameState) {
  try {
    const { isLoading, isGeneratingScene, isGeneratingImage, error, ...clean } = gameState;
    const snapshot = { ...clean };
    if (snapshot.scenes?.length > 10) {
      snapshot.scenes = snapshot.scenes.slice(-10);
    }
    snapshot._snapshotTime = Date.now();
    localStorage.setItem(CURRENT_CAMPAIGN_KEY, JSON.stringify(snapshot));
    // CAMPAIGNS_KEY is the legacy multi-campaign blob — always cleared on
    // snapshot writes so we don't accumulate stale copies post-migration.
    localStorage.removeItem(CAMPAIGNS_KEY);
  } catch (e) {
    console.warn('[storage] Failed to save local snapshot:', e.message);
  }
}

export function loadLocalSnapshot() {
  try {
    const data = localStorage.getItem(CURRENT_CAMPAIGN_KEY);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
}

export function clearLocalSnapshot() {
  localStorage.removeItem(CURRENT_CAMPAIGN_KEY);
}
