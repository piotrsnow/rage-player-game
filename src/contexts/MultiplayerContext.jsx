import { createContext, useContext, useReducer, useCallback, useEffect, useRef } from 'react';
import { wsService } from '../services/websocket';
import { apiClient } from '../services/apiClient';

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
      };

    case 'ROOM_STATE':
      return {
        ...state,
        phase: action.payload.room.phase,
        players: action.payload.room.players,
        gameState: action.payload.room.gameState,
      };

    case 'PLAYER_JOINED':
      return {
        ...state,
        players: action.payload.room.players,
      };

    case 'PLAYER_LEFT':
      return {
        ...state,
        players: action.payload.room.players,
        isHost: action.payload.room.players.find((p) => p.odId === state.myOdId)?.isHost || state.isHost,
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

    case 'SCENE_UPDATE':
      return {
        ...state,
        isGenerating: false,
        gameState: action.payload.room?.gameState || state.gameState,
        players: action.payload.room?.players || state.players,
      };

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
      wsService.on('ROOM_CREATED', (msg) => dispatch({ type: 'ROOM_CREATED', payload: msg })),
      wsService.on('ROOM_JOINED', (msg) => dispatch({ type: 'ROOM_JOINED', payload: msg })),
      wsService.on('ROOM_STATE', (msg) => dispatch({ type: 'ROOM_STATE', payload: msg })),
      wsService.on('PLAYER_JOINED', (msg) => dispatch({ type: 'PLAYER_JOINED', payload: msg })),
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
      wsService.on('ERROR', (msg) => dispatch({ type: 'SET_ERROR', payload: msg.message })),
    ];
    return () => unsubs.forEach((fn) => fn());
  }, []);

  const connect = useCallback(() => {
    const baseUrl = apiClient.getBaseUrl();
    const token = apiClient.getToken();
    if (baseUrl && token) {
      wsService.connect(baseUrl, token);
    }
  }, []);

  const disconnect = useCallback(() => {
    wsService.disconnect();
    dispatch({ type: 'RESET' });
  }, []);

  const createRoom = useCallback(() => {
    if (!wsService.connected) connect();
    setTimeout(() => wsService.send('CREATE_ROOM'), 100);
  }, [connect]);

  const joinRoom = useCallback((code) => {
    if (!wsService.connected) connect();
    setTimeout(() => wsService.send('JOIN_ROOM', { roomCode: code.toUpperCase() }), 100);
  }, [connect]);

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

  const approveActions = useCallback((language) => {
    wsService.send('APPROVE_ACTIONS', { language });
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
    leaveRoom,
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
