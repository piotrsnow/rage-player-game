import { SPECIES, CHARACTERISTIC_KEYS } from '../data/wfrp';

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

// WFRP d100 roll (1-100)
export function rollD100() {
  return Math.floor(Math.random() * 100) + 1;
}

// Roll 2d10 (2-20)
export function roll2d10() {
  return Math.floor(Math.random() * 10) + 1 + Math.floor(Math.random() * 10) + 1;
}

// WFRP bonus = tens digit of a characteristic (e.g. 34 → 3)
export function getBonus(characteristicValue) {
  return Math.floor(characteristicValue / 10);
}

// Calculate Success Levels: (target - roll) / 10, rounded toward 0
export function calculateSL(roll, target) {
  const diff = target - roll;
  return diff >= 0 ? Math.floor(diff / 10) : -Math.floor(Math.abs(diff) / 10);
}

// WFRP Wounds = Strength Bonus + 2 × Toughness Bonus + Willpower Bonus
export function calculateWounds(characteristics) {
  const sb = getBonus(characteristics.s);
  const tb = getBonus(characteristics.t);
  const wpb = getBonus(characteristics.wp);
  return sb + 2 * tb + wpb;
}

// Generate random characteristics for a given species
export function generateCharacteristics(speciesName) {
  const species = SPECIES[speciesName];
  if (!species) return null;

  const characteristics = {};
  for (const key of CHARACTERISTIC_KEYS) {
    const base = species.characteristics[key];
    characteristics[key] = roll2d10() + base;
  }
  return characteristics;
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
    characterCareer: character?.career?.name || 'Unknown',
    characterTier: character?.career?.tier || 1,
    sceneCount: scenes?.length || 0,
    lastPlayed: gameState.lastSaved || Date.now(),
    totalCost: gameState.aiCosts?.total || 0,
  };
}
