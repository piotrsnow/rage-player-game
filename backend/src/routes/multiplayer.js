import { prisma } from '../lib/prisma.js';
import {
  createRoom, createRoomWithGameState, joinRoom, leaveRoom, updateCharacter,
  updateSettings, submitAction, withdrawAction, approveActions, executeSoloAction,
  setPhase, setGameState, broadcast, sendTo, sanitizeRoom, getRoom, touchRoom,
  saveRoomToDB, deleteRoomFromDB, loadActiveSessionsFromDB, findSessionInDB, restoreRoom,
  listJoinableRooms, disconnectPlayer, listUserRooms, restorePendingActions,
} from '../services/roomManager.js';
import {
  generateMultiplayerScene,
  generateMultiplayerCampaign,
  generateMidGameCharacter,
  needsCompression,
  compressOldScenes,
  verifyMultiplayerQuestObjective,
} from '../services/multiplayerAI.js';
import { hourToPeriod, decayNeeds } from '../services/timeUtils.js';
import { validateMultiplayerStateChanges } from '../services/stateValidator.js';
import { AIServiceError, toClientAiError } from '../services/aiErrors.js';
import { applyMultiplayerSceneStateChanges } from '../../../shared/domain/multiplayerState.js';
import {
  createWsMessage,
  normalizeClientWsType,
  normalizeMultiplayerStateChanges,
  TYPING_DRAFT_MAX_LENGTH,
  WS_SERVER_TYPES,
} from '../../../shared/contracts/multiplayer.js';

function calcNextMomentum(sl, current) {
  const newVal = sl * 5;
  let next;
  if (sl === 0) {
    next = current > 0 ? Math.max(0, current - 5) : current < 0 ? Math.min(0, current + 5) : 0;
  } else if (sl > 0) {
    next = current < 0 ? newVal : (newVal > current ? newVal : Math.max(0, current - 5));
  } else {
    next = current > 0 ? newVal : (newVal < current ? newVal : Math.min(0, current + 5));
  }
  return Math.max(-30, Math.min(30, next));
}

function applySceneStateChanges(gameState, sceneResult, settings) {
  return applyMultiplayerSceneStateChanges(gameState, sceneResult, {
    needsEnabled: settings?.needsSystemEnabled === true,
    periodResolver: hourToPeriod,
    decayNeeds,
  });
}

function normalizeJoinCharacter(characterData) {
  if (!characterData || typeof characterData !== 'object') return null;
  const name = typeof characterData.name === 'string' ? characterData.name.trim() : '';
  if (!name) return null;
  const gender = typeof characterData.gender === 'string' && characterData.gender
    ? characterData.gender
    : 'male';
  const career = characterData.career || characterData.careerData || null;
  return {
    ...characterData,
    name,
    gender,
    career,
  };
}

function buildArrivalNarrative(playerName, language = 'en') {
  if (typeof language === 'string' && language.toLowerCase().startsWith('pl')) {
    return `${playerName} dołącza do drużyny i zajmuje miejsce przy ognisku, gotów ruszyć dalej.`;
  }
  return `${playerName} joins the party and takes a place by the campfire, ready for the journey ahead.`;
}

export async function multiplayerRoutes(fastify) {
  const sendWs = (ws, type, payload = {}) => {
    ws.send(JSON.stringify(createWsMessage(type, payload)));
  };

  fastify.get('/rooms', { onRequest: [fastify.authenticate] }, async () => {
    return { rooms: listJoinableRooms() };
  });

  fastify.get('/my-sessions', { onRequest: [fastify.authenticate] }, async (request) => {
    const userId = request.user.id;
    const inMemory = listUserRooms(userId);

    if (inMemory.length > 0) return { sessions: inMemory };

    try {
      const dbSessions = await prisma.multiplayerSession.findMany({
        where: { phase: 'playing' },
        select: { roomCode: true, phase: true, players: true, settings: true, gameState: true, updatedAt: true },
      });

      const userSessions = [];
      for (const session of dbSessions) {
        const players = JSON.parse(session.players || '[]');
        const match = players.find((p) => p.userId === userId);
        if (!match) continue;
        const settings = JSON.parse(session.settings || '{}');
        const gameState = JSON.parse(session.gameState || '{}');
        const hostPlayer = players.find((p) => p.isHost);
        userSessions.push({
          roomCode: session.roomCode,
          phase: session.phase,
          hostName: hostPlayer?.name || 'Host',
          campaignName: gameState?.campaign?.name || settings?.genre || 'Campaign',
          playerCount: players.length,
          myOdId: match.odId,
          isHost: match.isHost,
        });
      }
      return { sessions: userSessions };
    } catch (err) {
      fastify.log.warn(err, 'Failed to load multiplayer sessions from database');
      return { sessions: [] };
    }
  });

  fastify.get('/', { websocket: true }, async (socket, request) => {
    let odId = null;
    let roomCode = null;

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

      let messageQueueTail = Promise.resolve();

      socket.on('message', (raw) => {
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
            await handleMessage(fastify, socket, userId, msg);
          } catch (err) {
            fastify.log.error(err, 'WebSocket message handler error');
            const safeMessages = ['Room not found', 'Cannot join this room', 'Room is full',
              'Not in a room', 'Only the host can start the game', 'No actions to approve',
              'Only the host can kick players', 'Only the host can update settings',
              'Invalid kick target', 'Player not found', 'Game not in progress',
              'Game state is required', 'Room no longer exists',
              'Cannot rejoin: player not found or unauthorized',
              'Solo action on cooldown'];
            if (err instanceof AIServiceError) {
              const aiError = toClientAiError(err, 'AI request failed.');
              sendWs(socket, WS_SERVER_TYPES.ERROR, { message: aiError.message, code: aiError.code, retryable: aiError.retryable });
              return;
            }
            const message = safeMessages.includes(err.message) ? err.message : 'An error occurred';
            sendWs(socket, WS_SERVER_TYPES.ERROR, { message });
          }
        }).catch((err) => {
          fastify.log.warn(err, 'WebSocket message queue failure');
        });
      });

      socket.on('close', () => {
        if (roomCode && odId) {
          const currentRoom = getRoom(roomCode);
          if (!currentRoom) return;

          const player = currentRoom.players.get(odId);
          const playerName = player?.name || 'A player';

          if (currentRoom.phase === 'lobby') {
            const room = leaveRoom(roomCode, odId);
            if (room) {
              broadcast(room, {
                type: 'PLAYER_LEFT',
                playerId: odId,
                room: sanitizeRoom(room),
              });
            }
          } else {
            const room = disconnectPlayer(roomCode, odId);
            if (room) {
              broadcast(room, {
                type: 'PLAYER_DISCONNECTED',
                playerId: odId,
                playerName,
                room: sanitizeRoom(room),
              });
              saveRoomToDB(roomCode).catch(() => {});
            }
          }
        }
      });

      async function handleMessage(fastify, ws, uid, msg) {
        if (roomCode) touchRoom(roomCode);
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

          case 'CONVERT_TO_MULTIPLAYER': {
            const gameState = msg.gameState;
            const settings = msg.settings;
            if (!gameState) throw new Error('Game state is required');

            const result = createRoomWithGameState(uid, ws, gameState, settings);
            odId = result.odId;
            roomCode = result.room.roomCode;

            sendTo(result.room, odId, {
              type: 'ROOM_CONVERTED',
              roomCode,
              odId,
              room: sanitizeRoom(result.room),
            });

            saveRoomToDB(roomCode).catch((err) => fastify.log.warn(err, 'MP room save on convert failed'));
            break;
          }

          case 'JOIN_ROOM': {
            const result = joinRoom(msg.roomCode, uid, ws);
            odId = result.odId;
            roomCode = result.room.roomCode;
            const player = result.room.players.get(odId);
            const selectedCharacter = normalizeJoinCharacter(msg.characterData);

            if (player && selectedCharacter) {
              player.name = selectedCharacter.name;
              player.gender = selectedCharacter.gender;
              player.characterData = selectedCharacter;
            }

            if (result.room.phase === 'playing' && result.room.gameState) {
              let newChar;
              let arrivalNarrative;
              if (selectedCharacter) {
                newChar = {
                  ...selectedCharacter,
                  odId,
                  playerName: selectedCharacter.name,
                };
                arrivalNarrative = buildArrivalNarrative(newChar.name, msg.language || 'en');
              } else {
                const charResult = await generateMidGameCharacter(
                  result.room.gameState,
                  result.room.settings,
                  player.name,
                  player.gender,
                  null,
                  msg.language || 'en',
                  player.characterData || null,
                );
                newChar = { ...charResult.character, odId };
                arrivalNarrative = charResult.arrivalNarrative;
              }

              result.room.gameState.characters = [...(result.room.gameState.characters || []), newChar];

              const careerName = newChar.career?.name || newChar.class || 'Adventurer';
              const journalEntry = `${newChar.name} (${careerName}) joined the party.`;
              if (!result.room.gameState.world) result.room.gameState.world = {};
              result.room.gameState.world.eventHistory = [...(result.room.gameState.world?.eventHistory || []), journalEntry];

              const arrivalMsg = {
                id: `msg_arrival_${Date.now()}`,
                role: 'dm',
                content: arrivalNarrative,
                dialogueSegments: [{ type: 'narration', text: arrivalNarrative }],
                timestamp: Date.now(),
              };
              result.room.gameState.chatHistory = [...(result.room.gameState.chatHistory || []), arrivalMsg];
              setGameState(roomCode, result.room.gameState);

              sendTo(result.room, odId, {
                type: 'ROOM_JOINED',
                roomCode,
                odId,
                room: sanitizeRoom(result.room),
              });

              broadcast(result.room, {
                type: 'PLAYER_JOINED_MIDGAME',
                player: {
                  odId,
                  userId: uid,
                  name: player.name,
                  gender: player.gender,
                  photo: null,
                  isHost: false,
                  pendingAction: null,
                },
                newCharacter: newChar,
                arrivalMessage: arrivalMsg,
                room: sanitizeRoom(result.room),
              }, odId);
            } else {
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
                  name: player?.name || 'Adventurer',
                  gender: player?.gender || 'male',
                  photo: null,
                  isHost: false,
                  pendingAction: null,
                },
                room: sanitizeRoom(result.room),
              }, odId);
            }
            break;
          }

          case 'LEAVE_ROOM': {
            if (!roomCode || !odId) break;
            const currentRoom = getRoom(roomCode);
            const leavingPlayer = currentRoom?.players.get(odId);
            const playerName = leavingPlayer?.name || 'A player';
            const wasPlaying = currentRoom?.phase === 'playing' && currentRoom?.gameState;

            const room = leaveRoom(roomCode, odId);
            if (room) {
              if (wasPlaying && room.gameState) {
                room.gameState.characters = (room.gameState.characters || []).filter((c) => c.odId !== odId);
                const journalEntry = `${playerName} left the party.`;
                if (!room.gameState.world) room.gameState.world = {};
                room.gameState.world.eventHistory = [...(room.gameState.world?.eventHistory || []), journalEntry];
                setGameState(roomCode, room.gameState);
              }
              broadcast(room, {
                type: 'PLAYER_LEFT',
                playerId: odId,
                room: sanitizeRoom(room),
              });
            }
            roomCode = null;
            odId = null;
            sendWs(ws, WS_SERVER_TYPES.LEFT_ROOM);
            break;
          }

          case 'UPDATE_CHARACTER': {
            if (!roomCode || !odId) throw new Error('Not in a room');
            const room = updateCharacter(roomCode, odId, {
              name: msg.name,
              gender: msg.gender,
              photo: msg.photo,
              voiceId: msg.voiceId,
              voiceName: msg.voiceName,
              characterData: msg.characterData,
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

            try {
              const players = [];
              for (const [, p] of currentRoom.players) {
                players.push({ odId: p.odId, name: p.name, gender: p.gender, isHost: p.isHost, characterData: p.characterData || null });
              }

              const campaignResult = await generateMultiplayerCampaign(
                currentRoom.settings,
                players,
                null,
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

              saveRoomToDB(roomCode).catch((err) => fastify.log.warn(err, 'MP room save failed'));
            } catch (genErr) {
              fastify.log.error(genErr, 'START_GAME generation failed');
              const aiError = toClientAiError(genErr, 'Campaign generation failed. Please try again.');
              broadcast(currentRoom, {
                type: 'GENERATION_FAILED',
                message: aiError.message,
                code: aiError.code,
                retryable: aiError.retryable,
              });
            }
            break;
          }

          case 'SUBMIT_ACTION': {
            if (!roomCode || !odId) throw new Error('Not in a room');
            const room = submitAction(roomCode, odId, msg.text, msg.isCustom);
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
            if (!sceneId) break;

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

            try {
              const players = [];
              for (const [, p] of room.players) {
                players.push({ odId: p.odId, name: p.name, gender: p.gender, isHost: p.isHost });
              }

              const characterMomentum = room.gameState.characterMomentum || {};

              const sceneResult = await generateMultiplayerScene(
                room.gameState,
                room.settings,
                players,
                actions,
                null,
                msg.language || 'en',
                msg.dmSettings || null,
                characterMomentum,
              );

              const { validated: validatedChanges } = validateMultiplayerStateChanges(
                sceneResult.stateChanges, room.gameState
              );
              sceneResult.stateChanges = normalizeMultiplayerStateChanges(validatedChanges);

              const prevMomentum = room.gameState.characterMomentum || {};
              const newMomentum = { ...prevMomentum };
              if (sceneResult.scene.diceRolls?.length) {
                for (const dr of sceneResult.scene.diceRolls) {
                  if (dr.character && dr.sl != null) {
                    newMomentum[dr.character] = calcNextMomentum(dr.sl, prevMomentum[dr.character] || 0);
                  }
                }
              }

              const applied = applySceneStateChanges(room.gameState, sceneResult, room.settings);
              const updatedGameState = {
                ...room.gameState,
                characters: applied.characters,
                world: applied.world,
                quests: applied.quests,
                ...(applied.campaign && { campaign: applied.campaign }),
                scenes: [...(room.gameState.scenes || []), sceneResult.scene],
                chatHistory: [...(room.gameState.chatHistory || []), ...sceneResult.chatMessages],
                characterMomentum: newMomentum,
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

              saveRoomToDB(roomCode).catch((err) => fastify.log.warn(err, 'MP room save failed'));

              if (needsCompression(updatedGameState)) {
                compressOldScenes(updatedGameState, null, msg.language || 'en')
                  .then((summary) => {
                    if (summary) {
                      const currentRoom = getRoom(roomCode);
                      if (currentRoom?.gameState) {
                        currentRoom.gameState.world = {
                          ...(currentRoom.gameState.world || {}),
                          compressedHistory: summary,
                        };
                        setGameState(roomCode, currentRoom.gameState);
                        saveRoomToDB(roomCode).catch(() => {});
                      }
                    }
                  })
                  .catch((err) => fastify.log.warn(err, 'MP scene compression failed'));
              }
            } catch (genErr) {
              fastify.log.error(genErr, 'APPROVE_ACTIONS generation failed');
              restorePendingActions(roomCode, actions);
              const aiError = toClientAiError(genErr, 'Scene generation failed. Your actions have been restored — please try again.');
              broadcast(room, {
                type: 'GENERATION_FAILED',
                message: aiError.message,
                code: aiError.code,
                retryable: aiError.retryable,
                room: sanitizeRoom(room),
              });
            }
            break;
          }

          case 'SOLO_ACTION': {
            if (!roomCode || !odId) throw new Error('Not in a room');
            const { room, action } = executeSoloAction(roomCode, odId, msg.text, msg.isCustom);

            broadcast(room, { type: 'SCENE_GENERATING' });
            broadcast(room, {
              type: 'ACTIONS_UPDATED',
              room: sanitizeRoom(room),
            });

            try {
              const players = [];
              for (const [, p] of room.players) {
                players.push({ odId: p.odId, name: p.name, gender: p.gender, isHost: p.isHost });
              }

              const soloMomentum = room.gameState.characterMomentum || {};

              const sceneResult = await generateMultiplayerScene(
                room.gameState,
                room.settings,
                players,
                [action],
                null,
                msg.language || 'en',
                msg.dmSettings || null,
                soloMomentum,
              );

              const { validated: validatedSoloChanges } = validateMultiplayerStateChanges(
                sceneResult.stateChanges, room.gameState
              );
              sceneResult.stateChanges = normalizeMultiplayerStateChanges(validatedSoloChanges);

              const newSoloMomentum = { ...soloMomentum };
              if (sceneResult.scene.diceRolls?.length) {
                for (const dr of sceneResult.scene.diceRolls) {
                  if (dr.character && dr.sl != null) {
                    newSoloMomentum[dr.character] = calcNextMomentum(dr.sl, soloMomentum[dr.character] || 0);
                  }
                }
              } else if (sceneResult.scene.diceRoll?.sl != null) {
                newSoloMomentum[action.name] = calcNextMomentum(sceneResult.scene.diceRoll.sl, soloMomentum[action.name] || 0);
              }

              const applied = applySceneStateChanges(room.gameState, sceneResult, room.settings);
              const updatedGameState = {
                ...room.gameState,
                characters: applied.characters,
                world: applied.world,
                quests: applied.quests,
                ...(applied.campaign && { campaign: applied.campaign }),
                scenes: [...(room.gameState.scenes || []), sceneResult.scene],
                chatHistory: [...(room.gameState.chatHistory || []), ...sceneResult.chatMessages],
                characterMomentum: newSoloMomentum,
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

              saveRoomToDB(roomCode).catch((err) => fastify.log.warn(err, 'MP room save failed'));

              if (needsCompression(updatedGameState)) {
                compressOldScenes(updatedGameState, null, msg.language || 'en')
                  .then((summary) => {
                    if (summary) {
                      const currentRoom = getRoom(roomCode);
                      if (currentRoom?.gameState) {
                        currentRoom.gameState.world = {
                          ...(currentRoom.gameState.world || {}),
                          compressedHistory: summary,
                        };
                        setGameState(roomCode, currentRoom.gameState);
                        saveRoomToDB(roomCode).catch(() => {});
                      }
                    }
                  })
                  .catch((err) => fastify.log.warn(err, 'MP scene compression failed'));
              }
            } catch (genErr) {
              fastify.log.error(genErr, 'SOLO_ACTION generation failed');
              restorePendingActions(roomCode, [action]);
              const aiError = toClientAiError(genErr, 'Scene generation failed. Your action has been restored — please try again.');
              broadcast(room, {
                type: 'GENERATION_FAILED',
                message: aiError.message,
                code: aiError.code,
                retryable: aiError.retryable,
                room: sanitizeRoom(room),
              });
            }
            break;
          }

          case 'ACCEPT_QUEST_OFFER': {
            if (!roomCode || !odId) throw new Error('Not in a room');
            const room = getRoom(roomCode);
            if (!room) throw new Error('Room not found');
            const { sceneId: aqSceneId, questOffer } = msg;
            if (!aqSceneId || !questOffer?.id) break;

            const quest = {
              id: questOffer.id,
              name: questOffer.name,
              description: questOffer.description,
              completionCondition: questOffer.completionCondition,
              objectives: (questOffer.objectives || []).map((obj) => ({ ...obj, completed: false })),
            };
            if (!room.gameState.quests) room.gameState.quests = { active: [], completed: [] };
            room.gameState.quests.active.push(quest);

            if (room.gameState?.scenes) {
              const sIdx = room.gameState.scenes.findIndex((s) => s.id === aqSceneId);
              if (sIdx >= 0 && room.gameState.scenes[sIdx].questOffers) {
                room.gameState.scenes[sIdx].questOffers = room.gameState.scenes[sIdx].questOffers.map((o) =>
                  o.id === questOffer.id ? { ...o, status: 'accepted' } : o
                );
              }
            }

            const acceptMsg = {
              id: `msg_${Date.now()}_quest_accept`,
              role: 'system',
              subtype: 'quest_new',
              content: `New quest: ${quest.name}`,
              timestamp: Date.now(),
            };
            room.gameState.chatHistory = [...(room.gameState.chatHistory || []), acceptMsg];
            setGameState(roomCode, room.gameState);

            broadcast(room, {
              type: 'QUEST_OFFER_UPDATE',
              sceneId: aqSceneId,
              offerId: questOffer.id,
              status: 'accepted',
              quest,
              chatMessage: acceptMsg,
              room: sanitizeRoom(room),
            });
            saveRoomToDB(roomCode).catch((err) => fastify.log.warn(err, 'MP room save failed'));
            break;
          }

          case 'DECLINE_QUEST_OFFER': {
            if (!roomCode || !odId) throw new Error('Not in a room');
            const room = getRoom(roomCode);
            if (!room) throw new Error('Room not found');
            const { sceneId: dqSceneId, offerId: dqOfferId } = msg;
            if (!dqSceneId || !dqOfferId) break;

            if (room.gameState?.scenes) {
              const sIdx = room.gameState.scenes.findIndex((s) => s.id === dqSceneId);
              if (sIdx >= 0 && room.gameState.scenes[sIdx].questOffers) {
                room.gameState.scenes[sIdx].questOffers = room.gameState.scenes[sIdx].questOffers.map((o) =>
                  o.id === dqOfferId ? { ...o, status: 'declined' } : o
                );
              }
            }
            setGameState(roomCode, room.gameState);

            broadcast(room, {
              type: 'QUEST_OFFER_UPDATE',
              sceneId: dqSceneId,
              offerId: dqOfferId,
              status: 'declined',
              room: sanitizeRoom(room),
            });
            break;
          }

          case 'VERIFY_QUEST_OBJECTIVE': {
            if (!roomCode || !odId) throw new Error('Not in a room');
            const room = getRoom(roomCode);
            if (!room) throw new Error('Room not found');
            if (!room.gameState?.quests?.active) throw new Error('Game not in progress');

            const { questId, objectiveId, requestId } = msg;
            if (!questId || !objectiveId || !requestId) break;

            const quest = room.gameState.quests.active.find((q) => q.id === questId);
            if (!quest) {
              sendTo(room, odId, {
                type: 'QUEST_OBJECTIVE_VERIFIED',
                requestId,
                questId,
                objectiveId,
                fulfilled: false,
                reasoning: 'Quest not found.',
              });
              break;
            }

            const objective = quest.objectives?.find((o) => o.id === objectiveId);
            if (!objective) {
              sendTo(room, odId, {
                type: 'QUEST_OBJECTIVE_VERIFIED',
                requestId,
                questId,
                objectiveId,
                fulfilled: false,
                reasoning: 'Objective not found.',
              });
              break;
            }

            if (objective.completed) {
              sendTo(room, odId, {
                type: 'QUEST_OBJECTIVE_VERIFIED',
                requestId,
                questId,
                objectiveId,
                fulfilled: true,
                reasoning: msg.language === 'pl'
                  ? 'Cel jest już oznaczony jako ukończony.'
                  : 'This objective is already marked as completed.',
                alreadyCompleted: true,
              });
              break;
            }

            const world = room.gameState.world || {};
            const scenes = room.gameState.scenes || [];
            const recentScenes = scenes.slice(-12);
            const contextParts = [];

            if (world.compressedHistory) {
              contextParts.push(`ARCHIVED HISTORY:\n${world.compressedHistory}`);
            }
            if (Array.isArray(world.eventHistory) && world.eventHistory.length > 0) {
              const lastEvents = world.eventHistory.slice(-40);
              contextParts.push(`STORY JOURNAL:\n${lastEvents.map((entry, idx) => `${idx + 1}. ${entry}`).join('\n')}`);
            }
            if (recentScenes.length > 0) {
              contextParts.push(
                `RECENT SCENES:\n${recentScenes
                  .map((scene, idx) => {
                    const number = scenes.length - recentScenes.length + idx + 1;
                    return `Scene ${number}: ${(scene?.narrative || '').slice(0, 1600)}`;
                  })
                  .join('\n\n')}`
              );
            }

            const storyContext = contextParts.join('\n\n') || 'No story events yet.';
            const verification = await verifyMultiplayerQuestObjective(
              storyContext,
              quest.name,
              quest.description,
              objective.description,
              msg.language || 'en',
            );

            if (!verification.fulfilled) {
              sendTo(room, odId, {
                type: 'QUEST_OBJECTIVE_VERIFIED',
                requestId,
                questId,
                objectiveId,
                fulfilled: false,
                reasoning: verification.reasoning || '',
              });
              break;
            }

            room.gameState.quests.active = room.gameState.quests.active.map((activeQuest) => {
              if (activeQuest.id !== questId) return activeQuest;
              return {
                ...activeQuest,
                objectives: (activeQuest.objectives || []).map((obj) =>
                  obj.id === objectiveId ? { ...obj, completed: true } : obj
                ),
              };
            });

            const objectiveMessage = {
              id: `msg_${Date.now()}_quest_obj_verify`,
              role: 'system',
              subtype: 'quest_objective_completed',
              content: msg.language === 'pl'
                ? `Cel ukończony: ${quest.name} — ${objective.description}`
                : `Objective completed: ${quest.name} — ${objective.description}`,
              timestamp: Date.now(),
            };
            room.gameState.chatHistory = [...(room.gameState.chatHistory || []), objectiveMessage];
            setGameState(roomCode, room.gameState);

            broadcast(room, {
              type: 'ROOM_STATE',
              room: sanitizeRoom(room),
            });

            sendTo(room, odId, {
              type: 'QUEST_OBJECTIVE_VERIFIED',
              requestId,
              questId,
              objectiveId,
              fulfilled: true,
              reasoning: verification.reasoning || '',
            });

            saveRoomToDB(roomCode).catch((err) => fastify.log.warn(err, 'MP room save after quest verification failed'));
            break;
          }

          case 'SYNC_CHARACTER': {
            if (!roomCode || !odId) throw new Error('Not in a room');
            const room = getRoom(roomCode);
            if (!room) throw new Error('Room not found');
            if (!room.gameState?.characters) break;

            const charData = msg.character;
            if (!charData) break;

            const charIdx = room.gameState.characters.findIndex((c) => c.odId === odId);
            if (charIdx < 0) break;

            const prev = room.gameState.characters[charIdx];
            room.gameState.characters[charIdx] = {
              ...prev,
              ...charData,
              odId: prev.odId,
              playerName: prev.playerName,
            };
            setGameState(roomCode, room.gameState);

            broadcast(room, {
              type: 'CHARACTER_SYNCED',
              odId,
              room: sanitizeRoom(room),
            });

            saveRoomToDB(roomCode).catch((err) => fastify.log.warn(err, 'MP room save after char sync failed'));
            break;
          }

          case 'COMBAT_SYNC': {
            if (!roomCode || !odId) throw new Error('Not in a room');
            const combatRoom = getRoom(roomCode);
            if (!combatRoom) throw new Error('Room not found');
            if (combatRoom.hostId !== odId) throw new Error('Only the host can sync combat state');
            if (!combatRoom.gameState) throw new Error('Game not in progress');

            combatRoom.gameState.combat = msg.combat;
            if (Array.isArray(msg.chatMessages) && msg.chatMessages.length > 0) {
              combatRoom.gameState.chatHistory = [
                ...(combatRoom.gameState.chatHistory || []),
                ...msg.chatMessages,
              ];
            }
            setGameState(roomCode, combatRoom.gameState);

            broadcast(combatRoom, {
              type: 'COMBAT_SYNC',
              combat: msg.combat,
              chatMessages: Array.isArray(msg.chatMessages) ? msg.chatMessages : [],
            });

            saveRoomToDB(roomCode).catch((err) => fastify.log.warn(err, 'MP room save after combat sync failed'));
            break;
          }

          case 'COMBAT_MANOEUVRE': {
            if (!roomCode || !odId) throw new Error('Not in a room');
            const manRoom = getRoom(roomCode);
            if (!manRoom) throw new Error('Room not found');
            if (!manRoom.gameState?.combat?.active) throw new Error('No active combat');

            sendTo(manRoom, manRoom.hostId, {
              type: 'COMBAT_MANOEUVRE',
              fromOdId: odId,
              manoeuvre: msg.manoeuvre,
              targetId: msg.targetId,
              customDescription: msg.customDescription,
            });
            break;
          }

          case 'COMBAT_ENDED': {
            if (!roomCode || !odId) throw new Error('Not in a room');
            const endRoom = getRoom(roomCode);
            if (!endRoom) throw new Error('Room not found');
            if (endRoom.hostId !== odId) throw new Error('Only the host can end combat');
            if (!endRoom.gameState) throw new Error('Game not in progress');

            const combatPerChar = normalizeMultiplayerStateChanges({ perCharacter: msg.perCharacter || {} }).perCharacter || {};
            const chars = endRoom.gameState.characters || [];
            const deadPlayers = [];
            endRoom.gameState.characters = chars.map((c) => {
              const delta = combatPerChar[c.name];
              if (!delta) return c;
              const updated = { ...c };
              if (delta.wounds != null) {
                updated.wounds = Math.max(0, Math.min(updated.maxWounds, updated.wounds + delta.wounds));
              }
              if (delta.xp != null) {
                updated.xp = (updated.xp || 0) + delta.xp;
              }
              if (updated.wounds === 0 && delta.wounds < 0) {
                const critCount = (updated.criticalWoundCount || 0) + 1;
                updated.criticalWoundCount = critCount;
                if (critCount >= 3) {
                  updated.status = 'dead';
                  deadPlayers.push({ name: c.name, odId: c.odId });
                }
              }
              return updated;
            });

            endRoom.gameState.combat = null;

            if (msg.journalEntry) {
              if (!endRoom.gameState.world) endRoom.gameState.world = {};
              endRoom.gameState.world.eventHistory = [
                ...(endRoom.gameState.world.eventHistory || []),
                msg.journalEntry,
              ];
            }

            setGameState(roomCode, endRoom.gameState);

            broadcast(endRoom, {
              type: 'COMBAT_ENDED',
              perCharacter: combatPerChar,
              deadPlayers,
              summary: {
                enemiesDefeated: msg.enemiesDefeated,
                totalEnemies: msg.totalEnemies,
                rounds: msg.rounds,
                outcome: msg.outcome || 'victory',
              },
              room: sanitizeRoom(endRoom),
            });

            for (const dp of deadPlayers) {
              broadcast(endRoom, {
                type: 'PLAYER_DIED',
                playerName: dp.name,
                playerOdId: dp.odId,
              });
            }

            saveRoomToDB(roomCode).catch((err) => fastify.log.warn(err, 'MP room save after combat end failed'));
            break;
          }

          case 'TYPING': {
            if (!roomCode || !odId) break;
            const typingRoom = getRoom(roomCode);
            if (!typingRoom) break;
            const typingPlayer = typingRoom.players.get(odId);
            if (!typingPlayer) break;
            const rawDraft = typeof msg.draft === 'string' ? msg.draft : '';
            const draft = rawDraft.trim().slice(0, TYPING_DRAFT_MAX_LENGTH);
            broadcast(typingRoom, {
              type: 'TYPING',
              odId,
              playerName: typingPlayer.name,
              isTyping: !!msg.isTyping,
              draft,
            }, odId);
            break;
          }

          case 'PING': {
            sendWs(ws, WS_SERVER_TYPES.PONG);
            break;
          }

          case 'REJOIN_ROOM': {
            let targetRoom = getRoom(msg.roomCode);

            if (!targetRoom) {
              const dbSession = await findSessionInDB(msg.roomCode);
              if (dbSession && dbSession.gameState) {
                const players = dbSession.players || [];
                const playerMap = new Map();
                for (const p of players) {
                  playerMap.set(p.odId, { ...p, ws: null, pendingAction: null, lastSoloActionAt: null });
                }
                const hostOdId = players.find((p) => p.isHost)?.odId || players[0]?.odId;
                targetRoom = restoreRoom(msg.roomCode, {
                  roomCode: dbSession.roomCode,
                  hostId: hostOdId,
                  phase: dbSession.phase,
                  settings: dbSession.settings,
                  players: playerMap,
                  gameState: dbSession.gameState,
                  lastActivity: Date.now(),
                });
              }
            }

            if (!targetRoom) {
              sendWs(ws, WS_SERVER_TYPES.ROOM_EXPIRED, { message: 'Room no longer exists' });
              break;
            }
            const existingPlayer = targetRoom.players.get(msg.odId);
            if (!existingPlayer || existingPlayer.userId !== uid) {
              sendWs(ws, WS_SERVER_TYPES.ROOM_EXPIRED, { message: 'Cannot rejoin: player not found or unauthorized' });
              break;
            }
            existingPlayer.ws = ws;
            odId = msg.odId;
            roomCode = msg.roomCode;
            touchRoom(roomCode);

            sendTo(targetRoom, odId, {
              type: 'ROOM_JOINED',
              roomCode,
              odId,
              room: sanitizeRoom(targetRoom),
            });

            broadcast(targetRoom, {
              type: 'PLAYER_RECONNECTED',
              playerId: odId,
              playerName: existingPlayer.name,
              room: sanitizeRoom(targetRoom),
            }, odId);

            saveRoomToDB(roomCode).catch((err) => fastify.log.warn(err, 'MP room save after rejoin failed'));
            break;
          }

          case 'WEBRTC_OFFER': {
            if (!roomCode) break;
            const rtcOfferRoom = getRoom(roomCode);
            if (rtcOfferRoom && msg.targetOdId) {
              sendTo(rtcOfferRoom, msg.targetOdId, { type: 'WEBRTC_OFFER', fromOdId: odId, offer: msg.offer });
            }
            break;
          }

          case 'WEBRTC_ANSWER': {
            if (!roomCode) break;
            const rtcAnswerRoom = getRoom(roomCode);
            if (rtcAnswerRoom && msg.targetOdId) {
              sendTo(rtcAnswerRoom, msg.targetOdId, { type: 'WEBRTC_ANSWER', fromOdId: odId, answer: msg.answer });
            }
            break;
          }

          case 'WEBRTC_ICE': {
            if (!roomCode) break;
            const rtcIceRoom = getRoom(roomCode);
            if (rtcIceRoom && msg.targetOdId) {
              sendTo(rtcIceRoom, msg.targetOdId, { type: 'WEBRTC_ICE', fromOdId: odId, candidate: msg.candidate });
            }
            break;
          }

          case 'WEBRTC_TRACK_STATE': {
            if (!roomCode) break;
            const rtcTrackRoom = getRoom(roomCode);
            if (rtcTrackRoom && msg.targetOdId) {
              sendTo(rtcTrackRoom, msg.targetOdId, {
                type: 'WEBRTC_TRACK_STATE',
                fromOdId: odId,
                videoEnabled: msg.videoEnabled,
                audioEnabled: msg.audioEnabled,
              });
            }
            break;
          }

          case 'KICK_PLAYER': {
            if (!roomCode || !odId) throw new Error('Not in a room');
            const room = getRoom(roomCode);
            if (!room) throw new Error('Room not found');
            if (room.hostId !== odId) throw new Error('Only the host can kick players');
            const targetOdId = msg.targetOdId;
            if (!targetOdId || targetOdId === odId) throw new Error('Invalid kick target');
            const target = room.players.get(targetOdId);
            if (!target) throw new Error('Player not found');

            const kickedName = target.name;
            if (target.ws?.readyState === 1) {
              sendWs(target.ws, WS_SERVER_TYPES.KICKED, { message: 'You have been removed from the room' });
              target.ws.close();
            }

            const updatedRoom = leaveRoom(roomCode, targetOdId);
            if (updatedRoom) {
              if (updatedRoom.gameState) {
                updatedRoom.gameState.characters = (updatedRoom.gameState.characters || []).filter((c) => c.odId !== targetOdId);
                const journalEntry = `${kickedName} was removed from the party.`;
                if (!updatedRoom.gameState.world) updatedRoom.gameState.world = {};
                updatedRoom.gameState.world.eventHistory = [...(updatedRoom.gameState.world?.eventHistory || []), journalEntry];
                setGameState(roomCode, updatedRoom.gameState);
              }
              broadcast(updatedRoom, {
                type: 'PLAYER_LEFT',
                playerId: targetOdId,
                room: sanitizeRoom(updatedRoom),
              });
            }
            break;
          }

          default:
            sendWs(ws, WS_SERVER_TYPES.ERROR, { message: 'Unknown message type' });
        }
      }
    } catch (err) {
      fastify.log.error(err, 'WebSocket connection error');
      sendWs(socket, WS_SERVER_TYPES.ERROR, { message: 'Internal server error' });
      socket.close();
    }
  });
}
