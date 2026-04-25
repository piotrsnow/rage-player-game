import { randomBytes } from 'crypto';
import { prisma } from '../lib/prisma.js';
import { childLogger } from '../lib/logger.js';
import { deserializeCharacterRow } from './characterMutations.js';

const log = childLogger({ module: 'roomManager' });

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
      connected: p.ws?.readyState === 1,
      pendingAction: p.pendingAction,
      lastSoloActionAt: p.lastSoloActionAt || null,
      voiceId: p.voiceId || null,
      voiceName: p.voiceName || null,
      // characterId is the canonical reference into the Character collection.
      // characterData is a transient cache for in-room rendering — the DB
      // record is the source of truth for persistence.
      characterId: p.characterId || null,
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
    characterId: null,
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
    // Character record reference. Caller is expected to populate this from
    // gameState.character.backendId before invoking createRoomWithGameState.
    characterId: gameState.characters?.[0]?.backendId
      || gameState.characters?.[0]?.id
      || gameState.character?.backendId
      || gameState.character?.id
      || null,
    characterData: gameState.characters?.[0] || gameState.character || null,
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
    characterId: null,
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
    deleteRoomFromDB(roomCode).catch((err) => {
      log.warn({ err, roomCode }, 'deleteRoomFromDB after last leave failed');
    });
    return null;
  }

  if (room.hostId === odId) {
    const firstPlayer = room.players.values().next().value;
    firstPlayer.isHost = true;
    room.hostId = firstPlayer.odId;
  }

  return room;
}

export function disconnectPlayer(roomCode, odId) {
  const room = rooms.get(roomCode);
  if (!room) return null;

  const player = room.players.get(odId);
  if (!player) return null;

  player.ws = null;

  const hasConnected = [...room.players.values()].some((p) => p.ws?.readyState === 1);
  if (!hasConnected) {
    room.lastActivity = Date.now();
  }

  if (room.hostId === odId) {
    const connectedPlayer = [...room.players.values()].find((p) => p.odId !== odId && p.ws?.readyState === 1);
    if (connectedPlayer) {
      player.isHost = false;
      connectedPlayer.isHost = true;
      room.hostId = connectedPlayer.odId;
    }
  }

  return room;
}

export function listUserRooms(userId) {
  const result = [];
  for (const [, room] of rooms) {
    for (const [, p] of room.players) {
      if (p.userId === userId) {
        const hostPlayer = [...room.players.values()].find((pl) => pl.isHost);
        const campaignName = room.gameState?.campaign?.name || room.settings?.genre || 'Campaign';
        result.push({
          roomCode: room.roomCode,
          phase: room.phase,
          hostName: hostPlayer?.name || 'Host',
          campaignName,
          playerCount: room.players.size,
          myOdId: p.odId,
          isHost: p.isHost,
        });
        break;
      }
    }
  }
  return result;
}

export function updateCharacter(roomCode, odId, { name, gender, photo, voiceId, voiceName, characterId, characterData }) {
  const room = rooms.get(roomCode);
  if (!room) throw new Error('Room not found');
  const player = room.players.get(odId);
  if (!player) throw new Error('Player not found');

  if (name !== undefined) player.name = name;
  if (gender !== undefined) player.gender = gender;
  if (photo !== undefined) player.photo = photo;
  if (voiceId !== undefined) player.voiceId = voiceId;
  if (voiceName !== undefined) player.voiceName = voiceName;
  if (characterId !== undefined) player.characterId = characterId;
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
  player.pendingActionAt = Date.now();
  return room;
}

export function withdrawAction(roomCode, odId) {
  const room = rooms.get(roomCode);
  if (!room) throw new Error('Room not found');
  const player = room.players.get(odId);
  if (!player) throw new Error('Player not found');

  player.pendingAction = null;
  player.pendingActionAt = null;
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
        submittedAt: p.pendingActionAt || 0,
      });
    }
  }
  actions.sort((a, b) => a.submittedAt - b.submittedAt);

  for (const [, p] of room.players) {
    p.pendingAction = null;
    p.pendingActionIsCustom = false;
    p.pendingActionAt = null;
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

export function listJoinableRooms() {
  const result = [];
  for (const [, room] of rooms) {
    if (room.players.size >= 6) continue;
    const hostPlayer = [...room.players.values()].find((p) => p.isHost);
    result.push({
      roomCode: room.roomCode,
      phase: room.phase,
      hostName: hostPlayer?.name || 'Host',
      playerCount: room.players.size,
      maxPlayers: 6,
      settings: {
        genre: room.settings?.genre || '',
        tone: room.settings?.tone || '',
        difficulty: room.settings?.difficulty || '',
      },
    });
  }
  return result;
}

export function broadcast(room, message, excludeOdId = null) {
  const payload = typeof message === 'string' ? message : JSON.stringify(message);
  for (const [, player] of room.players) {
    if (player.odId !== excludeOdId && player.ws?.readyState === 1) {
      player.ws.send(payload);
    }
  }
}

export function sendTo(room, odId, message) {
  const player = room.players.get(odId);
  if (player?.ws?.readyState === 1) {
    player.ws.send(typeof message === 'string' ? message : JSON.stringify(message));
    return true;
  }
  if (process.env.NODE_ENV !== 'production') {
    log.warn({ roomCode: room?.roomCode, odId }, 'sendTo skipped: target socket not open');
  }
  return false;
}

function touchRoom(roomCode) {
  const room = rooms.get(roomCode);
  if (room) room.lastActivity = Date.now();
}

function cleanupInactiveRooms() {
  const now = Date.now();
  for (const [code, room] of rooms) {
    const hasConnectedPlayers = [...room.players.values()].some((p) => p.ws?.readyState === 1);
    if (!hasConnectedPlayers && (now - room.lastActivity) > ROOM_INACTIVE_TTL_MS) {
      rooms.delete(code);
      deleteRoomFromDB(code).catch((err) => {
        log.warn({ err, roomCode: code }, 'deleteRoomFromDB cleanup failed');
      });
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

/**
 * Persist all active rooms to DB. Used by the graceful shutdown handler so
 * in-flight multiplayer sessions survive a SIGTERM-triggered deploy.
 */
export async function saveAllActiveRooms() {
  const codes = [];
  for (const [code, room] of rooms) {
    if (room?.gameState) codes.push(code);
  }
  await Promise.allSettled(codes.map((code) => saveRoomToDB(code)));
  return codes.length;
}

/**
 * Close every active WebSocket attached to a room. Called from shutdown so
 * clients get a clean close frame instead of dangling sockets.
 */
export function closeAllRoomSockets(code = 1001, reason = 'Server shutting down') {
  let closed = 0;
  for (const [, room] of rooms) {
    for (const [, player] of room.players) {
      const ws = player.ws;
      if (ws && ws.readyState === 1) {
        try { ws.close(code, reason); closed += 1; } catch { /* already closing */ }
      }
    }
  }
  return closed;
}

function buildPlayerRowsForDB(sessionId, room) {
  const rows = [];
  for (const [, p] of room.players) {
    rows.push({
      sessionId,
      odId: p.odId,
      userId: p.userId || null,
      name: p.name || '',
      characterId: p.characterId || null,
      isHost: !!p.isHost,
    });
  }
  return rows;
}

/**
 * Strip embedded character snapshots out of gameState before persistence.
 * Multiplayer sessions reference characters by ID via the characterIds column,
 * not via embedded snapshots in the gameState blob. The in-memory snapshot is
 * still useful for live rendering, but we never write it to disk.
 */
function stripCharactersFromGameStateForDB(gameState) {
  if (!gameState) return gameState;
  const out = { ...gameState };
  delete out.character;
  delete out.characters;
  return out;
}

export async function saveRoomToDB(roomCode) {
  const room = rooms.get(roomCode);
  if (!room || !room.gameState) return;

  try {
    const hostPlayer = room.players.get(room.hostId);
    if (!hostPlayer) return;

    const slimGameState = stripCharactersFromGameStateForDB(room.gameState);

    const session = await prisma.multiplayerSession.upsert({
      where: { roomCode },
      create: {
        roomCode,
        hostId: hostPlayer.userId,
        phase: room.phase,
        gameState: slimGameState,
        settings: room.settings,
      },
      update: {
        hostId: hostPlayer.userId,
        phase: room.phase,
        gameState: slimGameState,
        settings: room.settings,
      },
    });

    // Replace the session's player rows. Cheap because Prisma does the
    // delete+createMany in two statements; concurrent saves are serialized
    // by the same row lock on MultiplayerSession.
    const playerRows = buildPlayerRowsForDB(session.id, room);
    await prisma.$transaction([
      prisma.multiplayerSessionPlayer.deleteMany({ where: { sessionId: session.id } }),
      ...(playerRows.length > 0
        ? [prisma.multiplayerSessionPlayer.createMany({ data: playerRows })]
        : []),
    ]);
  } catch (err) {
    log.warn({ err }, 'Failed to save room to DB');
  }
}

export async function deleteRoomFromDB(roomCode) {
  try {
    await prisma.multiplayerSession.delete({ where: { roomCode } });
  } catch (err) {
    // Record-not-found (Prisma P2025) is benign — the session was already cleaned up.
    if (err?.code !== 'P2025') {
      log.warn({ err, roomCode }, 'Failed to delete session from DB');
    }
  }
}

export async function loadActiveSessionsFromDB() {
  try {
    const sessions = await prisma.multiplayerSession.findMany({
      where: { phase: 'playing' },
      include: { players: true },
    });

    for (const session of sessions) {
      if (rooms.has(session.roomCode)) continue;

      const gameState = session.gameState || null;
      const settings = session.settings || {};
      const players = session.players || [];

      if (!gameState) continue;

      const characterIds = players.map((p) => p.characterId).filter(Boolean);
      const charRows = characterIds.length > 0
        ? await prisma.character.findMany({ where: { id: { in: characterIds } } })
        : [];
      const charById = new Map(charRows.map((r) => [r.id, deserializeCharacterRow(r)]));

      const playerMap = new Map();
      const refreshedCharacters = [];
      for (const p of players) {
        const characterData = p.characterId ? charById.get(p.characterId) || null : null;
        playerMap.set(p.odId, {
          odId: p.odId,
          userId: p.userId,
          name: p.name,
          characterId: p.characterId || null,
          isHost: !!p.isHost,
          ws: null,
          pendingAction: null,
          lastSoloActionAt: null,
          characterData,
        });
        if (characterData) {
          refreshedCharacters.push({ ...characterData, odId: p.odId });
        }
      }

      gameState.characters = refreshedCharacters;
      if (refreshedCharacters[0]) gameState.character = refreshedCharacters[0];

      const hostOdId = players.find((p) => p.isHost)?.odId || players[0]?.odId;

      rooms.set(session.roomCode, {
        roomCode: session.roomCode,
        hostId: hostOdId,
        phase: session.phase,
        settings,
        players: playerMap,
        gameState,
        lastActivity: Date.now(),
        fromDB: true,
      });
    }

    if (sessions.length > 0) {
      log.info({ count: sessions.length }, 'Loaded multiplayer sessions from DB');
    }
  } catch (err) {
    log.warn({ err }, 'Failed to load sessions from DB');
  }
}

export async function findSessionInDB(roomCode) {
  try {
    const session = await prisma.multiplayerSession.findUnique({
      where: { roomCode },
      include: { players: true },
    });
    if (!session) return null;
    return {
      roomCode: session.roomCode,
      phase: session.phase,
      players: session.players || [],
      gameState: session.gameState || null,
      settings: session.settings || {},
      hostUserId: session.hostId,
    };
  } catch {
    return null;
  }
}

export function restoreRoom(roomCode, roomData) {
  if (rooms.has(roomCode)) return rooms.get(roomCode);
  rooms.set(roomCode, roomData);
  return roomData;
}

export function restorePendingActions(roomCode, actions) {
  const room = rooms.get(roomCode);
  if (!room) return;
  for (const a of actions) {
    const player = room.players.get(a.odId);
    if (player) {
      player.pendingAction = a.action;
      player.pendingActionIsCustom = a.isCustom || false;
      player.pendingActionAt = a.submittedAt || Date.now();
    }
  }
}

export { sanitizeRoom, touchRoom };
