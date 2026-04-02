const BIOME_GROUND = {
  plains:  { ground: ['ground_pebbles_light', 'ground_pebbles_tan', 'ground_pebbles_green'], accent: ['grass_tuft_green', 'flowers_pink', 'flowers_blue'] },
  forest:  { ground: ['ground_pebbles_brown', 'ground_pebbles_dark', 'ground_pebbles_green'], accent: ['grass_tuft_green', 'grass_tall_blue', 'bush_green_round'] },
  swamp:   { ground: ['ground_pebbles_teal', 'ground_pebbles_cyan', 'ground_vines_green'], accent: ['reeds_gold', 'grass_dark_blue', 'flowers_teal'] },
  desert:  { ground: ['ground_pebbles_tan', 'ground_pebbles_red', 'ground_pebbles_light'], accent: ['dry_grass_sparse', 'dry_brush_beige', 'cactus_tall'] },
  snow:    { ground: ['ground_bricks_ice', 'ground_pebbles_light', 'ground_hex_white'], accent: ['tree_round_snow', 'bush_snow', 'twigs_scattered'] },
  ruins:   { ground: ['ground_bricks_dark', 'ground_bricks_purple', 'ground_bricks_mixed'], accent: ['twigs_scattered', 'bush_dry_twigs', 'rock_gray'] },
  mountain:{ ground: ['ground_pebbles_dark', 'ground_pebbles_brown', 'ground_pebbles_purple'], accent: ['rock_gray', 'rock_brown', 'bush_rocks_brown'] },
};

const BIOME_TREES = {
  plains:  ['tree_round_green', 'tree_wide_green', 'tree_round_autumn_gold'],
  forest:  ['tree_round_green', 'tree_wide_green', 'tree_tall_blue_cypress', 'tree_double_blue_cypress', 'tree_wide_autumn_red'],
  swamp:   ['tree_dead_small', 'tree_dead_willow', 'tree_dead_willow_large', 'tree_dead_branching'],
  desert:  ['cactus_tall', 'cactus_branching', 'tree_palm_small', 'tree_palm_cluster'],
  snow:    ['tree_round_snow', 'tree_wide_snow'],
  ruins:   ['tree_dead_tall', 'tree_dead_branching_tall', 'tree_dead_small'],
  mountain:['tree_tall_blue_cypress', 'tree_round_green'],
};

const BIOME_WATER = {
  plains: 'water_blue',
  forest: 'water_teal',
  swamp:  'water_murky',
  desert: 'water_brown',
  snow:   'water_blue_bright',
  ruins:  'slime_purple',
  mountain: 'water_blue',
};

const BIOME_BUILDINGS = {
  plains:  ['house_red_roof', 'house_gray_roof', 'house_green_roof'],
  forest:  ['house_hay_roof', 'house_green_roof'],
  swamp:   ['house_dark_roof'],
  desert:  ['house_hay_roof', 'house_gold_roof'],
  snow:    ['house_snow_small', 'house_white_mountain'],
  ruins:   ['fortress_dark', 'tower_dark', 'obelisk'],
  mountain:['house_blue_stone', 'tower_round', 'chapel_small'],
};

const BIOME_PROPS = {
  plains:  ['campfire_small', 'well_dark', 'sign_post', 'bag_sack'],
  forest:  ['campfire_small', 'campfire_large', 'bench', 'plant_potted'],
  swamp:   ['skull_small', 'bone_pile', 'ritual_circle_gold'],
  desert:  ['bones_scattered', 'shrine_red', 'pit_dark'],
  snow:    ['firepit_coals', 'sign_post', 'banner_blue'],
  ruins:   ['portal_blue', 'shrine_red', 'skull_small', 'chest_gold'],
  mountain:['campfire_small', 'sign_post', 'ladder'],
};

const BIOME_MOUNTAINS = {
  plains: [],
  forest: [],
  swamp:  [],
  desert: ['mountain_gold'],
  snow:   ['mountain_snow', 'mountain_blue'],
  ruins:  [],
  mountain: ['mountain_green', 'mountain_navy', 'mountain_blue', 'mountain_pink'],
};

const BIOME_FARMS = {
  plains:  ['field_green_fenced', 'field_gold_fenced', 'field_pink_fenced'],
  forest:  ['field_green_open', 'field_brown_open'],
  swamp:   [],
  desert:  ['field_brown_fenced'],
  snow:    ['field_ice_fenced'],
  ruins:   [],
  mountain:[],
};

export function getBiomeGround(biome) {
  return BIOME_GROUND[biome] || BIOME_GROUND.plains;
}

export function getBiomeTrees(biome) {
  return BIOME_TREES[biome] || BIOME_TREES.plains;
}

export function getBiomeWater(biome) {
  return BIOME_WATER[biome] || BIOME_WATER.plains;
}

export function getBiomeBuildings(biome) {
  return BIOME_BUILDINGS[biome] || BIOME_BUILDINGS.plains;
}

export function getBiomeProps(biome) {
  return BIOME_PROPS[biome] || BIOME_PROPS.plains;
}

export function getBiomeMountains(biome) {
  return BIOME_MOUNTAINS[biome] || [];
}

export function getBiomeFarms(biome) {
  return BIOME_FARMS[biome] || [];
}

export const ALL_BIOMES = Object.keys(BIOME_GROUND);

const MAP_MODE_PROFILES = {
  pola: {
    biome: 'plains',
    treeDensity: 0.04,
    waterChance: 0.3,
    buildingChance: 0.2,
    farmChance: 0.45,
    roadChance: 0.25,
    propDensity: 6,
    mountainChance: 0,
  },
  las: {
    biome: 'forest',
    treeDensity: 0.28,
    waterChance: 0.2,
    buildingChance: 0.08,
    farmChance: 0,
    roadChance: 0.15,
    propDensity: 5,
    mountainChance: 0,
  },
  trakt: {
    pola: {
      biome: 'plains',
      treeDensity: 0.03,
      waterChance: 0.15,
      buildingChance: 0.15,
      farmChance: 0.35,
      roadChance: 1.0,
      propDensity: 8,
      mountainChance: 0,
    },
    las: {
      biome: 'forest',
      treeDensity: 0.22,
      waterChance: 0.1,
      buildingChance: 0.05,
      farmChance: 0,
      roadChance: 1.0,
      propDensity: 4,
      mountainChance: 0,
    },
    miasto: {
      biome: 'plains',
      treeDensity: 0.01,
      waterChance: 0.05,
      buildingChance: 0.55,
      farmChance: 0,
      roadChance: 1.0,
      propDensity: 12,
      mountainChance: 0,
      cityTiles: true,
    },
  },
  wnetrze: {
    biome: 'ruins',
    treeDensity: 0,
    waterChance: 0,
    buildingChance: 0,
    farmChance: 0,
    roadChance: 0,
    propDensity: 10,
    mountainChance: 0,
    interior: true,
  },
};

const INTERIOR_FLOOR = ['ground_bricks_dark', 'ground_bricks_mixed', 'ground_bricks_purple', 'ground_bricks_dark2'];
const INTERIOR_FLOOR_ACCENT = ['rug_round_red', 'ground_bricks_blue'];
const INTERIOR_PROPS = [
  'campfire_small', 'candles', 'table_stone', 'bookshelf_blue', 'shelf_wood',
  'bench', 'chest_gold', 'chest_dark', 'bag_sack', 'barrel', 'plant_potted',
  'banner_red', 'wardrobe_wood', 'bookshelf_tall', 'bookshelf_short',
  'rug_round_red', 'signboard',
];
const CITY_PROPS = [
  'sign_post', 'well_dark', 'bench', 'banner_red', 'banner_blue',
  'signboard', 'signboard_double', 'plant_potted', 'campfire_small',
  'sign_small', 'bag_sack',
];

export function getMapModeProfile(mapMode, roadVariant) {
  if (mapMode === 'trakt') {
    return MAP_MODE_PROFILES.trakt[roadVariant] || MAP_MODE_PROFILES.trakt.pola;
  }
  return MAP_MODE_PROFILES[mapMode] || MAP_MODE_PROFILES.pola;
}

export function getInteriorFloor() { return INTERIOR_FLOOR; }
export function getInteriorFloorAccent() { return INTERIOR_FLOOR_ACCENT; }
export function getInteriorProps() { return INTERIOR_PROPS; }
export function getCityProps() { return CITY_PROPS; }

const LANDMARKS = [
  'shrine_red', 'portal_blue', 'well_dark', 'campfire_large',
  'obelisk', 'chapel_small', 'tower_round', 'bonfire',
  'ritual_circle_gold', 'cross_stone',
];

const BREADCRUMBS = [
  'sign_post', 'sign_small', 'signboard', 'torch',
];

export function getLandmarks() { return LANDMARKS; }
export function getBreadcrumbs() { return BREADCRUMBS; }

export function getRoadTile(neighbors) {
  const { n, s, e, w } = neighbors;
  const count = [n, s, e, w].filter(Boolean).length;
  if (count === 4) return 'road_cross';
  if (count === 3) {
    if (!n) return 'road_t_down';
    if (!s) return 'road_t_up';
    if (!w) return 'road_t_right';
    return 'road_t_left';
  }
  if (count === 2) {
    if (n && s) return 'road_vertical';
    if (e && w) return 'road_horizontal';
    if (s && e) return 'road_turn_dr';
    if (s && w) return 'road_turn_dl';
    if (n && e) return 'road_turn_ur';
    return 'road_turn_ul';
  }
  if (n || s) return 'road_vertical';
  return 'road_horizontal';
}

export function getWallTile(neighbors) {
  const { n, s, e, w } = neighbors;
  if (n && s) return 'wall_vertical';
  if (e && w) return 'wall_top';
  if (!n && s) return 'wall_vertical';
  if (n && !s) return 'wall_cap_bottom';
  if (s && e) return 'wall_corner_tl';
  if (s && w) return 'wall_corner_tr';
  if (n && e) return 'wall_corner_bl';
  if (n && w) return 'wall_corner_br';
  return 'wall_vertical';
}
