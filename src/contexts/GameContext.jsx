import { createContext, useContext, useReducer, useCallback, useRef, useEffect } from 'react';
import { storage } from '../services/storage';

const GameContext = createContext(null);

function createDefaultNeeds() {
  return { hunger: 100, thirst: 100, bladder: 100, hygiene: 100, rest: 100 };
}

function hourToPeriod(hour) {
  if (hour >= 6 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'afternoon';
  if (hour >= 18 && hour < 22) return 'evening';
  return 'night';
}

const DECAY_PER_HOUR = { hunger: 4.2, thirst: 5.5, bladder: 13, hygiene: 2, rest: 5.5 };
const PERIOD_START_HOUR = { morning: 6, afternoon: 12, evening: 18, night: 22 };

function decayNeeds(needs, hoursElapsed) {
  const updated = { ...needs };
  for (const key of Object.keys(DECAY_PER_HOUR)) {
    updated[key] = Math.max(0, Math.round(((updated[key] ?? 100) - DECAY_PER_HOUR[key] * hoursElapsed) * 10) / 10);
  }
  return updated;
}

function createDefaultCharacter() {
  return {
    name: 'Adventurer',
    class: 'Wanderer',
    level: 1,
    xp: 0,
    hp: 100,
    maxHp: 100,
    mana: 50,
    maxMana: 50,
    stats: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    inventory: [],
    statuses: [],
    skills: [],
    backstory: '',
    needs: createDefaultNeeds(),
  };
}

const initialState = {
  campaign: null,
  character: null,
  characters: [],
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
  },
  quests: { active: [], completed: [] },
  scenes: [],
  chatHistory: [],
  characterVoiceMap: {},
  isLoading: false,
  error: null,
  aiCosts: { total: 0, breakdown: { ai: 0, image: 0, tts: 0, sfx: 0, music: 0 }, history: [] },
  isGeneratingScene: false,
  isGeneratingImage: false,
  isGeneratingMusic: false,
};

function gameReducer(state, action) {
  switch (action.type) {
    case 'START_CAMPAIGN': {
      const char = action.payload.character || createDefaultCharacter();
      return {
        ...initialState,
        campaign: action.payload.campaign,
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
      loaded.aiCosts = { ...defaultCosts, ...loaded.aiCosts };
      if (loaded.character && !loaded.character.needs) {
        loaded.character = { ...loaded.character, needs: createDefaultNeeds() };
      }
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
          stats: { ...state.character.stats, ...action.payload },
        },
      };

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

    case 'UPDATE_SCENE_MUSIC':
      return state;

    case 'APPLY_STATE_CHANGES': {
      const changes = action.payload;
      let next = { ...state };

      if (changes.hp !== undefined || changes.mana !== undefined || changes.xp !== undefined) {
        next.character = { ...next.character };
        if (changes.hp !== undefined) next.character.hp = Math.max(0, Math.min(next.character.maxHp, next.character.hp + changes.hp));
        if (changes.mana !== undefined) next.character.mana = Math.max(0, Math.min(next.character.maxMana, next.character.mana + changes.mana));
        if (changes.xp !== undefined) {
          next.character.xp = next.character.xp + changes.xp;
          const xpThreshold = next.character.level * 100;
          if (next.character.xp >= xpThreshold) {
            next.character.level += 1;
            next.character.xp -= xpThreshold;
            next.character.maxHp += 10;
            next.character.hp = next.character.maxHp;
            next.character.maxMana += 5;
            next.character.mana = next.character.maxMana;
          }
        }
      }

      if (changes.newItems) {
        next.character = {
          ...next.character,
          inventory: [...next.character.inventory, ...changes.newItems],
        };
      }

      if (changes.removeItems) {
        next.character = {
          ...next.character,
          inventory: next.character.inventory.filter(
            (i) => !changes.removeItems.includes(i.id)
          ),
        };
      }

      if (changes.newQuests) {
        next.quests = {
          ...next.quests,
          active: [...next.quests.active, ...changes.newQuests],
        };
      }

      if (changes.completedQuests) {
        const completed = next.quests.active.filter((q) =>
          changes.completedQuests.includes(q.id)
        );
        next.quests = {
          active: next.quests.active.filter(
            (q) => !changes.completedQuests.includes(q.id)
          ),
          completed: [...next.quests.completed, ...completed.map((q) => ({ ...q, completedAt: Date.now() }))],
        };
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
            });
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

      if (changes.currentLocation) {
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

export { createDefaultNeeds, hourToPeriod };
