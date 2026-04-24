import { apiClient } from '../apiClient';
import { SETTINGS_KEY, sanitizeSettings } from './keys.js';
import { getSettings } from './settings.js';
import { getActiveCampaignId } from './activeCampaign.js';
import { parseBackendCampaign } from './campaignParse.js';
import { saveCampaign } from './campaignSave.js';

/**
 * Dump settings + every backend-known campaign (rehydrated via
 * parseBackendCampaign) as a JSON file the user can re-import. Offline mode
 * downgrades to settings-only — campaigns are skipped rather than exporting
 * a broken local snapshot that may be missing scenes.
 */
export async function exportConfig() {
  let campaigns = [];
  try {
    const list = await apiClient.get('/campaigns');
    const full = await Promise.all(
      list.map((c) => apiClient.get(`/campaigns/${c.id}`).then(parseBackendCampaign).catch(() => null)),
    );
    campaigns = full.filter(Boolean);
  } catch { /* offline — export settings only */ }

  const payload = {
    _meta: {
      app: 'nikczemny_krzemuch',
      version: 2,
      exportedAt: new Date().toISOString(),
    },
    settings: sanitizeSettings(getSettings()),
    campaigns,
    activeCampaignId: getActiveCampaignId(),
  };
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `nikczemny-krzemuch-config-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function importConfig(file) {
  const text = await file.text();
  const data = JSON.parse(text);
  if (!data._meta || data._meta.app !== 'nikczemny_krzemuch') {
    throw new Error('Invalid config file');
  }

  if (data.settings) {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(sanitizeSettings(data.settings)));
  }

  if (data.campaigns && Array.isArray(data.campaigns)) {
    for (const entry of data.campaigns) {
      if (!entry?.campaign) continue;
      try {
        await saveCampaign(entry);
      } catch (err) {
        console.warn('[storage] Import: failed to save campaign:', entry.campaign?.name, err.message);
      }
    }
  }

  return sanitizeSettings(data.settings);
}
