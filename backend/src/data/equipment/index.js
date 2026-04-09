/**
 * RPGon equipment — barrel re-exports.
 * All game data imports should point here:
 *   import { WEAPONS, ARMOUR, ... } from '../data/equipment/index.js';
 */

export { MELEE_RANGE, BATTLEFIELD_MAX, DEFAULT_MOVEMENT, MANOEUVRES, HIT_LOCATIONS } from './combatConstants.js';
export { WEAPONS } from './weapons.js';
export { ARMOUR, SHIELDS } from './armour.js';
export {
  BESTIARY, BESTIARY_LOCATIONS, BESTIARY_DIFFICULTIES, BESTIARY_RACES,
  DIFFICULTY_VARIANCE, THREAT_COSTS,
  findClosestBestiaryEntry, searchBestiary, selectBestiaryEncounter,
  applyAttributeVariance, getBestiaryLocationSummary,
} from './bestiary.js';
export { EQUIPMENT, EQUIPMENT_CATEGORIES, AVAILABILITY_MODIFIERS } from './equipment.js';
export { CRAFTING_RECIPES } from './crafting.js';
export { ALCHEMY_RECIPES } from './alchemy.js';
export { MATERIALS, MATERIAL_CATEGORIES_BY_ARCHETYPE } from './materials.js';
export { normalizeCoins, priceToCopper, calculatePrice, formatCoinPrice } from './pricing.js';
export { formatWeaponCatalog, getEquipmentByCategory, formatEquipmentForPrompt, formatBaseTypeCatalog } from './formatters.js';

// --- BaseType resolver ---

import { WEAPONS } from './weapons.js';
import { ARMOUR, SHIELDS } from './armour.js';
import { EQUIPMENT } from './equipment.js';

/**
 * Resolve a baseType ID to full equipment + combat data.
 * @param {string} baseTypeId - e.g. 'dagger', 'leather_jack', 'buckler'
 * @returns {{ ...equipmentEntry, combat: object|null, combatSource: 'weapon'|'armour'|'shield'|null } | null}
 */
export function resolveBaseType(baseTypeId) {
  const entry = EQUIPMENT[baseTypeId];
  if (!entry) return null;

  const result = { id: baseTypeId, ...entry, combat: null, combatSource: null };

  if (entry.combatKey) {
    if (WEAPONS[entry.combatKey]) {
      result.combat = WEAPONS[entry.combatKey];
      result.combatSource = 'weapon';
    } else if (ARMOUR[entry.combatKey]) {
      result.combat = ARMOUR[entry.combatKey];
      result.combatSource = 'armour';
    } else if (SHIELDS[entry.combatKey]) {
      result.combat = SHIELDS[entry.combatKey];
      result.combatSource = 'shield';
    }
  }

  return result;
}

/**
 * Get all valid baseType IDs grouped by category for AI context.
 * Excludes non-inventoriable categories (lodging, services).
 */
export function getValidBaseTypes() {
  const exclude = new Set(['lodging', 'services']);
  const result = {};
  for (const [id, entry] of Object.entries(EQUIPMENT)) {
    if (exclude.has(entry.category)) continue;
    const cat = entry.category;
    if (!result[cat]) result[cat] = [];
    result[cat].push({ id, name: entry.name, combatKey: entry.combatKey || null });
  }
  return result;
}

/**
 * Build a precomputed index of all baseTypes with resolved combat data.
 * Used by the /game-data/equipment API endpoint.
 */
export function buildBaseTypeIndex() {
  const index = {};
  for (const id of Object.keys(EQUIPMENT)) {
    index[id] = resolveBaseType(id);
  }
  return index;
}
