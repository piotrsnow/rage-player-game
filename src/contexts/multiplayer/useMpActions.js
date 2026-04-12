import { useCallback } from 'react';
import { wsService, clearPersistedRejoinInfo, getPersistedRejoinInfo } from '../../services/websocket';
import { apiClient } from '../../services/apiClient';
import { WS_CLIENT_TYPES } from '../../../shared/contracts/multiplayer.js';
import { shortId } from '../../utils/ids';

export function useMpActions({ dispatch, pendingQuestVerifyRef }) {
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
  }, [dispatch]);

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
  }, [dispatch]);

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
  }, [dispatch]);

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
  }, [dispatch]);

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

      const requestId = `verify_${Date.now()}_${shortId()}`;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ), []);

  return {
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
}
