// Old World geography for WFRP — normalized map coords (0–1), Empire & neighbours.

/** @typedef {'province' | 'kingdom' | 'wasteland'} RegionType */
/** @typedef {'metropolis' | 'city' | 'town' | 'village' | 'hamlet'} PopulationTier */

/**
 * Major regions. `name` keys cities and encounter modifiers.
 * @type {Array<{ name: string, type: RegionType, description: string, climate: string, dangerLevel: number }>}
 */
export const OLD_WORLD_REGIONS = [
  {
    name: 'Reikland',
    type: 'province',
    description: 'Heartland of the Empire: fertile river valleys, the Reik, and the court at Altdorf.',
    climate: 'Temperate; wet winters, mild summers',
    dangerLevel: 2,
  },
  {
    name: 'Middenland',
    type: 'province',
    description: 'Forested north-central Empire dominated by Middenheim and the cult of Ulric.',
    climate: 'Cold winters; heavy snow on the Fauschlag',
    dangerLevel: 3,
  },
  {
    name: 'Nordland',
    type: 'province',
    description: 'Coastal north threatened by Norscan raids, sea mist, and garrison towns.',
    climate: 'Cool maritime; storms and long nights',
    dangerLevel: 3,
  },
  {
    name: 'Ostland',
    type: 'province',
    description: 'Eastern marches facing the Forest of Shadows and Chaos incursions.',
    climate: 'Harsh continental; bitter winters',
    dangerLevel: 4,
  },
  {
    name: 'Ostermark',
    type: 'province',
    description: 'Open steppe and border forts toward Kislev and the dark east.',
    climate: 'Windy plains; cold, dry spells',
    dangerLevel: 4,
  },
  {
    name: 'Talabecland',
    type: 'province',
    description: 'Great Forests and the Talabec; Talabheim stands as a proud bulwark.',
    climate: 'Continental; humid woodlands',
    dangerLevel: 3,
  },
  {
    name: 'Stirland',
    type: 'province',
    description: 'Hills, vineyards, and the winding Stir; Wurtbad and rural nobility.',
    climate: 'Mild hills; fog in the vales',
    dangerLevel: 2,
  },
  {
    name: 'Averland',
    type: 'province',
    description: 'Southern pastures and trade roads toward the Border Princes.',
    climate: 'Warm summers; dry river gorges',
    dangerLevel: 3,
  },
  {
    name: 'Wissenland',
    type: 'province',
    description: 'Blackpowder forges and foundries; Nuln’s smoke stains the sky.',
    climate: 'Industrial haze; hot forges, cold winters',
    dangerLevel: 3,
  },
  {
    name: 'Hochland',
    type: 'province',
    description: 'High moors and mountain approaches between Middenland and Ostland.',
    climate: 'Alpine edge; sudden storms',
    dangerLevel: 3,
  },
  {
    name: 'The Moot',
    type: 'province',
    description: 'Halfling farmland between the Reik and Aver; bucolic and deceptively quiet.',
    climate: 'Mild; long growing seasons',
    dangerLevel: 2,
  },
  {
    name: 'The Wasteland',
    type: 'kingdom',
    description: 'Marienburg and the marshy delta — richest city in the Old World, outside the Emperor’s direct rule.',
    climate: 'Wet lowlands; sea fog and brine',
    dangerLevel: 3,
  },
  {
    name: 'Sylvania',
    type: 'wasteland',
    description: 'Cursed hills ruled by the von Carsteins’ legacy; the dead do not rest.',
    climate: 'Still air; endless gloom',
    dangerLevel: 5,
  },
  {
    name: 'Drakwald',
    type: 'wasteland',
    description: 'Broken forest and beast-herds between Middenland and Nordland.',
    climate: 'Damp forest; oppressive canopy',
    dangerLevel: 4,
  },
  {
    name: 'Border Princes',
    type: 'wasteland',
    description: 'Petty kings, orc tribes, and ruins — no law but the sword.',
    climate: 'Dry scrub and rocky passes',
    dangerLevel: 5,
  },
  {
    name: 'Kislev',
    type: 'kingdom',
    description: 'Ice-queen’s realm and the bulwark against the northern Chaos wastes.',
    climate: 'Arctic wind; ice and short summers',
    dangerLevel: 4,
  },
];

/**
 * Key settlements. x/y are normalized 0–1 (x west→east, y north→south).
 * `factions` use IDs from `FACTION_DEFINITIONS` in wfrpFactions.js where possible.
 * @type {Array<{ name: string, region: string, x: number, y: number, population: PopulationTier, description: string, factions: string[], services: string[] }>}
 */
export const OLD_WORLD_CITIES = [
  {
    name: 'Altdorf',
    region: 'Reikland',
    x: 0.42,
    y: 0.52,
    population: 'metropolis',
    description: 'Imperial capital on the Reik; Colleges of Magic, the Emperor, and endless intrigue.',
    factions: ['noble_houses', 'temple_sigmar', 'wizards_college', 'military', 'merchants_guild', 'witch_hunters', 'thieves_guild'],
    services: ['temple', 'market', 'blacksmith', 'tavern', 'healer'],
  },
  {
    name: 'Middenheim',
    region: 'Middenland',
    x: 0.38,
    y: 0.22,
    population: 'metropolis',
    description: 'City of the White Wolf atop the Fauschlag; northern pride and wolf-priests.',
    factions: ['military', 'noble_houses', 'temple_sigmar', 'merchants_guild', 'peasant_folk', 'witch_hunters'],
    services: ['temple', 'market', 'blacksmith', 'tavern', 'healer'],
  },
  {
    name: 'Nuln',
    region: 'Wissenland',
    x: 0.48,
    y: 0.68,
    population: 'metropolis',
    description: 'Blackpowder capital — cannons, forges, and river trade on the Upper Reik.',
    factions: ['noble_houses', 'military', 'merchants_guild', 'temple_sigmar', 'peasant_folk'],
    services: ['market', 'blacksmith', 'tavern', 'healer'],
  },
  {
    name: 'Talabheim',
    region: 'Talabecland',
    x: 0.58,
    y: 0.42,
    population: 'metropolis',
    description: 'Crater-city of the Great Forest; old bloodlines and vigilant watch.',
    factions: ['noble_houses', 'military', 'temple_sigmar', 'merchants_guild', 'witch_hunters'],
    services: ['temple', 'market', 'blacksmith', 'tavern', 'healer'],
  },
  {
    name: 'Marienburg',
    region: 'The Wasteland',
    x: 0.12,
    y: 0.45,
    population: 'metropolis',
    description: 'Merchant-prince harbour at the Reik’s mouth; gold, spies, and sea-trade.',
    factions: ['merchants_guild', 'noble_houses', 'thieves_guild', 'temple_sigmar', 'temple_morr'],
    services: ['market', 'tavern', 'temple', 'blacksmith', 'healer'],
  },
  {
    name: 'Kislev',
    region: 'Kislev',
    x: 0.72,
    y: 0.12,
    population: 'metropolis',
    description: 'Crown of the Tzarina — ice-magic, winged lancers, and the war against the north.',
    factions: ['military', 'noble_houses', 'merchants_guild', 'peasant_folk'],
    services: ['temple', 'market', 'blacksmith', 'tavern', 'healer'],
  },
  {
    name: 'Averheim',
    region: 'Averland',
    x: 0.52,
    y: 0.78,
    population: 'city',
    description: 'Blacktusk capital on the Aver; cavalry traditions and southern ambition.',
    factions: ['noble_houses', 'military', 'temple_sigmar', 'merchants_guild'],
    services: ['temple', 'market', 'tavern', 'blacksmith', 'healer'],
  },
  {
    name: 'Ubersreik',
    region: 'Reikland',
    x: 0.35,
    y: 0.62,
    population: 'city',
    description: 'Grey Lady Pass hub; rival guilds, dwarf trade, and pressure from the vaults below.',
    factions: ['merchants_guild', 'military', 'noble_houses', 'thieves_guild', 'peasant_folk'],
    services: ['market', 'tavern', 'blacksmith', 'temple', 'healer'],
  },
  {
    name: 'Bogenhafen',
    region: 'Reikland',
    x: 0.4,
    y: 0.48,
    population: 'town',
    description: 'Busy Reik port town; grain barges and rumours from upriver.',
    factions: ['merchants_guild', 'peasant_folk', 'temple_sigmar', 'witch_hunters'],
    services: ['market', 'tavern', 'temple', 'blacksmith'],
  },
  {
    name: 'Helmgart',
    region: 'Reikland',
    x: 0.28,
    y: 0.55,
    population: 'town',
    description: 'Fortified pass town toward Bretonnia; tolls, patrols, and smugglers’ trails.',
    factions: ['military', 'merchants_guild', 'temple_sigmar'],
    services: ['tavern', 'market', 'blacksmith', 'healer'],
  },
  {
    name: 'Wurtbad',
    region: 'Stirland',
    x: 0.62,
    y: 0.58,
    population: 'city',
    description: 'Spa city of the Stir; nobles take the waters while cults whisper in the steam.',
    factions: ['noble_houses', 'temple_sigmar', 'merchants_guild', 'chaos_cults', 'witch_hunters'],
    services: ['healer', 'temple', 'tavern', 'market'],
  },
  {
    name: 'Salzenmund',
    region: 'Nordland',
    x: 0.35,
    y: 0.18,
    population: 'city',
    description: 'Salt and herring on a stormy coast; barons eye the sea and the raiders.',
    factions: ['merchants_guild', 'military', 'noble_houses', 'peasant_folk'],
    services: ['market', 'tavern', 'blacksmith', 'temple'],
  },
  {
    name: 'Mordheim',
    region: 'Ostland',
    x: 0.55,
    y: 0.48,
    population: 'hamlet',
    description: 'The City of the Damned — wyrdstone, mutants, and treasure-hunters in the ruins.',
    factions: ['chaos_cults', 'thieves_guild', 'witch_hunters', 'merchants_guild'],
    services: ['tavern', 'market'],
  },
];

/**
 * Major travel legs between named cities (undirected; use helpers for either direction).
 * @type {Array<{ from: string, to: string, distance: number, terrain: string, dangerLevel: number }>}
 */
export const TRAVEL_ROUTES = [
  { from: 'Marienburg', to: 'Altdorf', distance: 12, terrain: 'river_road', dangerLevel: 2 },
  { from: 'Marienburg', to: 'Helmgart', distance: 8, terrain: 'coast_road', dangerLevel: 2 },
  { from: 'Helmgart', to: 'Altdorf', distance: 10, terrain: 'hills_road', dangerLevel: 2 },
  { from: 'Altdorf', to: 'Bogenhafen', distance: 3, terrain: 'river_road', dangerLevel: 1 },
  { from: 'Bogenhafen', to: 'Ubersreik', distance: 4, terrain: 'river_road', dangerLevel: 2 },
  { from: 'Ubersreik', to: 'Nuln', distance: 6, terrain: 'mountain_pass', dangerLevel: 3 },
  { from: 'Altdorf', to: 'Nuln', distance: 8, terrain: 'river_road', dangerLevel: 2 },
  { from: 'Altdorf', to: 'Middenheim', distance: 9, terrain: 'forest_road', dangerLevel: 3 },
  { from: 'Middenheim', to: 'Salzenmund', distance: 5, terrain: 'forest_road', dangerLevel: 3 },
  { from: 'Middenheim', to: 'Talabheim', distance: 7, terrain: 'forest_road', dangerLevel: 3 },
  { from: 'Talabheim', to: 'Mordheim', distance: 4, terrain: 'forest_track', dangerLevel: 5 },
  { from: 'Talabheim', to: 'Wurtbad', distance: 5, terrain: 'forest_road', dangerLevel: 3 },
  { from: 'Nuln', to: 'Averheim', distance: 5, terrain: 'river_road', dangerLevel: 2 },
  { from: 'Nuln', to: 'Wurtbad', distance: 6, terrain: 'road', dangerLevel: 2 },
  { from: 'Averheim', to: 'Wurtbad', distance: 7, terrain: 'hills_road', dangerLevel: 2 },
  { from: 'Talabheim', to: 'Kislev', distance: 14, terrain: 'steppe_road', dangerLevel: 4 },
  { from: 'Middenheim', to: 'Kislev', distance: 16, terrain: 'north_road', dangerLevel: 4 },
];

/**
 * How each named region biases wilderness encounters (see ENCOUNTER_TABLES keys in encounterTables.js).
 * `frequencyMultiplier` scales how often a non-empty encounter triggers (1 = baseline).
 * `dangerLevelModifier` adds to route or narrative danger when crossing the region.
 * @type {Record<string, { defaultEncounterTable: string, frequencyMultiplier: number, dangerLevelModifier: number, notes: string }>}
 */
export const REGION_ENCOUNTER_MODIFIERS = {
  Reikland: {
    defaultEncounterTable: 'road',
    frequencyMultiplier: 0.9,
    dangerLevelModifier: 0,
    notes: 'Patrolled Reik roads; more bandits near rivers, fewer deep-forest beasts.',
  },
  Middenland: {
    defaultEncounterTable: 'forest',
    frequencyMultiplier: 1.1,
    dangerLevelModifier: 1,
    notes: 'Deep forest and wolf-runs; beastmen trails near the Drakwald edge.',
  },
  Nordland: {
    defaultEncounterTable: 'road',
    frequencyMultiplier: 1.15,
    dangerLevelModifier: 1,
    notes: 'Raiders, sea-wrack, and desperate coastal brigands.',
  },
  Ostland: {
    defaultEncounterTable: 'forest',
    frequencyMultiplier: 1.25,
    dangerLevelModifier: 2,
    notes: 'Shadowy woods and Chaos-touched warbands; Mordheim’s curse bleeds outward.',
  },
  Ostermark: {
    defaultEncounterTable: 'road',
    frequencyMultiplier: 1.2,
    dangerLevelModifier: 2,
    notes: 'Open ground favours mounted raiders and refugee convoys turned predatory.',
  },
  Talabecland: {
    defaultEncounterTable: 'forest',
    frequencyMultiplier: 1.1,
    dangerLevelModifier: 1,
    notes: 'Great Forest ambushes; goblin paths between old druid groves.',
  },
  Stirland: {
    defaultEncounterTable: 'road',
    frequencyMultiplier: 1.0,
    dangerLevelModifier: 1,
    notes: 'Hill roads and Sylvanian mist on the eastern marches.',
  },
  Averland: {
    defaultEncounterTable: 'road',
    frequencyMultiplier: 1.05,
    dangerLevelModifier: 1,
    notes: 'Goblin hills and Border Princes spillover on southern tracks.',
  },
  Wissenland: {
    defaultEncounterTable: 'road',
    frequencyMultiplier: 1.0,
    dangerLevelModifier: 1,
    notes: 'Busy forges mean escorted convoys — but deserters and press-gangs prowl.',
  },
  Hochland: {
    defaultEncounterTable: 'forest',
    frequencyMultiplier: 1.15,
    dangerLevelModifier: 1,
    notes: 'High moors and sudden mountain weather hide beastherds.',
  },
  'The Moot': {
    defaultEncounterTable: 'road',
    frequencyMultiplier: 0.85,
    dangerLevelModifier: 0,
    notes: 'Halfling lanes are safer by day — don’t underestimate hungry ghouls by night.',
  },
  'The Wasteland': {
    defaultEncounterTable: 'swamp',
    frequencyMultiplier: 1.1,
    dangerLevelModifier: 1,
    notes: 'Marsh tracks, smugglers, and things washed in from the sea.',
  },
  Sylvania: {
    defaultEncounterTable: 'dungeon',
    frequencyMultiplier: 1.4,
    dangerLevelModifier: 3,
    notes: 'Undead-heavy bias; treat travel as haunted moor and barrow country.',
  },
  Drakwald: {
    defaultEncounterTable: 'forest',
    frequencyMultiplier: 1.35,
    dangerLevelModifier: 2,
    notes: 'Beastmen heartland; few safe camps.',
  },
  'Border Princes': {
    defaultEncounterTable: 'road',
    frequencyMultiplier: 1.3,
    dangerLevelModifier: 3,
    notes: 'Orc warbands and human reavers; “road” is generous.',
  },
  Kislev: {
    defaultEncounterTable: 'road',
    frequencyMultiplier: 1.2,
    dangerLevelModifier: 2,
    notes: 'Wolf-riders, ice-goblins, and Chaos war parties south of the oblast.',
  },
};

function normalizeCityName(name) {
  if (name == null || typeof name !== 'string') return '';
  return name.trim().toLowerCase();
}

const CITY_BY_NORMALIZED_NAME = Object.fromEntries(
  OLD_WORLD_CITIES.map((c) => [normalizeCityName(c.name), c]),
);

/**
 * @param {string} name
 * @returns {typeof OLD_WORLD_CITIES[0] | undefined}
 */
export function getCityByName(name) {
  return CITY_BY_NORMALIZED_NAME[normalizeCityName(name)];
}

/**
 * @param {string} region
 * @returns {typeof OLD_WORLD_CITIES}
 */
export function getCitiesInRegion(region) {
  if (!region) return [];
  const r = region.trim();
  return OLD_WORLD_CITIES.filter((c) => c.region === r);
}

/**
 * Direct routes between two cities (either direction).
 * @param {string} cityA
 * @param {string} cityB
 * @returns {Array<{ from: string, to: string, distance: number, terrain: string, dangerLevel: number }>}
 */
export function getRoutesBetween(cityA, cityB) {
  const a = normalizeCityName(cityA);
  const b = normalizeCityName(cityB);
  if (!a || !b || a === b) return [];
  const canon = (n) => getCityByName(n)?.name || n;
  const nameA = canon(cityA);
  const nameB = canon(cityB);
  return TRAVEL_ROUTES.filter(
    (route) =>
      (route.from === nameA && route.to === nameB) ||
      (route.from === nameB && route.to === nameA),
  );
}

/**
 * Nearest defined city by Euclidean distance in normalized coordinate space.
 * @param {number} x
 * @param {number} y
 * @returns {typeof OLD_WORLD_CITIES[0] | null}
 */
export function getNearestCity(x, y) {
  const nx = Number(x);
  const ny = Number(y);
  if (!Number.isFinite(nx) || !Number.isFinite(ny)) return null;
  let best = null;
  let bestD = Infinity;
  for (const city of OLD_WORLD_CITIES) {
    const dx = city.x - nx;
    const dy = city.y - ny;
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = city;
    }
  }
  return best;
}
