export function createCampaignId() {
  return `campaign_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

export function createSceneId() {
  return `scene_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

export function createItemId() {
  return `item_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
}

export function createQuestId() {
  return `quest_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
}

export function rollD20() {
  return Math.floor(Math.random() * 20) + 1;
}

export function getModifier(stat) {
  return Math.floor((stat - 10) / 2);
}

export function formatTimestamp(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function getCampaignSummary(gameState) {
  const { campaign, character, scenes } = gameState;
  return {
    name: campaign?.name || 'Untitled',
    genre: campaign?.genre || 'Unknown',
    tone: campaign?.tone || 'Unknown',
    characterName: character?.name || 'Unknown',
    characterLevel: character?.level || 1,
    sceneCount: scenes?.length || 0,
    lastPlayed: gameState.lastSaved || Date.now(),
    totalCost: gameState.aiCosts?.total || 0,
  };
}
