// Economy - WFRP 4e economy system: weapons, armour, equipment, and trade
// Currency: 1 Gold Crown (GC) = 20 Silver Shillings (SS) = 240 Brass Pennies (BP)
// Simplified: 1 GC = 100 copper, 1 SS = 10 copper for game purposes

export const AVAILABILITY_DC = {
  Common: 0,
  Scarce: -10,
  Rare: -20,
  Exotic: -30,
};

// ── WEAPONS ────────────────────────────────────────────────────
export const WEAPONS = [
  // Melee weapons (damage values assume ~SB 3 where applicable)
  {
    name: 'Dagger',
    category: 'melee',
    group: 'Basic',
    damage: 2,
    qualities: ['Fast'],
    encumbrance: 0,
    price: { gold: 0, silver: 1, copper: 0 },
    availability: 'Common',
  },
  {
    name: 'Sword',
    category: 'melee',
    group: 'Fencing',
    damage: 5,
    qualities: [],
    encumbrance: 1,
    price: { gold: 1, silver: 0, copper: 0 },
    availability: 'Common',
  },
  {
    name: 'Axe',
    category: 'melee',
    group: 'Basic',
    damage: 5,
    qualities: ['Hack'],
    encumbrance: 1,
    price: { gold: 1, silver: 0, copper: 0 },
    availability: 'Common',
  },
  {
    name: 'Mace',
    category: 'melee',
    group: 'Basic',
    damage: 5,
    qualities: ['Pummel'],
    encumbrance: 1,
    price: { gold: 1, silver: 0, copper: 0 },
    availability: 'Common',
  },
  {
    name: 'Rapier',
    category: 'melee',
    group: 'Fencing',
    damage: 4,
    qualities: ['Fast', 'Impale'],
    encumbrance: 1,
    price: { gold: 3, silver: 0, copper: 0 },
    availability: 'Scarce',
  },
  {
    name: 'Main Gauche',
    category: 'melee',
    group: 'Parry',
    damage: 3,
    qualities: ['Defensive'],
    encumbrance: 0,
    price: { gold: 1, silver: 0, copper: 0 },
    availability: 'Common',
  },
  {
    name: 'Flail',
    category: 'melee',
    group: 'Flail',
    damage: 6,
    qualities: ['Wrap'],
    encumbrance: 2,
    price: { gold: 2, silver: 0, copper: 0 },
    availability: 'Common',
  },
  {
    name: 'Great Sword',
    category: 'melee',
    group: 'Two-Handed',
    damage: 6,
    qualities: ['Slow'],
    encumbrance: 3,
    price: { gold: 2, silver: 0, copper: 0 },
    availability: 'Common',
  },
  {
    name: 'Great Axe',
    category: 'melee',
    group: 'Two-Handed',
    damage: 6,
    qualities: ['Hack', 'Slow'],
    encumbrance: 3,
    price: { gold: 2, silver: 0, copper: 0 },
    availability: 'Common',
  },
  {
    name: 'Halberd',
    category: 'melee',
    group: 'Polearm',
    damage: 6,
    qualities: ['Hack', 'Slow'],
    encumbrance: 3,
    price: { gold: 2, silver: 0, copper: 0 },
    availability: 'Common',
  },
  {
    name: 'Spear',
    category: 'melee',
    group: 'Polearm',
    damage: 5,
    qualities: ['Impale'],
    encumbrance: 2,
    price: { gold: 1, silver: 0, copper: 0 },
    availability: 'Common',
  },
  {
    name: 'Lance',
    category: 'melee',
    group: 'Cavalry',
    damage: 6,
    qualities: ['Impale'],
    encumbrance: 3,
    price: { gold: 3, silver: 0, copper: 0 },
    availability: 'Scarce',
  },
  {
    name: 'Staff',
    category: 'melee',
    group: 'Basic',
    damage: 3,
    qualities: ['Defensive'],
    encumbrance: 2,
    price: { gold: 0, silver: 3, copper: 0 },
    availability: 'Common',
  },
  {
    name: 'Knuckledusters',
    category: 'melee',
    group: 'Brawling',
    damage: 3,
    qualities: [],
    encumbrance: 0,
    price: { gold: 0, silver: 1, copper: 0 },
    availability: 'Common',
  },

  // Ranged weapons
  {
    name: 'Shortbow',
    category: 'ranged',
    group: 'Bow',
    damage: 3,
    qualities: [],
    encumbrance: 1,
    price: { gold: 1, silver: 0, copper: 0 },
    availability: 'Common',
  },
  {
    name: 'Longbow',
    category: 'ranged',
    group: 'Bow',
    damage: 4,
    qualities: [],
    encumbrance: 2,
    price: { gold: 1, silver: 5, copper: 0 },
    availability: 'Common',
  },
  {
    name: 'Elf Bow',
    category: 'ranged',
    group: 'Bow',
    damage: 4,
    qualities: ['Accurate'],
    encumbrance: 1,
    price: { gold: 10, silver: 0, copper: 0 },
    availability: 'Exotic',
  },
  {
    name: 'Light Crossbow',
    category: 'ranged',
    group: 'Crossbow',
    damage: 5,
    qualities: ['Reload 1'],
    encumbrance: 2,
    price: { gold: 2, silver: 5, copper: 0 },
    availability: 'Common',
  },
  {
    name: 'Heavy Crossbow',
    category: 'ranged',
    group: 'Crossbow',
    damage: 7,
    qualities: ['Reload 2', 'Slow'],
    encumbrance: 3,
    price: { gold: 5, silver: 0, copper: 0 },
    availability: 'Scarce',
  },
  {
    name: 'Pistol',
    category: 'ranged',
    group: 'Blackpowder',
    damage: 6,
    qualities: ['Blackpowder', 'Reload 1'],
    encumbrance: 1,
    price: { gold: 5, silver: 0, copper: 0 },
    availability: 'Scarce',
  },
  {
    name: 'Handgun',
    category: 'ranged',
    group: 'Blackpowder',
    damage: 7,
    qualities: ['Blackpowder', 'Reload 2'],
    encumbrance: 2,
    price: { gold: 7, silver: 0, copper: 0 },
    availability: 'Scarce',
  },
  {
    name: 'Blunderbuss',
    category: 'ranged',
    group: 'Blackpowder',
    damage: 8,
    qualities: ['Blackpowder', 'Reload 2', 'Blast 2'],
    encumbrance: 3,
    price: { gold: 4, silver: 0, copper: 0 },
    availability: 'Scarce',
  },
  {
    name: 'Throwing Knife',
    category: 'ranged',
    group: 'Throwing',
    damage: 2,
    qualities: [],
    encumbrance: 0,
    price: { gold: 0, silver: 1, copper: 0 },
    availability: 'Common',
  },
  {
    name: 'Throwing Axe',
    category: 'ranged',
    group: 'Throwing',
    damage: 4,
    qualities: ['Hack'],
    encumbrance: 1,
    price: { gold: 0, silver: 2, copper: 0 },
    availability: 'Common',
  },
  {
    name: 'Sling',
    category: 'ranged',
    group: 'Sling',
    damage: 3,
    qualities: [],
    encumbrance: 0,
    price: { gold: 0, silver: 2, copper: 0 },
    availability: 'Common',
  },
];

// ── ARMOUR ─────────────────────────────────────────────────────
export const ARMOUR = [
  // Leather
  {
    name: 'Leather Skullcap',
    locations: ['head'],
    ap: 1,
    penalties: { stealth: 0, agility: 0 },
    encumbrance: 0,
    price: { gold: 0, silver: 3, copper: 0 },
    availability: 'Common',
  },
  {
    name: 'Leather Jack',
    locations: ['body', 'arms'],
    ap: 1,
    penalties: { stealth: 0, agility: 0 },
    encumbrance: 1,
    price: { gold: 1, silver: 0, copper: 0 },
    availability: 'Common',
  },
  {
    name: 'Leather Leggings',
    locations: ['legs'],
    ap: 1,
    penalties: { stealth: 0, agility: 0 },
    encumbrance: 1,
    price: { gold: 0, silver: 10, copper: 0 },
    availability: 'Common',
  },
  {
    name: 'Leather Bracers',
    locations: ['arms'],
    ap: 1,
    penalties: { stealth: 0, agility: 0 },
    encumbrance: 0,
    price: { gold: 0, silver: 5, copper: 0 },
    availability: 'Common',
  },

  {
    name: 'Gambeson',
    locations: ['body'],
    ap: 1,
    penalties: { stealth: 0, agility: 0 },
    encumbrance: 1,
    price: { gold: 0, silver: 5, copper: 0 },
    availability: 'Common',
  },

  // Mail
  {
    name: 'Mail Coif',
    locations: ['head'],
    ap: 2,
    penalties: { stealth: -5, agility: 0 },
    encumbrance: 1,
    price: { gold: 2, silver: 0, copper: 0 },
    availability: 'Scarce',
  },
  {
    name: 'Mail Shirt',
    locations: ['body', 'arms'],
    ap: 2,
    penalties: { stealth: -10, agility: -5 },
    encumbrance: 3,
    price: { gold: 6, silver: 0, copper: 0 },
    availability: 'Scarce',
  },
  {
    name: 'Mail Chausses',
    locations: ['legs'],
    ap: 2,
    penalties: { stealth: -10, agility: -5 },
    encumbrance: 2,
    price: { gold: 4, silver: 0, copper: 0 },
    availability: 'Scarce',
  },
  {
    name: 'Mail Vambraces',
    locations: ['arms'],
    ap: 2,
    penalties: { stealth: -5, agility: 0 },
    encumbrance: 1,
    price: { gold: 3, silver: 0, copper: 0 },
    availability: 'Scarce',
  },

  // Plate
  {
    name: 'Plate Helm',
    locations: ['head'],
    ap: 3,
    penalties: { stealth: -10, agility: -5 },
    encumbrance: 2,
    price: { gold: 10, silver: 0, copper: 0 },
    availability: 'Rare',
  },
  {
    name: 'Plate Breastplate',
    locations: ['body'],
    ap: 3,
    penalties: { stealth: -20, agility: -10 },
    encumbrance: 4,
    price: { gold: 20, silver: 0, copper: 0 },
    availability: 'Rare',
  },
  {
    name: 'Plate Leggings',
    locations: ['legs'],
    ap: 3,
    penalties: { stealth: -15, agility: -10 },
    encumbrance: 3,
    price: { gold: 15, silver: 0, copper: 0 },
    availability: 'Rare',
  },
  {
    name: 'Plate Bracers',
    locations: ['arms'],
    ap: 3,
    penalties: { stealth: -10, agility: -5 },
    encumbrance: 2,
    price: { gold: 12, silver: 0, copper: 0 },
    availability: 'Rare',
  },

  // Shield
  {
    name: 'Shield',
    locations: ['body'],
    ap: 1,
    penalties: { stealth: 0, agility: 0 },
    encumbrance: 2,
    price: { gold: 1, silver: 0, copper: 0 },
    availability: 'Common',
  },
];

// ── EQUIPMENT ──────────────────────────────────────────────────
export const EQUIPMENT = [
  {
    name: 'Rope (10m)',
    type: 'tool',
    description: 'A sturdy hemp rope, useful for climbing, binding, or hauling.',
    price: { gold: 0, silver: 0, copper: 4 },
    availability: 'Common',
    encumbrance: 1,
  },
  {
    name: 'Torch',
    type: 'light',
    description: 'A simple wooden torch soaked in pitch. Burns for about one hour.',
    price: { gold: 0, silver: 0, copper: 1 },
    availability: 'Common',
    encumbrance: 0,
  },
  {
    name: 'Lantern',
    type: 'light',
    description: 'A hooded lantern with shutters. Requires oil to operate.',
    price: { gold: 0, silver: 5, copper: 0 },
    availability: 'Common',
    encumbrance: 1,
  },
  {
    name: 'Oil Flask',
    type: 'consumable',
    description: 'A flask of lamp oil, enough for four hours of lantern use.',
    price: { gold: 0, silver: 0, copper: 3 },
    availability: 'Common',
    encumbrance: 0,
  },
  {
    name: 'Healing Draught',
    type: 'medical',
    description: 'A herbal potion that restores 1d10 wounds when consumed.',
    price: { gold: 0, silver: 3, copper: 0 },
    availability: 'Common',
    encumbrance: 0,
  },
  {
    name: 'Antidote',
    type: 'medical',
    description: 'A small vial that neutralises common poisons if taken promptly.',
    price: { gold: 0, silver: 5, copper: 0 },
    availability: 'Scarce',
    encumbrance: 0,
  },
  {
    name: 'Lockpicks',
    type: 'tool',
    description: 'A set of fine metal picks for opening locks without a key.',
    price: { gold: 0, silver: 5, copper: 0 },
    availability: 'Scarce',
    encumbrance: 0,
  },
  {
    name: 'Grappling Hook',
    type: 'tool',
    description: 'A multi-pronged iron hook designed to be thrown and anchored.',
    price: { gold: 0, silver: 1, copper: 0 },
    availability: 'Common',
    encumbrance: 1,
  },
  {
    name: 'Backpack',
    type: 'container',
    description: 'A sturdy canvas pack worn on the back. Increases carrying capacity.',
    price: { gold: 0, silver: 2, copper: 0 },
    availability: 'Common',
    encumbrance: 0,
  },
  {
    name: 'Waterskin',
    type: 'travel',
    description: 'A leather skin that holds enough water for a day of travel.',
    price: { gold: 0, silver: 1, copper: 0 },
    availability: 'Common',
    encumbrance: 1,
  },
  {
    name: 'Rations (1 day)',
    type: 'consumable',
    description: 'Dried meat, hard cheese, and biscuit — enough for one day.',
    price: { gold: 0, silver: 0, copper: 5 },
    availability: 'Common',
    encumbrance: 0,
  },
  {
    name: 'Writing Kit',
    type: 'tool',
    description: 'Quill, ink, and parchment sheets for taking notes or writing letters.',
    price: { gold: 1, silver: 0, copper: 0 },
    availability: 'Common',
    encumbrance: 1,
  },
  {
    name: 'Map',
    type: 'misc',
    description: 'A regional map of varying quality and accuracy.',
    price: { gold: 5, silver: 0, copper: 0 },
    availability: 'Scarce',
    encumbrance: 0,
  },
  {
    name: 'Telescope',
    type: 'tool',
    description: 'A brass spyglass for seeing distant objects more clearly.',
    price: { gold: 3, silver: 0, copper: 0 },
    availability: 'Scarce',
    encumbrance: 1,
  },
  {
    name: 'Manacles',
    type: 'tool',
    description: 'Iron wrist restraints with a simple lock mechanism.',
    price: { gold: 0, silver: 5, copper: 0 },
    availability: 'Common',
    encumbrance: 1,
  },
  {
    name: 'Holy Symbol',
    type: 'misc',
    description: 'A blessed symbol of one of the gods of the Old World.',
    price: { gold: 1, silver: 0, copper: 0 },
    availability: 'Common',
    encumbrance: 0,
  },
  {
    name: 'Blanket',
    type: 'travel',
    description: 'A thick wool blanket for sleeping outdoors.',
    price: { gold: 0, silver: 3, copper: 0 },
    availability: 'Common',
    encumbrance: 1,
  },
  {
    name: 'Tent',
    type: 'travel',
    description: 'A two-person canvas tent with poles and stakes.',
    price: { gold: 2, silver: 0, copper: 0 },
    availability: 'Common',
    encumbrance: 3,
  },
  {
    name: 'Cooking Pot',
    type: 'travel',
    description: 'A cast iron pot suitable for cooking over a campfire.',
    price: { gold: 0, silver: 5, copper: 0 },
    availability: 'Common',
    encumbrance: 1,
  },
  {
    name: 'Disguise Kit',
    type: 'tool',
    description: 'A collection of wigs, makeup, and prosthetics for altering appearance.',
    price: { gold: 3, silver: 0, copper: 0 },
    availability: 'Scarce',
    encumbrance: 1,
  },
  {
    name: 'Crowbar',
    type: 'tool',
    description: 'A heavy iron bar for prying open doors, crates, and other sealed objects.',
    price: { gold: 0, silver: 2, copper: 0 },
    availability: 'Common',
    encumbrance: 1,
  },
];

// ── TRADE MATERIALS ────────────────────────────────────────────
export const TRADE_MATERIALS = [
  {
    name: 'Iron Ingot',
    category: 'metal',
    price: { gold: 0, silver: 5, copper: 0 },
    availability: 'Common',
  },
  {
    name: 'Steel Ingot',
    category: 'metal',
    price: { gold: 1, silver: 0, copper: 0 },
    availability: 'Scarce',
  },
  {
    name: 'Oak Timber',
    category: 'wood',
    price: { gold: 0, silver: 3, copper: 0 },
    availability: 'Common',
  },
  {
    name: 'Tanned Hide',
    category: 'leather',
    price: { gold: 0, silver: 5, copper: 0 },
    availability: 'Common',
  },
  {
    name: 'Fine Silk',
    category: 'cloth',
    price: { gold: 5, silver: 0, copper: 0 },
    availability: 'Rare',
  },
  {
    name: 'Linen Bolt',
    category: 'cloth',
    price: { gold: 0, silver: 8, copper: 0 },
    availability: 'Common',
  },
  {
    name: 'Healing Herbs',
    category: 'herb',
    price: { gold: 0, silver: 2, copper: 0 },
    availability: 'Common',
  },
  {
    name: 'Poison Herbs',
    category: 'herb',
    price: { gold: 0, silver: 5, copper: 0 },
    availability: 'Scarce',
  },
  {
    name: 'Ruby',
    category: 'gem',
    price: { gold: 50, silver: 0, copper: 0 },
    availability: 'Rare',
  },
  {
    name: 'Wyrdstone',
    category: 'gem',
    price: { gold: 100, silver: 0, copper: 0 },
    availability: 'Exotic',
  },
];

// ── UTILITY FUNCTIONS ──────────────────────────────────────────

/**
 * Convert a price object to total copper value.
 * 1 GC = 100 copper, 1 SS = 10 copper.
 */
function toCopper(price) {
  return (price.gold || 0) * 100 + (price.silver || 0) * 10 + (price.copper || 0);
}

/**
 * Convert a copper total back to a price object.
 */
function fromCopper(total) {
  const copper = Math.round(total);
  const gold = Math.floor(copper / 100);
  const silver = Math.floor((copper % 100) / 10);
  return { gold, silver, copper: copper % 10 };
}

/**
 * Calculate a haggled price based on success levels.
 * Positive SL = discount (buyer wins), negative SL = markup (seller wins).
 * Each SL = 10% change, capped at +/-50%.
 */
export function calculateHagglePrice(basePrice, sl) {
  const clampedSl = Math.max(-5, Math.min(5, sl));
  const multiplier = 1 - clampedSl * 0.1;
  const totalCopper = toCopper(basePrice);
  const adjusted = Math.max(1, Math.round(totalCopper * multiplier));
  return fromCopper(adjusted);
}

/**
 * Filter items by a category value.
 * @param {string} category - The category/group/type to filter by
 * @param {'weapons'|'armour'|'equipment'|'materials'} itemType - Which item list to search
 * @returns {Array} Matching items
 */
export function getItemsByCategory(category, itemType = 'weapons') {
  const lowerCategory = category.toLowerCase();

  switch (itemType) {
    case 'weapons':
      return WEAPONS.filter(
        (w) => w.category.toLowerCase() === lowerCategory || w.group.toLowerCase() === lowerCategory
      );
    case 'armour':
      return ARMOUR.filter(
        (a) =>
          a.locations.some((l) => l.toLowerCase() === lowerCategory) ||
          a.availability.toLowerCase() === lowerCategory
      );
    case 'equipment':
      return EQUIPMENT.filter((e) => e.type.toLowerCase() === lowerCategory);
    case 'materials':
      return TRADE_MATERIALS.filter((m) => m.category.toLowerCase() === lowerCategory);
    default:
      return [];
  }
}

/**
 * Check whether a money purse can cover a given price.
 * Both arguments are { gold, silver, copper }.
 */
export function canAfford(money, price) {
  return toCopper(money) >= toCopper(price);
}
