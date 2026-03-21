const CAMPAIGNS_KEY = 'obsidian_grimoire_campaigns';
const SETTINGS_KEY = 'obsidian_grimoire_settings';
const ACTIVE_CAMPAIGN_KEY = 'obsidian_grimoire_active';

export const storage = {
  getCampaigns() {
    try {
      const data = localStorage.getItem(CAMPAIGNS_KEY);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  },

  saveCampaign(gameState) {
    const campaigns = this.getCampaigns();
    const idx = campaigns.findIndex((c) => c.campaign.id === gameState.campaign.id);
    const entry = {
      ...gameState,
      lastSaved: Date.now(),
    };
    if (idx >= 0) {
      campaigns[idx] = entry;
    } else {
      campaigns.unshift(entry);
    }
    localStorage.setItem(CAMPAIGNS_KEY, JSON.stringify(campaigns));
    localStorage.setItem(ACTIVE_CAMPAIGN_KEY, gameState.campaign.id);
  },

  loadCampaign(id) {
    const campaigns = this.getCampaigns();
    return campaigns.find((c) => c.campaign.id === id) || null;
  },

  deleteCampaign(id) {
    const campaigns = this.getCampaigns().filter((c) => c.campaign.id !== id);
    localStorage.setItem(CAMPAIGNS_KEY, JSON.stringify(campaigns));
    const activeId = localStorage.getItem(ACTIVE_CAMPAIGN_KEY);
    if (activeId === id) {
      localStorage.removeItem(ACTIVE_CAMPAIGN_KEY);
    }
  },

  getActiveCampaignId() {
    return localStorage.getItem(ACTIVE_CAMPAIGN_KEY);
  },

  getSettings() {
    try {
      const data = localStorage.getItem(SETTINGS_KEY);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  },

  saveSettings(settings) {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  },
};
