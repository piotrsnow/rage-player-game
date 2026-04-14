import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../services/roomManager.js', () => ({
  getRoom: vi.fn(),
  setGameState: vi.fn(),
  broadcast: vi.fn(),
  sendTo: vi.fn(),
  sanitizeRoom: vi.fn((room) => ({ sanitized: true, roomCode: room?.roomCode })),
  saveRoomToDB: vi.fn(() => Promise.resolve()),
}));

import {
  getRoom,
  setGameState,
  broadcast,
  sendTo,
  saveRoomToDB,
} from '../../../services/roomManager.js';
import {
  handleCombatSync,
  handleCombatManoeuvre,
  handleCombatEnded,
} from './combat.js';

function makeCtx() {
  return { fastify: { log: { warn: vi.fn() } }, ws: {}, uid: 'user_1', sendWs: vi.fn() };
}

function makeSession(overrides = {}) {
  return { odId: 'od_host', roomCode: 'ABCD', ...overrides };
}

beforeEach(() => vi.clearAllMocks());

describe('handleCombatSync', () => {
  it('rejects non-host', async () => {
    getRoom.mockReturnValue({ roomCode: 'ABCD', hostId: 'od_other', gameState: {} });
    await expect(
      handleCombatSync(makeCtx(), makeSession(), { combat: { active: true } }),
    ).rejects.toThrow(/Only the host can sync/);
  });

  it('updates combat state and broadcasts when host', async () => {
    const room = { roomCode: 'ABCD', hostId: 'od_host', gameState: { chatHistory: [] } };
    getRoom.mockReturnValue(room);
    await handleCombatSync(makeCtx(), makeSession(), {
      combat: { active: true, round: 1 },
      chatMessages: [{ id: 'm1', role: 'combat' }],
    });
    expect(room.gameState.combat).toEqual({ active: true, round: 1 });
    expect(room.gameState.chatHistory).toHaveLength(1);
    expect(broadcast).toHaveBeenCalledWith(room, expect.objectContaining({ type: 'COMBAT_SYNC' }));
    expect(setGameState).toHaveBeenCalled();
    expect(saveRoomToDB).toHaveBeenCalledWith('ABCD');
  });
});

describe('handleCombatManoeuvre', () => {
  it('forwards manoeuvre to host', async () => {
    const room = { roomCode: 'ABCD', hostId: 'od_host', gameState: { combat: { active: true } } };
    getRoom.mockReturnValue(room);
    await handleCombatManoeuvre(makeCtx(), makeSession({ odId: 'od_player' }), {
      manoeuvre: 'attack',
      targetId: 'enemy_1',
      customDescription: 'swing hard',
    });
    expect(sendTo).toHaveBeenCalledWith(
      room,
      'od_host',
      expect.objectContaining({
        type: 'COMBAT_MANOEUVRE',
        fromOdId: 'od_player',
        manoeuvre: 'attack',
        targetId: 'enemy_1',
        customDescription: 'swing hard',
      }),
    );
  });

  it('throws when no active combat', async () => {
    getRoom.mockReturnValue({ roomCode: 'ABCD', gameState: { combat: { active: false } } });
    await expect(
      handleCombatManoeuvre(makeCtx(), makeSession(), { manoeuvre: 'x' }),
    ).rejects.toThrow(/No active combat/);
  });
});

describe('handleCombatEnded', () => {
  it('rejects non-host', async () => {
    getRoom.mockReturnValue({ roomCode: 'ABCD', hostId: 'od_other', gameState: {} });
    await expect(
      handleCombatEnded(makeCtx(), makeSession(), {}),
    ).rejects.toThrow(/Only the host can end combat/);
  });

  it('applies per-character wounds and xp delta', async () => {
    const room = {
      roomCode: 'ABCD',
      hostId: 'od_host',
      gameState: {
        characters: [
          { name: 'Hero', wounds: 10, maxWounds: 20, xp: 0 },
          { name: 'Friend', wounds: 15, maxWounds: 20, xp: 5 },
        ],
      },
    };
    getRoom.mockReturnValue(room);

    await handleCombatEnded(makeCtx(), makeSession(), {
      perCharacter: {
        Hero: { wounds: -5, xp: 10 },
        Friend: { wounds: 3, xp: 20 },
      },
      outcome: 'victory',
    });

    expect(room.gameState.characters[0].wounds).toBe(5);
    expect(room.gameState.characters[0].xp).toBe(10);
    expect(room.gameState.characters[1].wounds).toBe(18);
    expect(room.gameState.characters[1].xp).toBe(25);
    expect(room.gameState.combat).toBeNull();
    expect(broadcast).toHaveBeenCalledWith(room, expect.objectContaining({ type: 'COMBAT_ENDED' }));
  });

  it('marks character dead after 3 critical wounds', async () => {
    const room = {
      roomCode: 'ABCD',
      hostId: 'od_host',
      gameState: {
        characters: [
          { name: 'Hero', wounds: 5, maxWounds: 20, criticalWoundCount: 2 },
        ],
      },
    };
    getRoom.mockReturnValue(room);

    await handleCombatEnded(makeCtx(), makeSession(), {
      perCharacter: { Hero: { wounds: -10 } },
    });

    expect(room.gameState.characters[0].wounds).toBe(0);
    expect(room.gameState.characters[0].criticalWoundCount).toBe(3);
    expect(room.gameState.characters[0].status).toBe('dead');
    expect(broadcast).toHaveBeenCalledWith(
      room,
      expect.objectContaining({ type: 'PLAYER_DIED', playerName: 'Hero' }),
    );
  });

  it('appends journal entry when provided', async () => {
    const room = {
      roomCode: 'ABCD',
      hostId: 'od_host',
      gameState: { characters: [], world: { eventHistory: ['prev'] } },
    };
    getRoom.mockReturnValue(room);

    await handleCombatEnded(makeCtx(), makeSession(), {
      perCharacter: {},
      journalEntry: 'Defeated the orcs',
    });

    expect(room.gameState.world.eventHistory).toEqual(['prev', 'Defeated the orcs']);
  });
});
