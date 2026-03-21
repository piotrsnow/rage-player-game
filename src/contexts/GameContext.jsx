import { createContext, useContext, useReducer, useCallback, useRef, useEffect } from 'react';
import { storage } from '../services/storage';

const GameContext = createContext(null);

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
  };
}

const initialState = {
  campaign: null,
  character: null,
  world: { locations: [], facts: [], eventHistory: [] },
  quests: { active: [], completed: [] },
  scenes: [],
  chatHistory: [],
  isLoading: false,
  error: null,
  isGeneratingScene: false,
  isGeneratingImage: false,
};

function gameReducer(state, action) {
  switch (action.type) {
    case 'START_CAMPAIGN':
      return {
        ...initialState,
        campaign: action.payload.campaign,
        character: action.payload.character || createDefaultCharacter(),
        world: action.payload.world || initialState.world,
        scenes: action.payload.scenes || [],
        chatHistory: action.payload.chatHistory || [],
      };

    case 'LOAD_CAMPAIGN':
      return {
        ...initialState,
        ...action.payload,
      };

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

      if (changes.statuses) {
        next.character = { ...next.character, statuses: changes.statuses };
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
      storage.saveCampaign(current);
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
