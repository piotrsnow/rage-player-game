export const FACTION_DEFINITIONS = {
  merchants_guild: {
    id: 'merchants_guild',
    name: 'Merchants Guild',
    icon: 'storefront',
    description: 'The organized network of traders, shopkeepers, and merchant houses',
    effects: {
      allied: 'Best prices, exclusive goods, trade contacts',
      friendly: 'Good prices, wider selection available',
      neutral: 'Standard prices and service',
      unfriendly: 'Raised prices, limited selection',
      hostile: 'Refused service, no trade possible',
    },
  },
  thieves_guild: {
    id: 'thieves_guild',
    name: 'Thieves Guild',
    icon: 'visibility_off',
    description: 'The criminal underworld — fences, smugglers, and assassins',
    effects: {
      allied: 'Access to black market, fence stolen goods, underworld contacts',
      friendly: 'Can fence goods, tips about heists and secrets',
      neutral: 'Left alone',
      unfriendly: 'Pickpocketed, minor harassment',
      hostile: 'Targeted for robbery, assassination contracts',
    },
  },
  temple_sigmar: {
    id: 'temple_sigmar',
    name: 'Temple of Sigmar',
    icon: 'church',
    description: 'The dominant human religion — Warrior Priests, Witch Hunters, and zealots',
    effects: {
      allied: 'Healing, blessings, sanctuary, Witch Hunter support',
      friendly: 'Healing at reduced cost, temple lodging',
      neutral: 'Standard temple services',
      unfriendly: 'Watched with suspicion, denied services',
      hostile: 'Accused of heresy, actively hunted',
    },
  },
  temple_morr: {
    id: 'temple_morr',
    name: 'Temple of Morr',
    icon: 'deceased',
    description: 'The god of death and dreams — caretakers of the dead, dream seers',
    effects: {
      allied: 'Protection against undead, prophetic dreams, funeral rites',
      friendly: 'Burial services, undead lore, dream interpretation',
      neutral: 'Standard funeral rites',
      unfriendly: 'Warned about disturbing the dead',
      hostile: 'Branded as necromancer, refused burial rites',
    },
  },
  military: {
    id: 'military',
    name: 'Imperial Military',
    icon: 'shield',
    description: 'The standing army, city watch, and militia of the Empire',
    effects: {
      allied: 'Military escort, weapon access, officer connections',
      friendly: 'Given benefit of the doubt, some military intelligence',
      neutral: 'Standard interaction with authorities',
      unfriendly: 'Extra scrutiny, searched at gates',
      hostile: 'Arrest warrants, barred from cities',
    },
  },
  noble_houses: {
    id: 'noble_houses',
    name: 'Noble Houses',
    icon: 'castle',
    description: 'The aristocratic families who rule the provinces and cities',
    effects: {
      allied: 'Invitations to court, political favors, noble sponsorship',
      friendly: 'Audience with nobles, social introductions',
      neutral: 'Ignored by nobility',
      unfriendly: 'Social snubbing, denied audience',
      hostile: 'Politically persecuted, lands/property seized',
    },
  },
  chaos_cults: {
    id: 'chaos_cults',
    name: 'Chaos Cults',
    icon: 'whatshot',
    description: 'Secret worshippers of the Dark Gods — dangerous and corrupting',
    effects: {
      allied: 'Dark rituals, mutations, forbidden knowledge (corruption!)',
      friendly: 'Information about cult activities, minor dark favors',
      neutral: 'Unknown to the cults',
      unfriendly: 'Cult tries to recruit or silence',
      hostile: 'Marked for sacrifice, actively hunted by cults',
    },
  },
  witch_hunters: {
    id: 'witch_hunters',
    name: 'Witch Hunters',
    icon: 'local_fire_department',
    description: 'The Order of the Silver Hammer — zealous hunters of heretics and mutants',
    effects: {
      allied: 'Protection from accusations, investigation support, purification',
      friendly: 'Benefit of the doubt, access to restricted lore',
      neutral: 'Standard scrutiny',
      unfriendly: 'Under investigation, watched closely',
      hostile: 'Actively hunted, accused of witchcraft/heresy',
    },
  },
  wizards_college: {
    id: 'wizards_college',
    name: 'Colleges of Magic',
    icon: 'auto_awesome',
    description: 'The eight sanctioned Colleges of Magic in Altdorf',
    effects: {
      allied: 'Magic training, enchanted items, arcane lore',
      friendly: 'Minor magical services, identification of artifacts',
      neutral: 'Distant but not hostile',
      unfriendly: 'Refused magical services',
      hostile: 'Reported to Witch Hunters as rogue caster',
    },
  },
  peasant_folk: {
    id: 'peasant_folk',
    name: 'Common Folk',
    icon: 'agriculture',
    description: 'The farmers, laborers, and commoners of the Empire',
    effects: {
      allied: 'Free lodging, local knowledge, warnings about danger',
      friendly: 'Warm welcome, gossip, local guides',
      neutral: 'Cautious but polite',
      unfriendly: 'Doors locked, rumors spread about you',
      hostile: 'Driven out of villages, mob violence',
    },
  },
};

export const REPUTATION_TIERS = [
  { min: -100, max: -61, tier: 'hostile', label: 'Hostile', color: 'error' },
  { min: -60, max: -21, tier: 'unfriendly', label: 'Unfriendly', color: 'error' },
  { min: -20, max: 20, tier: 'neutral', label: 'Neutral', color: 'outline' },
  { min: 21, max: 60, tier: 'friendly', label: 'Friendly', color: 'primary' },
  { min: 61, max: 100, tier: 'allied', label: 'Allied', color: 'tertiary' },
];

export function getReputationTier(reputation) {
  for (const tier of REPUTATION_TIERS) {
    if (reputation >= tier.min && reputation <= tier.max) {
      return tier.tier;
    }
  }
  return 'neutral';
}

export function getReputationTierData(reputation) {
  for (const tier of REPUTATION_TIERS) {
    if (reputation >= tier.min && reputation <= tier.max) {
      return tier;
    }
  }
  return REPUTATION_TIERS[2];
}

export function getFactionEffect(factionId, reputation) {
  const faction = FACTION_DEFINITIONS[factionId];
  if (!faction) return null;
  const tier = getReputationTier(reputation);
  return faction.effects[tier] || null;
}
