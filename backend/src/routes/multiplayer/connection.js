import { childLogger } from '../../lib/logger.js';
import {
  getRoom,
  leaveRoom,
  disconnectPlayer,
  broadcast,
  sanitizeRoom,
  saveRoomToDB,
  touchRoom,
} from '../../services/roomManager.js';
import { AIServiceError, toClientAiError } from '../../services/aiErrors.js';
import {
  createWsMessage,
  normalizeClientWsType,
  WS_SERVER_TYPES,
} from '../../../../shared/contracts/multiplayer.js';
import * as lobby from './handlers/lobby.js';
import * as roomState from './handlers/roomState.js';
import * as gameplay from './handlers/gameplay.js';
import * as quests from './handlers/quests.js';
import * as combat from './handlers/combat.js';
import * as webrtc from './handlers/webrtc.js';

const HEARTBEAT_INTERVAL_MS = 30_000;
const MESSAGE_RATE_WINDOW_MS = 1000;
const MESSAGE_RATE_LIMIT = 30;
const MESSAGE_RATE_BURST_CLOSE = 60;

const log = childLogger({ module: 'multiplayer' });

const HANDLERS = {
  CREATE_ROOM: lobby.handleCreateRoom,
  CONVERT_TO_MULTIPLAYER: lobby.handleConvertToMultiplayer,
  JOIN_ROOM: lobby.handleJoinRoom,
  LEAVE_ROOM: lobby.handleLeaveRoom,
  REJOIN_ROOM: lobby.handleRejoinRoom,
  KICK_PLAYER: lobby.handleKickPlayer,

  UPDATE_CHARACTER: roomState.handleUpdateCharacter,
  UPDATE_SETTINGS: roomState.handleUpdateSettings,
  SYNC_CHARACTER: roomState.handleSyncCharacter,
  UPDATE_SCENE_IMAGE: roomState.handleUpdateSceneImage,
  TYPING: roomState.handleTyping,
  PING: roomState.handlePing,

  START_GAME: gameplay.handleStartGame,
  SUBMIT_ACTION: gameplay.handleSubmitAction,
  WITHDRAW_ACTION: gameplay.handleWithdrawAction,
  APPROVE_ACTIONS: gameplay.handleApproveActions,
  SOLO_ACTION: gameplay.handleSoloAction,

  ACCEPT_QUEST_OFFER: quests.handleAcceptQuestOffer,
  DECLINE_QUEST_OFFER: quests.handleDeclineQuestOffer,
  VERIFY_QUEST_OBJECTIVE: quests.handleVerifyQuestObjective,

  COMBAT_SYNC: combat.handleCombatSync,
  COMBAT_MANOEUVRE: combat.handleCombatManoeuvre,
  COMBAT_ENDED: combat.handleCombatEnded,

  WEBRTC_OFFER: webrtc.handleWebrtcOffer,
  WEBRTC_ANSWER: webrtc.handleWebrtcAnswer,
  WEBRTC_ICE: webrtc.handleWebrtcIce,
  WEBRTC_TRACK_STATE: webrtc.handleWebrtcTrackState,
};

const SAFE_ERROR_MESSAGES = new Set([
  'Room not found', 'Cannot join this room', 'Room is full',
  'Not in a room', 'Only the host can start the game', 'No actions to approve',
  'Only the host can kick players', 'Only the host can update settings',
  'Invalid kick target', 'Player not found', 'Game not in progress',
  'Game state is required', 'Room no longer exists',
  'Cannot rejoin: player not found or unauthorized',
  'Solo action on cooldown',
]);

export async function multiplayerWsRoute(fastify) {
  const sendWs = (ws, type, payload = {}) => {
    ws.send(JSON.stringify(createWsMessage(type, payload)));
  };

  fastify.get('/', { websocket: true }, async (socket, request) => {
    const session = { odId: null, roomCode: null };

    try {
      const token = request.query?.token;
      if (!token) {
        sendWs(socket, WS_SERVER_TYPES.ERROR, { message: 'Missing auth token' });
        socket.close();
        return;
      }
      let user;
      try {
        user = fastify.jwt.verify(token);
      } catch {
        sendWs(socket, WS_SERVER_TYPES.ERROR, { message: 'Invalid auth token' });
        socket.close();
        return;
      }

      const userId = user.id;
      const ctx = { fastify, ws: socket, uid: userId, sendWs, log };

      let isAlive = true;
      socket.on('pong', () => { isAlive = true; });
      const heartbeat = setInterval(() => {
        if (!isAlive) {
          fastify.log.warn(`[multiplayer] heartbeat timeout — terminating socket (uid=${userId})`);
          socket.terminate();
          return;
        }
        isAlive = false;
        try { socket.ping(); } catch { /* socket already closing */ }
      }, HEARTBEAT_INTERVAL_MS);

      const messageTimestamps = [];
      let messageQueueTail = Promise.resolve();

      socket.on('message', (raw) => {
        const now = Date.now();
        while (messageTimestamps.length > 0 && messageTimestamps[0] < now - MESSAGE_RATE_WINDOW_MS) {
          messageTimestamps.shift();
        }
        messageTimestamps.push(now);
        if (messageTimestamps.length > MESSAGE_RATE_BURST_CLOSE) {
          fastify.log.warn(`[multiplayer] message burst limit exceeded (uid=${userId}) — closing socket`);
          sendWs(socket, WS_SERVER_TYPES.ERROR, { message: 'Too many messages', code: 'RATE_LIMIT' });
          socket.close();
          return;
        }
        if (messageTimestamps.length > MESSAGE_RATE_LIMIT) {
          sendWs(socket, WS_SERVER_TYPES.ERROR, { message: 'Message rate limit — slow down', code: 'RATE_LIMIT' });
          return;
        }

        messageQueueTail = messageQueueTail.then(async () => {
          let msg;
          try {
            msg = JSON.parse(raw.toString());
            msg = {
              ...msg,
              type: normalizeClientWsType(msg?.type) || msg?.type,
            };
          } catch {
            sendWs(socket, WS_SERVER_TYPES.ERROR, { message: 'Invalid JSON' });
            return;
          }

          try {
            await dispatchMessage(ctx, session, msg);
          } catch (err) {
            fastify.log.error(err, 'WebSocket message handler error');
            if (err instanceof AIServiceError) {
              const aiError = toClientAiError(err, 'AI request failed.');
              sendWs(socket, WS_SERVER_TYPES.ERROR, { message: aiError.message, code: aiError.code, retryable: aiError.retryable });
              return;
            }
            const message = SAFE_ERROR_MESSAGES.has(err.message) ? err.message : 'An error occurred';
            sendWs(socket, WS_SERVER_TYPES.ERROR, { message });
          }
        }).catch((err) => {
          fastify.log.warn(err, 'WebSocket message queue failure');
        });
      });

      socket.on('close', () => {
        clearInterval(heartbeat);
        if (session.roomCode && session.odId) {
          const currentRoom = getRoom(session.roomCode);
          if (!currentRoom) return;

          const player = currentRoom.players.get(session.odId);
          const playerName = player?.name || 'A player';

          if (currentRoom.phase === 'lobby') {
            const room = leaveRoom(session.roomCode, session.odId);
            if (room) {
              broadcast(room, {
                type: 'PLAYER_LEFT',
                playerId: session.odId,
                room: sanitizeRoom(room),
              });
            }
          } else {
            const room = disconnectPlayer(session.roomCode, session.odId);
            if (room) {
              broadcast(room, {
                type: 'PLAYER_DISCONNECTED',
                playerId: session.odId,
                playerName,
                room: sanitizeRoom(room),
              });
              saveRoomToDB(session.roomCode).catch((err) => {
                fastify.log.warn(err, `MP room save on disconnect failed for ${session.roomCode} — state may diverge from DB`);
                sendWs(socket, WS_SERVER_TYPES.ERROR, {
                  message: 'Room save failed — your progress may not persist across disconnects',
                  code: 'ROOM_SAVE_FAILED',
                });
              });
            }
          }
        }
      });
    } catch (err) {
      fastify.log.error(err, 'WebSocket connection error');
      sendWs(socket, WS_SERVER_TYPES.ERROR, { message: 'Internal server error' });
      socket.close();
    }
  });
}

async function dispatchMessage(ctx, session, msg) {
  if (session.roomCode) touchRoom(session.roomCode);
  const handler = HANDLERS[msg.type];
  if (!handler) {
    ctx.sendWs(ctx.ws, WS_SERVER_TYPES.ERROR, { message: 'Unknown message type' });
    return;
  }
  await handler(ctx, session, msg);
}
