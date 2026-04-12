import { useEffect } from 'react';
import { wsService, clearPersistedRejoinInfo } from '../../services/websocket';
import { WS_SERVER_TYPES } from '../../../shared/contracts/multiplayer.js';

export function useMpWsSubscription({ dispatch, sceneCallbackRef, pendingQuestVerifyRef }) {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
