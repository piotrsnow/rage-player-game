import { apiClient } from './apiClient';

const reportedKeys = new Set();

function buildReportKey(entry, campaignId) {
  return [
    campaignId || 'local',
    entry.sceneId || '',
    entry.entityKind || 'object',
    entry.objectId || '',
    entry.objectName || '',
    entry.suggestedModelId || '',
    entry.alreadyExists ? '1' : '0',
    entry.status || '',
  ].join('|');
}

export async function reportWanted3dEntries(entries, campaignId = null) {
  if (!apiClient.isConnected() || !Array.isArray(entries) || entries.length === 0) {
    return;
  }

  const payload = entries.filter(Boolean).filter((entry) => {
    const key = buildReportKey(entry, campaignId);
    if (reportedKeys.has(key)) return false;
    reportedKeys.add(key);
    return true;
  });

  if (payload.length === 0) return;

  try {
    await apiClient.post('/wanted3d/report', {
      campaignId,
      entries: payload,
    });
  } catch (err) {
    console.warn('[Wanted3D] Failed to report displayed objects:', err.message);
  }
}
