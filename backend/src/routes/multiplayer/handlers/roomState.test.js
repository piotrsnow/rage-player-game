import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../services/roomManager.js', () => ({
  updateCharacter: vi.fn(),
  updateSettings: vi.fn(),
  getRoom: vi.fn(),
  broadcast: vi.fn(),
  sanitizeRoom: vi.fn((room) => ({ sanitized: true, roomCode: room?.roomCode })),
  setGameState: vi.fn(),
  saveRoomToDB: vi.fn(() => Promise.resolve()),
}));

vi.mock('../../../services/multiplayerSceneFlow.js', () => ({
  fetchOwnedCharacter: vi.fn(),
}));

import {
  updateCharacter,
  updateSettings,
  getRoom,
  broadcast,
  setGameState,
  saveRoomToDB,
} from '../../../services/roomManager.js';
import { fetchOwnedCharacter } from '../../../services/multiplayerSceneFlow.js';
import {
  handleUpdateCharacter,
  handleUpdateSettings,
  handleSyncCharacter,
  handleUpdateSceneImage,
  handleTyping,
  handlePing,
} from './roomState.js';

function makeCtx() {
  return {
    fastify: { log: { warn: vi.fn() } },
    ws: {},
    uid: 'user_1',
    sendWs: vi.fn(),
    log: { warn: vi.fn() },
  };
}

function makeSession(overrides = {}) {
  return { odId: 'od_me', roomCode: 'ABCD', ...overrides };
}

beforeEach(() => vi.clearAllMocks());

describe('handleUpdateCharacter', () => {
  it('throws when not in room', async () => {
    await expect(
      handleUpdateCharacter(makeCtx(), makeSession({ roomCode: null }), {}),
    ).rejects.toThrow(/Not in a room/);
  });

  it('uses inline characterData when no characterId', async () => {
    const room = { roomCode: 'ABCD' };
    updateCharacter.mockReturnValue(room);
    await handleUpdateCharacter(makeCtx(), makeSession(), {
      name: 'Bob',
      gender: 'male',
      photo: 'p.png',
      characterData: { name: 'Bob' },
    });
    expect(updateCharacter).toHaveBeenCalledWith(
      'ABCD',
      'od_me',
      expect.objectContaining({ name: 'Bob', gender: 'male', characterData: { name: 'Bob' } }),
    );
    expect(broadcast).toHaveBeenCalled();
    expect(fetchOwnedCharacter).not.toHaveBeenCalled();
  });

  it('fetches owned character when characterId is provided', async () => {
    const room = { roomCode: 'ABCD' };
    updateCharacter.mockReturnValue(room);
    fetchOwnedCharacter.mockResolvedValue({ name: 'Fetched', id: 'c1' });
    await handleUpdateCharacter(makeCtx(), makeSession(), {
      characterId: 'c1',
      name: 'Bob',
    });
    expect(fetchOwnedCharacter).toHaveBeenCalledWith('c1', 'user_1');
    expect(updateCharacter).toHaveBeenCalledWith(
      'ABCD',
      'od_me',
      expect.objectContaining({ characterData: { name: 'Fetched', id: 'c1' } }),
    );
  });

  it('throws when characterId is not owned', async () => {
    fetchOwnedCharacter.mockResolvedValue(null);
    await expect(
      handleUpdateCharacter(makeCtx(), makeSession(), { characterId: 'c1' }),
    ).rejects.toThrow(/Character not found/);
  });
});

describe('handleUpdateSettings', () => {
  it('applies settings and broadcasts', async () => {
    const room = { roomCode: 'ABCD' };
    updateSettings.mockReturnValue(room);
    await handleUpdateSettings(makeCtx(), makeSession(), { settings: { tts: true } });
    expect(updateSettings).toHaveBeenCalledWith('ABCD', 'od_me', { tts: true });
    expect(broadcast).toHaveBeenCalled();
  });

  it('throws when not in room', async () => {
    await expect(
      handleUpdateSettings(makeCtx(), makeSession({ roomCode: null }), {}),
    ).rejects.toThrow(/Not in a room/);
  });
});

describe('handleSyncCharacter', () => {
  it('merges incoming charData while preserving odId/playerName', async () => {
    const room = {
      roomCode: 'ABCD',
      gameState: {
        characters: [
          { odId: 'od_me', playerName: 'BobKeep', wounds: 10, name: 'BobOld' },
        ],
      },
    };
    getRoom.mockReturnValue(room);

    await handleSyncCharacter(makeCtx(), makeSession(), {
      character: { wounds: 5, name: 'BobNew', odId: 'other', playerName: 'other' },
    });

    expect(room.gameState.characters[0].wounds).toBe(5);
    expect(room.gameState.characters[0].name).toBe('BobNew');
    expect(room.gameState.characters[0].odId).toBe('od_me');
    expect(room.gameState.characters[0].playerName).toBe('BobKeep');
    expect(setGameState).toHaveBeenCalled();
    expect(broadcast).toHaveBeenCalledWith(room, expect.objectContaining({ type: 'CHARACTER_SYNCED' }));
    expect(saveRoomToDB).toHaveBeenCalledWith('ABCD');
  });

  it('returns early when room has no gameState characters', async () => {
    getRoom.mockReturnValue({ roomCode: 'ABCD' });
    await handleSyncCharacter(makeCtx(), makeSession(), { character: { wounds: 5 } });
    expect(setGameState).not.toHaveBeenCalled();
  });

  it('returns early when character is missing from gameState', async () => {
    getRoom.mockReturnValue({
      roomCode: 'ABCD',
      gameState: { characters: [{ odId: 'od_other', name: 'Other' }] },
    });
    await handleSyncCharacter(makeCtx(), makeSession(), { character: { wounds: 5 } });
    expect(setGameState).not.toHaveBeenCalled();
  });
});

describe('handleUpdateSceneImage', () => {
  it('updates scene image in gameState when sceneId matches', async () => {
    const room = {
      roomCode: 'ABCD',
      gameState: {
        scenes: [
          { id: 's1', image: null },
          { id: 's2', image: 'old' },
        ],
      },
    };
    getRoom.mockReturnValue(room);

    await handleUpdateSceneImage(makeCtx(), makeSession(), { sceneId: 's2', image: 'new' });
    expect(room.gameState.scenes[1].image).toBe('new');
    expect(setGameState).toHaveBeenCalled();
    expect(broadcast).toHaveBeenCalledWith(
      room,
      expect.objectContaining({ type: 'SCENE_IMAGE_UPDATE', sceneId: 's2', image: 'new' }),
      'od_me',
    );
  });

  it('returns early without sceneId', async () => {
    getRoom.mockReturnValue({ roomCode: 'ABCD' });
    await handleUpdateSceneImage(makeCtx(), makeSession(), { image: 'x' });
    expect(setGameState).not.toHaveBeenCalled();
    expect(broadcast).not.toHaveBeenCalled();
  });
});

describe('handleTyping', () => {
  it('broadcasts typing draft trimmed to max length and excludes sender', async () => {
    const room = {
      roomCode: 'ABCD',
      players: new Map([['od_me', { name: 'Bob' }]]),
    };
    getRoom.mockReturnValue(room);

    await handleTyping(makeCtx(), makeSession(), {
      draft: '  hello world  ',
      isTyping: true,
    });

    expect(broadcast).toHaveBeenCalledWith(
      room,
      expect.objectContaining({
        type: 'TYPING',
        odId: 'od_me',
        playerName: 'Bob',
        isTyping: true,
        draft: 'hello world',
      }),
      'od_me',
    );
  });

  it('returns silently when player not in room', async () => {
    getRoom.mockReturnValue({ roomCode: 'ABCD', players: new Map() });
    await handleTyping(makeCtx(), makeSession(), { draft: 'hi', isTyping: true });
    expect(broadcast).not.toHaveBeenCalled();
  });
});

describe('handlePing', () => {
  it('responds with PONG', async () => {
    const ctx = makeCtx();
    await handlePing(ctx);
    expect(ctx.sendWs).toHaveBeenCalledWith(ctx.ws, 'PONG');
  });
});
