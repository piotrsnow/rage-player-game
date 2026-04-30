import {
  updateCharacter,
  updateSettings,
  getRoom,
  broadcast,
  sanitizeRoom,
  setGameState,
  saveRoomToDB,
} from '../../../services/roomManager.js';
import { fetchOwnedCharacter } from '../../../services/multiplayerSceneFlow.js';
import {
  TYPING_DRAFT_MAX_LENGTH,
  WS_SERVER_TYPES,
} from '../../../../../shared/contracts/multiplayer.js';

export async function handleUpdateCharacter(ctx, session, msg) {
  if (!session.roomCode || !session.odId) throw new Error('Not in a room');

  let snapshot = msg.characterData;
  if (msg.characterId) {
    const owned = await fetchOwnedCharacter(msg.characterId, ctx.uid);
    if (!owned) throw new Error('Character not found or not owned by user');
    snapshot = owned;
  }

  const room = updateCharacter(session.roomCode, session.odId, {
    name: msg.name,
    gender: msg.gender,
    photo: msg.photo,
    voiceId: msg.voiceId,
    voiceName: msg.voiceName,
    characterId: msg.characterId,
    characterData: snapshot,
  });
  broadcast(room, {
    type: 'ROOM_STATE',
    room: sanitizeRoom(room),
  });
}

export async function handleUpdateSettings(ctx, session, msg) {
  if (!session.roomCode || !session.odId) throw new Error('Not in a room');
  const room = updateSettings(session.roomCode, session.odId, msg.settings);
  broadcast(room, {
    type: 'ROOM_STATE',
    room: sanitizeRoom(room),
  });
}

export async function handleSyncCharacter(ctx, session, msg) {
  if (!session.roomCode || !session.odId) throw new Error('Not in a room');
  const room = getRoom(session.roomCode);
  if (!room) throw new Error('Room not found');
  if (!room.gameState?.characters) return;

  const charData = msg.character;
  if (!charData) return;

  const charIdx = room.gameState.characters.findIndex((c) => c.odId === session.odId);
  if (charIdx < 0) return;

  const prev = room.gameState.characters[charIdx];
  room.gameState.characters[charIdx] = {
    ...prev,
    ...charData,
    odId: prev.odId,
    playerName: prev.playerName,
  };
  setGameState(session.roomCode, room.gameState);

  broadcast(room, {
    type: 'CHARACTER_SYNCED',
    odId: session.odId,
    room: sanitizeRoom(room),
  });

  saveRoomToDB(session.roomCode).catch((err) => ctx.fastify.log.warn(err, 'MP room save after char sync failed'));
}

export async function handleUpdateSceneImage(ctx, session, msg) {
  if (!session.roomCode || !session.odId) throw new Error('Not in a room');
  const room = getRoom(session.roomCode);
  if (!room) throw new Error('Room not found');
  const { sceneId, image, fullImagePrompt = null } = msg;
  if (!sceneId) return;

  if (room.gameState?.scenes) {
    const idx = room.gameState.scenes.findIndex((s) => s.id === sceneId);
    if (idx >= 0) {
      room.gameState.scenes[idx] = { ...room.gameState.scenes[idx], image, fullImagePrompt };
      setGameState(session.roomCode, room.gameState);
    }
  }

  broadcast(room, {
    type: 'SCENE_IMAGE_UPDATE',
    sceneId,
    image,
    fullImagePrompt,
  }, session.odId);
}

export async function handleTyping(ctx, session, msg) {
  if (!session.roomCode || !session.odId) return;
  const typingRoom = getRoom(session.roomCode);
  if (!typingRoom) return;
  const typingPlayer = typingRoom.players.get(session.odId);
  if (!typingPlayer) return;
  const rawDraft = typeof msg.draft === 'string' ? msg.draft : '';
  const draft = rawDraft.trim().slice(0, TYPING_DRAFT_MAX_LENGTH);
  broadcast(typingRoom, {
    type: 'TYPING',
    odId: session.odId,
    playerName: typingPlayer.name,
    isTyping: !!msg.isTyping,
    draft,
  }, session.odId);
}

export async function handlePing(ctx) {
  ctx.sendWs(ctx.ws, WS_SERVER_TYPES.PONG);
}
