import { ACTIVE_CAMPAIGN_KEY } from './keys.js';

/**
 * Tracks which campaign the user is "inside" across reloads. Set after any
 * successful save, read at bootstrap to resume the right playthrough.
 */
export function getActiveCampaignId() {
  return localStorage.getItem(ACTIVE_CAMPAIGN_KEY);
}

export function setActiveCampaignId(id) {
  if (id) {
    localStorage.setItem(ACTIVE_CAMPAIGN_KEY, id);
  } else {
    localStorage.removeItem(ACTIVE_CAMPAIGN_KEY);
  }
}
