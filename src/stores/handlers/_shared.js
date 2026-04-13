import { calculateMaxWounds } from '../../services/gameState';
import { DEFAULT_CHARACTER_AGE, normalizeCharacterAge } from '../../services/characterAge';
import { SKILL_CAPS, createStartingSkills, charLevelCost } from '../../data/rpgSystem';
import { shortId } from '../../utils/ids';

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

/** Merge new materials into the bag, stacking by name (case-insensitive). */
export function stackMaterials(bag, newItems) {
  const result = bag.map((m) => ({ ...m }));
  for (const item of newItems) {
    const lower = (item.name || '').toLowerCase();
    const existing = result.find((m) => (m.name || '').toLowerCase() === lower);
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
    backstory: '',
    customAttackPresets: [],
    equipped: { mainHand: null, offHand: null, armour: null },
    needs: createDefaultNeeds(),
    characterLevel: 1,
    characterXp: 0,
    attributePoints: 0,
    lastTrainingScene: -SKILL_CAPS.basic,
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

/**
 * Apply character XP gain with potential multiple level-ups.
 * Mutates the character draft in-place. Each level-up grants +1 attribute point.
 * Used in 3+ places inside APPLY_STATE_CHANGES (woundsChange+xp, skillProgress, completedQuests).
 */
export function applyCharacterXpGain(characterDraft, xpGain) {
  if (!characterDraft || xpGain <= 0) return;
  let charXp = (characterDraft.characterXp || 0) + xpGain;
  let charLevel = characterDraft.characterLevel || 1;
  let attrPoints = characterDraft.attributePoints || 0;
  while (charXp >= charLevelCost(charLevel + 1)) {
    charXp -= charLevelCost(charLevel + 1);
    charLevel++;
    attrPoints++;
  }
  characterDraft.characterXp = charXp;
  characterDraft.characterLevel = charLevel;
  characterDraft.attributePoints = attrPoints;
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
