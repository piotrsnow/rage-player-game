import { apiClient } from '../apiClient';
import { saveLocalSnapshot } from './localSnapshot.js';
import { setActiveCampaignId } from './activeCampaign.js';
import { sceneIndexCache } from './sceneIndexCache.js';

// Per-campaign in-flight save dedup: a single save is allowed at a time per
// campaign. Concurrent calls collapse into one follow-up save queued here,
// so the last write wins without flooding the backend.
const _pendingBackendSaves = new Map();
const _pendingFollowUp = new Map();

/**
 * Persist `gameState` locally + to the backend if online. Returns a flag
 * summary describing what actually happened; the caller uses it to decide
 * whether to show a save-indicator or warn about offline state.
 */
export async function saveCampaign(gameState) {
  const campaignId = gameState.campaign?.id;
  if (!campaignId) return { saved: false };

  saveLocalSnapshot(gameState);

  if (!apiClient.isConnected()) return { saved: false, local: true };

  if (_pendingBackendSaves.has(campaignId)) {
    _pendingFollowUp.set(campaignId, gameState);
    return { saved: false, queued: true };
  }

  const promise = doSave(gameState);
  _pendingBackendSaves.set(campaignId, promise);
  try {
    await promise;
    return { saved: true };
  } catch (err) {
    console.warn('[storage] Save failed:', err.message);
    return { saved: false };
  } finally {
    _pendingBackendSaves.delete(campaignId);
    const followUp = _pendingFollowUp.get(campaignId);
    if (followUp) {
      _pendingFollowUp.delete(campaignId);
      saveCampaign(followUp).catch(() => {});
    }
  }
}

async function doSave(gameState) {
  const { scenes, isLoading, isGeneratingScene, isGeneratingImage, error, ...rest } = gameState;
  const coreState = { ...rest };

  // Character data lives in the Character collection — never include it in
  // the coreState payload sent to the campaign endpoint. Backend will reject
  // any request that contains a `character` or `characterState` field.
  delete coreState.character;
  delete coreState.characters;

  // Resolve characterIds: prefer the explicit array on campaign, fall back
  // to the live state.character.backendId for single-player legacy paths.
  let characterIds = Array.isArray(gameState.campaign?.characterIds)
    ? gameState.campaign.characterIds.filter((id) => typeof id === 'string' && id)
    : [];
  if (characterIds.length === 0 && gameState.character?.backendId) {
    characterIds = [gameState.character.backendId];
  }

  const payload = {
    name: gameState.campaign?.name || '',
    genre: gameState.campaign?.genre || '',
    tone: gameState.campaign?.tone || '',
    coreState,
    characterIds,
  };

  // Living World (Phase 1) — forward experimental flag when set at creation.
  if (gameState.campaign?.livingWorldEnabled === true) {
    payload.livingWorldEnabled = true;
    if (typeof gameState.campaign?.worldTimeRatio === 'number') {
      payload.worldTimeRatio = gameState.campaign.worldTimeRatio;
    }
    if (Number.isInteger(gameState.campaign?.worldTimeMaxGapDays)) {
      payload.worldTimeMaxGapDays = gameState.campaign.worldTimeMaxGapDays;
    }
  }

  const backendId = gameState.campaign?.backendId;
  if (backendId) {
    await apiClient.put(`/campaigns/${backendId}`, payload);
    await saveNewScenes(backendId, scenes);
  } else {
    const created = await apiClient.post('/campaigns', payload, { idempotent: true });
    if (gameState.campaign) {
      gameState.campaign.backendId = created.id;
      if (Array.isArray(created.characterIds)) {
        gameState.campaign.characterIds = created.characterIds;
      }
    }
    if (scenes?.length) {
      await saveNewScenes(created.id, scenes, true);
    }
  }

  setActiveCampaignId(gameState.campaign.backendId || gameState.campaign.id);
}

async function saveNewScenes(backendId, scenes, forceAll = false) {
  if (!scenes?.length) return;
  const lastSaved = forceAll ? -1 : (sceneIndexCache.get(backendId) ?? -1);
  const newScenes = scenes
    .map((scene, i) => ({ scene, i }))
    .filter(({ i }) => i > lastSaved);
  if (newScenes.length === 0) return;

  const CHUNK = 20;
  let highestSaved = lastSaved;

  for (let start = 0; start < newScenes.length; start += CHUNK) {
    const chunk = newScenes.slice(start, start + CHUNK);
    try {
      const res = await apiClient.post(`/ai/campaigns/${backendId}/scenes/bulk`, {
        scenes: chunk.map(({ scene, i }) => ({ ...scene, sceneIndex: i })),
      }, { idempotent: true });
      const lastInChunk = chunk[chunk.length - 1].i;
      if (res.saved > 0 && lastInChunk > highestSaved) {
        highestSaved = lastInChunk;
      }
    } catch (err) {
      if (err.message?.includes('404') || err.message?.includes('API error: 404')) {
        await saveNewScenesLegacy(backendId, newScenes.slice(start), highestSaved);
        return;
      }
      console.warn('[storage] Bulk scene save failed at chunk %d:', start, err.message);
      break;
    }
  }

  if (highestSaved > lastSaved) {
    sceneIndexCache.set(backendId, highestSaved);
  }
}

// Legacy one-scene-per-POST path — triggered only when the bulk endpoint
// returns 404 (older backend revision during a rolling deploy). Still
// available so a stale FE doesn't drop unsynced scenes on the floor.
async function saveNewScenesLegacy(backendId, remaining, highestSaved) {
  for (const { scene, i } of remaining) {
    try {
      await apiClient.post(`/ai/campaigns/${backendId}/scenes`, {
        ...scene,
        sceneIndex: i,
      }, { idempotent: true });
      highestSaved = i;
    } catch (err) {
      console.warn('[storage] Scene save failed at index %d:', i, err.message);
      break;
    }
  }
  sceneIndexCache.set(backendId, highestSaved);
}
