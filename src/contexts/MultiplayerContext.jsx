import { createContext, useContext, useReducer, useCallback, useEffect, useRef } from 'react';
import { wsService, clearPersistedRejoinInfo, getPersistedRejoinInfo } from '../services/websocket';
import { apiClient } from '../services/apiClient';
import { hourToPeriod, decayNeeds } from '../services/timeUtils';
import {
  normalizeMultiplayerStateChanges,
  WS_CLIENT_TYPES,
  WS_SERVER_TYPES,
} from '../../shared/contracts/multiplayer.js';

const MultiplayerContext = (import.meta.hot?.data?.MultiplayerContext) || createContext(null);
if (import.meta.hot) import.meta.hot.data.MultiplayerContext = MultiplayerContext;

const initialState = {
  isMultiplayer: false,
  isHost: false,
  roomCode: null,
  phase: null,
  players: [],
  myOdId: null,
  connected: false,
  gameState: null,
  roomSettings: null,
  isGenerating: false,
  error: null,
  errorCode: null,
  pendingCombatManoeuvre: null,
  isDead: false,
  typingPlayers: {},
  reconnectState: { status: 'disconnected', attempt: 0, delayMs: 0, maxAttempts: 10 },
};

function mpReducer(state, action) {
  switch (action.type) {
    case 'SET_CONNECTED':
      return { ...state, connected: action.payload };

    case 'SET_RECONNECT_STATE':
      return { ...state, reconnectState: action.payload };

    case 'ROOM_CREATED':
      return {
        ...state,
        isMultiplayer: true,
        isHost: true,
        roomCode: action.payload.roomCode,
        myOdId: action.payload.odId,
        phase: action.payload.room.phase,
        players: action.payload.room.players,
        roomSettings: action.payload.room.settings,
        error: null,
      };

    case 'ROOM_JOINED': {
      const joinedOdId = action.payload.odId;
      const joinedIsHost = action.payload.room.players.find((p) => p.odId === joinedOdId)?.isHost || false;
      return {
        ...state,
        isMultiplayer: true,
        isHost: joinedIsHost,
        roomCode: action.payload.roomCode,
        myOdId: joinedOdId,
        phase: action.payload.room.phase,
        players: action.payload.room.players,
        gameState: action.payload.room.gameState,
        roomSettings: action.payload.room.settings,
        error: null,
      };
    }

    case 'ROOM_STATE':
      return {
        ...state,
        phase: action.payload.room.phase,
        players: action.payload.room.players,
        gameState: action.payload.room.gameState,
        roomSettings: action.payload.room.settings ?? state.roomSettings,
        typingPlayers: Object.fromEntries(
          Object.entries(state.typingPlayers).filter(([id]) =>
            action.payload.room.players.some((player) => player.odId === id)
          )
        ),
      };

    case 'ROOM_CONVERTED':
      return {
        ...state,
        isMultiplayer: true,
        isHost: true,
        roomCode: action.payload.roomCode,
        myOdId: action.payload.odId,
        phase: action.payload.room.phase,
        players: action.payload.room.players,
        gameState: action.payload.room.gameState,
        roomSettings: action.payload.room.settings,
        error: null,
      };

    case 'PLAYER_JOINED':
      return {
        ...state,
        players: action.payload.room.players,
        roomSettings: action.payload.room.settings ?? state.roomSettings,
      };

    case 'PLAYER_JOINED_MIDGAME': {
      const updatedGameState = action.payload.room.gameState || state.gameState;
      return {
        ...state,
        players: action.payload.room.players,
        gameState: updatedGameState,
        roomSettings: action.payload.room.settings ?? state.roomSettings,
      };
    }

    case 'PLAYER_LEFT':
      return {
        ...state,
        players: action.payload.room.players,
        gameState: action.payload.room.gameState ?? state.gameState,
        isHost: action.payload.room.players.find((p) => p.odId === state.myOdId)?.isHost || state.isHost,
        roomSettings: action.payload.room.settings ?? state.roomSettings,
        typingPlayers: Object.fromEntries(
          Object.entries(state.typingPlayers).filter(([id]) =>
            action.payload.room.players.some((player) => player.odId === id)
          )
        ),
      };

    case 'PLAYER_DISCONNECTED':
      return {
        ...state,
        players: action.payload.room.players,
        isHost: action.payload.room.players.find((p) => p.odId === state.myOdId)?.isHost || state.isHost,
      };

    case 'PLAYER_RECONNECTED':
      return {
        ...state,
        players: action.payload.room.players,
      };

    case 'GAME_STARTING':
      return { ...state, isGenerating: true };

    case 'GAME_STARTED':
      return {
        ...state,
        phase: 'playing',
        gameState: action.payload.gameState,
        players: action.payload.room.players,
        isGenerating: false,
      };

    case 'ACTIONS_UPDATED':
      return {
        ...state,
        players: action.payload.room.players,
      };

    case 'SCENE_GENERATING':
      return { ...state, isGenerating: true };

    case 'GENERATION_FAILED':
      return {
        ...state,
        isGenerating: false,
        players: action.payload.room?.players || state.players,
        error: action.payload.message || 'Generation failed',
        errorCode: action.payload.code || null,
      };

    case 'SCENE_UPDATE': {
      let newGameState = action.payload.room?.gameState || state.gameState;
      const stateChanges = normalizeMultiplayerStateChanges(action.payload.stateChanges || {});

      if (!action.payload.room?.gameState && newGameState) {
        const perChar = stateChanges.perCharacter;
        if (perChar && newGameState.characters) {
          const updatedChars = newGameState.characters.map((c) => {
            const delta = perChar[c.name] || perChar[c.playerName];
            if (!delta) return c;
            const u = { ...c };
            if (delta.wounds != null) u.wounds = Math.max(0, Math.min(u.maxWounds || 12, (u.wounds ?? u.maxWounds ?? 12) + delta.wounds));
            if (delta.xp != null) u.xp = (u.xp || 0) + delta.xp;
            if (delta.hp != null && u.hp != null) u.hp = Math.max(0, Math.min(u.maxHp || 100, u.hp + delta.hp));
            if (delta.mana != null && u.mana != null) u.mana = Math.max(0, Math.min(u.maxMana || 50, u.mana + delta.mana));
            if (delta.fortuneChange != null) u.fortune = Math.max(0, Math.min(u.fate ?? 2, (u.fortune ?? 0) + delta.fortuneChange));
            if (delta.resolveChange != null) u.resolve = Math.max(0, Math.min(u.resilience ?? 1, (u.resolve ?? 0) + delta.resolveChange));
            if (Array.isArray(delta.newItems)) u.inventory = [...(u.inventory || []), ...delta.newItems];
            if (Array.isArray(delta.removeItems)) {
              const rmById = new Set(delta.removeItems.map((i) => (typeof i === 'string' ? i : i.id || i.name)));
              u.inventory = (u.inventory || []).filter((i) => !rmById.has(typeof i === 'string' ? i : i.id || i.name));
            }
            if (delta.moneyChange) {
              const cur = u.money || { gold: 0, silver: 0, copper: 0 };
              let total = ((cur.gold || 0) + (delta.moneyChange.gold || 0)) * 100
                + ((cur.silver || 0) + (delta.moneyChange.silver || 0)) * 10
                + ((cur.copper || 0) + (delta.moneyChange.copper || 0));
              if (total < 0) total = 0;
              u.money = { gold: Math.floor(total / 100), silver: Math.floor((total % 100) / 10), copper: total % 10 };
            }
            if (delta.needsChanges && u.needs) {
              const needs = { ...u.needs };
              for (const [key, val] of Object.entries(delta.needsChanges)) {
                if (key in needs) needs[key] = Math.max(0, Math.min(100, (needs[key] ?? 100) + val));
              }
              u.needs = needs;
            }
            if (delta.statuses) u.statuses = delta.statuses;
            if (Array.isArray(delta.criticalWounds)) {
              u.criticalWounds = [...(u.criticalWounds || []), ...delta.criticalWounds];
            }
            if (delta.healCriticalWound) {
              u.criticalWounds = (u.criticalWounds || []).filter((cw) => cw.name !== delta.healCriticalWound);
            }
            return u;
          });
          newGameState = { ...newGameState, characters: updatedChars };
        }

        if (stateChanges.timeAdvance) {
          const world = { ...(newGameState.world || {}) };
          const ts = world.timeState || { day: 1, timeOfDay: 'morning', hour: 6, season: 'unknown' };
          const hoursElapsed = stateChanges.timeAdvance.hoursElapsed || 0.5;
          let newHour = (ts.hour ?? 6) + hoursElapsed;
          let dayInc = 0;
          while (newHour >= 24) { newHour -= 24; dayInc++; }
          if (stateChanges.timeAdvance.newDay && dayInc === 0) dayInc = 1;
          world.timeState = {
            ...ts,
            hour: Math.round(newHour * 10) / 10,
            timeOfDay: hourToPeriod(newHour),
            day: ts.day + dayInc,
            ...(stateChanges.timeAdvance.season && { season: stateChanges.timeAdvance.season }),
          };

          if (newGameState.characters) {
            newGameState = {
              ...newGameState,
              characters: newGameState.characters.map((c) =>
                c.needs ? { ...c, needs: decayNeeds(c.needs, hoursElapsed) } : c
              ),
            };
          }

          newGameState = { ...newGameState, world };
        }

        if (stateChanges.currentLocation) {
          const world = { ...(newGameState.world || {}) };
          const prevLoc = world.currentLocation;
          const newLoc = stateChanges.currentLocation;
          let mapConns = [...(world.mapConnections || [])];
          let mapSt = [...(world.mapState || [])];

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

          world.currentLocation = newLoc;
          world.mapConnections = mapConns;
          world.mapState = mapSt;
          const explored = new Set(world.exploredLocations || []);
          explored.add(newLoc);
          world.exploredLocations = [...explored];
          newGameState = { ...newGameState, world };
        }

        if (Array.isArray(stateChanges.mapChanges) && stateChanges.mapChanges.length > 0) {
          const world = { ...(newGameState.world || {}) };
          const mapState = [...(world.mapState || [])];
          for (const change of stateChanges.mapChanges) {
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
          world.mapState = mapState;
          newGameState = { ...newGameState, world };
        }

        if (stateChanges.factionChanges && typeof stateChanges.factionChanges === 'object') {
          const world = { ...(newGameState.world || {}) };
          const factions = { ...(world.factions || {}) };
          for (const [factionId, delta] of Object.entries(stateChanges.factionChanges)) {
            factions[factionId] = Math.max(-100, Math.min(100, (factions[factionId] || 0) + delta));
          }
          world.factions = factions;
          newGameState = { ...newGameState, world };
        }

        if (stateChanges.campaignEnd && newGameState.campaign) {
          newGameState = {
            ...newGameState,
            campaign: {
              ...newGameState.campaign,
              status: stateChanges.campaignEnd.status || 'completed',
              epilogue: stateChanges.campaignEnd.epilogue || '',
            },
          };
        }
      }

      return {
        ...state,
        isGenerating: false,
        gameState: newGameState,
        players: action.payload.room?.players || state.players,
      };
    }

    case 'COMBAT_SYNC': {
      if (!state.gameState) return state;
      const chatMessages = action.payload.chatMessages || [];
      return {
        ...state,
        gameState: {
          ...state.gameState,
          combat: action.payload.combat,
          chatHistory: chatMessages.length > 0
            ? [...(state.gameState.chatHistory || []), ...chatMessages]
            : state.gameState.chatHistory,
        },
      };
    }

    case 'COMBAT_MANOEUVRE': {
      return {
        ...state,
        pendingCombatManoeuvre: action.payload,
      };
    }

    case 'COMBAT_ENDED': {
      if (!state.gameState) return state;
      let updatedChars = state.gameState.characters || [];
      const perChar = normalizeMultiplayerStateChanges({ perCharacter: action.payload.perCharacter || {} }).perCharacter || {};
      const deadList = action.payload.deadPlayers || [];
      updatedChars = updatedChars.map((c) => {
        const delta = perChar[c.name];
        if (!delta) return c;
        const u = { ...c };
        if (delta.wounds != null) u.wounds = Math.max(0, Math.min(u.maxWounds || 12, (u.wounds ?? u.maxWounds ?? 12) + delta.wounds));
        if (delta.xp != null) u.xp = (u.xp || 0) + delta.xp;
        if (Array.isArray(delta.criticalWounds) && delta.criticalWounds.length > 0) {
          u.criticalWounds = [...(u.criticalWounds || []), ...delta.criticalWounds];
        }
        if (u.wounds === 0 && delta.wounds < 0) {
          const critCount = (u.criticalWoundCount || 0) + 1;
          u.criticalWoundCount = critCount;
          if (critCount >= 3) {
            if ((u.fate || 0) > 0) {
              u.fate = u.fate - 1;
              u.fortune = Math.min(u.fortune || 0, u.fate);
              u.criticalWoundCount = 2;
              u.wounds = 1;
            } else {
              u.status = 'dead';
            }
          }
        }
        return u;
      });
      const myChar = updatedChars.find((c) => c.odId === state.myOdId);
      const isDead = myChar?.status === 'dead';
      return {
        ...state,
        isDead: isDead || state.isDead,
        gameState: {
          ...state.gameState,
          characters: updatedChars,
          combat: null,
        },
      };
    }

    case 'PLAYER_DIED': {
      const { playerOdId } = action.payload;
      return {
        ...state,
        isDead: state.isDead || (playerOdId === state.myOdId),
      };
    }

    case 'UPDATE_SCENE_IMAGE': {
      if (!state.gameState?.scenes) return state;
      const scenes = state.gameState.scenes.map((s) =>
        s.id === action.payload.sceneId ? { ...s, image: action.payload.image } : s
      );
      return {
        ...state,
        gameState: { ...state.gameState, scenes },
      };
    }

    case 'UPDATE_SCENE_GRID': {
      if (!state.gameState?.scenes) return state;
      const scenes = state.gameState.scenes.map((s) =>
        s.id === action.payload.sceneId
          ? { ...s, sceneGrid: action.payload.sceneGrid || s.sceneGrid || null }
          : s
      );
      return {
        ...state,
        gameState: { ...state.gameState, scenes },
      };
    }

    case 'QUEST_OFFER_UPDATE': {
      if (!state.gameState) return state;
      const { sceneId, offerId, status, quest, chatMessage } = action.payload;
      const updatedScenes = (state.gameState.scenes || []).map((s) =>
        s.id === sceneId
          ? { ...s, questOffers: (s.questOffers || []).map((o) => o.id === offerId ? { ...o, status } : o) }
          : s
      );
      let updatedQuests = state.gameState.quests || { active: [], completed: [] };
      if (status === 'accepted' && quest) {
        updatedQuests = { ...updatedQuests, active: [...updatedQuests.active, quest] };
      }
      const updatedChat = chatMessage
        ? [...(state.gameState.chatHistory || []), chatMessage]
        : state.gameState.chatHistory;
      return {
        ...state,
        gameState: { ...state.gameState, scenes: updatedScenes, quests: updatedQuests, chatHistory: updatedChat },
        players: action.payload.room?.players || state.players,
      };
    }

    case 'CHARACTER_SYNCED':
      return {
        ...state,
        gameState: action.payload.room?.gameState || state.gameState,
        players: action.payload.room?.players || state.players,
      };

    case 'TYPING_UPDATE': {
      const {
        odId: typingOdId,
        playerName,
        isTyping,
        draft = '',
      } = action.payload;
      const normalizedDraft = typeof draft === 'string' ? draft : '';
      const typingPlayers = { ...state.typingPlayers };
      if (isTyping) {
        typingPlayers[typingOdId] = {
          name: playerName,
          draft: normalizedDraft,
          isTyping: true,
        };
      } else {
        if (normalizedDraft) {
          typingPlayers[typingOdId] = {
            name: playerName,
            draft: normalizedDraft,
            isTyping: false,
          };
        } else {
          delete typingPlayers[typingOdId];
        }
      }
      return { ...state, typingPlayers };
    }

    case 'CLEAR_TYPING':
      return { ...state, typingPlayers: {} };

    case 'LEFT_ROOM':
    case 'RESET':
      return initialState;

    case 'SET_ERROR':
      return {
        ...state,
        error: typeof action.payload === 'string' ? action.payload : (action.payload?.message || 'Multiplayer error'),
        errorCode: typeof action.payload === 'object' ? (action.payload.code || null) : null,
        isGenerating: false,
      };

    default:
      return state;
  }
}

export function MultiplayerProvider({ children }) {
  const [state, dispatch] = useReducer(mpReducer, initialState);
  const sceneCallbackRef = useRef(null);
  const pendingQuestVerifyRef = useRef(new Map());

  useEffect(() => {
    const unsubs = [
      wsService.on('_connected', () => dispatch({ type: 'SET_CONNECTED', payload: true })),
      wsService.on('_disconnected', () => dispatch({ type: 'SET_CONNECTED', payload: false })),
      wsService.on('_reconnect_state', (msg) => dispatch({ type: 'SET_RECONNECT_STATE', payload: msg })),
      wsService.on('_reconnect_exhausted', () => {
        dispatch({
          type: 'SET_ERROR',
          payload: 'Connection to multiplayer server was lost. Reconnect attempts were exhausted. Please rejoin from lobby.',
        });
      }),
      wsService.on('_send_failed', () => {
        dispatch({
          type: 'SET_ERROR',
          payload: 'Action could not be sent because multiplayer connection is offline.',
        });
      }),
      wsService.on(WS_SERVER_TYPES.ROOM_CREATED, (msg) => {
        wsService.setRejoinInfo(msg.roomCode, msg.odId);
        dispatch({ type: 'ROOM_CREATED', payload: msg });
      }),
      wsService.on(WS_SERVER_TYPES.ROOM_CONVERTED, (msg) => {
        wsService.setRejoinInfo(msg.roomCode, msg.odId);
        dispatch({ type: 'ROOM_CONVERTED', payload: msg });
      }),
      wsService.on(WS_SERVER_TYPES.ROOM_JOINED, (msg) => {
        wsService.setRejoinInfo(msg.roomCode, msg.odId);
        dispatch({ type: 'ROOM_JOINED', payload: msg });
      }),
      wsService.on(WS_SERVER_TYPES.ROOM_STATE, (msg) => dispatch({ type: 'ROOM_STATE', payload: msg })),
      wsService.on(WS_SERVER_TYPES.PLAYER_JOINED, (msg) => dispatch({ type: 'PLAYER_JOINED', payload: msg })),
      wsService.on(WS_SERVER_TYPES.PLAYER_JOINED_MIDGAME, (msg) => dispatch({ type: 'PLAYER_JOINED_MIDGAME', payload: msg })),
      wsService.on(WS_SERVER_TYPES.PLAYER_LEFT, (msg) => dispatch({ type: 'PLAYER_LEFT', payload: msg })),
      wsService.on(WS_SERVER_TYPES.PLAYER_DISCONNECTED, (msg) => dispatch({ type: 'PLAYER_DISCONNECTED', payload: msg })),
      wsService.on(WS_SERVER_TYPES.PLAYER_RECONNECTED, (msg) => dispatch({ type: 'PLAYER_RECONNECTED', payload: msg })),
      wsService.on(WS_SERVER_TYPES.GAME_STARTING, () => dispatch({ type: 'GAME_STARTING' })),
      wsService.on(WS_SERVER_TYPES.GAME_STARTED, (msg) => dispatch({ type: 'GAME_STARTED', payload: msg })),
      wsService.on(WS_SERVER_TYPES.ACTIONS_UPDATED, (msg) => dispatch({ type: 'ACTIONS_UPDATED', payload: msg })),
      wsService.on(WS_SERVER_TYPES.SCENE_GENERATING, () => dispatch({ type: 'SCENE_GENERATING' })),
      wsService.on(WS_SERVER_TYPES.GENERATION_FAILED, (msg) => dispatch({ type: 'GENERATION_FAILED', payload: msg })),
      wsService.on(WS_SERVER_TYPES.TYPING, (msg) => {
        dispatch({ type: 'TYPING_UPDATE', payload: msg });
      }),
      wsService.on(WS_SERVER_TYPES.SCENE_UPDATE, (msg) => {
        dispatch({ type: 'CLEAR_TYPING' });
        dispatch({ type: 'SCENE_UPDATE', payload: msg });
        sceneCallbackRef.current?.(msg);
      }),
      wsService.on(WS_SERVER_TYPES.SCENE_IMAGE_UPDATE, (msg) => {
        dispatch({ type: 'UPDATE_SCENE_IMAGE', payload: { sceneId: msg.sceneId, image: msg.image } });
      }),
      wsService.on(WS_SERVER_TYPES.QUEST_OFFER_UPDATE, (msg) => {
        dispatch({ type: 'QUEST_OFFER_UPDATE', payload: msg });
      }),
      wsService.on(WS_SERVER_TYPES.QUEST_OBJECTIVE_VERIFIED, (msg) => {
        const requestId = msg?.requestId;
        if (!requestId) return;
        const pending = pendingQuestVerifyRef.current.get(requestId);
        if (!pending) return;
        pendingQuestVerifyRef.current.delete(requestId);
        clearTimeout(pending.timeoutId);
        pending.resolve({
          fulfilled: !!msg.fulfilled,
          reasoning: typeof msg.reasoning === 'string' ? msg.reasoning : '',
          alreadyCompleted: !!msg.alreadyCompleted,
        });
      }),
      wsService.on(WS_SERVER_TYPES.CHARACTER_SYNCED, (msg) => {
        dispatch({ type: 'CHARACTER_SYNCED', payload: msg });
      }),
      wsService.on(WS_SERVER_TYPES.COMBAT_SYNC, (msg) => {
        dispatch({ type: 'COMBAT_SYNC', payload: msg });
      }),
      wsService.on(WS_SERVER_TYPES.COMBAT_MANOEUVRE, (msg) => {
        dispatch({ type: 'COMBAT_MANOEUVRE', payload: msg });
      }),
      wsService.on(WS_SERVER_TYPES.COMBAT_ENDED, (msg) => {
        dispatch({ type: 'COMBAT_ENDED', payload: msg });
      }),
      wsService.on(WS_SERVER_TYPES.PLAYER_DIED, (msg) => {
        dispatch({ type: 'PLAYER_DIED', payload: msg });
      }),
      wsService.on(WS_SERVER_TYPES.LEFT_ROOM, () => {
        clearPersistedRejoinInfo();
        dispatch({ type: 'LEFT_ROOM' });
      }),
      wsService.on(WS_SERVER_TYPES.KICKED, (msg) => {
        wsService.setRejoinInfo(null, null);
        clearPersistedRejoinInfo();
        dispatch({ type: 'SET_ERROR', payload: msg.message || 'You have been removed from the room' });
        dispatch({ type: 'RESET' });
      }),
      wsService.on(WS_SERVER_TYPES.ROOM_EXPIRED, (msg) => {
        clearPersistedRejoinInfo();
        wsService.setRejoinInfo(null, null);
        dispatch({ type: 'RESET' });
        dispatch({ type: 'SET_ERROR', payload: msg?.message || 'The multiplayer room has expired or is unavailable.' });
      }),
      wsService.on(WS_SERVER_TYPES.ERROR, (msg) => dispatch({ type: 'SET_ERROR', payload: msg })),
    ];
    return () => {
      unsubs.forEach((fn) => fn());
      for (const [, pending] of pendingQuestVerifyRef.current.entries()) {
        clearTimeout(pending.timeoutId);
        pending.reject(new Error('Quest objective verification was cancelled.'));
      }
      pendingQuestVerifyRef.current.clear();
    };
  }, []);

  const connect = useCallback(() => {
    const baseUrl = apiClient.getBaseUrl();
    const token = apiClient.getToken();
    if (baseUrl && token) {
      return wsService.connect(baseUrl, token);
    }
    return Promise.resolve();
  }, []);

  const disconnect = useCallback(() => {
    wsService.disconnect();
    dispatch({ type: 'RESET' });
  }, []);

  const ensureConnected = useCallback(async () => {
    if (!wsService.connected) await connect();
    await wsService.whenReady();
    if (!wsService.connected) {
      throw new Error('Failed to establish multiplayer connection');
    }
  }, [connect]);

  const createRoom = useCallback(async () => {
    await ensureConnected();
    wsService.send(WS_CLIENT_TYPES.CREATE_ROOM);
  }, [ensureConnected]);

  const joinRoom = useCallback(async (code, options = {}) => {
    await ensureConnected();
    wsService.send(WS_CLIENT_TYPES.JOIN_ROOM, {
      roomCode: code.toUpperCase(),
      language: options.language,
      characterData: options.characterData || null,
    });
  }, [ensureConnected]);

  const convertToMultiplayer = useCallback(async (gameState, settings) => {
    await ensureConnected();
    wsService.send(WS_CLIENT_TYPES.CONVERT_TO_MULTIPLAYER, { gameState, settings });
  }, [ensureConnected]);

  const leaveRoom = useCallback(() => {
    wsService.send(WS_CLIENT_TYPES.LEAVE_ROOM);
    clearPersistedRejoinInfo();
    dispatch({ type: 'RESET' });
  }, []);

  const rejoinRoom = useCallback(async () => {
    const info = getPersistedRejoinInfo();
    if (!info?.roomCode || !info?.odId) return false;
    await ensureConnected();
    wsService.send(WS_CLIENT_TYPES.REJOIN_ROOM, { roomCode: info.roomCode, odId: info.odId });
    return true;
  }, [ensureConnected]);

  const updateMyCharacter = useCallback((data) => {
    wsService.send(WS_CLIENT_TYPES.UPDATE_CHARACTER, data);
  }, []);

  const updateSettings = useCallback((settings) => {
    wsService.send(WS_CLIENT_TYPES.UPDATE_SETTINGS, { settings });
  }, []);

  const startGame = useCallback((language) => {
    wsService.send(WS_CLIENT_TYPES.START_GAME, { language });
  }, []);

  const submitAction = useCallback((text, isCustom = false) => {
    wsService.send(WS_CLIENT_TYPES.SUBMIT_ACTION, { text, isCustom });
  }, []);

  const withdrawAction = useCallback(() => {
    wsService.send(WS_CLIENT_TYPES.WITHDRAW_ACTION);
  }, []);

  const approveActions = useCallback((language, dmSettings) => {
    wsService.send(WS_CLIENT_TYPES.APPROVE_ACTIONS, { language, dmSettings });
  }, []);

  const soloAction = useCallback((text, isCustom = false, language, dmSettings) => {
    wsService.send(WS_CLIENT_TYPES.SOLO_ACTION, { text, isCustom, language, dmSettings });
  }, []);

  const kickPlayer = useCallback((targetOdId) => {
    wsService.send(WS_CLIENT_TYPES.KICK_PLAYER, { targetOdId });
  }, []);

  const updateSceneImage = useCallback((sceneId, image) => {
    dispatch({ type: 'UPDATE_SCENE_IMAGE', payload: { sceneId, image } });
    wsService.send(WS_CLIENT_TYPES.UPDATE_SCENE_IMAGE, { sceneId, image });
  }, []);

  const onSceneUpdate = useCallback((cb) => {
    sceneCallbackRef.current = cb;
  }, []);

  const acceptMpQuestOffer = useCallback((sceneId, questOffer) => {
    wsService.send(WS_CLIENT_TYPES.ACCEPT_QUEST_OFFER, { sceneId, questOffer });
  }, []);

  const declineMpQuestOffer = useCallback((sceneId, offerId) => {
    wsService.send(WS_CLIENT_TYPES.DECLINE_QUEST_OFFER, { sceneId, offerId });
  }, []);

  const syncCharacter = useCallback((character) => {
    wsService.send(WS_CLIENT_TYPES.SYNC_CHARACTER, { character });
  }, []);

  const syncCombatState = useCallback((combat, options = {}) => {
    wsService.send(WS_CLIENT_TYPES.COMBAT_SYNC, { combat, ...options });
  }, []);

  const sendCombatManoeuvre = useCallback((manoeuvre, targetId, customDescription = '') => {
    wsService.send(WS_CLIENT_TYPES.COMBAT_MANOEUVRE, { manoeuvre, targetId, customDescription });
  }, []);

  const endMultiplayerCombat = useCallback((results) => {
    wsService.send(WS_CLIENT_TYPES.COMBAT_ENDED, results);
  }, []);

  const clearPendingCombatManoeuvre = useCallback(() => {
    dispatch({ type: 'COMBAT_MANOEUVRE', payload: null });
  }, []);

  const sendTyping = useCallback((isTyping, draft = '') => {
    wsService.send(WS_CLIENT_TYPES.TYPING, {
      isTyping,
      draft: typeof draft === 'string' ? draft : '',
    });
  }, []);

  const verifyQuestObjective = useCallback((questId, objectiveId, language = 'en') => (
    new Promise((resolve, reject) => {
      if (!questId || !objectiveId) {
        reject(new Error('Missing quest or objective id'));
        return;
      }

      const requestId = `verify_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const timeoutId = setTimeout(() => {
        pendingQuestVerifyRef.current.delete(requestId);
        reject(new Error('Quest objective verification timed out.'));
      }, 25000);

      pendingQuestVerifyRef.current.set(requestId, { resolve, reject, timeoutId });

      const sent = wsService.send(WS_CLIENT_TYPES.VERIFY_QUEST_OBJECTIVE, {
        requestId,
        questId,
        objectiveId,
        language,
      });

      if (!sent) {
        clearTimeout(timeoutId);
        pendingQuestVerifyRef.current.delete(requestId);
        reject(new Error('Multiplayer connection is offline.'));
      }
    })
  ), []);

  const value = {
    state,
    dispatch,
    connect,
    disconnect,
    createRoom,
    joinRoom,
    rejoinRoom,
    convertToMultiplayer,
    leaveRoom,
    kickPlayer,
    updateMyCharacter,
    updateSettings,
    startGame,
    submitAction,
    withdrawAction,
    approveActions,
    soloAction,
    updateSceneImage,
    onSceneUpdate,
    acceptMpQuestOffer,
    declineMpQuestOffer,
    syncCharacter,
    syncCombatState,
    sendCombatManoeuvre,
    endMultiplayerCombat,
    clearPendingCombatManoeuvre,
    sendTyping,
    verifyQuestObjective,
  };

  return (
    <MultiplayerContext.Provider value={value}>
      {children}
    </MultiplayerContext.Provider>
  );
}

export function useMultiplayer() {
  const ctx = useContext(MultiplayerContext);
  if (!ctx) throw new Error('useMultiplayer must be used within MultiplayerProvider');
  return ctx;
}
