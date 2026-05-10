// Admin panel API client. Thin wrapper over the shared apiClient that fixes
// the prefix and exposes one function per endpoint group. Keep server route
// shapes mirrored 1:1 so this is grep-able both ways.

import { apiClient } from '../../../../services/apiClient';

const PREFIX = '/admin/campaigns';

function req(path, options) {
  return apiClient.request(`${PREFIX}${path}`, options);
}

// ── Campaigns ──
export const adminApi = {
  listCampaigns: (search) => req(`/${search ? `?search=${encodeURIComponent(search)}` : ''}`),
  getCampaign: (id) => req(`/${id}`),
  patchCampaign: (id, body) => req(`/${id}`, { method: 'PATCH', body }),

  // Quests
  listQuests: (id) => req(`/${id}/quests`),
  getQuest: (id, questId) => req(`/${id}/quests/${questId}`),
  createQuest: (id, body) => req(`/${id}/quests`, { method: 'POST', body }),
  patchQuest: (id, questId, body) => req(`/${id}/quests/${questId}`, { method: 'PATCH', body }),
  deleteQuest: (id, questId) => req(`/${id}/quests/${questId}`, { method: 'DELETE' }),
  createObjective: (id, questId, body) =>
    req(`/${id}/quests/${questId}/objectives`, { method: 'POST', body }),
  patchObjective: (id, questId, objId, body) =>
    req(`/${id}/quests/${questId}/objectives/${objId}`, { method: 'PATCH', body }),
  deleteObjective: (id, questId, objId) =>
    req(`/${id}/quests/${questId}/objectives/${objId}`, { method: 'DELETE' }),
  putPrerequisites: (id, questId, prerequisiteIds) =>
    req(`/${id}/quests/${questId}/prerequisites`, { method: 'PUT', body: { prerequisiteIds } }),

  // Campaign NPCs
  listNpcs: (id) => req(`/${id}/npcs`),
  getNpc: (id, npcId) => req(`/${id}/npcs/${npcId}`),
  createNpc: (id, body) => req(`/${id}/npcs`, { method: 'POST', body }),
  patchNpc: (id, npcId, body) => req(`/${id}/npcs/${npcId}`, { method: 'PATCH', body }),
  deleteNpc: (id, npcId) => req(`/${id}/npcs/${npcId}`, { method: 'DELETE' }),

  // World NPCs
  listWorldNpcs: (search) =>
    req(`/world-npcs${search ? `?search=${encodeURIComponent(search)}` : ''}`),
  getWorldNpc: (npcId) => req(`/world-npcs/${npcId}`),
  patchWorldNpc: (npcId, body) => req(`/world-npcs/${npcId}`, { method: 'PATCH', body }),

  // Locations
  listWorldLocations: (search) =>
    req(`/world-locations${search ? `?search=${encodeURIComponent(search)}` : ''}`),
  getWorldLocation: (locId) => req(`/world-locations/${locId}`),
  patchWorldLocation: (locId, body) => req(`/world-locations/${locId}`, { method: 'PATCH', body }),
  listCampaignLocations: (id) => req(`/${id}/locations`),
  getCampaignLocation: (id, locId) => req(`/${id}/locations/${locId}`),
  createCampaignLocation: (id, body) => req(`/${id}/locations`, { method: 'POST', body }),
  patchCampaignLocation: (id, locId, body) => req(`/${id}/locations/${locId}`, { method: 'PATCH', body }),
  deleteCampaignLocation: (id, locId) => req(`/${id}/locations/${locId}`, { method: 'DELETE' }),

  // Edges
  listEdges: (id) => req(`/${id}/edges`),
  createEdge: (id, body) => req(`/${id}/edges`, { method: 'POST', body }),
  patchEdge: (id, edgeId, body) => req(`/${id}/edges/${edgeId}`, { method: 'PATCH', body }),
  deleteEdge: (id, edgeId) => req(`/${id}/edges/${edgeId}`, { method: 'DELETE' }),
  listCampaignEdges: (id) => req(`/${id}/campaign-edges`),
  createCampaignEdge: (id, body) => req(`/${id}/campaign-edges`, { method: 'POST', body }),
  patchCampaignEdge: (id, edgeId, body) => req(`/${id}/campaign-edges/${edgeId}`, { method: 'PATCH', body }),
  deleteCampaignEdge: (id, edgeId) => req(`/${id}/campaign-edges/${edgeId}`, { method: 'DELETE' }),

  // Characters
  getCharacter: (characterId) => req(`/characters/${characterId}`),
  putCharacter: (characterId, body, campaignId) =>
    req(
      `/characters/${characterId}${campaignId ? `?campaignId=${campaignId}` : ''}`,
      { method: 'PUT', body },
    ),
  addInventoryItem: (characterId, body, campaignId) =>
    req(
      `/characters/${characterId}/inventory${campaignId ? `?campaignId=${campaignId}` : ''}`,
      { method: 'POST', body },
    ),
  patchInventoryItem: (characterId, itemKey, body, campaignId) =>
    req(
      `/characters/${characterId}/inventory/${encodeURIComponent(itemKey)}${campaignId ? `?campaignId=${campaignId}` : ''}`,
      { method: 'PATCH', body },
    ),
  deleteInventoryItem: (characterId, itemKey, campaignId) =>
    req(
      `/characters/${characterId}/inventory/${encodeURIComponent(itemKey)}${campaignId ? `?campaignId=${campaignId}` : ''}`,
      { method: 'DELETE' },
    ),

  // Scenes
  getScene: (id, sceneId) => req(`/${id}/scenes/${sceneId}`),
  patchScene: (id, sceneId, body) => req(`/${id}/scenes/${sceneId}`, { method: 'PATCH', body }),
  deleteScene: (id, sceneId) => req(`/${id}/scenes/${sceneId}`, { method: 'DELETE' }),

  // Incidents (read-only)
  listIncidents: (id) => req(`/${id}/incidents`),
  getIncident: (id, incidentId) => req(`/${id}/incidents/${incidentId}`),

  // Snapshots
  listSnapshots: (id) => req(`/${id}/snapshots`),
  createSnapshot: (id, body) => req(`/${id}/snapshots`, { method: 'POST', body: body || {} }),
  restoreSnapshot: (id, snapshotId) =>
    req(`/${id}/snapshots/${snapshotId}/restore`, { method: 'POST' }),
  patchSnapshot: (id, snapshotId, body) =>
    req(`/${id}/snapshots/${snapshotId}`, { method: 'PATCH', body }),
  deleteSnapshot: (id, snapshotId) =>
    req(`/${id}/snapshots/${snapshotId}`, { method: 'DELETE' }),

  // Validate
  validate: (id) => req(`/${id}/validate`, { method: 'POST' }),
};
