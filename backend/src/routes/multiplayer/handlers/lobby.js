import {
  createRoom,
  createRoomWithGameState,
  joinRoom,
  leaveRoom,
  restoreRoom,
  getRoom,
  findSessionInDB,
  sanitizeRoom,
  sendTo,
  broadcast,
  setGameState,
  saveRoomToDB,
  touchRoom,
} from '../../../services/roomManager.js';
import {
  fetchOwnedCharacter,
  buildArrivalNarrative,
} from '../../../services/multiplayerSceneFlow.js';
import { WS_SERVER_TYPES } from '../../../../../shared/contracts/multiplayer.js';

export async function handleCreateRoom(ctx, session) {
  const result = createRoom(ctx.uid, ctx.ws);
  session.odId = result.odId;
  session.roomCode = result.room.roomCode;
  sendTo(result.room, session.odId, {
    type: 'ROOM_CREATED',
    roomCode: session.roomCode,
    odId: session.odId,
    room: sanitizeRoom(result.room),
  });
}

export async function handleConvertToMultiplayer(ctx, session, msg) {
  const gameState = msg.gameState;
  const settings = msg.settings;
  if (!gameState) throw new Error('Game state is required');

  const result = createRoomWithGameState(ctx.uid, ctx.ws, gameState, settings);
  session.odId = result.odId;
  session.roomCode = result.room.roomCode;

  sendTo(result.room, session.odId, {
    type: 'ROOM_CONVERTED',
    roomCode: session.roomCode,
    odId: session.odId,
    room: sanitizeRoom(result.room),
  });

  saveRoomToDB(session.roomCode).catch((err) => ctx.fastify.log.warn(err, 'MP room save on convert failed'));
}

export async function handleJoinRoom(ctx, session, msg) {
  if (!msg.characterId) {
    throw new Error('characterId is required');
  }
  const result = joinRoom(msg.roomCode, ctx.uid, ctx.ws);
  session.odId = result.odId;
  session.roomCode = result.room.roomCode;
  const player = result.room.players.get(session.odId);

  const selectedCharacter = await fetchOwnedCharacter(msg.characterId, ctx.uid);
  if (!selectedCharacter) {
    throw new Error('Character not found or not owned by user');
  }
  if (player) {
    player.characterId = msg.characterId;
    player.name = selectedCharacter.name;
    player.gender = selectedCharacter.gender || 'male';
    player.characterData = selectedCharacter;
  }

  if (result.room.phase === 'playing' && result.room.gameState) {
    const newChar = {
      ...selectedCharacter,
      odId: session.odId,
      playerName: selectedCharacter.name,
    };
    const arrivalNarrative = buildArrivalNarrative(newChar.name, msg.language || 'en');

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
    setGameState(session.roomCode, result.room.gameState);

    sendTo(result.room, session.odId, {
      type: 'ROOM_JOINED',
      roomCode: session.roomCode,
      odId: session.odId,
      room: sanitizeRoom(result.room),
    });

    broadcast(result.room, {
      type: 'PLAYER_JOINED_MIDGAME',
      player: {
        odId: session.odId,
        userId: ctx.uid,
        name: player.name,
        gender: player.gender,
        photo: null,
        isHost: false,
        pendingAction: null,
      },
      newCharacter: newChar,
      arrivalMessage: arrivalMsg,
      room: sanitizeRoom(result.room),
    }, session.odId);
  } else {
    sendTo(result.room, session.odId, {
      type: 'ROOM_JOINED',
      roomCode: session.roomCode,
      odId: session.odId,
      room: sanitizeRoom(result.room),
    });

    broadcast(result.room, {
      type: 'PLAYER_JOINED',
      player: {
        odId: session.odId,
        userId: ctx.uid,
        name: player?.name || 'Adventurer',
        gender: player?.gender || 'male',
        photo: null,
        isHost: false,
        pendingAction: null,
      },
      room: sanitizeRoom(result.room),
    }, session.odId);
  }
}

export async function handleLeaveRoom(ctx, session) {
  if (!session.roomCode || !session.odId) return;
  const currentRoom = getRoom(session.roomCode);
  const leavingPlayer = currentRoom?.players.get(session.odId);
  const playerName = leavingPlayer?.name || 'A player';
  const wasPlaying = currentRoom?.phase === 'playing' && currentRoom?.gameState;

  const room = leaveRoom(session.roomCode, session.odId);
  if (room) {
    if (wasPlaying && room.gameState) {
      room.gameState.characters = (room.gameState.characters || []).filter((c) => c.odId !== session.odId);
      const journalEntry = `${playerName} left the party.`;
      if (!room.gameState.world) room.gameState.world = {};
      room.gameState.world.eventHistory = [...(room.gameState.world?.eventHistory || []), journalEntry];
      setGameState(session.roomCode, room.gameState);
    }
    broadcast(room, {
      type: 'PLAYER_LEFT',
      playerId: session.odId,
      room: sanitizeRoom(room),
    });
  }
  session.roomCode = null;
  session.odId = null;
  ctx.sendWs(ctx.ws, WS_SERVER_TYPES.LEFT_ROOM);
}

export async function handleRejoinRoom(ctx, session, msg) {
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
    ctx.sendWs(ctx.ws, WS_SERVER_TYPES.ROOM_EXPIRED, { message: 'Room no longer exists' });
    return;
  }
  const existingPlayer = targetRoom.players.get(msg.odId);
  if (!existingPlayer || existingPlayer.userId !== ctx.uid) {
    ctx.sendWs(ctx.ws, WS_SERVER_TYPES.ROOM_EXPIRED, { message: 'Cannot rejoin: player not found or unauthorized' });
    return;
  }
  existingPlayer.ws = ctx.ws;
  session.odId = msg.odId;
  session.roomCode = msg.roomCode;
  touchRoom(session.roomCode);

  sendTo(targetRoom, session.odId, {
    type: 'ROOM_JOINED',
    roomCode: session.roomCode,
    odId: session.odId,
    room: sanitizeRoom(targetRoom),
  });

  broadcast(targetRoom, {
    type: 'PLAYER_RECONNECTED',
    playerId: session.odId,
    playerName: existingPlayer.name,
    room: sanitizeRoom(targetRoom),
  }, session.odId);

  saveRoomToDB(session.roomCode).catch((err) => ctx.fastify.log.warn(err, 'MP room save after rejoin failed'));
}

export async function handleKickPlayer(ctx, session, msg) {
  if (!session.roomCode || !session.odId) throw new Error('Not in a room');
  const room = getRoom(session.roomCode);
  if (!room) throw new Error('Room not found');
  if (room.hostId !== session.odId) throw new Error('Only the host can kick players');
  const targetOdId = msg.targetOdId;
  if (!targetOdId || targetOdId === session.odId) throw new Error('Invalid kick target');
  const target = room.players.get(targetOdId);
  if (!target) throw new Error('Player not found');

  const kickedName = target.name;
  if (target.ws?.readyState === 1) {
    ctx.sendWs(target.ws, WS_SERVER_TYPES.KICKED, { message: 'You have been removed from the room' });
    target.ws.close();
  }

  const updatedRoom = leaveRoom(session.roomCode, targetOdId);
  if (updatedRoom) {
    if (updatedRoom.gameState) {
      updatedRoom.gameState.characters = (updatedRoom.gameState.characters || []).filter((c) => c.odId !== targetOdId);
      const journalEntry = `${kickedName} was removed from the party.`;
      if (!updatedRoom.gameState.world) updatedRoom.gameState.world = {};
      updatedRoom.gameState.world.eventHistory = [...(updatedRoom.gameState.world?.eventHistory || []), journalEntry];
      setGameState(session.roomCode, updatedRoom.gameState);
    }
    broadcast(updatedRoom, {
      type: 'PLAYER_LEFT',
      playerId: targetOdId,
      room: sanitizeRoom(updatedRoom),
    });
  }
}
