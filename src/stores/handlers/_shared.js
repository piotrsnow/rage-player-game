// DEPRECATION NOTE: The following world-state fields are DEPRECATED as
// independent mutable state — reads are proxied from the location graph API:
//   - world.mapState         → graph nodes query
//   - world.mapConnections   → graph movement edges
//   - world.exploredLocations → DiscoveryState = visited on graph nodes
//   - world.currentLocation (string) → world.currentLocationRef ({ kind, id })
//   - world.knowledgeBase.locations → graph node metadata (visitCount, npcsEncountered)
//   - npc.lastLocation (string) → npc.locationRef ({ kind, id })
// They remain populated for backward-compat reads but are no longer the
// source of truth. The LocationEdge table + graphExtractor pipeline owns
// spatial connectivity. See backend/src/services/locationGraph/.
// Faza 3a — wprowadzone composite refs jako nowy primary path; legacy stringi
// zachowane do czasu Fazy 8 cleanup.

import { calculateMaxWounds } from '../../services/gameState';
import { DEFAULT_CHARACTER_AGE, normalizeCharacterAge } from '../../services/characterAge';
import { createStartingSkills } from '../../data/rpgSystem';
import { shortId } from '../../utils/ids';
import { slugifyItemName } from '../../../shared/domain/itemKeys.js';

export function createDefaultNeeds() {
  return { hunger: 100, thirst: 100, bladder: 100, hygiene: 100, rest: 100 };
}

export function normalizeCustomAttackPresets(presets) {
  if (!Array.isArray(presets)) return [];
  const seen = new Set();
  return presets
    .map((preset) => (typeof preset === 'string' ? preset.trim() : ''))
    .filter((preset) => {
      if (!preset || seen.has(preset)) return false;
      seen.add(preset);
      return true;
    })
    .slice(0, 12);
}

export const PERIOD_START_HOUR = { morning: 6, afternoon: 12, evening: 18, night: 22 };

/** Merge new materials into the bag, stacking by slugified name. */
export function stackMaterials(bag, newItems) {
  const result = bag.map((m) => ({ ...m }));
  for (const item of newItems) {
    const key = slugifyItemName(item.name);
    const existing = result.find((m) => slugifyItemName(m.name) === key);
    if (existing) {
      existing.quantity = (existing.quantity || 1) + (item.quantity || 1);
    } else {
      result.push({
        name: item.name,
        quantity: item.quantity || 1,
      });
    }
  }
  return result;
}

/**
 * F4 — merge regular inventory items by slugify(name). Mirrors BE persistence
 * so optimistic FE updates don't show duplicate rows for one scene before
 * the server reconcile collapses them.
 */
export function stackInventory(inventory, newItems) {
  const result = inventory.map((it) => ({ ...it, props: it.props ? { ...it.props } : {} }));
  for (const item of newItems) {
    const key = slugifyItemName(item.name);
    const existing = result.find((i) => slugifyItemName(i.name) === key);
    if (existing) {
      existing.quantity = (existing.quantity || 1) + (item.quantity || 1);
      // Latest write wins for non-quantity props.
      const KNOWN_COLS = new Set(['id', 'name', 'baseType', 'quantity', 'props', 'imageUrl', 'addedAt']);
      for (const [k, v] of Object.entries(item)) {
        if (!KNOWN_COLS.has(k) && v !== undefined) existing[k] = v;
        else if (k === 'baseType' && v) existing.baseType = v;
        else if (k === 'imageUrl' && v) existing.imageUrl = v;
      }
    } else {
      result.push({ ...item, id: key, name: item.name, quantity: item.quantity || 1 });
    }
  }
  return result;
}

export function createDefaultCharacter() {
  const attributes = { sila: 10, inteligencja: 10, charyzma: 10, zrecznosc: 10, wytrzymalosc: 10, szczescie: 5 };
  return {
    name: 'Adventurer',
    age: DEFAULT_CHARACTER_AGE,
    species: 'Human',
    attributes,
    mana: { current: 0, max: 0 },
    wounds: calculateMaxWounds(attributes.wytrzymalosc),
    maxWounds: calculateMaxWounds(attributes.wytrzymalosc),
    movement: 4,
    skills: createStartingSkills('Human'),
    spells: { known: [], usageCounts: {}, scrolls: [] },
    inventory: [],
    materialBag: [],
    statuses: [],
    activeEffects: [],
    backstory: '',
    customAttackPresets: [],
    equipped: { mainHand: null, offHand: null, armour: null },
    needs: createDefaultNeeds(),
    characterLevel: 1,
    characterXp: 0,
    attributePoints: 0,
  };
}

export function normalizeCharacter(character) {
  if (!character) return character;
  return {
    ...character,
    age: normalizeCharacterAge(character.age),
    attributes: character.attributes || { sila: 10, inteligencja: 10, charyzma: 10, zrecznosc: 10, wytrzymalosc: 10, szczescie: 5 },
    mana: character.mana || { current: 0, max: 0 },
    spells: character.spells || { known: [], usageCounts: {}, scrolls: [] },
    equipped: character.equipped || { mainHand: null, offHand: null, armour: null },
    materialBag: character.materialBag || [],
    activeEffects: character.activeEffects || [],
  };
}

export function normalizeLocationName(value) {
  if (typeof value !== 'string') return '';
  return value.trim();
}

/**
 * Immer-safe: mutates the world draft to ensure a location entry exists.
 * Returns nothing — use from within a produce() draft.
 */
export function ensureMapContainsLocationDraft(worldDraft, locationName) {
  const normalized = normalizeLocationName(locationName);
  if (!normalized) return;
  if (!worldDraft.mapState) worldDraft.mapState = [];
  const exists = worldDraft.mapState.some(
    (loc) => loc?.name?.toLowerCase() === normalized.toLowerCase()
  );
  if (exists) return;
  worldDraft.mapState.push({
    id: `loc_${Date.now()}_${shortId(5)}`,
    name: normalized,
    description: '',
    modifications: [],
  });
}

export function createDefaultAchievementState() {
  return {
    unlocked: [],
    stats: {
      scenesPlayed: 0, combatWins: 0, enemiesDefeated: 0,
      locationsVisited: [], hagglesSucceeded: 0,
      spellsCast: 0, miscasts: 0, spellsByLore: {},
      lowestWounds: 999, npcDispositions: {},
    },
  };
}

export const initialState = {
  campaign: null,
  character: null,
  characters: [],
  party: [],
  activeCharacterId: null,
  world: {
    locations: [],
    facts: [],
    eventHistory: [],
    npcs: [],
    mapState: [],
    mapConnections: [],
    currentLocation: '',
    // Faza 3a — composite ref do node grafu lokacji ({ kind: 'world'|'campaign', id: UUID } | null).
    // Preferowany primary path; `currentLocation` (string) zachowane jako legacy do Fazy 8.
    currentLocationRef: null,
    timeState: { day: 1, timeOfDay: 'morning', hour: 6, season: 'unknown' },
    activeEffects: [],
    compressedHistory: '',
    factions: {},
    exploredLocations: [],
    knowledgeBase: {
      characters: {},
      locations: {},
      events: [],
      decisions: [],
      plotThreads: [],
    },
    codex: {},
    narrativeSeeds: [],
    npcAgendas: [],
  },
  quests: { active: [], completed: [] },
  scenes: [],
  chatHistory: [],
  characterVoiceMap: {},
  narratorVoiceId: null,
  isLoading: false,
  error: null,
  aiCosts: { total: 0, breakdown: { ai: 0, image: 0, tts: 0, sfx: 0, music: 0 }, history: [] },
  momentumBonus: 0,
  isGeneratingScene: false,
  isGeneratingImage: false,
  localDiceRoll: null,
  combat: null,
  trade: null,
  crafting: null,
  alchemy: null,
  achievements: createDefaultAchievementState(),
  magic: { activeSpells: [] },
  narrationTime: 0,
  totalPlayTime: 0,
  mainQuestJustCompleted: false,
};
