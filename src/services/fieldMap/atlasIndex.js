let _atlas = null;
let _byId = null;
let _bySection = null;
let _byTag = null;

const BLOCKING_SECTIONS = new Set([
  'trees', 'rocks', 'buildings', 'walls', 'mountains', 'cities',
]);
const BLOCKING_TAGS = new Set(['blocking', 'wall', 'building', 'city']);
const LIQUID_SECTIONS = new Set(['liquids']);
const ROAD_SECTIONS = new Set(['roads', 'rails']);

export async function loadAtlas(url = '/fantasy_full_atlas.json') {
  if (_atlas) return _atlas;
  const res = await fetch(url);
  _atlas = await res.json();
  _buildIndices();
  return _atlas;
}

export function setAtlas(data) {
  _atlas = data;
  _buildIndices();
}

function _buildIndices() {
  _byId = new Map();
  _bySection = new Map();
  _byTag = new Map();

  if (!_atlas?.sections) return;

  for (const [section, tiles] of Object.entries(_atlas.sections)) {
    if (!_bySection.has(section)) _bySection.set(section, []);
    for (const tile of tiles) {
      const entry = {
        ...tile,
        section,
        passable: !BLOCKING_SECTIONS.has(section) && !(tile.tags || []).some((t) => BLOCKING_TAGS.has(t)),
        liquid: LIQUID_SECTIONS.has(section),
        road: ROAD_SECTIONS.has(section),
      };
      _byId.set(tile.id, entry);
      _bySection.get(section).push(entry);
      for (const tag of tile.tags || []) {
        if (!_byTag.has(tag)) _byTag.set(tag, []);
        _byTag.get(tag).push(entry);
      }
    }
  }
}

export function getTileById(id) {
  return _byId?.get(id) || null;
}

export function getTilesBySection(section) {
  return _bySection?.get(section) || [];
}

export function getTilesByTag(tag) {
  return _byTag?.get(tag) || [];
}

export function isPassable(tileId) {
  const entry = _byId?.get(tileId);
  return entry ? entry.passable : true;
}

export function isLiquid(tileId) {
  const entry = _byId?.get(tileId);
  return entry ? entry.liquid : false;
}

export function isRoad(tileId) {
  const entry = _byId?.get(tileId);
  return entry ? entry.road : false;
}

export function getMeta() {
  return _atlas?.meta || null;
}

export function getAllSections() {
  return _bySection ? [..._bySection.keys()] : [];
}
