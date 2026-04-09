/**
 * RPGon crafting recipes.
 * All use the 'Rzemioslo' skill (Inteligencja attribute).
 * Difficulty uses named levels matching DIFFICULTY_THRESHOLDS.
 *
 * Note: Apothecary recipes (Healing Draught, Antidote) moved to alchemy.js.
 */

export const CRAFTING_RECIPES = [
  {
    name: 'Forge Hand Weapon',
    requiredSkill: 'Rzemioslo',
    requiredMaterials: [
      { name: 'Iron ingot', quantity: 2 },
      { name: 'Charcoal', quantity: 3 },
      { name: 'Leather wrap', quantity: 1 },
    ],
    resultItem: { name: 'Hand Weapon', type: 'weapon', rarity: 'common' },
    difficulty: 'hard',
    time: 16,
    description: 'Heat, hammer, and temper a serviceable blade or head on a haft.',
  },
  {
    name: 'Forge Mail Shirt',
    requiredSkill: 'Rzemioslo',
    requiredMaterials: [
      { name: 'Iron wire rings (bulk)', quantity: 1 },
      { name: 'Rivets', quantity: 1 },
      { name: 'Leather edging', quantity: 1 },
    ],
    resultItem: { name: 'Mail Shirt', type: 'armor', rarity: 'uncommon' },
    difficulty: 'veryHard',
    time: 120,
    description: 'Thousands of riveted rings; weeks of labour for a skilled armourer.',
  },
  {
    name: 'Forge Breastplate',
    requiredSkill: 'Rzemioslo',
    requiredMaterials: [
      { name: 'Steel plate blank', quantity: 1 },
      { name: 'Padding and straps', quantity: 1 },
    ],
    resultItem: { name: 'Breastplate', type: 'armor', rarity: 'uncommon' },
    difficulty: 'hard',
    time: 40,
    description: 'Dishing and planishing steel to fit the torso.',
  },
  {
    name: 'Fletch Arrow Bundle',
    requiredSkill: 'Rzemioslo',
    requiredMaterials: [
      { name: 'Arrow shafts', quantity: 10 },
      { name: 'Feather fletchings', quantity: 30 },
      { name: 'Arrowheads', quantity: 10 },
      { name: 'Glue and thread', quantity: 1 },
    ],
    resultItem: { name: 'Arrows (10)', type: 'ammunition', rarity: 'common' },
    difficulty: 'medium',
    time: 4,
    description: 'Straighten shafts, bind heads, fletch and seal.',
  },
  {
    name: 'Build Short Bow',
    requiredSkill: 'Rzemioslo',
    requiredMaterials: [
      { name: 'Seasoned yew stave', quantity: 1 },
      { name: 'Hemp bowstring', quantity: 1 },
      { name: 'Beeswax', quantity: 1 },
    ],
    resultItem: { name: 'Short Bow', type: 'weapon', rarity: 'common' },
    difficulty: 'hard',
    time: 24,
    description: 'Tiller the stave till the draw is even and safe.',
  },
  {
    name: 'Assemble Crossbow',
    requiredSkill: 'Rzemioslo',
    requiredMaterials: [
      { name: 'Steel prod', quantity: 1 },
      { name: 'Walnut stock', quantity: 1 },
      { name: 'Brass trigger mechanism', quantity: 1 },
      { name: 'Cord and spaniel', quantity: 1 },
    ],
    resultItem: { name: 'Crossbow', type: 'weapon', rarity: 'uncommon' },
    difficulty: 'veryHard',
    time: 48,
    description: 'Fit prod to stock; tune the nut and sear.',
  },
  {
    name: 'Tailor Leather Jerkin',
    requiredSkill: 'Rzemioslo',
    requiredMaterials: [
      { name: 'Cured leather hides', quantity: 2 },
      { name: 'Wax thread', quantity: 1 },
      { name: 'Brass buckles', quantity: 1 },
    ],
    resultItem: { name: 'Leather Jerkin', type: 'armor', rarity: 'common' },
    difficulty: 'medium',
    time: 20,
    description: 'Cut, oil, and stitch overlapping plates for mobility.',
  },
  {
    name: 'Sew Mail Liner',
    requiredSkill: 'Rzemioslo',
    requiredMaterials: [
      { name: 'Quilted linen layers', quantity: 3 },
      { name: 'Wool padding', quantity: 2 },
    ],
    resultItem: { name: 'Gambeson', type: 'armor', rarity: 'common' },
    difficulty: 'medium',
    time: 16,
    description: 'Thick aketon to wear beneath mail or alone.',
  },
  {
    name: 'Carpenter Travel Chest',
    requiredSkill: 'Rzemioslo',
    requiredMaterials: [
      { name: 'Oak planks', quantity: 4 },
      { name: 'Iron hinges and hasp', quantity: 1 },
    ],
    resultItem: { name: 'Travel Chest', type: 'tool', rarity: 'common' },
    difficulty: 'medium',
    time: 12,
    description: 'Dovetail corners; iron-bound for travel.',
  },
  {
    name: 'Chandler Lantern',
    requiredSkill: 'Rzemioslo',
    requiredMaterials: [
      { name: 'Tin sheets', quantity: 1 },
      { name: 'Glass pane', quantity: 1 },
      { name: 'Wire guard', quantity: 1 },
    ],
    resultItem: { name: 'Lantern', type: 'tool', rarity: 'common' },
    difficulty: 'medium',
    time: 6,
    description: 'Hooded reflector and shutter for directed light.',
  },
  {
    name: 'Tanner Waterskin',
    requiredSkill: 'Rzemioslo',
    requiredMaterials: [
      { name: 'Cured goat hide', quantity: 1 },
      { name: 'Beeswax seal', quantity: 1 },
    ],
    resultItem: { name: 'Waterskin', type: 'tool', rarity: 'common' },
    difficulty: 'medium',
    time: 4,
    description: 'Seamed bladder, waxed against leakage.',
  },
  {
    name: 'Jeweller Signet Ring',
    requiredSkill: 'Rzemioslo',
    requiredMaterials: [
      { name: 'Silver blank', quantity: 1 },
      { name: 'Engraving tools (use)', quantity: 1 },
    ],
    resultItem: { name: 'Signet Ring', type: 'ring', rarity: 'uncommon' },
    difficulty: 'hard',
    time: 8,
    description: 'Cut intaglio for sealing wax.',
  },
];
