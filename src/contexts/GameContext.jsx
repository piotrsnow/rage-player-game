import { createContext, useContext, useReducer, useCallback, useRef, useEffect } from 'react';
import { storage } from '../services/storage';
import { calculateWounds, normalizeMoney } from '../services/gameState';
import { DEFAULT_CHARACTER_AGE, normalizeCharacterAge } from '../services/characterAge';
import { createCombatState } from '../services/combatEngine';
import { createDialogueState } from '../services/dialogueEngine';
import { hourToPeriod, decayNeeds } from '../services/timeUtils';
import { reduceMultiplayerSlice } from './slices/multiplayerSlice';
import {
  getAdvancementCost,
  ADVANCEMENT_COSTS,
  isCharacteristicInCareer,
  isSkillInCareer,
  isTalentInCareer,
  getCareerByName,
  canAdvanceTier,
} from '../data/wfrp';

const GameContext = (import.meta.hot?.data?.GameContext) || createContext(null);
if (import.meta.hot) import.meta.hot.data.GameContext = GameContext;
const FORTUNE_REGEN_MS = 24 * 60 * 60 * 1000;
const RESOLVE_REGEN_MS = 48 * 60 * 60 * 1000;

function createDefaultNeeds() {
  return { hunger: 100, thirst: 100, bladder: 100, hygiene: 100, rest: 100 };
}

function normalizeCustomAttackPresets(presets) {
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

const PERIOD_START_HOUR = { morning: 6, afternoon: 12, evening: 18, night: 22 };

function createDefaultCharacter() {
  return {
    name: 'Adventurer',
    age: DEFAULT_CHARACTER_AGE,
    species: 'Human',
    career: {
      class: 'Warriors',
      name: 'Soldier',
      tier: 1,
      tierName: 'Recruit',
      status: 'Silver 1',
    },
    xp: 0,
    xpSpent: 0,
    characteristics: {
      ws: 31, bs: 25, s: 34, t: 28,
      i: 30, ag: 33, dex: 27, int: 35,
      wp: 29, fel: 32,
    },
    advances: {
      ws: 0, bs: 0, s: 0, t: 0,
      i: 0, ag: 0, dex: 0, int: 0,
      wp: 0, fel: 0,
    },
    wounds: 12,
    maxWounds: 12,
    movement: 4,
    fate: 2,
    fortune: 2,
    resilience: 1,
    resolve: 1,
    skills: {},
    talents: [],
    inventory: [],
    statuses: [],
    backstory: '',
    customAttackPresets: [],
    needs: createDefaultNeeds(),
    criticalWounds: [],
  };
}

function normalizeCharacterMetaCurrencies(character) {
  if (!character) return character;

  const fate = Math.max(0, Number(character.fate ?? 0));
  const resilience = Math.max(0, Number(character.resilience ?? 0));
  const fortuneFallback = character.fortune == null ? fate : Number(character.fortune);
  const resolveFallback = character.resolve == null ? resilience : Number(character.resolve);

  const fortune = Number.isFinite(fortuneFallback)
    ? Math.max(0, Math.min(fate, fortuneFallback))
    : fate;
  const resolve = Number.isFinite(resolveFallback)
    ? Math.max(0, Math.min(resilience, resolveFallback))
    : resilience;

  return {
    ...character,
    age: normalizeCharacterAge(character.age),
    fate,
    resilience,
    fortune,
    resolve,
  };
}

function applyOfflineMetaCurrencyRegen(character, lastSavedAt) {
  const normalized = normalizeCharacterMetaCurrencies(character);
  if (!normalized || !lastSavedAt) return normalized;

  const elapsedMs = Math.max(0, Date.now() - Number(lastSavedAt || 0));
  if (!elapsedMs) return normalized;

  const fortuneTicks = Math.floor(elapsedMs / FORTUNE_REGEN_MS);
  const resolveTicks = Math.floor(elapsedMs / RESOLVE_REGEN_MS);
  if (!fortuneTicks && !resolveTicks) return normalized;

  return {
    ...normalized,
    fortune: Math.min(normalized.fate, normalized.fortune + fortuneTicks),
    resolve: Math.min(normalized.resilience, normalized.resolve + resolveTicks),
  };
}

function normalizeLocationName(value) {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function ensureMapContainsLocation(world, locationName) {
  const normalizedLocation = normalizeLocationName(locationName);
  if (!normalizedLocation) return world;

  const mapState = [...(world?.mapState || [])];
  const exists = mapState.some(
    (loc) => loc?.name?.toLowerCase() === normalizedLocation.toLowerCase()
  );
  if (exists) return world;

  mapState.push({
    id: `loc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name: normalizedLocation,
    description: '',
    modifications: [],
  });
  return { ...world, mapState };
}

function createDefaultAchievementState() {
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

const initialState = {
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
    weather: null,
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
  dialogue: null,
  dialogueCooldown: 0,
  achievements: createDefaultAchievementState(),
  magic: { storedWindPoints: 0, activeSpells: [], knownSpells: [] },
  narrationTime: 0,
  totalPlayTime: 0,
};

function gameReducer(state, action) {
  if (action.type === 'LOAD_MULTIPLAYER_STATE' || action.type.startsWith('MP_')) {
    return reduceMultiplayerSlice(state, action);
  }

  switch (action.type) {
    case 'START_CAMPAIGN': {
      const rawChar = action.payload.character || createDefaultCharacter();
      const char = normalizeCharacterMetaCurrencies(rawChar);
      const campaignData = {
        ...action.payload.campaign,
        status: 'active',
      };
      const voiceMap = {};
      if (char.voiceId && char.name) {
        voiceMap[char.name] = { voiceId: char.voiceId, gender: char.gender || null };
      }
      return {
        ...initialState,
        campaign: campaignData,
        character: {
          ...char,
          needs: char.needs || createDefaultNeeds(),
          customAttackPresets: normalizeCustomAttackPresets(char.customAttackPresets),
        },
        characterVoiceMap: voiceMap,
        world: action.payload.world || initialState.world,
        scenes: action.payload.scenes || [],
        chatHistory: action.payload.chatHistory || [],
        aiCosts: { total: 0, breakdown: { ai: 0, image: 0, tts: 0, sfx: 0, music: 0 }, history: [] },
      };
    }

    case 'LOAD_CAMPAIGN': {
      const defaultCosts = { total: 0, breakdown: { ai: 0, image: 0, tts: 0, sfx: 0, music: 0 }, history: [] };
      const loaded = { ...initialState, ...action.payload };
      loaded.isLoading = false;
      loaded.isGeneratingScene = false;
      loaded.isGeneratingImage = false;
      loaded.error = null;
      loaded.aiCosts = { ...defaultCosts, ...loaded.aiCosts };
      if (loaded.character && !loaded.character.needs) {
        loaded.character = { ...loaded.character, needs: createDefaultNeeds() };
      }
      if (loaded.character) {
        const normalizedCharacter = {
          ...loaded.character,
          customAttackPresets: normalizeCustomAttackPresets(loaded.character.customAttackPresets),
        };
        loaded.character = applyOfflineMetaCurrencyRegen(normalizedCharacter, action.payload?.lastSaved);
      }
      if (!loaded.achievements) loaded.achievements = createDefaultAchievementState();
      if (!loaded.magic) loaded.magic = { storedWindPoints: 0, activeSpells: [], knownSpells: [] };
      if (loaded.narrationTime == null) loaded.narrationTime = 0;
      if (loaded.totalPlayTime == null) loaded.totalPlayTime = 0;
      if (!loaded.dialogue) loaded.dialogue = null;
      if (loaded.dialogueCooldown == null) loaded.dialogueCooldown = 0;
      if (!loaded.party) loaded.party = [];
      if (loaded.world && !loaded.world.exploredLocations) loaded.world.exploredLocations = [];
      if (loaded.world && !loaded.world.weather) loaded.world.weather = null;
      if (loaded.world && !loaded.world.knowledgeBase) {
        loaded.world.knowledgeBase = { characters: {}, locations: {}, events: [], decisions: [], plotThreads: [] };
      }
      if (loaded.world && !loaded.world.codex) {
        loaded.world.codex = {};
      }
      if (loaded.world && loaded.world.fieldMap) {
        loaded.world.fieldMap = {
          seed: 0,
          chunkSize: 64,
          chunks: {},
          playerPos: { x: 32, y: 32 },
          activeBiome: 'plains',
          mapMode: 'pola',
          roadVariant: null,
          stepCounter: 0,
          stepBuffer: [],
          discoveredPoi: [],
          interior: null,
          ...loaded.world.fieldMap,
        };
      }
      if (loaded.campaign && !loaded.campaign.status) loaded.campaign.status = 'active';
      if (loaded.character?.voiceId && loaded.character.name) {
        if (!loaded.characterVoiceMap) loaded.characterVoiceMap = {};
        if (!loaded.characterVoiceMap[loaded.character.name]) {
          loaded.characterVoiceMap[loaded.character.name] = {
            voiceId: loaded.character.voiceId,
            gender: loaded.character.gender || null,
          };
        }
      }

      if (loaded.scenes?.length) {
        const existingDmSceneIds = new Set(
          (loaded.chatHistory || [])
            .filter((m) => m.role === 'dm' && m.sceneId)
            .map((m) => m.sceneId),
        );
        const reconstructed = [];
        loaded.scenes.forEach((scene, idx) => {
          if (!scene.id || existingDmSceneIds.has(scene.id)) return;
          const ts = scene.timestamp || Date.now();
          if (idx > 0 && scene.chosenAction) {
            reconstructed.push({
              id: `msg_reconstructed_${scene.id}_player`,
              role: 'player',
              content: scene.chosenAction,
              timestamp: ts - 2,
            });
          }
          if (scene.diceRoll) {
            reconstructed.push({
              id: `msg_reconstructed_${scene.id}_roll`,
              role: 'system',
              subtype: 'dice_roll',
              content: `${scene.diceRoll.skill}: ${scene.diceRoll.roll} / ${scene.diceRoll.target || scene.diceRoll.dc} (SL ${scene.diceRoll.sl ?? 0})`,
              diceData: scene.diceRoll,
              timestamp: ts - 1,
            });
          }
          reconstructed.push({
            id: `msg_reconstructed_${scene.id}_dm`,
            role: 'dm',
            sceneId: scene.id,
            content: scene.narrative || '',
            scenePacing: scene.scenePacing || 'exploration',
            dialogueSegments: scene.dialogueSegments || [],
            soundEffect: scene.soundEffect || null,
            timestamp: ts,
          });
        });
        if (reconstructed.length > 0) {
          loaded.chatHistory = [...(loaded.chatHistory || []), ...reconstructed]
            .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
        }
      }

      return loaded;
    }

    case 'RESET':
      return initialState;

    case 'ADD_SCENE': {
      const nextCooldown = (!state.dialogue?.active && state.dialogueCooldown > 0)
        ? state.dialogueCooldown - 1
        : state.dialogueCooldown;
      return {
        ...state,
        scenes: [...state.scenes, action.payload],
        dialogueCooldown: nextCooldown,
      };
    }

    case 'UPDATE_SCENE_IMAGE': {
      const scenes = [...state.scenes];
      const idx = scenes.findIndex((s) => s.id === action.payload.sceneId);
      if (idx >= 0) {
        scenes[idx] = { ...scenes[idx], image: action.payload.image };
      }
      return { ...state, scenes };
    }

    case 'UPDATE_SCENE_COMMAND': {
      const scenes = [...state.scenes];
      const idx = scenes.findIndex((s) => s.id === action.payload.sceneId);
      if (idx >= 0) {
        scenes[idx] = { ...scenes[idx], sceneCommand: action.payload.sceneCommand };
      }
      return { ...state, scenes };
    }

    case 'UPDATE_SCENE_GRID': {
      const scenes = [...state.scenes];
      const idx = scenes.findIndex((s) => s.id === action.payload.sceneId);
      if (idx >= 0) {
        scenes[idx] = {
          ...scenes[idx],
          sceneGrid: action.payload.sceneGrid || scenes[idx].sceneGrid || null,
        };
      }
      return { ...state, scenes };
    }

    case 'ADD_CHAT_MESSAGE':
      return {
        ...state,
        chatHistory: [...state.chatHistory, action.payload],
      };

    case 'UPDATE_CHARACTER':
      return {
        ...state,
        character: {
          ...state.character,
          ...action.payload,
          customAttackPresets: normalizeCustomAttackPresets(
            action.payload.customAttackPresets ?? state.character?.customAttackPresets
          ),
        },
      };

    case 'SAVE_CUSTOM_ATTACK': {
      const description = typeof action.payload === 'string' ? action.payload.trim() : '';
      if (!description || !state.character) return state;

      const current = normalizeCustomAttackPresets(state.character.customAttackPresets);
      const nextPresets = [description, ...current.filter((preset) => preset !== description)].slice(0, 12);

      return {
        ...state,
        character: {
          ...state.character,
          customAttackPresets: nextPresets,
        },
      };
    }

    case 'DELETE_CUSTOM_ATTACK': {
      const description = typeof action.payload === 'string' ? action.payload.trim() : '';
      if (!description || !state.character) return state;

      return {
        ...state,
        character: {
          ...state.character,
          customAttackPresets: normalizeCustomAttackPresets(
            (state.character.customAttackPresets || []).filter((preset) => preset !== description)
          ),
        },
      };
    }

    case 'UPSERT_3D_MODEL_ASSIGNMENTS': {
      const { playerModel, partyModels = [], npcModels = [] } = action.payload || {};
      const nextCharacter = playerModel && state.character
        ? { ...state.character, model3d: playerModel }
        : state.character;

      const nextParty = (state.party || []).map((member) => {
        const match = partyModels.find((item) => (item.id && (member.id || member.name) === item.id) || item.name === member.name);
        return match?.model3d ? { ...member, model3d: match.model3d } : member;
      });

      const nextNpcs = (state.world?.npcs || []).map((npc) => {
        const match = npcModels.find((item) => item.name?.toLowerCase() === npc.name?.toLowerCase());
        return match?.model3d ? { ...npc, model3d: match.model3d } : npc;
      });

      return {
        ...state,
        character: nextCharacter,
        party: nextParty,
        world: {
          ...state.world,
          npcs: nextNpcs,
        },
      };
    }

    case 'SPEND_FORTUNE': {
      if (state.character.fortune <= 0) return state;
      return {
        ...state,
        character: { ...state.character, fortune: state.character.fortune - 1 },
      };
    }

    case 'SPEND_RESOLVE': {
      if (state.character.resolve <= 0) return state;
      return {
        ...state,
        character: { ...state.character, resolve: state.character.resolve - 1 },
      };
    }


    case 'SPEND_XP_CHARACTERISTIC': {
      const { key } = action.payload;
      const char = state.character;
      if (!char) return state;
      const currentAdv = char.advances?.[key] || 0;
      const inCareer = isCharacteristicInCareer(key, char.career?.name, char.career?.tier);
      const cost = getAdvancementCost(currentAdv, inCareer);
      const available = (char.xp || 0) - (char.xpSpent || 0);
      if (cost > available) return state;

      const newAdvances = { ...char.advances, [key]: currentAdv + 1 };
      const newChars = { ...char.characteristics, [key]: (char.characteristics[key] || 0) + 1 };
      const newMaxWounds = calculateWounds(newChars);
      return {
        ...state,
        character: {
          ...char,
          xpSpent: char.xpSpent + cost,
          advances: newAdvances,
          characteristics: newChars,
          maxWounds: newMaxWounds,
          wounds: Math.min(char.wounds, newMaxWounds),
        },
      };
    }

    case 'SPEND_XP_SKILL': {
      const { skill } = action.payload;
      const char = state.character;
      if (!char) return state;
      const currentAdv = char.skills?.[skill] || 0;
      const inCareer = isSkillInCareer(skill, char.career?.name, char.career?.tier);
      const cost = getAdvancementCost(currentAdv, inCareer);
      const available = (char.xp || 0) - (char.xpSpent || 0);
      if (cost > available) return state;

      return {
        ...state,
        character: {
          ...char,
          xpSpent: char.xpSpent + cost,
          skills: { ...char.skills, [skill]: currentAdv + 1 },
        },
      };
    }

    case 'SPEND_XP_TALENT': {
      const { talent } = action.payload;
      const char = state.character;
      if (!char) return state;
      if (char.talents?.includes(talent)) return state;
      const inCareer = isTalentInCareer(talent, char.career?.name, char.career?.tier);
      const cost = inCareer ? ADVANCEMENT_COSTS.talentInCareer : ADVANCEMENT_COSTS.talentOutOfCareer;
      const available = (char.xp || 0) - (char.xpSpent || 0);
      if (cost > available) return state;

      return {
        ...state,
        character: {
          ...char,
          xpSpent: char.xpSpent + cost,
          talents: [...(char.talents || []), talent],
        },
      };
    }

    case 'CHANGE_CAREER': {
      const { careerName } = action.payload;
      const char = state.character;
      if (!char) return state;
      const newCareer = getCareerByName(careerName);
      if (!newCareer) return state;
      const sameClass = newCareer.class === char.career?.class;
      const cost = sameClass
        ? ADVANCEMENT_COSTS.careerChangeSameClass
        : ADVANCEMENT_COSTS.careerChangeDifferentClass;
      const available = (char.xp || 0) - (char.xpSpent || 0);
      if (cost > available) return state;

      const tierData = newCareer.tiers[0];
      return {
        ...state,
        character: {
          ...char,
          xpSpent: char.xpSpent + cost,
          career: {
            class: newCareer.class,
            name: newCareer.name,
            tier: 1,
            tierName: tierData?.name || newCareer.name,
            status: tierData?.status || 'Silver 1',
          },
        },
      };
    }

    case 'ADVANCE_CAREER_TIER': {
      const char = state.character;
      if (!char || !canAdvanceTier(char)) return state;
      const career = getCareerByName(char.career?.name);
      if (!career) return state;
      const nextTier = (char.career?.tier || 1) + 1;
      if (nextTier > 4) return state;
      const tierData = career.tiers[nextTier - 1];
      return {
        ...state,
        character: {
          ...char,
          career: {
            ...char.career,
            tier: nextTier,
            tierName: tierData?.name || char.career.tierName,
            status: tierData?.status || char.career.status,
          },
        },
      };
    }

    case 'UPDATE_INVENTORY_ITEM_IMAGE': {
      const { itemId, imageUrl } = action.payload || {};
      if (!itemId || !state.character?.inventory?.length) return state;
      return {
        ...state,
        character: {
          ...state.character,
          inventory: state.character.inventory.map((item) =>
            item?.id === itemId ? { ...item, imageUrl } : item
          ),
        },
      };
    }

    case 'ADD_QUEST': {
      const quest = action.payload;
      const nextWorld = quest?.locationId
        ? ensureMapContainsLocation(state.world, quest.locationId)
        : state.world;
      return {
        ...state,
        quests: {
          ...state.quests,
          active: [...state.quests.active, quest],
        },
        world: nextWorld,
      };
    }

    case 'UPDATE_SCENE_QUEST_OFFER': {
      const { sceneId, offerId, status } = action.payload;
      return {
        ...state,
        scenes: state.scenes.map((s) =>
          s.id === sceneId
            ? {
                ...s,
                questOffers: (s.questOffers || []).map((offer) =>
                  offer.id === offerId ? { ...offer, status } : offer
                ),
              }
            : s
        ),
      };
    }

    case 'UPDATE_WORLD':
      return {
        ...state,
        world: { ...state.world, ...action.payload },
      };

    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };

    case 'SET_ERROR':
      return { ...state, error: action.payload, isLoading: false };

    case 'SET_GENERATING_SCENE':
      return { ...state, isGeneratingScene: action.payload };

    case 'SET_GENERATING_IMAGE':
      return { ...state, isGeneratingImage: action.payload };

    case 'SET_MOMENTUM':
      return { ...state, momentumBonus: action.payload };

    case 'APPLY_STATE_CHANGES': {
      const changes = action.payload;
      let next = { ...state };

      // --- Campaign end from AI ---
      if (changes.campaignEnd && next.campaign) {
        next.campaign = {
          ...next.campaign,
          status: changes.campaignEnd.status || 'completed',
          epilogue: changes.campaignEnd.epilogue || '',
        };
      }

      if (changes.woundsChange !== undefined || changes.xp !== undefined) {
        next.character = { ...next.character };
        if (changes.woundsChange !== undefined) {
          const newWounds = Math.max(0, Math.min(next.character.maxWounds, next.character.wounds + changes.woundsChange));
          next.character.wounds = newWounds;

          // Critical wounds & death mechanics
          if (newWounds === 0 && changes.woundsChange < 0) {
            const currentCritCount = next.character.criticalWoundCount || 0;
            next.character.criticalWoundCount = currentCritCount + 1;

            if (next.character.criticalWoundCount >= 3) {
              if (next.character.fate > 0) {
                next.character.fate = next.character.fate - 1;
                next.character.fortune = Math.min(next.character.fortune, next.character.fate);
                next.character.criticalWoundCount = 2;
                next.character.wounds = 1;
              } else {
                next.character.status = 'dead';
              }
            }
          }
        }
        if (changes.xp !== undefined) {
          next.character.xp = next.character.xp + changes.xp;
        }
      }

      if (changes.forceStatus && next.character) {
        next.character = { ...next.character };
        next.character.status = changes.forceStatus;
      }

      if (changes.fortuneChange !== undefined && next.character) {
        next.character = { ...next.character };
        next.character.fortune = Math.max(0, Math.min(next.character.fate, next.character.fortune + changes.fortuneChange));
      }

      if (changes.resolveChange !== undefined && next.character) {
        next.character = { ...next.character };
        next.character.resolve = Math.max(0, Math.min(next.character.resilience, next.character.resolve + changes.resolveChange));
      }

      if (changes.fateChange !== undefined && next.character) {
        next.character = { ...next.character };
        next.character.fate = Math.max(0, next.character.fate + changes.fateChange);
        next.character.fortune = Math.min(next.character.fortune, next.character.fate);
      }

      if (changes.resilienceChange !== undefined && next.character) {
        next.character = { ...next.character };
        next.character.resilience = Math.max(0, next.character.resilience + changes.resilienceChange);
        next.character.resolve = Math.min(next.character.resolve, next.character.resilience);
      }

      if (changes.careerAdvance && next.character) {
        next.character = {
          ...next.character,
          career: { ...next.character.career, ...changes.careerAdvance },
        };
      }

      if (changes.skillAdvances && next.character) {
        const skills = { ...next.character.skills };
        for (const [skillName, advanceAmount] of Object.entries(changes.skillAdvances)) {
          skills[skillName] = (skills[skillName] || 0) + advanceAmount;
        }
        next.character = { ...next.character, skills };
      }

      if (changes.newTalents?.length > 0 && next.character) {
        const talents = [...next.character.talents];
        for (const t of changes.newTalents) {
          if (!talents.includes(t)) talents.push(t);
        }
        next.character = { ...next.character, talents };
      }

      if (changes.characteristicAdvances && next.character) {
        const advances = { ...next.character.advances };
        const chars = { ...next.character.characteristics };
        for (const [key, amount] of Object.entries(changes.characteristicAdvances)) {
          advances[key] = (advances[key] || 0) + amount;
          chars[key] = (chars[key] || 0) + amount;
        }
        const newMaxWounds = calculateWounds(chars);
        next.character = {
          ...next.character,
          advances,
          characteristics: chars,
          maxWounds: newMaxWounds,
          wounds: Math.min(next.character.wounds, newMaxWounds),
        };
      }

      if (changes.newItems) {
        next.character = {
          ...next.character,
          inventory: [...(next.character.inventory || []), ...changes.newItems],
        };
      }

      if (changes.removeItems) {
        next.character = {
          ...next.character,
          inventory: (next.character.inventory || []).filter(
            (i) => !changes.removeItems.includes(i.id)
          ),
        };
      }

      if (changes.moneyChange) {
        const cur = next.character.money || { gold: 0, silver: 0, copper: 0 };
        next.character = {
          ...next.character,
          money: normalizeMoney({
            gold: (cur.gold || 0) + (changes.moneyChange.gold || 0),
            silver: (cur.silver || 0) + (changes.moneyChange.silver || 0),
            copper: (cur.copper || 0) + (changes.moneyChange.copper || 0),
          }),
        };
      }

      if (changes.newQuests) {
        const normalized = changes.newQuests.map((q) => ({
          ...q,
          objectives: (q.objectives || []).map((obj) => ({ ...obj, completed: obj.completed ?? false })),
          questGiverId: q.questGiverId || null,
          turnInNpcId: q.turnInNpcId || q.questGiverId || null,
          locationId: q.locationId || null,
          prerequisiteQuestIds: q.prerequisiteQuestIds || [],
          reward: q.reward || null,
          type: q.type || 'side',
        }));
        next.quests = {
          ...next.quests,
          active: [...next.quests.active, ...normalized],
        };
        let worldWithQuestLocations = next.world;
        for (const quest of normalized) {
          if (!quest?.locationId) continue;
          worldWithQuestLocations = ensureMapContainsLocation(worldWithQuestLocations, quest.locationId);
        }
        next.world = worldWithQuestLocations;
      }

      if (changes.completedQuests) {
        const activeIds = new Set(next.quests.active.map((q) => q.id));
        const validIds = changes.completedQuests.filter((id) => activeIds.has(id));
        if (validIds.length > 0) {
          const completed = next.quests.active.filter((q) => validIds.includes(q.id));

          let totalRewardXp = 0;
          let rewardMoney = { gold: 0, silver: 0, copper: 0 };
          const rewardItems = [];
          for (const q of completed) {
            if (q.reward) {
              if (q.reward.xp) totalRewardXp += q.reward.xp;
              if (q.reward.money) {
                rewardMoney.gold += q.reward.money.gold || 0;
                rewardMoney.silver += q.reward.money.silver || 0;
                rewardMoney.copper += q.reward.money.copper || 0;
              }
              if (q.reward.items?.length > 0) rewardItems.push(...q.reward.items);
            }
          }

          if (totalRewardXp > 0) {
            next.character = { ...next.character, xp: (next.character.xp || 0) + totalRewardXp };
          }
          if (rewardMoney.gold || rewardMoney.silver || rewardMoney.copper) {
            const cur = next.character.money || { gold: 0, silver: 0, copper: 0 };
            next.character = {
              ...next.character,
              money: normalizeMoney({
                gold: (cur.gold || 0) + rewardMoney.gold,
                silver: (cur.silver || 0) + rewardMoney.silver,
                copper: (cur.copper || 0) + rewardMoney.copper,
              }),
            };
          }
          if (rewardItems.length > 0) {
            next.character = {
              ...next.character,
              inventory: [...(next.character.inventory || []), ...rewardItems],
            };
          }

          next.quests = {
            active: next.quests.active.filter((q) => !validIds.includes(q.id)),
            completed: [...next.quests.completed, ...completed.map((q) => ({ ...q, completedAt: Date.now(), rewardGranted: true }))],
          };
        }
      }

      if (changes.questUpdates?.length > 0) {
        const activeQuests = [...next.quests.active];
        for (const update of changes.questUpdates) {
          const qIdx = activeQuests.findIndex((q) => q.id === update.questId);
          if (qIdx >= 0 && activeQuests[qIdx].objectives) {
            const objectives = activeQuests[qIdx].objectives.map((obj) =>
              obj.id === update.objectiveId ? { ...obj, completed: !!update.completed } : obj
            );
            activeQuests[qIdx] = { ...activeQuests[qIdx], objectives };
          }
        }
        next.quests = { ...next.quests, active: activeQuests };
      }

      if (changes.worldFacts) {
        next.world = {
          ...next.world,
          facts: [...next.world.facts, ...changes.worldFacts],
        };
      }

      if (changes.journalEntries?.length > 0) {
        next.world = {
          ...next.world,
          eventHistory: [...(next.world.eventHistory || []), ...changes.journalEntries],
        };
      }

      if (changes.statuses) {
        next.character = { ...next.character, statuses: changes.statuses };
      }

      if (changes.npcs?.length > 0) {
        const npcs = [...(next.world.npcs || [])];
        const relationshipFields = (npc) => ({
          ...(npc.factionId !== undefined && { factionId: npc.factionId }),
          ...(npc.relatedQuestIds?.length > 0 && { relatedQuestIds: npc.relatedQuestIds }),
          ...(npc.relationships?.length > 0 && { relationships: npc.relationships }),
        });
        for (const npc of changes.npcs) {
          const idx = npcs.findIndex((n) => n.name?.toLowerCase() === npc.name?.toLowerCase());
          if (npc.action === 'introduce' && idx < 0) {
            npcs.push({
              id: `npc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
              name: npc.name,
              gender: npc.gender || 'unknown',
              role: npc.role || '',
              personality: npc.personality || '',
              attitude: npc.attitude || 'neutral',
              lastLocation: npc.location || '',
              alive: true,
              notes: npc.notes || '',
              disposition: 0,
              factionId: npc.factionId || null,
              relatedQuestIds: npc.relatedQuestIds || [],
              relationships: npc.relationships || [],
            });
          } else if (npc.action === 'introduce' && idx >= 0) {
            npcs[idx] = {
              ...npcs[idx],
              ...(npc.gender && { gender: npc.gender }),
              ...(npc.role && { role: npc.role }),
              ...(npc.personality && { personality: npc.personality }),
              ...(npc.attitude && { attitude: npc.attitude }),
              ...(npc.location && { lastLocation: npc.location }),
              ...(npc.notes && { notes: npc.notes }),
              ...relationshipFields(npc),
            };
          } else if (idx >= 0) {
            const mergedRelQuestIds = npc.relatedQuestIds?.length > 0
              ? [...new Set([...(npcs[idx].relatedQuestIds || []), ...npc.relatedQuestIds])]
              : npcs[idx].relatedQuestIds;
            const mergedRelationships = npc.relationships?.length > 0
              ? [...(npcs[idx].relationships || []).filter(
                  (r) => !npc.relationships.some((nr) => nr.npcName === r.npcName)
                ), ...npc.relationships]
              : npcs[idx].relationships;
            npcs[idx] = {
              ...npcs[idx],
              ...(npc.gender && { gender: npc.gender }),
              ...(npc.role && { role: npc.role }),
              ...(npc.personality && { personality: npc.personality }),
              ...(npc.attitude && { attitude: npc.attitude }),
              ...(npc.location && { lastLocation: npc.location }),
              ...(npc.notes && { notes: npc.notes }),
              ...(npc.alive !== undefined && { alive: npc.alive }),
              ...(npc.factionId !== undefined && { factionId: npc.factionId }),
              ...(mergedRelQuestIds && { relatedQuestIds: mergedRelQuestIds }),
              ...(mergedRelationships && { relationships: mergedRelationships }),
              ...(typeof npc.dispositionChange === 'number' && {
                disposition: Math.max(-50, Math.min(50, (npcs[idx].disposition || 0) + npc.dispositionChange)),
              }),
            };
          }
        }
        next.world = { ...next.world, npcs };
      }

      if (changes.mapChanges?.length > 0) {
        const mapState = [...(next.world.mapState || [])];
        for (const change of changes.mapChanges) {
          const idx = mapState.findIndex((m) => m.name?.toLowerCase() === change.location?.toLowerCase());
          if (idx >= 0) {
            mapState[idx] = {
              ...mapState[idx],
              modifications: [...(mapState[idx].modifications || []), { description: change.modification, type: change.type || 'other', timestamp: Date.now() }],
            };
          } else {
            mapState.push({
              id: `loc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
              name: change.location,
              description: '',
              modifications: [{ description: change.modification, type: change.type || 'other', timestamp: Date.now() }],
            });
          }
        }
        next.world = { ...next.world, mapState };
      }

      if (changes.timeAdvance) {
        const ts = next.world.timeState || { day: 1, timeOfDay: 'morning', hour: 6, season: 'unknown' };
        const currentHour = ts.hour ?? 6;

        let hoursElapsed = changes.timeAdvance.hoursElapsed;
        if (!hoursElapsed && changes.timeAdvance.timeOfDay) {
          const targetHour = PERIOD_START_HOUR[changes.timeAdvance.timeOfDay] ?? currentHour;
          hoursElapsed = targetHour > currentHour
            ? targetHour - currentHour
            : targetHour < currentHour ? (24 - currentHour + targetHour) : 0;
        }
        hoursElapsed = hoursElapsed || 0.5;

        let newHour = currentHour + hoursElapsed;
        let dayIncrement = 0;
        while (newHour >= 24) { newHour -= 24; dayIncrement++; }
        if (changes.timeAdvance.newDay && dayIncrement === 0) dayIncrement = 1;

        next.world = {
          ...next.world,
          timeState: {
            ...ts,
            hour: Math.round(newHour * 10) / 10,
            timeOfDay: hourToPeriod(newHour),
            day: ts.day + dayIncrement,
            ...(changes.timeAdvance.season && { season: changes.timeAdvance.season }),
          },
        };

        if (next.character) {
          const currentNeeds = next.character.needs || createDefaultNeeds();
          next.character = {
            ...next.character,
            needs: decayNeeds(currentNeeds, hoursElapsed),
          };
        }
      }

      if (changes.needsChanges && next.character) {
        const needs = { ...(next.character.needs || createDefaultNeeds()) };
        for (const [key, delta] of Object.entries(changes.needsChanges)) {
          if (key in needs) {
            needs[key] = Math.max(0, Math.min(100, (needs[key] ?? 100) + delta));
          }
        }
        next.character = { ...next.character, needs };

        if (changes.needsChanges.rest > 0) {
          next.momentumBonus = 0;
        }
      }

      // --- Knowledge Base updates (memory system) ---
      if (changes.knowledgeUpdates && next.world) {
        const kb = { ...(next.world.knowledgeBase || { characters: {}, locations: {}, events: [], decisions: [], plotThreads: [] }) };
        const ku = changes.knowledgeUpdates;

        if (ku.events?.length > 0) {
          kb.events = [...kb.events, ...ku.events.map((e) => ({
            ...e,
            sceneIndex: (next.scenes?.length || 0),
          }))].slice(-50);
        }
        if (ku.decisions?.length > 0) {
          kb.decisions = [...kb.decisions, ...ku.decisions.map((d) => ({
            ...d,
            sceneIndex: (next.scenes?.length || 0),
          }))].slice(-50);
        }
        if (ku.plotThreads?.length > 0) {
          const threads = [...kb.plotThreads];
          for (const pt of ku.plotThreads) {
            const idx = threads.findIndex((t) => t.id === pt.id);
            if (idx >= 0) {
              const existing = threads[idx];
              threads[idx] = {
                ...existing,
                ...pt,
                relatedNpcIds: [...new Set([...(existing.relatedNpcIds || []), ...(pt.relatedNpcIds || [])])],
                relatedQuestIds: [...new Set([...(existing.relatedQuestIds || []), ...(pt.relatedQuestIds || [])])],
                relatedLocationIds: [...new Set([...(existing.relatedLocationIds || []), ...(pt.relatedLocationIds || [])])],
                relatedScenes: [...new Set([...(existing.relatedScenes || []), next.scenes?.length || 0])],
              };
            } else {
              threads.push({
                ...pt,
                relatedNpcIds: pt.relatedNpcIds || [],
                relatedQuestIds: pt.relatedQuestIds || [],
                relatedLocationIds: pt.relatedLocationIds || [],
                relatedScenes: [next.scenes?.length || 0],
              });
            }
          }
          kb.plotThreads = threads;
        }
        next.world = { ...next.world, knowledgeBase: kb };
      }

      if (changes.codexUpdates?.length > 0 && next.world) {
        const codex = { ...(next.world.codex || {}) };
        const MAX_CODEX_ENTRIES = 100;
        const MAX_FRAGMENTS_PER_ENTRY = 10;

        for (const update of changes.codexUpdates) {
          if (!update.id || !update.fragment?.content) continue;
          const existing = codex[update.id];
          if (existing) {
            const isDuplicate = existing.fragments.some(
              (f) => f.content === update.fragment.content
            );
            if (!isDuplicate && existing.fragments.length < MAX_FRAGMENTS_PER_ENTRY) {
              codex[update.id] = {
                ...existing,
                fragments: [
                  ...existing.fragments,
                  {
                    id: `frag_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                    ...update.fragment,
                    sceneIndex: next.scenes?.length || 0,
                    timestamp: Date.now(),
                  },
                ],
                tags: [...new Set([...(existing.tags || []), ...(update.tags || [])])],
                relatedEntries: [...new Set([...(existing.relatedEntries || []), ...(update.relatedEntries || [])])],
              };
            }
          } else if (Object.keys(codex).length < MAX_CODEX_ENTRIES) {
            codex[update.id] = {
              id: update.id,
              name: update.name,
              category: update.category || 'concept',
              fragments: [{
                id: `frag_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                ...update.fragment,
                sceneIndex: next.scenes?.length || 0,
                timestamp: Date.now(),
              }],
              tags: update.tags || [],
              relatedEntries: update.relatedEntries || [],
              firstDiscovered: Date.now(),
            };
          }
        }
        next.world = { ...next.world, codex };
      }

      // --- Auto-populate knowledgeBase.characters and .locations ---
      {
        const kb = { ...(next.world.knowledgeBase || { characters: {}, locations: {}, events: [], decisions: [], plotThreads: [] }) };
        let kbChanged = false;
        const sceneIdx = next.scenes?.length || 0;

        if (changes.npcs?.length > 0) {
          const kbChars = { ...(kb.characters || {}) };
          for (const npc of (next.world.npcs || [])) {
            const changedNpc = changes.npcs.find((n) => n.name?.toLowerCase() === npc.name?.toLowerCase());
            if (!changedNpc) continue;
            const key = npc.name.toLowerCase();
            const existing = kbChars[key] || { interactionCount: 0, knownFacts: [] };
            kbChars[key] = {
              name: npc.name,
              lastSeen: npc.lastLocation || existing.lastSeen || '',
              lastSeenScene: sceneIdx,
              disposition: npc.disposition ?? existing.disposition ?? 0,
              factionId: npc.factionId || existing.factionId || null,
              role: npc.role || existing.role || '',
              alive: npc.alive ?? existing.alive ?? true,
              interactionCount: existing.interactionCount + 1,
              knownFacts: existing.knownFacts,
              relationships: npc.relationships || existing.relationships || [],
            };
          }
          kb.characters = kbChars;
          kbChanged = true;
        }

        const currentLoc = changes.currentLocation || next.world.currentLocation;
        if (currentLoc) {
          const kbLocs = { ...(kb.locations || {}) };
          const key = currentLoc.toLowerCase();
          const existing = kbLocs[key] || { visitCount: 0, knownFacts: [], npcsEncountered: [] };
          const npcsHere = (next.world.npcs || [])
            .filter((n) => n.alive !== false && n.lastLocation?.toLowerCase() === currentLoc.toLowerCase())
            .map((n) => n.name);
          const mergedNpcs = [...new Set([...(existing.npcsEncountered || []), ...npcsHere])];
          kbLocs[key] = {
            name: currentLoc,
            visitCount: existing.visitCount + (changes.currentLocation ? 1 : 0),
            lastVisited: sceneIdx,
            knownFacts: existing.knownFacts,
            npcsEncountered: mergedNpcs,
          };
          kb.locations = kbLocs;
          kbChanged = true;
        }

        if (kbChanged) {
          next.world = { ...next.world, knowledgeBase: kb };
        }
      }

      if (next.character?.needs) {
        const needs = next.character.needs;
        const hasRestCrisis = (needs.rest ?? 100) === 0;
        if (hasRestCrisis && !next.character.needsPenalty) {
          next.character = { ...next.character, needsPenalty: -10 };
        } else if (!hasRestCrisis && next.character.needsPenalty) {
          next.character = { ...next.character, needsPenalty: 0 };
        }
      }

      if (changes.activeEffects?.length > 0) {
        let effects = [...(next.world.activeEffects || [])];
        for (const fx of changes.activeEffects) {
          if (fx.action === 'add') {
            effects.push({
              id: fx.id || `fx_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
              type: fx.type || 'other',
              location: fx.location || '',
              description: fx.description || '',
              placedBy: fx.placedBy || '',
              active: true,
            });
          } else if (fx.action === 'remove') {
            effects = effects.filter((e) => e.id !== fx.id);
          } else if (fx.action === 'trigger') {
            effects = effects.map((e) => (e.id === fx.id ? { ...e, active: false } : e));
          }
        }
        next.world = { ...next.world, activeEffects: effects };
      }

      if (changes.criticalWounds && Array.isArray(changes.criticalWounds) && next.character) {
        next.character = {
          ...next.character,
          criticalWounds: [...(next.character.criticalWounds || []), ...changes.criticalWounds],
        };
      }

      if (changes.healCriticalWound && next.character) {
        next.character = {
          ...next.character,
          criticalWounds: (next.character.criticalWounds || []).filter(
            (cw) => cw.name !== changes.healCriticalWound
          ),
        };
      }

      if (changes.factionChanges && typeof changes.factionChanges === 'object') {
        const factions = { ...(next.world.factions || {}) };
        for (const [factionId, delta] of Object.entries(changes.factionChanges)) {
          const current = factions[factionId] || 0;
          factions[factionId] = Math.max(-100, Math.min(100, current + delta));
        }
        next.world = { ...next.world, factions };
      }

      if (changes.combatUpdate && changes.combatUpdate.active) {
        const allies = (next.party || []).filter((c) => c.id !== next.activeCharacterId);
        next.combat = createCombatState(next.character, changes.combatUpdate.enemies || [], allies);
        next.combat.reason = changes.combatUpdate.reason;
      } else if (changes.combatUpdate && !changes.combatUpdate.active) {
        next.combat = null;
      }

      if (changes.dialogueUpdate && changes.dialogueUpdate.active) {
        const dialogueNpcs = (changes.dialogueUpdate.npcs || []).map((npc) => {
          const worldNpc = (next.world?.npcs || []).find(
            (n) => n.name?.toLowerCase() === npc.name?.toLowerCase()
          );
          return {
            name: npc.name,
            attitude: npc.attitude || worldNpc?.attitude || 'neutral',
            role: worldNpc?.role || '',
            personality: worldNpc?.personality || '',
            goal: npc.goal || '',
          };
        });
        next.dialogue = createDialogueState(next.character, dialogueNpcs);
        next.dialogue.reason = changes.dialogueUpdate.reason || '';
      } else if (changes.dialogueUpdate && !changes.dialogueUpdate.active) {
        if (next.dialogue) {
          next.dialogueCooldown = next.dialogue.round || 0;
        }
        next.dialogue = null;
      }

      if (changes.weatherUpdate) {
        next.world = { ...next.world, weather: changes.weatherUpdate };
      }

      // --- Act progression ---
      if (next.campaign?.structure?.acts?.length > 0) {
        const structure = { ...next.campaign.structure };
        const currentAct = structure.acts.find((a) => a.number === structure.currentAct);
        if (currentAct) {
          const scenesBeforeAct = structure.acts
            .filter((a) => a.number < structure.currentAct)
            .reduce((sum, a) => sum + (a.targetScenes || 0), 0);
          const scenesInAct = (next.scenes?.length || 0) - scenesBeforeAct;
          if (scenesInAct >= (currentAct.targetScenes || 999)) {
            const nextActNum = structure.currentAct + 1;
            if (structure.acts.some((a) => a.number === nextActNum)) {
              structure.currentAct = nextActNum;
              next.campaign = { ...next.campaign, structure };
            }
          }
        }
      }

      if (changes.currentLocation) {
        const explored = new Set(next.world.exploredLocations || []);
        explored.add(changes.currentLocation);
        next.world = { ...next.world, exploredLocations: [...explored] };
        const prevLoc = next.world.currentLocation;
        const newLoc = changes.currentLocation;
        let mapConns = [...(next.world.mapConnections || [])];
        let mapSt = [...(next.world.mapState || [])];

        if (prevLoc && newLoc && prevLoc.toLowerCase() !== newLoc.toLowerCase()) {
          const already = mapConns.some(
            (c) =>
              (c.from.toLowerCase() === prevLoc.toLowerCase() && c.to.toLowerCase() === newLoc.toLowerCase()) ||
              (c.from.toLowerCase() === newLoc.toLowerCase() && c.to.toLowerCase() === prevLoc.toLowerCase())
          );
          if (!already) {
            mapConns.push({ from: prevLoc, to: newLoc });
          }

          for (const locName of [prevLoc, newLoc]) {
            if (!mapSt.some((m) => m.name?.toLowerCase() === locName.toLowerCase())) {
              mapSt.push({
                id: `loc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                name: locName,
                description: '',
                modifications: [],
              });
            }
          }
        }

        next.world = { ...next.world, currentLocation: newLoc, mapConnections: mapConns, mapState: mapSt };
      }

      if (changes.narrativeSeeds?.length > 0) {
        const existing = next.world.narrativeSeeds || [];
        const newSeeds = changes.narrativeSeeds
          .filter((s) => !existing.some((e) => e.id === s.id))
          .map((s) => ({ ...s, planted: s.planted ?? (next.scenes?.length || 0) }));
        next.world = { ...next.world, narrativeSeeds: [...existing, ...newSeeds].slice(-30) };
      }

      if (changes.resolvedSeeds?.length > 0) {
        const seeds = (next.world.narrativeSeeds || []).map((s) =>
          changes.resolvedSeeds.includes(s.id) ? { ...s, resolved: true } : s
        );
        next.world = { ...next.world, narrativeSeeds: seeds };
      }

      if (changes.npcAgendas?.length > 0) {
        const existing = next.world.npcAgendas || [];
        const merged = [...existing];
        for (const agenda of changes.npcAgendas) {
          const idx = merged.findIndex((a) => a.npcName?.toLowerCase() === agenda.npcName?.toLowerCase());
          if (idx >= 0) {
            merged[idx] = { ...merged[idx], ...agenda };
          } else {
            merged.push({ ...agenda, plantedScene: agenda.plantedScene ?? (next.scenes?.length || 0) });
          }
        }
        next.world = { ...next.world, npcAgendas: merged.slice(-20) };
      }

      if (changes.pendingCallbacks?.length > 0 && next.world?.knowledgeBase) {
        const kb = { ...next.world.knowledgeBase };
        const decisions = [...(kb.decisions || [])];
        if (decisions.length > 0) {
          const last = { ...decisions[decisions.length - 1] };
          last.pendingCallbacks = [...(last.pendingCallbacks || []), ...changes.pendingCallbacks];
          decisions[decisions.length - 1] = last;
        }
        kb.decisions = decisions;
        next.world = { ...next.world, knowledgeBase: kb };
      }

      if (changes.mapMode && next.world?.fieldMap) {
        const fm = next.world.fieldMap;
        const newMode = changes.mapMode;
        const newVariant = newMode === 'trakt' ? (changes.roadVariant || null) : null;
        if (fm.mapMode !== newMode || fm.roadVariant !== newVariant) {
          next.world = {
            ...next.world,
            fieldMap: {
              ...fm,
              mapMode: newMode,
              roadVariant: newVariant,
              chunks: {},
              stepCounter: 0,
              stepBuffer: [],
              discoveredPoi: [],
            },
          };
        }
      }

      return next;
    }

    case 'ADD_AI_COST': {
      const entry = action.payload;
      const costs = state.aiCosts || { total: 0, breakdown: { ai: 0, image: 0, tts: 0, sfx: 0, music: 0 }, history: [] };
      const cost = entry.cost || 0;
      const history = costs.history.length >= 200 ? costs.history.slice(-199) : costs.history;
      return {
        ...state,
        aiCosts: {
          total: costs.total + cost,
          breakdown: { ...costs.breakdown, [entry.type]: (costs.breakdown[entry.type] || 0) + cost },
          history: [...history, entry],
        },
      };
    }

    case 'SET_CHARACTER_LOCAL_ID':
      return { ...state, character: { ...state.character, localId: action.payload } };

    case 'MAP_CHARACTER_VOICE': {
      const { characterName, voiceId, gender } = action.payload;
      const next = {
        ...state,
        characterVoiceMap: {
          ...state.characterVoiceMap,
          [characterName]: { voiceId, gender },
        },
      };
      if (state.character && state.character.name === characterName) {
        next.character = {
          ...state.character,
          voiceId: voiceId || null,
          voiceName: action.payload.voiceName || state.character.voiceName || null,
        };
      }
      return next;
    }

    case 'SET_NARRATOR_VOICE':
      return { ...state, narratorVoiceId: action.payload || null };

    case 'START_COMBAT': {
      return { ...state, combat: action.payload };
    }

    case 'UPDATE_COMBAT': {
      if (!state.combat) return state;
      return { ...state, combat: { ...state.combat, ...action.payload } };
    }

    case 'END_COMBAT': {
      return { ...state, combat: null };
    }

    case 'START_DIALOGUE': {
      return { ...state, dialogue: action.payload };
    }

    case 'UPDATE_DIALOGUE': {
      if (!state.dialogue) return state;
      return { ...state, dialogue: { ...state.dialogue, ...action.payload } };
    }

    case 'END_DIALOGUE': {
      const cooldown = state.dialogue?.round || 0;
      return { ...state, dialogue: null, dialogueCooldown: cooldown };
    }

    case 'ADD_PARTY_COMPANION': {
      const companion = { ...action.payload, type: 'companion' };
      return { ...state, party: [...(state.party || []), companion] };
    }

    case 'UPDATE_PARTY_MEMBER': {
      const { id, updates } = action.payload;
      return {
        ...state,
        party: (state.party || []).map((m) =>
          (m.id || m.name) === id ? { ...m, ...updates } : m
        ),
      };
    }

    case 'SET_ACTIVE_CHARACTER': {
      return { ...state, activeCharacterId: action.payload };
    }

    case 'UPDATE_ACHIEVEMENTS': {
      return { ...state, achievements: { ...state.achievements, ...action.payload } };
    }

    case 'ADD_NARRATION_TIME': {
      return { ...state, narrationTime: (state.narrationTime || 0) + (action.payload || 0) };
    }

    case 'SET_PLAY_TIME': {
      return { ...state, totalPlayTime: action.payload || 0 };
    }

    case 'INIT_FIELD_MAP': {
      const { seed, chunkSize, playerPos, activeBiome, mapMode, roadVariant } = action.payload;
      return {
        ...state,
        world: {
          ...state.world,
          fieldMap: {
            seed: seed || Date.now(),
            chunkSize: chunkSize || 64,
            chunks: {},
            playerPos: playerPos || { x: 32, y: 32 },
            activeBiome: activeBiome || 'plains',
            mapMode: mapMode || 'pola',
            roadVariant: roadVariant || null,
            stepCounter: 0,
            stepBuffer: [],
            discoveredPoi: [],
            interior: null,
          },
        },
      };
    }

    case 'FIELD_MAP_SET_CHUNKS': {
      if (!state.world?.fieldMap) return state;
      return {
        ...state,
        world: {
          ...state.world,
          fieldMap: {
            ...state.world.fieldMap,
            chunks: { ...state.world.fieldMap.chunks, ...action.payload },
          },
        },
      };
    }

    case 'FIELD_MAP_MOVE_PLAYER': {
      if (!state.world?.fieldMap) return state;
      const fm = state.world.fieldMap;
      const { x, y, tile, biome } = action.payload;
      const nextCounter = fm.stepCounter + 1;
      const nextBuffer = [...fm.stepBuffer, { x, y, tile, biome, ts: Date.now() }];
      return {
        ...state,
        world: {
          ...state.world,
          fieldMap: {
            ...fm,
            playerPos: { x, y },
            stepCounter: nextCounter,
            stepBuffer: nextBuffer,
          },
        },
      };
    }

    case 'FIELD_MAP_RESET_STEPS': {
      if (!state.world?.fieldMap) return state;
      return {
        ...state,
        world: {
          ...state.world,
          fieldMap: {
            ...state.world.fieldMap,
            stepCounter: 0,
            stepBuffer: [],
          },
        },
      };
    }

    case 'FIELD_MAP_DISCOVER_POI': {
      if (!state.world?.fieldMap) return state;
      const existing = state.world.fieldMap.discoveredPoi;
      const poi = action.payload;
      if (existing.some((p) => p.x === poi.x && p.y === poi.y)) return state;
      return {
        ...state,
        world: {
          ...state.world,
          fieldMap: {
            ...state.world.fieldMap,
            discoveredPoi: [...existing, poi],
          },
        },
      };
    }

    case 'FIELD_MAP_SET_BIOME': {
      if (!state.world?.fieldMap) return state;
      return {
        ...state,
        world: {
          ...state.world,
          fieldMap: {
            ...state.world.fieldMap,
            activeBiome: action.payload,
          },
        },
      };
    }

    case 'FIELD_MAP_SET_MODE': {
      if (!state.world?.fieldMap) return state;
      const { mapMode, roadVariant } = action.payload;
      const fm = state.world.fieldMap;
      if (fm.mapMode === mapMode && fm.roadVariant === (roadVariant || null)) return state;
      return {
        ...state,
        world: {
          ...state.world,
          fieldMap: {
            ...fm,
            mapMode: mapMode || fm.mapMode,
            roadVariant: mapMode === 'trakt' ? (roadVariant || null) : null,
            chunks: {},
            stepCounter: 0,
            stepBuffer: [],
            discoveredPoi: [],
          },
        },
      };
    }

    case 'FIELD_MAP_SET_INTERIOR': {
      if (!state.world?.fieldMap) return state;
      return {
        ...state,
        world: {
          ...state.world,
          fieldMap: {
            ...state.world.fieldMap,
            interior: action.payload,
          },
        },
      };
    }

    default:
      return state;
  }
}

export function GameProvider({ children }) {
  const [state, dispatch] = useReducer(gameReducer, initialState);
  const stateRef = useRef(state);
  const saveTimerRef = useRef(null);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const autoSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      const current = stateRef.current;
      if (current.campaign) {
        storage.saveCampaign(current).catch((err) => {
          console.error('[GameContext] Save error:', err);
        });

        if (current.character) {
          const charCopy = { ...current.character };
          storage.saveCharacter(charCopy).then(() => {
            if (!current.character.localId && charCopy.localId) {
              dispatch({ type: 'SET_CHARACTER_LOCAL_ID', payload: charCopy.localId });
            }
          });
        }
      }
    }, 1500);
  }, []);

  useEffect(() => {
    const flushSave = () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
        const current = stateRef.current;
        if (current.campaign) {
          storage.saveCampaign(current).catch(() => {});
        }
      }
    };
    window.addEventListener('beforeunload', flushSave);
    return () => {
      window.removeEventListener('beforeunload', flushSave);
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  const value = {
    state,
    dispatch,
    autoSave,
  };

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame() {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame must be used within GameProvider');
  return ctx;
}

export { createDefaultNeeds, createDefaultAchievementState };
