/**
 * RPGon crafting & alchemy materials catalog.
 * Every material referenced in crafting.js and alchemy.js recipes MUST exist here with a price.
 */

export const MATERIALS = [
  // ── Metals ──
  { name: 'Iron ingot', category: 'metal', price: { gold: 0, silver: 3, copper: 0 }, availability: 'common', weight: 2 },
  { name: 'Steel plate blank', category: 'metal', price: { gold: 1, silver: 0, copper: 0 }, availability: 'uncommon', weight: 3 },
  { name: 'Iron wire rings (bulk)', category: 'metal', price: { gold: 0, silver: 8, copper: 0 }, availability: 'uncommon', weight: 4 },
  { name: 'Rivets', category: 'metal', price: { gold: 0, silver: 0, copper: 5 }, availability: 'common', weight: 0.3 },
  { name: 'Steel prod', category: 'metal', price: { gold: 0, silver: 6, copper: 0 }, availability: 'uncommon', weight: 1.5 },
  { name: 'Iron hinges and hasp', category: 'metal', price: { gold: 0, silver: 1, copper: 0 }, availability: 'common', weight: 0.5 },
  { name: 'Tin sheets', category: 'metal', price: { gold: 0, silver: 0, copper: 8 }, availability: 'common', weight: 0.5 },
  { name: 'Silver blank', category: 'metal', price: { gold: 0, silver: 5, copper: 0 }, availability: 'uncommon', weight: 0.5 },
  { name: 'Arrowheads', category: 'metal', price: { gold: 0, silver: 0, copper: 5 }, availability: 'common', weight: 0.3 },
  { name: 'Brass buckles', category: 'metal', price: { gold: 0, silver: 0, copper: 4 }, availability: 'common', weight: 0.2 },
  { name: 'Brass trigger mechanism', category: 'metal', price: { gold: 0, silver: 3, copper: 0 }, availability: 'uncommon', weight: 0.3 },
  { name: 'Wire guard', category: 'metal', price: { gold: 0, silver: 0, copper: 3 }, availability: 'common', weight: 0.1 },
  { name: 'Engraving tools (use)', category: 'metal', price: { gold: 0, silver: 2, copper: 0 }, availability: 'uncommon', weight: 0.5 },

  // ── Wood ──
  { name: 'Seasoned yew stave', category: 'wood', price: { gold: 0, silver: 2, copper: 0 }, availability: 'common', weight: 1 },
  { name: 'Oak planks', category: 'wood', price: { gold: 0, silver: 1, copper: 0 }, availability: 'common', weight: 2 },
  { name: 'Arrow shafts', category: 'wood', price: { gold: 0, silver: 0, copper: 3 }, availability: 'common', weight: 0.5 },
  { name: 'Walnut stock', category: 'wood', price: { gold: 0, silver: 2, copper: 5 }, availability: 'uncommon', weight: 1 },

  // ── Fabric & Leather ──
  { name: 'Cured leather hides', category: 'fabric', price: { gold: 0, silver: 2, copper: 0 }, availability: 'common', weight: 1.5 },
  { name: 'Leather wrap', category: 'fabric', price: { gold: 0, silver: 0, copper: 5 }, availability: 'common', weight: 0.2 },
  { name: 'Leather edging', category: 'fabric', price: { gold: 0, silver: 0, copper: 4 }, availability: 'common', weight: 0.2 },
  { name: 'Quilted linen layers', category: 'fabric', price: { gold: 0, silver: 1, copper: 5 }, availability: 'common', weight: 1 },
  { name: 'Wool padding', category: 'fabric', price: { gold: 0, silver: 0, copper: 8 }, availability: 'common', weight: 0.8 },
  { name: 'Wax thread', category: 'fabric', price: { gold: 0, silver: 0, copper: 2 }, availability: 'common', weight: 0.1 },
  { name: 'Padding and straps', category: 'fabric', price: { gold: 0, silver: 1, copper: 0 }, availability: 'common', weight: 0.5 },
  { name: 'Cured goat hide', category: 'fabric', price: { gold: 0, silver: 1, copper: 0 }, availability: 'common', weight: 0.8 },
  { name: 'Hemp bowstring', category: 'fabric', price: { gold: 0, silver: 0, copper: 3 }, availability: 'common', weight: 0.05 },
  { name: 'Cord and spaniel', category: 'fabric', price: { gold: 0, silver: 0, copper: 5 }, availability: 'common', weight: 0.1 },

  // ── Herbs (alchemy) ──
  { name: 'Moonwort', category: 'herb', price: { gold: 0, silver: 0, copper: 5 }, availability: 'common', weight: 0.1 },
  { name: 'Milk thistle', category: 'herb', price: { gold: 0, silver: 0, copper: 3 }, availability: 'common', weight: 0.1 },
  { name: 'Nightshade', category: 'herb', price: { gold: 0, silver: 1, copper: 0 }, availability: 'uncommon', weight: 0.1 },
  { name: 'Wolfsbane', category: 'herb', price: { gold: 0, silver: 1, copper: 5 }, availability: 'uncommon', weight: 0.1 },
  { name: 'Firethorn berries', category: 'herb', price: { gold: 0, silver: 0, copper: 8 }, availability: 'common', weight: 0.1 },
  { name: 'Ghostcap mushroom', category: 'herb', price: { gold: 0, silver: 2, copper: 0 }, availability: 'rare', weight: 0.1 },
  { name: 'Ironroot bark', category: 'herb', price: { gold: 0, silver: 0, copper: 6 }, availability: 'common', weight: 0.2 },
  { name: 'Starbloom petals', category: 'herb', price: { gold: 0, silver: 3, copper: 0 }, availability: 'rare', weight: 0.05 },
  { name: 'Feverfew', category: 'herb', price: { gold: 0, silver: 0, copper: 4 }, availability: 'common', weight: 0.1 },
  { name: 'Dragonweed', category: 'herb', price: { gold: 0, silver: 2, copper: 5 }, availability: 'rare', weight: 0.1 },
  { name: 'Marsh moss', category: 'herb', price: { gold: 0, silver: 0, copper: 2 }, availability: 'common', weight: 0.1 },

  // ── Liquids & Chemicals ──
  { name: 'Spirit base', category: 'liquid', price: { gold: 0, silver: 1, copper: 0 }, availability: 'common', weight: 0.5 },
  { name: 'Vinegar tincture', category: 'liquid', price: { gold: 0, silver: 0, copper: 5 }, availability: 'common', weight: 0.3 },
  { name: 'Honey', category: 'liquid', price: { gold: 0, silver: 0, copper: 8 }, availability: 'common', weight: 0.3 },
  { name: 'Distilled water', category: 'liquid', price: { gold: 0, silver: 0, copper: 2 }, availability: 'common', weight: 0.4 },
  { name: 'Quicksilver', category: 'liquid', price: { gold: 0, silver: 4, copper: 0 }, availability: 'rare', weight: 0.3 },
  { name: 'Mineral oil', category: 'liquid', price: { gold: 0, silver: 0, copper: 6 }, availability: 'common', weight: 0.4 },
  { name: 'Sulphur powder', category: 'liquid', price: { gold: 0, silver: 1, copper: 0 }, availability: 'uncommon', weight: 0.2 },

  // ── Misc ──
  { name: 'Charcoal', category: 'misc', price: { gold: 0, silver: 0, copper: 2 }, availability: 'common', weight: 0.5 },
  { name: 'Beeswax', category: 'misc', price: { gold: 0, silver: 0, copper: 3 }, availability: 'common', weight: 0.2 },
  { name: 'Beeswax seal', category: 'misc', price: { gold: 0, silver: 0, copper: 3 }, availability: 'common', weight: 0.1 },
  { name: 'Feather fletchings', category: 'misc', price: { gold: 0, silver: 0, copper: 1 }, availability: 'common', weight: 0.1 },
  { name: 'Glue and thread', category: 'misc', price: { gold: 0, silver: 0, copper: 2 }, availability: 'common', weight: 0.1 },
  { name: 'Glass pane', category: 'misc', price: { gold: 0, silver: 0, copper: 8 }, availability: 'common', weight: 0.3 },
  { name: 'Activated charcoal', category: 'misc', price: { gold: 0, silver: 0, copper: 4 }, availability: 'common', weight: 0.2 },
  { name: 'Empty vials', category: 'misc', price: { gold: 0, silver: 0, copper: 3 }, availability: 'common', weight: 0.1 },
  { name: 'Mortar and pestle (use)', category: 'misc', price: { gold: 0, silver: 2, copper: 0 }, availability: 'common', weight: 1 },
  { name: 'Alembic (use)', category: 'misc', price: { gold: 0, silver: 5, copper: 0 }, availability: 'uncommon', weight: 2 },
];

/** Map material categories to shop archetypes that sell them. */
export const MATERIAL_CATEGORIES_BY_ARCHETYPE = {
  blacksmith: ['metal', 'misc'],
  apothecary: ['herb', 'liquid', 'misc'],
  herbalist: ['herb', 'liquid'],
  merchant: ['misc', 'fabric', 'wood'],
  tailor: ['fabric'],
  general: ['misc', 'wood'],
};
