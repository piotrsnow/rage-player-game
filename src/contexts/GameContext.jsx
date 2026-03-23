import { createContext, useContext, useReducer, useCallback, useRef, useEffect } from 'react';
import { storage } from '../services/storage';
import { calculateWounds, normalizeMoney } from '../services/gameState';
import { DECAY_PER_HOUR, hourToPeriod, decayNeeds } from '../services/timeUtils';
import {
  getAdvancementCost,
  ADVANCEMENT_COSTS,
  isCharacteristicInCareer,
  isSkillInCareer,
  isTalentInCareer,
  getCareerByName,
  canAdvanceTier,
} from '../data/wfrp';

const GameContext = createContext(null);

function createDefaultNeeds() {
  return { hunger: 100, thirst: 100, bladder: 100, hygiene: 100, rest: 100 };
}

const PERIOD_START_HOUR = { morning: 6, afternoon: 12, evening: 18, night: 22 };

function createDefaultCharacter() {
  return {
    name: 'Adventurer',
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
    needs: createDefaultNeeds(),
    criticalWounds: [],
  };
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
  },
  quests: { active: [], completed: [] },
  scenes: [],
  chatHistory: [],
  characterVoiceMap: {},
  isLoading: false,
  error: null,
  aiCosts: { total: 0, breakdown: { ai: 0, image: 0, tts: 0, sfx: 0, music: 0 }, history: [] },
  momentumBonus: 0,
  isGeneratingScene: false,
  isGeneratingImage: false,
  isGeneratingMusic: false,
  combat: null,
  undoStack: [],
  achievements: createDefaultAchievementState(),
  magic: { storedWindPoints: 0, activeSpells: [], knownSpells: [] },
};

function gameReducer(state, action) {
  switch (action.type) {
    case 'START_CAMPAIGN': {
      const char = action.payload.character || createDefaultCharacter();
      const campaignData = {
        ...action.payload.campaign,
        status: 'active',
      };
      return {
        ...initialState,
        campaign: campaignData,
        character: { ...char, needs: char.needs || createDefaultNeeds() },
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
      loaded.isGeneratingMusic = false;
      loaded.error = null;
      loaded.aiCosts = { ...defaultCosts, ...loaded.aiCosts };
      if (loaded.character && !loaded.character.needs) {
        loaded.character = { ...loaded.character, needs: createDefaultNeeds() };
      }
      if (!loaded.achievements) loaded.achievements = createDefaultAchievementState();
      if (!loaded.magic) loaded.magic = { storedWindPoints: 0, activeSpells: [], knownSpells: [] };
      if (!loaded.party) loaded.party = [];
      if (loaded.world && !loaded.world.exploredLocations) loaded.world.exploredLocations = [];
      if (loaded.world && !loaded.world.weather) loaded.world.weather = null;
      if (loaded.world && !loaded.world.knowledgeBase) {
        loaded.world.knowledgeBase = { characters: {}, locations: {}, events: [], decisions: [], plotThreads: [] };
      }
      if (loaded.world && !loaded.world.codex) {
        loaded.world.codex = {};
      }
      if (loaded.campaign && !loaded.campaign.status) loaded.campaign.status = 'active';
      return loaded;
    }

    case 'RESET':
      return initialState;

    case 'ADD_SCENE':
      return {
        ...state,
        scenes: [...state.scenes, action.payload],
      };

    case 'UPDATE_SCENE_IMAGE': {
      const scenes = [...state.scenes];
      const idx = scenes.findIndex((s) => s.id === action.payload.sceneId);
      if (idx >= 0) {
        scenes[idx] = { ...scenes[idx], image: action.payload.image };
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
        character: { ...state.character, ...action.payload },
      };

    case 'UPDATE_CHARACTER_STATS':
      return {
        ...state,
        character: {
          ...state.character,
          characteristics: { ...state.character.characteristics, ...action.payload },
        },
      };

    case 'UPDATE_CAREER': {
      const { career } = action.payload;
      return {
        ...state,
        character: {
          ...state.character,
          career: { ...state.character.career, ...career },
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

    case 'SPEND_FATE': {
      if (state.character.fate <= 0) return state;
      return {
        ...state,
        character: { ...state.character, fate: state.character.fate - 1 },
      };
    }

    case 'SPEND_RESOLVE': {
      if (state.character.resolve <= 0) return state;
      return {
        ...state,
        character: { ...state.character, resolve: state.character.resolve - 1 },
      };
    }

    case 'SPEND_RESILIENCE': {
      if (state.character.resilience <= 0) return state;
      return {
        ...state,
        character: { ...state.character, resilience: state.character.resilience - 1 },
      };
    }

    case 'UPDATE_SKILLS': {
      const { skills } = action.payload;
      return {
        ...state,
        character: {
          ...state.character,
          skills: { ...state.character.skills, ...skills },
        },
      };
    }

    case 'ADD_TALENT': {
      const { talent } = action.payload;
      if (state.character.talents.includes(talent)) return state;
      return {
        ...state,
        character: {
          ...state.character,
          talents: [...state.character.talents, talent],
        },
      };
    }

    case 'SPEND_XP': {
      const { cost } = action.payload;
      return {
        ...state,
        character: {
          ...state.character,
          xpSpent: state.character.xpSpent + cost,
        },
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

    case 'ADD_INVENTORY_ITEM':
      return {
        ...state,
        character: {
          ...state.character,
          inventory: [...state.character.inventory, action.payload],
        },
      };

    case 'REMOVE_INVENTORY_ITEM':
      return {
        ...state,
        character: {
          ...state.character,
          inventory: state.character.inventory.filter((i) => i.id !== action.payload),
        },
      };

    case 'ADD_QUEST':
      return {
        ...state,
        quests: {
          ...state.quests,
          active: [...state.quests.active, action.payload],
        },
      };

    case 'COMPLETE_QUEST': {
      const quest = state.quests.active.find((q) => q.id === action.payload);
      if (!quest) return state;
      return {
        ...state,
        quests: {
          active: state.quests.active.filter((q) => q.id !== action.payload),
          completed: [...state.quests.completed, { ...quest, completedAt: Date.now() }],
        },
      };
    }

    case 'UPDATE_WORLD':
      return {
        ...state,
        world: { ...state.world, ...action.payload },
      };

    case 'ADD_WORLD_FACT':
      return {
        ...state,
        world: {
          ...state.world,
          facts: [...state.world.facts, action.payload],
        },
      };

    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };

    case 'SET_ERROR':
      return { ...state, error: action.payload, isLoading: false };

    case 'SET_GENERATING_SCENE':
      return { ...state, isGeneratingScene: action.payload };

    case 'SET_GENERATING_IMAGE':
      return { ...state, isGeneratingImage: action.payload };

    case 'SET_GENERATING_MUSIC':
      return { ...state, isGeneratingMusic: action.payload };

    case 'SET_MOMENTUM':
      return { ...state, momentumBonus: action.payload };

    case 'UPDATE_SCENE_MUSIC':
      return state;

    case 'END_CAMPAIGN': {
      const { status, epilogue } = action.payload;
      return {
        ...state,
        campaign: {
          ...state.campaign,
          status: status || 'completed',
          epilogue: epilogue || '',
        },
      };
    }

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
        }));
        next.quests = {
          ...next.quests,
          active: [...next.quests.active, ...normalized],
        };
      }

      if (changes.completedQuests) {
        // State consistency: only complete quests that exist in active
        const activeIds = new Set(next.quests.active.map((q) => q.id));
        const validIds = changes.completedQuests.filter((id) => activeIds.has(id));
        if (validIds.length > 0) {
          const completed = next.quests.active.filter((q) => validIds.includes(q.id));
          next.quests = {
            active: next.quests.active.filter((q) => !validIds.includes(q.id)),
            completed: [...next.quests.completed, ...completed.map((q) => ({ ...q, completedAt: Date.now() }))],
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
            });
          } else if (npc.action === 'introduce' && idx >= 0) {
            // State consistency: "introduce" for existing NPC -> merge instead of duplicate
            npcs[idx] = {
              ...npcs[idx],
              ...(npc.gender && { gender: npc.gender }),
              ...(npc.role && { role: npc.role }),
              ...(npc.personality && { personality: npc.personality }),
              ...(npc.attitude && { attitude: npc.attitude }),
              ...(npc.location && { lastLocation: npc.location }),
              ...(npc.notes && { notes: npc.notes }),
            };
          } else if (idx >= 0) {
            npcs[idx] = {
              ...npcs[idx],
              ...(npc.gender && { gender: npc.gender }),
              ...(npc.role && { role: npc.role }),
              ...(npc.personality && { personality: npc.personality }),
              ...(npc.attitude && { attitude: npc.attitude }),
              ...(npc.location && { lastLocation: npc.location }),
              ...(npc.notes && { notes: npc.notes }),
              ...(npc.alive !== undefined && { alive: npc.alive }),
              ...(typeof npc.dispositionChange === 'number' && {
                disposition: (npcs[idx].disposition || 0) + npc.dispositionChange,
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
              threads[idx] = { ...threads[idx], ...pt };
            } else {
              threads.push({ ...pt, relatedScenes: [next.scenes?.length || 0] });
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

      if (changes.combatUpdate) {
        next.combat = changes.combatUpdate;
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
      return {
        ...state,
        characterVoiceMap: {
          ...state.characterVoiceMap,
          [characterName]: { voiceId, gender },
        },
      };
    }

    case 'PUSH_UNDO': {
      const MAX_UNDO = 10;
      const snapshot = {
        timestamp: Date.now(),
        character: state.character ? structuredClone(state.character) : null,
        world: state.world ? structuredClone(state.world) : null,
        quests: state.quests ? structuredClone(state.quests) : null,
      };
      const stack = [...(state.undoStack || []), snapshot];
      return { ...state, undoStack: stack.length > MAX_UNDO ? stack.slice(-MAX_UNDO) : stack };
    }

    case 'UNDO_STATE_CHANGES': {
      const stack = state.undoStack || [];
      if (stack.length === 0) return state;
      const last = stack[stack.length - 1];
      return {
        ...state,
        character: last.character || state.character,
        world: last.world || state.world,
        quests: last.quests || state.quests,
        undoStack: stack.slice(0, -1),
      };
    }

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

    case 'UPDATE_FACTIONS': {
      return {
        ...state,
        world: {
          ...state.world,
          factions: { ...(state.world.factions || {}), ...action.payload },
        },
      };
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

    case 'REMOVE_PARTY_COMPANION': {
      return {
        ...state,
        party: (state.party || []).filter((m) => (m.id || m.name) !== action.payload),
      };
    }

    case 'SET_ACTIVE_CHARACTER': {
      return { ...state, activeCharacterId: action.payload };
    }

    case 'UPDATE_ACHIEVEMENTS': {
      return { ...state, achievements: { ...state.achievements, ...action.payload } };
    }

    case 'UPDATE_MAGIC': {
      return { ...state, magic: { ...(state.magic || {}), ...action.payload } };
    }

    case 'UPDATE_WEATHER': {
      return {
        ...state,
        world: { ...state.world, weather: action.payload },
      };
    }

    case 'ADD_EXPLORED_LOCATION': {
      const explored = new Set(state.world.exploredLocations || []);
      explored.add(action.payload);
      return {
        ...state,
        world: { ...state.world, exploredLocations: [...explored] },
      };
    }

    case 'LOAD_MULTIPLAYER_STATE': {
      const gs = action.payload;
      const myOdId = action.payload.myOdId || state.myOdId;
      const chars = gs.characters || state.characters;
      return {
        ...state,
        myOdId,
        campaign: gs.campaign || state.campaign,
        characters: chars,
        character: (myOdId && chars?.find((c) => c.odId === myOdId)) || chars?.[0] || state.character,
        world: gs.world || state.world,
        quests: gs.quests || state.quests,
        scenes: gs.scenes || state.scenes,
        chatHistory: gs.chatHistory || state.chatHistory,
      };
    }

    case 'MP_ADD_SCENE': {
      return {
        ...state,
        scenes: [...state.scenes, action.payload.scene],
        chatHistory: [...state.chatHistory, ...(action.payload.chatMessages || [])],
      };
    }

    case 'MP_APPLY_STATE_CHANGES': {
      const { stateChanges, myOdId: payloadOdId } = action.payload;
      const localOdId = payloadOdId || state.myOdId;
      let next = { ...state };

      if (stateChanges?.perCharacter && next.characters?.length > 0) {
        next.characters = next.characters.map((c) => {
          const changes = stateChanges.perCharacter[c.name];
          if (!changes) return c;
          const updated = { ...c };
          if (changes.woundsChange !== undefined) updated.wounds = Math.max(0, Math.min(updated.maxWounds, updated.wounds + changes.woundsChange));
          if (changes.xp !== undefined) updated.xp = updated.xp + changes.xp;
          if (changes.fortuneChange !== undefined) updated.fortune = Math.max(0, Math.min(updated.fate, updated.fortune + changes.fortuneChange));
          if (changes.resolveChange !== undefined) updated.resolve = Math.max(0, Math.min(updated.resilience, updated.resolve + changes.resolveChange));
          if (changes.newItems) updated.inventory = [...(updated.inventory || []), ...changes.newItems];
          if (changes.removeItems) updated.inventory = (updated.inventory || []).filter((i) => !changes.removeItems.includes(i.id));
          if (changes.moneyChange) {
            const cur = updated.money || { gold: 0, silver: 0, copper: 0 };
            updated.money = normalizeMoney({
              gold: (cur.gold || 0) + (changes.moneyChange.gold || 0),
              silver: (cur.silver || 0) + (changes.moneyChange.silver || 0),
              copper: (cur.copper || 0) + (changes.moneyChange.copper || 0),
            });
          }
          return updated;
        });
        next.character = (localOdId && next.characters.find((c) => c.odId === localOdId)) || next.characters[0];
      }

      if (stateChanges?.worldFacts) {
        next.world = { ...next.world, facts: [...(next.world.facts || []), ...stateChanges.worldFacts] };
      }
      if (stateChanges?.journalEntries) {
        next.world = { ...next.world, eventHistory: [...(next.world.eventHistory || []), ...stateChanges.journalEntries] };
      }
      if (stateChanges?.currentLocation) {
        next.world = { ...next.world, currentLocation: stateChanges.currentLocation };
      }
      if (stateChanges?.codexUpdates?.length > 0) {
        const codex = { ...(next.world.codex || {}) };
        for (const update of stateChanges.codexUpdates) {
          if (!update.id || !update.fragment?.content) continue;
          const existing = codex[update.id];
          if (existing) {
            const isDuplicate = existing.fragments.some((f) => f.content === update.fragment.content);
            if (!isDuplicate && existing.fragments.length < 10) {
              codex[update.id] = {
                ...existing,
                fragments: [...existing.fragments, { id: `frag_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, ...update.fragment, sceneIndex: next.scenes?.length || 0, timestamp: Date.now() }],
                tags: [...new Set([...(existing.tags || []), ...(update.tags || [])])],
                relatedEntries: [...new Set([...(existing.relatedEntries || []), ...(update.relatedEntries || [])])],
              };
            }
          } else if (Object.keys(codex).length < 100) {
            codex[update.id] = {
              id: update.id, name: update.name, category: update.category || 'concept',
              fragments: [{ id: `frag_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, ...update.fragment, sceneIndex: next.scenes?.length || 0, timestamp: Date.now() }],
              tags: update.tags || [], relatedEntries: update.relatedEntries || [], firstDiscovered: Date.now(),
            };
          }
        }
        next.world = { ...next.world, codex };
      }

      return next;
    }

    default:
      return state;
  }
}

export function GameProvider({ children }) {
  const [state, dispatch] = useReducer(gameReducer, initialState);
  const stateRef = useRef(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const autoSave = useCallback(() => {
    const current = stateRef.current;
    if (current.campaign) {
      try {
        const result = storage.saveCampaign(current);
        if (result?.pruned) {
          console.warn('[GameContext] Save required pruning – old scene images were removed to free space');
        }
        if (result && !result.saved) {
          console.error('[GameContext] Campaign could not be saved – localStorage quota full');
        }
      } catch (err) {
        console.error('[GameContext] Unexpected save error:', err);
      }

      if (current.character) {
        const charCopy = { ...current.character };
        storage.saveCharacter(charCopy).then(() => {
          if (!current.character.localId && charCopy.localId) {
            dispatch({ type: 'SET_CHARACTER_LOCAL_ID', payload: charCopy.localId });
          }
        });
      }
    }
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
