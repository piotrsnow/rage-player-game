const LOCATION_TYPE_PHRASES = {
  generic: 'fantasy location',
  hamlet: 'tiny hamlet with a few houses',
  village: 'small village',
  town: 'medieval town',
  city: 'large walled city',
  capital: 'grand capital city with towers and walls',
  dungeon: 'dungeon entrance or dangerous underground site',
  forest: 'dense forest',
  wilderness: 'untamed wilderness',
  mountain: 'rocky mountain or highland',
  ruin: 'crumbling ancient ruin',
  camp: 'makeshift camp or encampment',
  cave: 'underground cave entrance or cavern',
  interior: 'building interior',
  dungeon_room: 'dark dungeon chamber',
  campaignPlace: 'notable landmark',
  region: 'large region overview',
  area: 'distinct area',
  district: 'town district or quarter',
  site: 'specific site or point of interest',
  room: 'single room interior',
  point: 'small point of interest',
  abstract: 'abstract concept marker',
};

const DANGER_PHRASES = {
  safe: null,
  moderate: 'somewhat ominous',
  dangerous: 'dangerous and hostile',
  deadly: 'deadly and terrifying',
};

const MAX_DESCRIPTION_CHARS = 250;
const MAX_TOTAL_CHARS = 600;

function clamp(text, max) {
  if (!text) return '';
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return trimmed.slice(0, max - 1) + '…';
}

/**
 * Builds a full PixelLab `description` for a location-graph sprite.
 * Always includes node identity (name + type); merges optional user hint
 * and DB metadata into a single coherent prompt.
 */
export function buildPixelSpriteDescription(loc, userHint) {
  const parts = ['top-down pixel art RPG map icon'];

  // Subject — name is always the primary focus
  if (loc.name) {
    parts.push(`of "${loc.name}"`);
  }

  // Type phrase
  const typePhrase = LOCATION_TYPE_PHRASES[loc.locationType] || LOCATION_TYPE_PHRASES.generic;
  parts.push(`— ${typePhrase}`);

  // Danger level coloring
  const dangerPhrase = DANGER_PHRASES[loc.dangerLevel];
  if (dangerPhrase) {
    parts.push(`(${dangerPhrase})`);
  }

  // DB description (clamped)
  const desc = clamp(loc.description, MAX_DESCRIPTION_CHARS);
  if (desc) {
    parts.push(`. ${desc}`);
  }

  // Atmosphere
  if (loc.atmosphere?.trim()) {
    parts.push(`. Atmosphere: ${loc.atmosphere.trim()}`);
  }

  // Biome
  if (loc.biome?.trim()) {
    parts.push(`. Biome: ${loc.biome.trim()}`);
  }

  // Tags (array from JSON column)
  const tags = Array.isArray(loc.tags) ? loc.tags.filter(Boolean) : [];
  if (tags.length > 0) {
    parts.push(`. Tags: ${tags.slice(0, 5).join(', ')}`);
  }

  // Style suffix (always)
  parts.push('. Fantasy style, transparent background');

  // User hint — appended as additional artist direction
  const hint = userHint?.trim();
  if (hint) {
    parts.push(`. Additional details: ${hint}`);
  }

  let result = parts.join(' ');

  // Hard budget — truncate from the end if the assembled prompt is too long
  if (result.length > MAX_TOTAL_CHARS) {
    result = result.slice(0, MAX_TOTAL_CHARS - 1) + '…';
  }

  return result;
}
