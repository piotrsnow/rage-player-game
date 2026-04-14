import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../services/roomManager.js', () => ({
  createRoom: vi.fn(),
  createRoomWithGameState: vi.fn(),
  joinRoom: vi.fn(),
  leaveRoom: vi.fn(),
  restoreRoom: vi.fn(),
  getRoom: vi.fn(),
  findSessionInDB: vi.fn(),
  sanitizeRoom: vi.fn((room) => ({ sanitized: true, roomCode: room?.roomCode })),
  sendTo: vi.fn(),
  broadcast: vi.fn(),
  setGameState: vi.fn(),
  saveRoomToDB: vi.fn(() => Promise.resolve()),
  touchRoom: vi.fn(),
}));

vi.mock('../../../services/multiplayerSceneFlow.js', () => ({
  fetchOwnedCharacter: vi.fn(),
  buildArrivalNarrative: vi.fn((name) => `${name} arrived`),
}));

import {
  createRoom,
  createRoomWithGameState,
  joinRoom,
  leaveRoom,
  getRoom,
  findSessionInDB,
  restoreRoom,
  sendTo,
  broadcast,
  setGameState,
  saveRoomToDB,
  touchRoom,
} from '../../../services/roomManager.js';
import { fetchOwnedCharacter } from '../../../services/multiplayerSceneFlow.js';
import {
  handleCreateRoom,
  handleConvertToMultiplayer,
  handleJoinRoom,
  handleLeaveRoom,
  handleRejoinRoom,
  handleKickPlayer,
} from './lobby.js';

function makeCtx() {
  return {
    fastify: { log: { warn: vi.fn() } },
    ws: { readyState: 1 },
    uid: 'user_1',
    sendWs: vi.fn(),
  };
}

function makeSession(overrides = {}) {
  return { odId: null, roomCode: null, ...overrides };
}

beforeEach(() => vi.clearAllMocks());

describe('handleCreateRoom', () => {
  it('creates room, mutates session, sends ROOM_CREATED', async () => {
    const room = { roomCode: 'NEW1', players: new Map() };
    createRoom.mockReturnValue({ odId: 'od_me', room });

    const session = makeSession();
    await handleCreateRoom(makeCtx(), session);

    expect(session.odId).toBe('od_me');
    expect(session.roomCode).toBe('NEW1');
    expect(sendTo).toHaveBeenCalledWith(
      room,
      'od_me',
      expect.objectContaining({ type: 'ROOM_CREATED', roomCode: 'NEW1' }),
    );
  });
});

describe('handleConvertToMultiplayer', () => {
  it('requires gameState', async () => {
    await expect(
      handleConvertToMultiplayer(makeCtx(), makeSession(), {}),
    ).rejects.toThrow(/Game state is required/);
  });

  it('creates room with gameState and saves to DB', async () => {
    const room = { roomCode: 'CONV' };
    createRoomWithGameState.mockReturnValue({ odId: 'od_me', room });
    const session = makeSession();
    await handleConvertToMultiplayer(makeCtx(), session, {
      gameState: { scenes: [] },
      settings: { language: 'en' },
    });
    expect(session.odId).toBe('od_me');
    expect(session.roomCode).toBe('CONV');
    expect(createRoomWithGameState).toHaveBeenCalledWith(
      'user_1', expect.anything(), { scenes: [] }, { language: 'en' },
    );
    expect(saveRoomToDB).toHaveBeenCalledWith('CONV');
  });
});

describe('handleJoinRoom', () => {
  it('requires characterId', async () => {
    await expect(
      handleJoinRoom(makeCtx(), makeSession(), { roomCode: 'X' }),
    ).rejects.toThrow(/characterId is required/);
  });

  it('throws when character is not owned', async () => {
    joinRoom.mockReturnValue({
      odId: 'od_me',
      room: { roomCode: 'X', players: new Map([['od_me', { name: 'p' }]]), phase: 'lobby' },
    });
    fetchOwnedCharacter.mockResolvedValue(null);
    await expect(
      handleJoinRoom(makeCtx(), makeSession(), { roomCode: 'X', characterId: 'c1' }),
    ).rejects.toThrow(/Character not found/);
  });

  it('attaches selected character and broadcasts PLAYER_JOINED in lobby', async () => {
    const player = { name: 'Old', gender: 'male' };
    const room = {
      roomCode: 'X',
      players: new Map([['od_me', player]]),
      phase: 'lobby',
    };
    joinRoom.mockReturnValue({ odId: 'od_me', room });
    fetchOwnedCharacter.mockResolvedValue({
      name: 'Hero', gender: 'female', id: 'c1',
    });

    const session = makeSession();
    await handleJoinRoom(makeCtx(), session, { roomCode: 'X', characterId: 'c1' });

    expect(player.name).toBe('Hero');
    expect(player.gender).toBe('female');
    expect(player.characterId).toBe('c1');
    expect(session.odId).toBe('od_me');
    expect(sendTo).toHaveBeenCalledWith(room, 'od_me', expect.objectContaining({ type: 'ROOM_JOINED' }));
    expect(broadcast).toHaveBeenCalledWith(
      room,
      expect.objectContaining({ type: 'PLAYER_JOINED' }),
      'od_me',
    );
  });

  it('adds character to party + broadcasts PLAYER_JOINED_MIDGAME when joining playing room', async () => {
    const player = { name: 'Old' };
    const room = {
      roomCode: 'X',
      players: new Map([['od_me', player]]),
      phase: 'playing',
      gameState: { characters: [], chatHistory: [], world: {} },
    };
    joinRoom.mockReturnValue({ odId: 'od_me', room });
    fetchOwnedCharacter.mockResolvedValue({ name: 'Hero', class: 'Warrior', gender: 'male' });

    await handleJoinRoom(makeCtx(), makeSession(), {
      roomCode: 'X', characterId: 'c1', language: 'en',
    });

    expect(room.gameState.characters).toHaveLength(1);
    expect(room.gameState.characters[0].name).toBe('Hero');
    expect(room.gameState.world.eventHistory).toContain('Hero (Warrior) joined the party.');
    expect(setGameState).toHaveBeenCalled();
    expect(broadcast).toHaveBeenCalledWith(
      room,
      expect.objectContaining({ type: 'PLAYER_JOINED_MIDGAME' }),
      'od_me',
    );
  });
});

describe('handleLeaveRoom', () => {
  it('returns silently when not in room', async () => {
    await handleLeaveRoom(makeCtx(), makeSession());
    expect(leaveRoom).not.toHaveBeenCalled();
  });

  it('removes character from party when leaving mid-game', async () => {
    const room = {
      roomCode: 'X',
      phase: 'playing',
      players: new Map([['od_me', { name: 'Hero' }]]),
      gameState: {
        characters: [{ odId: 'od_me', name: 'Hero' }, { odId: 'od_other' }],
        world: { eventHistory: [] },
      },
    };
    getRoom.mockReturnValue(room);
    leaveRoom.mockReturnValue(room);

    const session = makeSession({ odId: 'od_me', roomCode: 'X' });
    const ctx = makeCtx();
    await handleLeaveRoom(ctx, session);

    expect(room.gameState.characters).toHaveLength(1);
    expect(room.gameState.characters[0].odId).toBe('od_other');
    expect(room.gameState.world.eventHistory).toContain('Hero left the party.');
    expect(broadcast).toHaveBeenCalledWith(room, expect.objectContaining({ type: 'PLAYER_LEFT' }));
    expect(session.roomCode).toBeNull();
    expect(session.odId).toBeNull();
    expect(ctx.sendWs).toHaveBeenCalled();
  });
});

describe('handleRejoinRoom', () => {
  it('sends ROOM_EXPIRED when room and DB session both missing', async () => {
    getRoom.mockReturnValue(null);
    findSessionInDB.mockResolvedValue(null);
    const ctx = makeCtx();
    await handleRejoinRoom(ctx, makeSession(), { roomCode: 'X', odId: 'od_me' });
    expect(ctx.sendWs).toHaveBeenCalledWith(ctx.ws, expect.anything(), expect.objectContaining({ message: 'Room no longer exists' }));
  });

  it('restores room from DB session when not in memory', async () => {
    getRoom.mockReturnValue(null);
    findSessionInDB.mockResolvedValue({
      roomCode: 'X',
      phase: 'playing',
      settings: {},
      players: [{ odId: 'od_me', userId: 'user_1', name: 'Hero', isHost: true }],
      gameState: { characters: [] },
    });
    const restoredRoom = {
      roomCode: 'X',
      players: new Map([['od_me', { userId: 'user_1', ws: null, name: 'Hero' }]]),
    };
    restoreRoom.mockReturnValue(restoredRoom);

    const session = makeSession();
    await handleRejoinRoom(makeCtx(), session, { roomCode: 'X', odId: 'od_me' });

    expect(session.odId).toBe('od_me');
    expect(session.roomCode).toBe('X');
    expect(touchRoom).toHaveBeenCalledWith('X');
    expect(sendTo).toHaveBeenCalledWith(restoredRoom, 'od_me', expect.objectContaining({ type: 'ROOM_JOINED' }));
  });

  it('rejects rejoin when userId does not match', async () => {
    const room = {
      roomCode: 'X',
      players: new Map([['od_me', { userId: 'other_user', ws: null }]]),
    };
    getRoom.mockReturnValue(room);
    const ctx = makeCtx();
    await handleRejoinRoom(ctx, makeSession(), { roomCode: 'X', odId: 'od_me' });
    expect(ctx.sendWs).toHaveBeenCalledWith(
      ctx.ws,
      expect.anything(),
      expect.objectContaining({ message: expect.stringContaining('Cannot rejoin') }),
    );
  });
});

describe('handleKickPlayer', () => {
  it('rejects non-host', async () => {
    getRoom.mockReturnValue({ roomCode: 'X', hostId: 'od_other', players: new Map() });
    await expect(
      handleKickPlayer(makeCtx(), makeSession({ odId: 'od_me', roomCode: 'X' }), { targetOdId: 'od_target' }),
    ).rejects.toThrow(/Only the host can kick/);
  });

  it('rejects kicking self', async () => {
    getRoom.mockReturnValue({ roomCode: 'X', hostId: 'od_me', players: new Map() });
    await expect(
      handleKickPlayer(makeCtx(), makeSession({ odId: 'od_me', roomCode: 'X' }), { targetOdId: 'od_me' }),
    ).rejects.toThrow(/Invalid kick target/);
  });

  it('closes target socket and removes from room', async () => {
    const targetWs = { readyState: 1, close: vi.fn() };
    const room = {
      roomCode: 'X',
      hostId: 'od_me',
      players: new Map([['od_target', { name: 'Target', ws: targetWs }]]),
    };
    getRoom.mockReturnValue(room);
    const updatedRoom = {
      roomCode: 'X',
      gameState: {
        characters: [{ odId: 'od_target', name: 'Target' }, { odId: 'od_other' }],
        world: { eventHistory: [] },
      },
    };
    leaveRoom.mockReturnValue(updatedRoom);

    const ctx = makeCtx();
    await handleKickPlayer(ctx, makeSession({ odId: 'od_me', roomCode: 'X' }), { targetOdId: 'od_target' });

    expect(ctx.sendWs).toHaveBeenCalledWith(targetWs, expect.anything(), expect.objectContaining({ message: expect.stringContaining('removed') }));
    expect(targetWs.close).toHaveBeenCalled();
    expect(leaveRoom).toHaveBeenCalledWith('X', 'od_target');
    expect(updatedRoom.gameState.characters).toHaveLength(1);
    expect(broadcast).toHaveBeenCalledWith(updatedRoom, expect.objectContaining({ type: 'PLAYER_LEFT' }));
  });
});
