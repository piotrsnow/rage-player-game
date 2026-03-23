import { randomBytes } from 'crypto';

const rooms = new Map();
const ROOM_INACTIVE_TTL_MS = 30 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = Array.from(randomBytes(4))
      .map((b) => chars[b % chars.length])
      .join('');
  } while (rooms.has(code));
  return code;
}

function generateOdId() {
  return `od_${Date.now()}_${randomBytes(4).toString('hex')}`;
}

function sanitizeRoom(room) {
  const players = [];
  for (const [, p] of room.players) {
    players.push({
      odId: p.odId,
      userId: p.userId,
      name: p.name,
      gender: p.gender,
      photo: p.photo,
      isHost: p.isHost,
      pendingAction: p.pendingAction,
      lastSoloActionAt: p.lastSoloActionAt || null,
      voiceId: p.voiceId || null,
      voiceName: p.voiceName || null,
      characterData: p.characterData || null,
    });
  }
  return {
    roomCode: room.roomCode,
    hostId: room.hostId,
    phase: room.phase,
    settings: room.settings,
    players,
    gameState: room.gameState,
  };
}

export function createRoom(hostUserId, ws) {
  const roomCode = generateRoomCode();
  const odId = generateOdId();

  const player = {
    odId,
    userId: hostUserId,
    name: 'Host',
    gender: 'male',
    photo: null,
    isHost: true,
    ws,
    pendingAction: null,
    lastSoloActionAt: null,
    voiceId: null,
    voiceName: null,
    characterData: null,
  };

  const room = {
    roomCode,
    hostId: odId,
    phase: 'lobby',
    settings: {
      genre: 'Fantasy',
      tone: 'Epic',
      style: 'Hybrid',
      difficulty: 'Normal',
      length: 'Medium',
      storyPrompt: '',
    },
    players: new Map([[odId, player]]),
    gameState: null,
    lastActivity: Date.now(),
  };

  rooms.set(roomCode, room);
  return { room, odId };
}

export function createRoomWithGameState(hostUserId, ws, gameState, settings) {
  const roomCode = generateRoomCode();
  const odId = generateOdId();

  const player = {
    odId,
    userId: hostUserId,
    name: gameState.characters?.[0]?.name || 'Host',
    gender: gameState.characters?.[0]?.gender || 'male',
    photo: null,
    isHost: true,
    ws,
    pendingAction: null,
    lastSoloActionAt: null,
    voiceId: null,
    voiceName: null,
  };

  if (gameState.characters?.length > 0) {
    gameState.characters[0].odId = odId;
  }

  const room = {
    roomCode,
    hostId: odId,
    phase: 'playing',
    settings: settings || {
      genre: 'Fantasy',
      tone: 'Epic',
      style: 'Hybrid',
      difficulty: 'Normal',
      length: 'Medium',
      storyPrompt: '',
    },
    players: new Map([[odId, player]]),
    gameState,
    lastActivity: Date.now(),
  };

  rooms.set(roomCode, room);
  return { room, odId };
}

export function joinRoom(roomCode, userId, ws) {
  const room = rooms.get(roomCode);
  if (!room) throw new Error('Room not found');
  if (room.phase !== 'lobby' && room.phase !== 'playing') throw new Error('Cannot join this room');
  if (room.players.size >= 6) throw new Error('Room is full');

  const odId = generateOdId();
  const player = {
    odId,
    userId,
    name: 'Adventurer',
    gender: 'male',
    photo: null,
    isHost: false,
    ws,
    pendingAction: null,
    lastSoloActionAt: null,
    voiceId: null,
    voiceName: null,
    characterData: null,
  };

  room.players.set(odId, player);
  return { room, odId };
}

export function leaveRoom(roomCode, odId) {
  const room = rooms.get(roomCode);
  if (!room) return null;

  room.players.delete(odId);

  if (room.players.size === 0) {
    rooms.delete(roomCode);
    return null;
  }

  if (room.hostId === odId) {
    const firstPlayer = room.players.values().next().value;
    firstPlayer.isHost = true;
    room.hostId = firstPlayer.odId;
  }

  return room;
}

export function updateCharacter(roomCode, odId, { name, gender, photo, voiceId, voiceName, characterData }) {
  const room = rooms.get(roomCode);
  if (!room) throw new Error('Room not found');
  const player = room.players.get(odId);
  if (!player) throw new Error('Player not found');

  if (name !== undefined) player.name = name;
  if (gender !== undefined) player.gender = gender;
  if (photo !== undefined) player.photo = photo;
  if (voiceId !== undefined) player.voiceId = voiceId;
  if (voiceName !== undefined) player.voiceName = voiceName;
  if (characterData !== undefined) player.characterData = characterData;

  return room;
}

export function updateSettings(roomCode, odId, settings) {
  const room = rooms.get(roomCode);
  if (!room) throw new Error('Room not found');
  if (room.hostId !== odId) throw new Error('Only the host can update settings');

  room.settings = { ...room.settings, ...settings };
  return room;
}

export function setPhase(roomCode, phase) {
  const room = rooms.get(roomCode);
  if (!room) throw new Error('Room not found');
  room.phase = phase;
  return room;
}

export function setGameState(roomCode, gameState) {
  const room = rooms.get(roomCode);
  if (!room) throw new Error('Room not found');
  room.gameState = gameState;
  return room;
}

export function submitAction(roomCode, odId, actionText, isCustom = false) {
  const room = rooms.get(roomCode);
  if (!room) throw new Error('Room not found');
  if (room.phase !== 'playing') throw new Error('Game not in progress');
  const player = room.players.get(odId);
  if (!player) throw new Error('Player not found');

  player.pendingAction = actionText;
  player.pendingActionIsCustom = isCustom;
  return room;
}

export function withdrawAction(roomCode, odId) {
  const room = rooms.get(roomCode);
  if (!room) throw new Error('Room not found');
  const player = room.players.get(odId);
  if (!player) throw new Error('Player not found');

  player.pendingAction = null;
  return room;
}

export function approveActions(roomCode, odId) {
  const room = rooms.get(roomCode);
  if (!room) throw new Error('Room not found');
  if (room.hostId !== odId) throw new Error('Only the host can approve actions');

  const actions = [];
  for (const [, p] of room.players) {
    if (p.pendingAction) {
      actions.push({
        odId: p.odId,
        name: p.name,
        gender: p.gender,
        action: p.pendingAction,
        isCustom: p.pendingActionIsCustom || false,
      });
    }
  }

  for (const [, p] of room.players) {
    p.pendingAction = null;
    p.pendingActionIsCustom = false;
  }

  return { room, actions };
}

const SOLO_ACTION_COOLDOWN_MS = 3 * 60 * 1000;

export function executeSoloAction(roomCode, odId, actionText, isCustom = false) {
  const room = rooms.get(roomCode);
  if (!room) throw new Error('Room not found');
  if (room.phase !== 'playing') throw new Error('Game not in progress');
  const player = room.players.get(odId);
  if (!player) throw new Error('Player not found');

  const now = Date.now();
  if (player.lastSoloActionAt && (now - player.lastSoloActionAt) < SOLO_ACTION_COOLDOWN_MS) {
    const remainingMs = SOLO_ACTION_COOLDOWN_MS - (now - player.lastSoloActionAt);
    const err = new Error('Solo action on cooldown');
    err.remainingMs = remainingMs;
    throw err;
  }

  player.lastSoloActionAt = now;
  player.pendingAction = null;
  player.pendingActionIsCustom = false;

  const action = {
    odId: player.odId,
    name: player.name,
    gender: player.gender,
    action: actionText,
    isCustom,
  };

  return { room, action };
}

export function getRoom(roomCode) {
  return rooms.get(roomCode) || null;
}

export function broadcast(room, message, excludeOdId = null) {
  const payload = typeof message === 'string' ? message : JSON.stringify(message);
  for (const [, player] of room.players) {
    if (player.odId !== excludeOdId && player.ws.readyState === 1) {
      player.ws.send(payload);
    }
  }
}

export function sendTo(room, odId, message) {
  const player = room.players.get(odId);
  if (player && player.ws.readyState === 1) {
    player.ws.send(typeof message === 'string' ? message : JSON.stringify(message));
  }
}

function touchRoom(roomCode) {
  const room = rooms.get(roomCode);
  if (room) room.lastActivity = Date.now();
}

function cleanupInactiveRooms() {
  const now = Date.now();
  for (const [code, room] of rooms) {
    const hasConnectedPlayers = [...room.players.values()].some((p) => p.ws.readyState === 1);
    if (!hasConnectedPlayers && (now - room.lastActivity) > ROOM_INACTIVE_TTL_MS) {
      rooms.delete(code);
    }
  }
}

let cleanupTimer = null;

export function startRoomCleanup() {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(cleanupInactiveRooms, CLEANUP_INTERVAL_MS);
  if (cleanupTimer.unref) cleanupTimer.unref();
}

export function stopRoomCleanup() {
  clearInterval(cleanupTimer);
  cleanupTimer = null;
}

export { sanitizeRoom, touchRoom };
