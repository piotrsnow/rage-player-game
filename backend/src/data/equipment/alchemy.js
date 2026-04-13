/**
 * RPGon alchemy recipes.
 * All use the 'Alchemia' skill (Inteligencja attribute).
 * Difficulty uses named levels matching DIFFICULTY_THRESHOLDS.
 */

export const ALCHEMY_RECIPES = [
  // ── Healing & Restoration ──
  {
    name: 'Healing Draught',
    requiredSkill: 'Alchemia',
    difficulty: 'medium',
    time: 6,
    requiredMaterials: [
      { name: 'Moonwort', quantity: 2 },
      { name: 'Spirit base', quantity: 1 },
      { name: 'Honey', quantity: 1 },
    ],
    resultItem: {
      name: 'Healing Draught',
      type: 'potion',
      rarity: 'common',
      effect: { type: 'heal', value: 8 },
    },
    description: 'Decoction and fortification; must be kept sealed.',
  },
  {
    name: 'Greater Healing Draught',
    requiredSkill: 'Alchemia',
    difficulty: 'hard',
    time: 10,
    requiredMaterials: [
      { name: 'Moonwort', quantity: 4 },
      { name: 'Starbloom petals', quantity: 1 },
      { name: 'Spirit base', quantity: 2 },
      { name: 'Honey', quantity: 2 },
    ],
    resultItem: {
      name: 'Greater Healing Draught',
      type: 'potion',
      rarity: 'uncommon',
      effect: { type: 'heal', value: 16 },
    },
    description: 'Potent concoction that mends even grievous wounds.',
  },
  {
    name: 'Antidote',
    requiredSkill: 'Alchemia',
    difficulty: 'hard',
    time: 8,
    requiredMaterials: [
      { name: 'Activated charcoal', quantity: 1 },
      { name: 'Milk thistle', quantity: 2 },
      { name: 'Vinegar tincture', quantity: 1 },
    ],
    resultItem: {
      name: 'Antidote',
      type: 'potion',
      rarity: 'common',
      effect: { type: 'cure_poison', value: 1 },
    },
    description: 'For common venoms and bad food; weak against exotic toxins.',
  },
  {
    name: 'Mana Tincture',
    requiredSkill: 'Alchemia',
    difficulty: 'hard',
    time: 12,
    requiredMaterials: [
      { name: 'Starbloom petals', quantity: 2 },
      { name: 'Distilled water', quantity: 1 },
      { name: 'Quicksilver', quantity: 1 },
    ],
    resultItem: {
      name: 'Mana Tincture',
      type: 'potion',
      rarity: 'rare',
      effect: { type: 'restore_mana', value: 3 },
    },
    description: 'Shimmering liquid that restores magical reserves.',
  },

  // ── Buff Potions ──
  {
    name: 'Strength Elixir',
    requiredSkill: 'Alchemia',
    difficulty: 'hard',
    time: 8,
    requiredMaterials: [
      { name: 'Ironroot bark', quantity: 2 },
      { name: 'Firethorn berries', quantity: 1 },
      { name: 'Spirit base', quantity: 1 },
    ],
    resultItem: {
      name: 'Strength Elixir',
      type: 'potion',
      rarity: 'uncommon',
      effect: { type: 'buff', stat: 'sila', value: 3, durationHours: 4 },
    },
    description: 'Bitter brew that grants temporary surge of physical might.',
  },
  {
    name: 'Agility Elixir',
    requiredSkill: 'Alchemia',
    difficulty: 'hard',
    time: 8,
    requiredMaterials: [
      { name: 'Feverfew', quantity: 2 },
      { name: 'Marsh moss', quantity: 1 },
      { name: 'Honey', quantity: 1 },
    ],
    resultItem: {
      name: 'Agility Elixir',
      type: 'potion',
      rarity: 'uncommon',
      effect: { type: 'buff', stat: 'zrecznosc', value: 3, durationHours: 4 },
    },
    description: 'Sweet-sour tonic sharpening reflexes and balance.',
  },
  {
    name: 'Endurance Elixir',
    requiredSkill: 'Alchemia',
    difficulty: 'hard',
    time: 8,
    requiredMaterials: [
      { name: 'Ironroot bark', quantity: 1 },
      { name: 'Milk thistle', quantity: 2 },
      { name: 'Mineral oil', quantity: 1 },
    ],
    resultItem: {
      name: 'Endurance Elixir',
      type: 'potion',
      rarity: 'uncommon',
      effect: { type: 'buff', stat: 'wytrzymalosc', value: 3, durationHours: 4 },
    },
    description: 'Thick oily draught steeling the body against fatigue.',
  },
  {
    name: 'Wit-Sharpener',
    requiredSkill: 'Alchemia',
    difficulty: 'hard',
    time: 10,
    requiredMaterials: [
      { name: 'Ghostcap mushroom', quantity: 1 },
      { name: 'Feverfew', quantity: 1 },
      { name: 'Distilled water', quantity: 1 },
    ],
    resultItem: {
      name: 'Wit-Sharpener',
      type: 'potion',
      rarity: 'uncommon',
      effect: { type: 'buff', stat: 'inteligencja', value: 3, durationHours: 4 },
    },
    description: 'Clarifying draught that focuses the mind.',
  },

  // ── Utility Potions ──
  {
    name: 'Night-Eye Drops',
    requiredSkill: 'Alchemia',
    difficulty: 'medium',
    time: 4,
    requiredMaterials: [
      { name: 'Ghostcap mushroom', quantity: 1 },
      { name: 'Distilled water', quantity: 1 },
    ],
    resultItem: {
      name: 'Night-Eye Drops',
      type: 'potion',
      rarity: 'common',
      effect: { type: 'night_vision', durationHours: 6 },
    },
    description: 'Dilates the pupils; grants sight in near-total darkness.',
  },
  {
    name: 'Fire Resistance Oil',
    requiredSkill: 'Alchemia',
    difficulty: 'hard',
    time: 10,
    requiredMaterials: [
      { name: 'Dragonweed', quantity: 1 },
      { name: 'Mineral oil', quantity: 2 },
      { name: 'Sulphur powder', quantity: 1 },
    ],
    resultItem: {
      name: 'Fire Resistance Oil',
      type: 'potion',
      rarity: 'rare',
      effect: { type: 'resistance', element: 'fire', durationHours: 2 },
    },
    description: 'Coat skin or armour; reduces fire damage for a time.',
  },
  {
    name: 'Frost Resistance Oil',
    requiredSkill: 'Alchemia',
    difficulty: 'hard',
    time: 10,
    requiredMaterials: [
      { name: 'Firethorn berries', quantity: 2 },
      { name: 'Mineral oil', quantity: 2 },
      { name: 'Spirit base', quantity: 1 },
    ],
    resultItem: {
      name: 'Frost Resistance Oil',
      type: 'potion',
      rarity: 'rare',
      effect: { type: 'resistance', element: 'frost', durationHours: 2 },
    },
    description: 'Warming salve keeping frostbite at bay.',
  },

  // ── Poisons ──
  {
    name: 'Blade Venom',
    requiredSkill: 'Alchemia',
    difficulty: 'hard',
    time: 6,
    requiredMaterials: [
      { name: 'Nightshade', quantity: 2 },
      { name: 'Vinegar tincture', quantity: 1 },
    ],
    resultItem: {
      name: 'Blade Venom',
      type: 'potion',
      rarity: 'uncommon',
      effect: { type: 'poison_coating', bonusDamage: 4, attacks: 3 },
    },
    description: 'Apply to a weapon; next 3 strikes deal extra damage.',
  },
  {
    name: 'Sleeping Draught',
    requiredSkill: 'Alchemia',
    difficulty: 'veryHard',
    time: 8,
    requiredMaterials: [
      { name: 'Ghostcap mushroom', quantity: 1 },
      { name: 'Nightshade', quantity: 1 },
      { name: 'Honey', quantity: 2 },
    ],
    resultItem: {
      name: 'Sleeping Draught',
      type: 'potion',
      rarity: 'rare',
      effect: { type: 'sleep', durationHours: 4 },
    },
    description: 'Odorless when mixed into drink; target sleeps deeply.',
  },

  // ── Advanced ──
  {
    name: 'Liquid Courage',
    requiredSkill: 'Alchemia',
    difficulty: 'veryHard',
    time: 12,
    requiredMaterials: [
      { name: 'Wolfsbane', quantity: 1 },
      { name: 'Firethorn berries', quantity: 2 },
      { name: 'Spirit base', quantity: 2 },
      { name: 'Quicksilver', quantity: 1 },
    ],
    resultItem: {
      name: 'Liquid Courage',
      type: 'potion',
      rarity: 'rare',
      effect: { type: 'buff', stat: 'charyzma', value: 5, durationHours: 2 },
    },
    description: 'Dangerously potent; emboldens even the meekest soul.',
  },
];
