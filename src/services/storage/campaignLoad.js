import { apiClient } from '../apiClient';
import { clearLocalSnapshot, loadLocalSnapshot } from './localSnapshot.js';
import { ACTIVE_CAMPAIGN_KEY } from './keys.js';
import { getActiveCampaignId } from './activeCampaign.js';
import { sceneIndexCache } from './sceneIndexCache.js';
import { parseBackendCampaign } from './campaignParse.js';

/**
 * List campaigns — merges the backend list with the local snapshot (if any)
 * so an offline session still has its current campaign in the picker. Local
 * entry is prepended and tagged `source: 'local'` so the UI can show an
 * "unsaved" badge.
 */
export async function getCampaigns() {
  let campaigns = [];

  if (apiClient.isConnected()) {
    try {
      const list = await apiClient.get('/campaigns');
      campaigns = list.map((c) => ({ ...c, source: 'remote' }));
    } catch { /* offline or error — continue with local only */ }
  }

  const local = loadLocalSnapshot();
  if (local?.campaign) {
    const localId = local.campaign.backendId || local.campaign.id;
    const alreadyInRemote = campaigns.some((c) => c.id === localId);
    if (!alreadyInRemote) {
      campaigns.unshift({
        id: localId,
        name: local.campaign.name || '',
        genre: local.campaign.genre || '',
        tone: local.campaign.tone || '',
        lastSaved: local.lastSaved || Date.now(),
        characterName: local.character?.name || '',
        characterCareer: local.character?.career?.name || '',
        characterTier: local.character?.career?.tier || 1,
        sceneCount: local.scenes?.length || 0,
        totalCost: local.aiCosts?.total || 0,
        source: 'local',
      });
    }
  }

  return campaigns;
}

export async function loadCampaign(backendId) {
  if (apiClient.isConnected()) {
    try {
      const full = await apiClient.get(`/campaigns/${backendId}`);
      const state = parseBackendCampaign(full);
      if (state.scenes?.length) {
        sceneIndexCache.set(backendId, state.scenes.length - 1);
      }
      return state;
    } catch { /* fall through to local snapshot */ }
  }

  const local = loadLocalSnapshot();
  if (local?.campaign) {
    const localId = local.campaign.backendId || local.campaign.id;
    if (localId === backendId) return local;
  }
  return null;
}

export async function deleteCampaign(backendId) {
  await apiClient.del(`/campaigns/${backendId}`);
  const activeId = getActiveCampaignId();
  if (activeId === backendId) {
    // Clearing directly (not via setActiveCampaignId(null)) is fine — the
    // storage key is imported right here, no need to widen the facade for it.
    localStorage.removeItem(ACTIVE_CAMPAIGN_KEY);
  }
  const local = loadLocalSnapshot();
  if (local?.campaign) {
    const localId = local.campaign.backendId || local.campaign.id;
    if (localId === backendId) clearLocalSnapshot();
  }
  sceneIndexCache.delete(backendId);
}
