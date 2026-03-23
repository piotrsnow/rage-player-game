import { FACTION_DEFINITIONS, getReputationTier, REPUTATION_TIERS } from '../data/wfrpFactions';

export function getReputationModifier(factionId, reputation) {
  const tier = getReputationTier(reputation);
  switch (tier) {
    case 'hostile': return { priceModifier: 1.5, fellowshipMod: -20, questAccess: false };
    case 'unfriendly': return { priceModifier: 1.25, fellowshipMod: -10, questAccess: false };
    case 'neutral': return { priceModifier: 1.0, fellowshipMod: 0, questAccess: true };
    case 'friendly': return { priceModifier: 0.9, fellowshipMod: +10, questAccess: true };
    case 'allied': return { priceModifier: 0.75, fellowshipMod: +20, questAccess: true };
    default: return { priceModifier: 1.0, fellowshipMod: 0, questAccess: true };
  }
}

export function formatReputationForPrompt(factions) {
  if (!factions || Object.keys(factions).length === 0) return '';

  const lines = [];
  for (const [id, rep] of Object.entries(factions)) {
    const def = FACTION_DEFINITIONS[id];
    if (!def) continue;
    const tier = getReputationTier(rep);
    const mod = getReputationModifier(id, rep);
    const effect = def.effects[tier] || '';
    lines.push(`- ${def.name}: ${rep}/100 [${tier.toUpperCase()}] — ${effect}${mod.priceModifier !== 1.0 ? ` (prices ×${mod.priceModifier})` : ''}`);
  }

  if (lines.length === 0) return '';

  return `FACTION REPUTATION STANDINGS:\n${lines.join('\n')}\n\nFACTION RULES:\n- Hostile factions refuse service, may attack on sight.\n- Unfriendly factions charge higher prices and may withhold information.\n- Friendly factions offer discounts and share useful intel.\n- Allied factions grant exclusive quests, best prices, and active assistance.\n- When the character's actions affect a faction, include "factionChanges" in stateChanges (e.g. {"merchants_guild": 5, "thieves_guild": -10}).\n`;
}

export function calculateFactionReaction(factionId, reputation, npcRole) {
  const tier = getReputationTier(reputation);
  const attitudes = {
    hostile: ['hostile', 'fearful', 'aggressive'],
    unfriendly: ['unfriendly', 'suspicious', 'dismissive'],
    neutral: ['neutral', 'cautious', 'indifferent'],
    friendly: ['friendly', 'helpful', 'warm'],
    allied: ['devoted', 'eager', 'loyal'],
  };
  const pool = attitudes[tier] || attitudes.neutral;
  return pool[Math.floor(Math.random() * pool.length)];
}

export function getReputationSummary(factions) {
  if (!factions) return [];
  return Object.entries(factions).map(([id, rep]) => {
    const def = FACTION_DEFINITIONS[id];
    const tierData = REPUTATION_TIERS.find((t) => rep >= t.min && rep <= t.max) || REPUTATION_TIERS[2];
    return {
      id,
      name: def?.name || id,
      icon: def?.icon || 'group',
      reputation: rep,
      tier: tierData.tier,
      tierLabel: tierData.label,
      color: tierData.color,
      effect: def?.effects[tierData.tier] || '',
    };
  });
}
