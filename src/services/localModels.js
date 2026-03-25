const NPC_MODELS = [
  'npc_alchemist.glb',
  'npc_coca_lizard.glb',
  'npc_goblin_woman.glb',
  'npc_golem.glb',
  'npc_hyena.glb',
  'npc_metal_skeleton.glb',
  'npc_skeleton.glb',
  'npc_sorcerer.glb',
  'npc_sorceress.glb',
  'npc_sucub.glb',
];

const OBJECT_MODELS = [
  'animal_bird_1.glb',
  'animal_goat.glb',
  'animal_walking_shark_1.glb',
  'barell_1.glb',
  'book_1.glb',
  'chair_1.glb',
  'elixir_1.glb',
  'tree_1.glb',
  'tree_3.glb',
  'tree_4.glb',
  'wall_1.glb',
];

const BASE_PATH = '/3dmodels/';

/** Deterministic hash from a string to a positive integer. */
function hashCode(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/** @type {Map<string, string>} entity id -> assigned model path */
const assignmentCache = new Map();

/**
 * Pick a local GLB model path for a given entity.
 * Characters/NPCs get models from the npc_ pool, objects from the rest.
 *
 * @param {string} entityId - Unique id of the character or object
 * @param {'character'|'object'} kind
 * @returns {string} Public URL path to the GLB file
 */
export function getLocalModel(entityId, kind) {
  const cacheKey = `${kind}:${entityId}`;
  if (assignmentCache.has(cacheKey)) return assignmentCache.get(cacheKey);

  const pool = kind === 'character' ? NPC_MODELS : OBJECT_MODELS;
  const index = hashCode(entityId) % pool.length;
  const path = BASE_PATH + pool[index];

  assignmentCache.set(cacheKey, path);
  return path;
}

export function clearModelAssignments() {
  assignmentCache.clear();
}
