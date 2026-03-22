import { createContext, useContext, useReducer, useCallback, useEffect, useRef } from 'react';
import { wsService } from '../services/websocket';
import { apiClient } from '../services/apiClient';
import { hourToPeriod, decayNeeds } from '../services/timeUtils';

const MultiplayerContext = createContext(null);

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
};

function mpReducer(state, action) {
  switch (action.type) {
    case 'SET_CONNECTED':
      return { ...state, connected: action.payload };

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
      };

    case 'ROOM_JOINED':
      return {
        ...state,
        isMultiplayer: true,
        isHost: false,
        roomCode: action.payload.roomCode,
        myOdId: action.payload.odId,
        phase: action.payload.room.phase,
        players: action.payload.room.players,
        gameState: action.payload.room.gameState,
        roomSettings: action.payload.room.settings,
      };

    case 'ROOM_STATE':
      return {
        ...state,
        phase: action.payload.room.phase,
        players: action.payload.room.players,
        gameState: action.payload.room.gameState,
        roomSettings: action.payload.room.settings ?? state.roomSettings,
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

    case 'SCENE_UPDATE': {
      let newGameState = action.payload.room?.gameState || state.gameState;
      const stateChanges = action.payload.stateChanges || {};

      if (!action.payload.room?.gameState && newGameState) {
        const perChar = stateChanges.perCharacter;
        if (perChar && newGameState.characters) {
          const updatedChars = newGameState.characters.map((c) => {
            const delta = perChar[c.name] || perChar[c.playerName];
            if (!delta) return c;
            const u = { ...c };
            if (delta.wounds != null) u.wounds = Math.max(0, Math.min(u.maxWounds || 12, (u.wounds ?? u.maxWounds ?? 12) + delta.wounds));
            if (delta.xp != null) u.xp = (u.xp || 0) + delta.xp;
            // Legacy D&D fields for backward compat
            if (delta.hp != null && u.hp != null) u.hp = Math.max(0, Math.min(u.maxHp || 100, u.hp + delta.hp));
            if (delta.mana != null && u.mana != null) u.mana = Math.max(0, Math.min(u.maxMana || 50, u.mana + delta.mana));
            if (Array.isArray(delta.newItems)) u.inventory = [...(u.inventory || []), ...delta.newItems];
            if (Array.isArray(delta.removeItems)) {
              const rm = new Set(delta.removeItems.map((i) => (typeof i === 'string' ? i : i.name)));
              u.inventory = (u.inventory || []).filter((i) => !rm.has(typeof i === 'string' ? i : i.name));
            }
            if (delta.needsChanges && u.needs) {
              const needs = { ...u.needs };
              for (const [key, val] of Object.entries(delta.needsChanges)) {
                if (key in needs) needs[key] = Math.max(0, Math.min(100, (needs[key] ?? 100) + val));
              }
              u.needs = needs;
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
      }

      return {
        ...state,
        isGenerating: false,
        gameState: newGameState,
        players: action.payload.room?.players || state.players,
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

    case 'LEFT_ROOM':
    case 'RESET':
      return initialState;

    case 'SET_ERROR':
      return { ...state, error: action.payload, isGenerating: false };

    default:
      return state;
  }
}

export function MultiplayerProvider({ children }) {
  const [state, dispatch] = useReducer(mpReducer, initialState);
  const sceneCallbackRef = useRef(null);

  useEffect(() => {
    const unsubs = [
      wsService.on('_connected', () => dispatch({ type: 'SET_CONNECTED', payload: true })),
      wsService.on('_disconnected', () => dispatch({ type: 'SET_CONNECTED', payload: false })),
      wsService.on('ROOM_CREATED', (msg) => {
        wsService.setRejoinInfo(msg.roomCode, msg.odId);
        dispatch({ type: 'ROOM_CREATED', payload: msg });
      }),
      wsService.on('ROOM_CONVERTED', (msg) => {
        wsService.setRejoinInfo(msg.roomCode, msg.odId);
        dispatch({ type: 'ROOM_CONVERTED', payload: msg });
      }),
      wsService.on('ROOM_JOINED', (msg) => {
        wsService.setRejoinInfo(msg.roomCode, msg.odId);
        dispatch({ type: 'ROOM_JOINED', payload: msg });
      }),
      wsService.on('ROOM_STATE', (msg) => dispatch({ type: 'ROOM_STATE', payload: msg })),
      wsService.on('PLAYER_JOINED', (msg) => dispatch({ type: 'PLAYER_JOINED', payload: msg })),
      wsService.on('PLAYER_JOINED_MIDGAME', (msg) => dispatch({ type: 'PLAYER_JOINED_MIDGAME', payload: msg })),
      wsService.on('PLAYER_LEFT', (msg) => dispatch({ type: 'PLAYER_LEFT', payload: msg })),
      wsService.on('GAME_STARTING', () => dispatch({ type: 'GAME_STARTING' })),
      wsService.on('GAME_STARTED', (msg) => dispatch({ type: 'GAME_STARTED', payload: msg })),
      wsService.on('ACTIONS_UPDATED', (msg) => dispatch({ type: 'ACTIONS_UPDATED', payload: msg })),
      wsService.on('SCENE_GENERATING', () => dispatch({ type: 'SCENE_GENERATING' })),
      wsService.on('SCENE_UPDATE', (msg) => {
        dispatch({ type: 'SCENE_UPDATE', payload: msg });
        sceneCallbackRef.current?.(msg);
      }),
      wsService.on('SCENE_IMAGE_UPDATE', (msg) => {
        dispatch({ type: 'UPDATE_SCENE_IMAGE', payload: { sceneId: msg.sceneId, image: msg.image } });
      }),
      wsService.on('LEFT_ROOM', () => dispatch({ type: 'LEFT_ROOM' })),
      wsService.on('KICKED', (msg) => {
        wsService.setRejoinInfo(null, null);
        dispatch({ type: 'SET_ERROR', payload: msg.message || 'You have been removed from the room' });
        dispatch({ type: 'RESET' });
      }),
      wsService.on('ERROR', (msg) => dispatch({ type: 'SET_ERROR', payload: msg.message })),
    ];
    return () => unsubs.forEach((fn) => fn());
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
  }, [connect]);

  const createRoom = useCallback(async () => {
    await ensureConnected();
    wsService.send('CREATE_ROOM');
  }, [ensureConnected]);

  const joinRoom = useCallback(async (code) => {
    await ensureConnected();
    wsService.send('JOIN_ROOM', { roomCode: code.toUpperCase() });
  }, [ensureConnected]);

  const convertToMultiplayer = useCallback(async (gameState, settings) => {
    await ensureConnected();
    wsService.send('CONVERT_TO_MULTIPLAYER', { gameState, settings });
  }, [ensureConnected]);

  const leaveRoom = useCallback(() => {
    wsService.send('LEAVE_ROOM');
    dispatch({ type: 'RESET' });
  }, []);

  const updateMyCharacter = useCallback((data) => {
    wsService.send('UPDATE_CHARACTER', data);
  }, []);

  const updateSettings = useCallback((settings) => {
    wsService.send('UPDATE_SETTINGS', { settings });
  }, []);

  const startGame = useCallback((language) => {
    wsService.send('START_GAME', { language });
  }, []);

  const submitAction = useCallback((text) => {
    wsService.send('SUBMIT_ACTION', { text });
  }, []);

  const withdrawAction = useCallback(() => {
    wsService.send('WITHDRAW_ACTION');
  }, []);

  const approveActions = useCallback((language, dmSettings) => {
    wsService.send('APPROVE_ACTIONS', { language, dmSettings });
  }, []);

  const kickPlayer = useCallback((targetOdId) => {
    wsService.send('KICK_PLAYER', { targetOdId });
  }, []);

  const updateSceneImage = useCallback((sceneId, image) => {
    dispatch({ type: 'UPDATE_SCENE_IMAGE', payload: { sceneId, image } });
    wsService.send('UPDATE_SCENE_IMAGE', { sceneId, image });
  }, []);

  const onSceneUpdate = useCallback((cb) => {
    sceneCallbackRef.current = cb;
  }, []);

  const value = {
    state,
    dispatch,
    connect,
    disconnect,
    createRoom,
    joinRoom,
    convertToMultiplayer,
    leaveRoom,
    kickPlayer,
    updateMyCharacter,
    updateSettings,
    startGame,
    submitAction,
    withdrawAction,
    approveActions,
    updateSceneImage,
    onSceneUpdate,
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
