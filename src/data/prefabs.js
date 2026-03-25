/**
 * Prefab library: maps archetype keys to built-in primitive geometry descriptions.
 * The 3D renderer uses these when no Meshy-generated or cached GLB is available.
 *
 * geometry: 'capsule' | 'box' | 'cylinder' | 'sphere' | 'cone' | 'plane'
 * color: hex string
 * scale: [x, y, z]
 * yOffset: vertical offset from anchor Y (default 0)
 */

export const CHARACTER_PREFABS = {
  human_male:           { geometry: 'capsule', color: '#8B7355', scale: [0.35, 0.85, 0.35], yOffset: 0.85, label: 'Human' },
  human_female:         { geometry: 'capsule', color: '#A0826D', scale: [0.3, 0.8, 0.3],   yOffset: 0.8,  label: 'Human' },
  human_male_warrior:   { geometry: 'capsule', color: '#6B4226', scale: [0.4, 0.9, 0.4],   yOffset: 0.9,  label: 'Warrior' },
  human_female_warrior: { geometry: 'capsule', color: '#7B5236', scale: [0.35, 0.85, 0.35], yOffset: 0.85, label: 'Warrior' },
  human_male_stout:     { geometry: 'capsule', color: '#8B6914', scale: [0.45, 0.8, 0.45],  yOffset: 0.8,  label: 'Stout Human' },
  human_male_mage:      { geometry: 'capsule', color: '#4A3B8C', scale: [0.3, 0.9, 0.3],   yOffset: 0.9,  label: 'Mage' },
  human_female_mage:    { geometry: 'capsule', color: '#5B4B9C', scale: [0.28, 0.85, 0.28], yOffset: 0.85, label: 'Mage' },
  human_male_rogue:     { geometry: 'capsule', color: '#3D3D3D', scale: [0.3, 0.85, 0.3],  yOffset: 0.85, label: 'Rogue' },
  human_female_rogue:   { geometry: 'capsule', color: '#4D4D4D', scale: [0.28, 0.8, 0.28], yOffset: 0.8,  label: 'Rogue' },
  human_male_noble:     { geometry: 'capsule', color: '#8B0000', scale: [0.35, 0.9, 0.35], yOffset: 0.9,  label: 'Noble' },
  human_female_noble:   { geometry: 'capsule', color: '#A52A2A', scale: [0.3, 0.85, 0.3],  yOffset: 0.85, label: 'Noble' },
  human_male_merchant:  { geometry: 'capsule', color: '#DAA520', scale: [0.4, 0.85, 0.4],  yOffset: 0.85, label: 'Merchant' },
  human_male_priest:    { geometry: 'capsule', color: '#F5F5DC', scale: [0.32, 0.9, 0.32], yOffset: 0.9,  label: 'Priest' },

  dwarf_male:           { geometry: 'capsule', color: '#8B4513', scale: [0.4, 0.6, 0.4],   yOffset: 0.6,  label: 'Dwarf' },
  dwarf_female:         { geometry: 'capsule', color: '#A0522D', scale: [0.38, 0.58, 0.38], yOffset: 0.58, label: 'Dwarf' },
  dwarf_male_warrior:   { geometry: 'capsule', color: '#696969', scale: [0.45, 0.65, 0.45], yOffset: 0.65, label: 'Dwarf Warrior' },

  elf_male:             { geometry: 'capsule', color: '#90EE90', scale: [0.28, 0.95, 0.28], yOffset: 0.95, label: 'Elf' },
  elf_female:           { geometry: 'capsule', color: '#98FB98', scale: [0.26, 0.9, 0.26],  yOffset: 0.9,  label: 'Elf' },
  elf_male_mage:        { geometry: 'capsule', color: '#4682B4', scale: [0.28, 0.95, 0.28], yOffset: 0.95, label: 'Elf Mage' },

  halfling_male:        { geometry: 'capsule', color: '#DEB887', scale: [0.28, 0.5, 0.28],  yOffset: 0.5,  label: 'Halfling' },
  halfling_female:      { geometry: 'capsule', color: '#F5DEB3', scale: [0.26, 0.48, 0.26], yOffset: 0.48, label: 'Halfling' },

  ogre:                 { geometry: 'capsule', color: '#556B2F', scale: [0.6, 1.2, 0.6],   yOffset: 1.2,  label: 'Ogre' },
  troll:                { geometry: 'capsule', color: '#2E8B57', scale: [0.55, 1.1, 0.55],  yOffset: 1.1,  label: 'Troll' },
  goblin:               { geometry: 'capsule', color: '#6B8E23', scale: [0.25, 0.5, 0.25],  yOffset: 0.5,  label: 'Goblin' },
  orc:                  { geometry: 'capsule', color: '#4B5320', scale: [0.45, 0.85, 0.45], yOffset: 0.85, label: 'Orc' },
  skeleton:             { geometry: 'capsule', color: '#FFFFF0', scale: [0.3, 0.85, 0.3],  yOffset: 0.85, label: 'Skeleton' },
  zombie:               { geometry: 'capsule', color: '#708090', scale: [0.35, 0.8, 0.35], yOffset: 0.8,  label: 'Zombie' },
  wolf:                 { geometry: 'capsule', color: '#696969', scale: [0.35, 0.45, 0.5],  yOffset: 0.35, label: 'Wolf' },
  horse:                { geometry: 'capsule', color: '#8B4513', scale: [0.4, 0.7, 0.7],   yOffset: 0.7,  label: 'Horse' },
  rat_giant:            { geometry: 'capsule', color: '#4A3728', scale: [0.2, 0.25, 0.3],   yOffset: 0.2,  label: 'Giant Rat' },

  generic_npc:          { geometry: 'capsule', color: '#808080', scale: [0.35, 0.85, 0.35], yOffset: 0.85, label: 'NPC' },
  generic_enemy:        { geometry: 'capsule', color: '#8B0000', scale: [0.38, 0.88, 0.38], yOffset: 0.88, label: 'Enemy' },
};

export const OBJECT_PREFABS = {
  table:                { geometry: 'box',      color: '#8B6914', scale: [1.5, 0.75, 1],    yOffset: 0.375 },
  table_round:          { geometry: 'cylinder', color: '#8B6914', scale: [0.7, 0.75, 0.7],  yOffset: 0.375 },
  chair:                { geometry: 'box',      color: '#A0522D', scale: [0.4, 0.8, 0.4],   yOffset: 0.4 },
  bench:                { geometry: 'box',      color: '#A0522D', scale: [1.2, 0.45, 0.35], yOffset: 0.225 },
  stool:                { geometry: 'cylinder', color: '#A0522D', scale: [0.25, 0.5, 0.25], yOffset: 0.25 },
  bed:                  { geometry: 'box',      color: '#DEB887', scale: [1, 0.5, 2],       yOffset: 0.25 },
  chest:                { geometry: 'box',      color: '#6B4226', scale: [0.8, 0.5, 0.5],   yOffset: 0.25 },
  barrel:               { geometry: 'cylinder', color: '#8B6914', scale: [0.35, 0.6, 0.35], yOffset: 0.3 },
  crate:                { geometry: 'box',      color: '#8B7355', scale: [0.5, 0.5, 0.5],   yOffset: 0.25 },
  bookshelf:            { geometry: 'box',      color: '#654321', scale: [1.2, 1.8, 0.3],   yOffset: 0.9 },
  fireplace:            { geometry: 'box',      color: '#696969', scale: [1.5, 1.2, 0.5],   yOffset: 0.6 },
  cauldron:             { geometry: 'sphere',   color: '#2F4F4F', scale: [0.4, 0.35, 0.4],  yOffset: 0.2 },
  anvil:                { geometry: 'box',      color: '#404040', scale: [0.5, 0.5, 0.3],   yOffset: 0.25 },
  altar:                { geometry: 'box',      color: '#808080', scale: [1.2, 0.9, 0.6],   yOffset: 0.45 },
  pillar:               { geometry: 'cylinder', color: '#A9A9A9', scale: [0.3, 3, 0.3],     yOffset: 1.5 },
  statue:               { geometry: 'cylinder', color: '#C0C0C0', scale: [0.35, 1.8, 0.35], yOffset: 0.9 },
  well:                 { geometry: 'cylinder', color: '#696969', scale: [0.6, 0.7, 0.6],   yOffset: 0.35 },
  fountain:             { geometry: 'cylinder', color: '#B0C4DE', scale: [0.8, 0.6, 0.8],   yOffset: 0.3 },
  signpost:             { geometry: 'cylinder', color: '#8B7355', scale: [0.08, 1.8, 0.08], yOffset: 0.9 },
  cart:                 { geometry: 'box',      color: '#8B7355', scale: [1.2, 0.6, 2],     yOffset: 0.3 },
  campfire:             { geometry: 'cone',     color: '#FF4500', scale: [0.3, 0.4, 0.3],   yOffset: 0.2 },
  torch:                { geometry: 'cylinder', color: '#FF8C00', scale: [0.05, 0.5, 0.05], yOffset: 0.25 },
  door:                 { geometry: 'box',      color: '#654321', scale: [0.8, 1.8, 0.1],   yOffset: 0.9 },
  gate:                 { geometry: 'box',      color: '#404040', scale: [2, 2.5, 0.15],    yOffset: 1.25 },
  ladder:               { geometry: 'box',      color: '#8B7355', scale: [0.5, 2.5, 0.05],  yOffset: 1.25 },
  rock_small:           { geometry: 'sphere',   color: '#808080', scale: [0.3, 0.25, 0.35], yOffset: 0.12 },
  rock_large:           { geometry: 'sphere',   color: '#696969', scale: [0.8, 0.6, 0.9],   yOffset: 0.3 },
  tree:                 { geometry: 'cone',     color: '#228B22', scale: [1, 2.5, 1],       yOffset: 1.25 },
  bush:                 { geometry: 'sphere',   color: '#2E8B57', scale: [0.6, 0.5, 0.6],   yOffset: 0.25 },
  mushroom:             { geometry: 'sphere',   color: '#FF6347', scale: [0.15, 0.2, 0.15], yOffset: 0.1 },
  fence:                { geometry: 'box',      color: '#8B7355', scale: [2, 0.8, 0.08],    yOffset: 0.4 },
  banner:               { geometry: 'box',      color: '#8B0000', scale: [0.6, 1.5, 0.02],  yOffset: 0.75 },
  rug:                  { geometry: 'box',      color: '#800020', scale: [2, 0.02, 3],      yOffset: 0.01 },

  weapon_sword:         { geometry: 'box',      color: '#C0C0C0', scale: [0.05, 0.8, 0.12], yOffset: 0.05 },
  weapon_axe:           { geometry: 'box',      color: '#808080', scale: [0.08, 0.7, 0.2],  yOffset: 0.05 },
  weapon_staff:         { geometry: 'cylinder', color: '#8B7355', scale: [0.04, 1.5, 0.04], yOffset: 0.05 },
  weapon_bow:           { geometry: 'box',      color: '#8B6914', scale: [0.05, 1, 0.3],    yOffset: 0.05 },
  shield:               { geometry: 'box',      color: '#696969', scale: [0.5, 0.6, 0.05],  yOffset: 0.05 },
  potion:               { geometry: 'cylinder', color: '#9932CC', scale: [0.08, 0.15, 0.08], yOffset: 0.05 },
  scroll:               { geometry: 'cylinder', color: '#F5DEB3', scale: [0.06, 0.2, 0.06], yOffset: 0.05 },
  coin_pile:            { geometry: 'cylinder', color: '#FFD700', scale: [0.2, 0.05, 0.2],  yOffset: 0.025 },
  gem:                  { geometry: 'sphere',   color: '#00CED1', scale: [0.08, 0.08, 0.08], yOffset: 0.04 },
  key:                  { geometry: 'box',      color: '#B8860B', scale: [0.04, 0.12, 0.02], yOffset: 0.02 },
  lantern:              { geometry: 'box',      color: '#FFD700', scale: [0.12, 0.2, 0.12], yOffset: 0.1 },
  bag:                  { geometry: 'sphere',   color: '#8B7355', scale: [0.2, 0.25, 0.2],  yOffset: 0.12 },
  skull:                { geometry: 'sphere',   color: '#FFFFF0', scale: [0.15, 0.18, 0.15], yOffset: 0.09 },
};

const CAREER_TO_ARCHETYPE = {
  warrior:      'warrior',
  soldier:      'warrior',
  knight:       'warrior',
  guard:        'warrior',
  mercenary:    'warrior',
  pit_fighter:  'warrior',
  slayer:       'warrior',
  wizard:       'mage',
  mage:         'mage',
  witch:        'mage',
  sorcerer:     'mage',
  priest:       'priest',
  initiate:     'priest',
  thief:        'rogue',
  rogue:        'rogue',
  ranger:       'rogue',
  assassin:     'rogue',
  scout:        'rogue',
  noble:        'noble',
  merchant:     'merchant',
  trader:       'merchant',
  burgher:      'merchant',
};

/**
 * Derive a character archetype key from species, career, and gender.
 * @param {string} [species='human']
 * @param {string} [career='']
 * @param {string} [gender='male']
 * @returns {string}
 */
export function resolveCharacterArchetype(species = 'human', career = '', gender = 'male') {
  const sp = (species || 'human').toLowerCase().split(/[\s(]/)[0];
  const gn = (gender || 'male').toLowerCase().includes('female') ? 'female' : 'male';
  const careerLower = (career || '').toLowerCase().replace(/[^a-z_]/g, '_');
  const role = CAREER_TO_ARCHETYPE[careerLower] || '';

  const key = role ? `${sp}_${gn}_${role}` : `${sp}_${gn}`;
  if (CHARACTER_PREFABS[key]) return key;

  const speciesOnly = `${sp}_${gn}`;
  if (CHARACTER_PREFABS[speciesOnly]) return speciesOnly;

  const speciesAny = `${sp}_male`;
  if (CHARACTER_PREFABS[speciesAny]) return speciesAny;

  return 'generic_npc';
}

/**
 * @param {string} archetype
 * @returns {typeof CHARACTER_PREFABS[string] | null}
 */
export function getCharacterPrefab(archetype) {
  return CHARACTER_PREFABS[archetype] || CHARACTER_PREFABS.generic_npc;
}

/**
 * @param {string} objectType
 * @returns {typeof OBJECT_PREFABS[string] | null}
 */
export function getObjectPrefab(objectType) {
  return OBJECT_PREFABS[objectType] || null;
}

/**
 * Try to match a loose object description to a known prefab key.
 * @param {string} description
 * @returns {string}
 */
export function matchObjectType(description) {
  if (!description) return 'crate';
  const d = description.toLowerCase();

  const keywords = [
    ['sword', 'weapon_sword'], ['axe', 'weapon_axe'], ['staff', 'weapon_staff'],
    ['bow', 'weapon_bow'], ['shield', 'shield'], ['potion', 'potion'],
    ['scroll', 'scroll'], ['coin', 'coin_pile'], ['gem', 'gem'], ['key', 'key'],
    ['lantern', 'lantern'], ['skull', 'skull'], ['bag', 'bag'],
    ['table', 'table'], ['chair', 'chair'], ['bench', 'bench'], ['stool', 'stool'],
    ['bed', 'bed'], ['chest', 'chest'], ['barrel', 'barrel'], ['crate', 'crate'],
    ['book', 'bookshelf'], ['fire', 'campfire'], ['torch', 'torch'],
    ['door', 'door'], ['gate', 'gate'], ['well', 'well'], ['fountain', 'fountain'],
    ['cart', 'cart'], ['sign', 'signpost'], ['rock', 'rock_large'],
    ['tree', 'tree'], ['bush', 'bush'], ['fence', 'fence'],
    ['banner', 'banner'], ['rug', 'rug'], ['carpet', 'rug'],
    ['cauldron', 'cauldron'], ['anvil', 'anvil'], ['altar', 'altar'],
    ['pillar', 'pillar'], ['column', 'pillar'], ['statue', 'statue'],
    ['ladder', 'ladder'], ['mushroom', 'mushroom'],
  ];

  for (const [keyword, type] of keywords) {
    if (d.includes(keyword)) return type;
  }

  return 'crate';
}
