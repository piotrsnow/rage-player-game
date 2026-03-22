import { PrismaClient } from '@prisma/client';
import {
  createRoom, joinRoom, leaveRoom, updateCharacter,
  updateSettings, submitAction, withdrawAction, approveActions,
  setPhase, setGameState, broadcast, sendTo, sanitizeRoom, getRoom,
} from '../services/roomManager.js';
import { generateMultiplayerScene, generateMultiplayerCampaign } from '../services/multiplayerAI.js';

const prisma = new PrismaClient();

export async function multiplayerRoutes(fastify) {
  fastify.get('/', { websocket: true }, async (socket, request) => {
    let odId = null;
    let roomCode = null;

    try {
      const token = request.query?.token;
      if (!token) {
        socket.send(JSON.stringify({ type: 'ERROR', message: 'Missing auth token' }));
        socket.close();
        return;
      }
      let user;
      try {
        user = fastify.jwt.verify(token);
      } catch {
        socket.send(JSON.stringify({ type: 'ERROR', message: 'Invalid auth token' }));
        socket.close();
        return;
      }

      const userId = user.id;

      socket.on('message', async (raw) => {
        let msg;
        try {
          msg = JSON.parse(raw.toString());
        } catch {
          socket.send(JSON.stringify({ type: 'ERROR', message: 'Invalid JSON' }));
          return;
        }

        try {
          await handleMessage(fastify, socket, userId, msg);
        } catch (err) {
          fastify.log.error(err, 'WebSocket message handler error');
          socket.send(JSON.stringify({ type: 'ERROR', message: err.message }));
        }
      });

      socket.on('close', () => {
        if (roomCode && odId) {
          const room = leaveRoom(roomCode, odId);
          if (room) {
            broadcast(room, {
              type: 'PLAYER_LEFT',
              playerId: odId,
              room: sanitizeRoom(room),
            });
          }
        }
      });

      async function handleMessage(fastify, ws, uid, msg) {
        switch (msg.type) {
          case 'CREATE_ROOM': {
            const result = createRoom(uid, ws);
            odId = result.odId;
            roomCode = result.room.roomCode;
            sendTo(result.room, odId, {
              type: 'ROOM_CREATED',
              roomCode,
              odId,
              room: sanitizeRoom(result.room),
            });
            break;
          }

          case 'JOIN_ROOM': {
            const result = joinRoom(msg.roomCode, uid, ws);
            odId = result.odId;
            roomCode = result.room.roomCode;

            sendTo(result.room, odId, {
              type: 'ROOM_JOINED',
              roomCode,
              odId,
              room: sanitizeRoom(result.room),
            });

            broadcast(result.room, {
              type: 'PLAYER_JOINED',
              player: {
                odId,
                userId: uid,
                name: 'Adventurer',
                gender: 'male',
                photo: null,
                isHost: false,
                pendingAction: null,
              },
              room: sanitizeRoom(result.room),
            }, odId);
            break;
          }

          case 'LEAVE_ROOM': {
            if (!roomCode || !odId) break;
            const room = leaveRoom(roomCode, odId);
            if (room) {
              broadcast(room, {
                type: 'PLAYER_LEFT',
                playerId: odId,
                room: sanitizeRoom(room),
              });
            }
            roomCode = null;
            odId = null;
            ws.send(JSON.stringify({ type: 'LEFT_ROOM' }));
            break;
          }

          case 'UPDATE_CHARACTER': {
            if (!roomCode || !odId) throw new Error('Not in a room');
            const room = updateCharacter(roomCode, odId, {
              name: msg.name,
              gender: msg.gender,
              photo: msg.photo,
            });
            broadcast(room, {
              type: 'ROOM_STATE',
              room: sanitizeRoom(room),
            });
            break;
          }

          case 'UPDATE_SETTINGS': {
            if (!roomCode || !odId) throw new Error('Not in a room');
            const room = updateSettings(roomCode, odId, msg.settings);
            broadcast(room, {
              type: 'ROOM_STATE',
              room: sanitizeRoom(room),
            });
            break;
          }

          case 'START_GAME': {
            if (!roomCode || !odId) throw new Error('Not in a room');
            const currentRoom = getRoom(roomCode);
            if (!currentRoom) throw new Error('Room not found');
            if (currentRoom.hostId !== odId) throw new Error('Only the host can start the game');

            broadcast(currentRoom, { type: 'GAME_STARTING' });

            const hostPlayer = currentRoom.players.get(currentRoom.hostId);
            const dbUser = await prisma.user.findUnique({
              where: { id: hostPlayer.userId },
              select: { apiKeys: true },
            });

            const players = [];
            for (const [, p] of currentRoom.players) {
              players.push({ odId: p.odId, name: p.name, gender: p.gender, isHost: p.isHost });
            }

            const campaignResult = await generateMultiplayerCampaign(
              currentRoom.settings,
              players,
              dbUser?.apiKeys || '{}',
              msg.language || 'en',
            );

            setPhase(roomCode, 'playing');
            setGameState(roomCode, campaignResult);

            const updatedRoom = getRoom(roomCode);
            broadcast(updatedRoom, {
              type: 'GAME_STARTED',
              gameState: campaignResult,
              room: sanitizeRoom(updatedRoom),
            });
            break;
          }

          case 'SUBMIT_ACTION': {
            if (!roomCode || !odId) throw new Error('Not in a room');
            const room = submitAction(roomCode, odId, msg.text);
            broadcast(room, {
              type: 'ACTIONS_UPDATED',
              room: sanitizeRoom(room),
            });
            break;
          }

          case 'WITHDRAW_ACTION': {
            if (!roomCode || !odId) throw new Error('Not in a room');
            const room = withdrawAction(roomCode, odId);
            broadcast(room, {
              type: 'ACTIONS_UPDATED',
              room: sanitizeRoom(room),
            });
            break;
          }

          case 'UPDATE_SCENE_IMAGE': {
            if (!roomCode || !odId) throw new Error('Not in a room');
            const room = getRoom(roomCode);
            if (!room) throw new Error('Room not found');
            const { sceneId, image } = msg;
            if (!sceneId || !image) break;

            if (room.gameState?.scenes) {
              const idx = room.gameState.scenes.findIndex((s) => s.id === sceneId);
              if (idx >= 0) {
                room.gameState.scenes[idx] = { ...room.gameState.scenes[idx], image };
                setGameState(roomCode, room.gameState);
              }
            }

            broadcast(room, {
              type: 'SCENE_IMAGE_UPDATE',
              sceneId,
              image,
            }, odId);
            break;
          }

          case 'APPROVE_ACTIONS': {
            if (!roomCode || !odId) throw new Error('Not in a room');
            const { room, actions } = approveActions(roomCode, odId);
            if (actions.length === 0) throw new Error('No actions to approve');

            broadcast(room, { type: 'SCENE_GENERATING' });

            const hostPlayer = room.players.get(room.hostId);
            const dbUser = await prisma.user.findUnique({
              where: { id: hostPlayer.userId },
              select: { apiKeys: true },
            });

            const players = [];
            for (const [, p] of room.players) {
              players.push({ odId: p.odId, name: p.name, gender: p.gender, isHost: p.isHost });
            }

            const sceneResult = await generateMultiplayerScene(
              room.gameState,
              room.settings,
              players,
              actions,
              dbUser?.apiKeys || '{}',
              msg.language || 'en',
            );

            const updatedGameState = {
              ...room.gameState,
              scenes: [...(room.gameState.scenes || []), sceneResult.scene],
              chatHistory: [...(room.gameState.chatHistory || []), ...sceneResult.chatMessages],
            };
            setGameState(roomCode, updatedGameState);

            const updatedRoom = getRoom(roomCode);
            broadcast(updatedRoom, {
              type: 'SCENE_UPDATE',
              scene: sceneResult.scene,
              chatMessages: sceneResult.chatMessages,
              stateChanges: sceneResult.stateChanges,
              room: sanitizeRoom(updatedRoom),
            });
            break;
          }

          default:
            ws.send(JSON.stringify({ type: 'ERROR', message: `Unknown message type: ${msg.type}` }));
        }
      }
    } catch (err) {
      fastify.log.error(err, 'WebSocket connection error');
      socket.send(JSON.stringify({ type: 'ERROR', message: 'Internal server error' }));
      socket.close();
    }
  });
}
