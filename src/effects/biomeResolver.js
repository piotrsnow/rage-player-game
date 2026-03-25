/**
 * Resolves biome type and builds a full scene configuration from game state.
 *
 * Uses location name keyword matching with fallback to narrative/imagePrompt text.
 */

import { BIOMES, timeOfDayFromHour, timeOfDayFromPeriod } from './sceneData';

/* ------------------------------------------------------------------ */
/*  Keyword dictionaries                                               */
/* ------------------------------------------------------------------ */

const BIOME_KEYWORDS = {
  tavern: [
    'tavern', 'inn', 'pub', 'bar', 'alehouse', 'taproom',
    'karczma', 'tawerna', 'gospoda', 'oberża',
  ],
  cave: [
    'cave', 'cavern', 'grotto', 'tunnel', 'mine', 'underground', 'crypt', 'catacomb', 'dungeon', 'sewer',
    'jaskinia', 'grota', 'tunel', 'kopalnia', 'podziemia', 'krypta', 'katakumby', 'loch', 'kanał',
  ],
  castle: [
    'castle', 'fortress', 'keep', 'citadel', 'palace', 'throne', 'stronghold', 'bastion', 'manor', 'hall',
    'zamek', 'twierdza', 'cytadela', 'pałac', 'tron', 'dworek', 'sala',
  ],
  forest: [
    'forest', 'wood', 'woods', 'grove', 'thicket', 'jungle', 'glade', 'copse', 'clearing',
    'las', 'bór', 'gaj', 'puszcza', 'polana', 'zagajnik',
  ],
  mountain: [
    'mountain', 'peak', 'summit', 'hill', 'cliff', 'ridge', 'crag', 'pass', 'highland',
    'góra', 'szczyt', 'wzgórze', 'klif', 'grzbiet', 'przełęcz', 'wyżyna',
  ],
  town: [
    'town', 'city', 'village', 'market', 'shop', 'street', 'square', 'district', 'quarter',
    'farm', 'hamlet', 'settlement', 'smithy', 'forge', 'guild',
    'miasto', 'wioska', 'targ', 'sklep', 'ulica', 'plac', 'dzielnica', 'rynek',
    'osada', 'chata', 'kuźnia', 'gildia',
  ],
  coast: [
    'coast', 'beach', 'shore', 'sea', 'ocean', 'port', 'harbor', 'harbour', 'dock', 'pier', 'lighthouse',
    'wybrzeże', 'plaża', 'brzeg', 'morze', 'ocean', 'port', 'przystań', 'dok', 'latarnia',
  ],
  swamp: [
    'swamp', 'marsh', 'bog', 'wetland', 'mire', 'fen',
    'bagno', 'mokradła', 'trzęsawisko', 'moczary',
  ],
  ruins: [
    'ruins', 'ruin', 'rubble', 'temple', 'shrine', 'tomb', 'mausoleum', 'abandoned', 'crumbling',
    'ruiny', 'ruina', 'świątynia', 'grobowiec', 'mauzoleum', 'opuszczony',
  ],
  camp: [
    'camp', 'campsite', 'bivouac', 'encampment',
    'obóz', 'obozowisko', 'biwak',
  ],
  road: [
    'road', 'path', 'trail', 'highway', 'bridge', 'crossroad', 'wagon',
    'droga', 'ścieżka', 'trakt', 'most', 'skrzyżowanie',
  ],
};

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/**
 * Infer biome key from text sources.
 * Checks locationName first, then narrative/imagePrompt as fallback.
 */
export function resolveBiome(locationName, narrative, imagePrompt) {
  const primary = (locationName || '').toLowerCase();
  const fallback = `${imagePrompt || ''} ${(narrative || '').substring(0, 300)}`.toLowerCase();

  for (const [biome, keywords] of Object.entries(BIOME_KEYWORDS)) {
    if (keywords.some((kw) => primary.includes(kw))) return biome;
  }
  for (const [biome, keywords] of Object.entries(BIOME_KEYWORDS)) {
    if (keywords.some((kw) => fallback.includes(kw))) return biome;
  }

  return 'field';
}

/**
 * Build a complete scene config object from game state + current scene.
 * This is the data contract consumed by SceneRenderer.setScene().
 */
export function resolveSceneConfig(state, scene) {
  const world = state?.world || {};
  const combat = state?.combat || null;
  const character = state?.character || {};
  const party = state?.party || [];

  const locationName = world.currentLocation || '';
  const narrative = scene?.narrative || '';
  const imagePrompt = scene?.imagePrompt || '';
  const atmosphere = scene?.atmosphere || {};

  const biomeKey = resolveBiome(locationName, narrative, imagePrompt);
  const biome = BIOMES[biomeKey] || BIOMES.field;

  const timeState = world.timeState || {};
  let timeOfDay;
  if (timeState.hour != null) {
    timeOfDay = timeOfDayFromHour(timeState.hour);
  } else {
    timeOfDay = timeOfDayFromPeriod(timeState.timeOfDay || timeState.period || 'day');
  }

  const weather = atmosphere.weather || world.weather?.type || 'clear';
  const mood = atmosphere.mood || 'mystical';
  const lighting = atmosphere.lighting || 'natural';

  const sceneNpcs = (world.npcs || [])
    .filter((n) => n.alive !== false)
    .slice(0, 8)
    .map((n) => ({
      name: n.name,
      role: inferNpcRole(n, combat),
      gender: n.gender,
      species: n.species,
    }));

  const combatData = combat?.active
    ? {
        active: true,
        combatants: (combat.combatants || []).map((c) => ({
          name: c.name,
          isEnemy: c.isEnemy ?? true,
          wounds: c.wounds ?? c.maxWounds,
          maxWounds: c.maxWounds ?? 10,
          isActive: c.name === (combat.combatants?.[combat.currentTurn]?.name),
        })),
        round: combat.round || 1,
      }
    : null;

  const playerCharacter = {
    name: character.name || 'Player',
    species: character.species || 'Human',
    career: character.career?.name || '',
    weapon: inferWeapon(character),
  };

  return {
    biomeKey,
    biome,
    timeOfDay,
    weather,
    mood,
    lighting,
    npcs: sceneNpcs,
    combat: combatData,
    playerCharacter,
    sceneId: scene?.id || '',
    locationName,
  };
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function inferNpcRole(npc, combat) {
  if (combat?.active) {
    const combatant = (combat.combatants || []).find(
      (c) => c.name?.toLowerCase() === npc.name?.toLowerCase()
    );
    if (combatant?.isEnemy) return 'enemy';
    if (combatant && !combatant.isEnemy) return 'ally';
  }
  if (npc.disposition != null) {
    if (npc.disposition >= 10) return 'ally';
    if (npc.disposition <= -10) return 'enemy';
  }
  return 'neutral';
}

function inferWeapon(character) {
  const inv = character.inventory || [];
  const names = inv.map((i) => (typeof i === 'string' ? i : i.name || '').toLowerCase());
  if (names.some((n) => n.includes('staff') || n.includes('laska') || n.includes('kostur'))) return 'staff';
  if (names.some((n) => n.includes('bow') || n.includes('łuk'))) return 'bow';
  if (names.some((n) => n.includes('sword') || n.includes('miecz') || n.includes('axe') || n.includes('topor'))) return 'sword';
  const hasArcane = (character.talents || []).some((t) =>
    (typeof t === 'string' ? t : t.name || '').toLowerCase().includes('arcane')
  );
  if (hasArcane) return 'staff';
  return null;
}
