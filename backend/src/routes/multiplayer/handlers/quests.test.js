import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../services/roomManager.js', () => ({
  getRoom: vi.fn(),
  setGameState: vi.fn(),
  broadcast: vi.fn(),
  sendTo: vi.fn(),
  sanitizeRoom: vi.fn((room) => ({ sanitized: true, roomCode: room?.roomCode })),
  saveRoomToDB: vi.fn(() => Promise.resolve()),
}));

vi.mock('../../../services/multiplayerAI.js', () => ({
  verifyMultiplayerQuestObjective: vi.fn(),
}));

import {
  getRoom,
  setGameState,
  broadcast,
  sendTo,
  saveRoomToDB,
} from '../../../services/roomManager.js';
import { verifyMultiplayerQuestObjective } from '../../../services/multiplayerAI.js';
import {
  handleAcceptQuestOffer,
  handleDeclineQuestOffer,
  handleVerifyQuestObjective,
} from './quests.js';

function makeCtx() {
  return { fastify: { log: { warn: vi.fn() } }, ws: {}, uid: 'user_1', sendWs: vi.fn() };
}

function makeSession(overrides = {}) {
  return { odId: 'od_me', roomCode: 'ABCD', ...overrides };
}

beforeEach(() => vi.clearAllMocks());

describe('handleAcceptQuestOffer', () => {
  it('pushes new quest to active list and marks offer accepted', async () => {
    const questOffer = {
      id: 'q1',
      name: 'Find the ring',
      description: 'A quest',
      completionCondition: 'found',
      objectives: [{ id: 'o1', description: 'Look in attic' }],
    };
    const room = {
      roomCode: 'ABCD',
      gameState: {
        scenes: [{ id: 's1', questOffers: [{ id: 'q1', status: 'pending' }] }],
      },
    };
    getRoom.mockReturnValue(room);

    await handleAcceptQuestOffer(makeCtx(), makeSession(), { sceneId: 's1', questOffer });

    expect(room.gameState.quests.active).toHaveLength(1);
    expect(room.gameState.quests.active[0].id).toBe('q1');
    expect(room.gameState.quests.active[0].objectives[0].completed).toBe(false);
    expect(room.gameState.scenes[0].questOffers[0].status).toBe('accepted');
    expect(room.gameState.chatHistory).toHaveLength(1);
    expect(setGameState).toHaveBeenCalled();
    expect(broadcast).toHaveBeenCalledWith(
      room,
      expect.objectContaining({ type: 'QUEST_OFFER_UPDATE', status: 'accepted' }),
    );
    expect(saveRoomToDB).toHaveBeenCalledWith('ABCD');
  });

  it('throws when not in room', async () => {
    await expect(
      handleAcceptQuestOffer(makeCtx(), makeSession({ roomCode: null }), {}),
    ).rejects.toThrow(/Not in a room/);
  });

  it('returns silently when sceneId or questOffer.id missing', async () => {
    const room = { roomCode: 'ABCD', gameState: {} };
    getRoom.mockReturnValue(room);
    await handleAcceptQuestOffer(makeCtx(), makeSession(), { sceneId: null, questOffer: { id: 'q1' } });
    expect(setGameState).not.toHaveBeenCalled();
  });
});

describe('handleDeclineQuestOffer', () => {
  it('marks offer as declined and broadcasts', async () => {
    const room = {
      roomCode: 'ABCD',
      gameState: {
        scenes: [{ id: 's1', questOffers: [{ id: 'q1', status: 'pending' }] }],
      },
    };
    getRoom.mockReturnValue(room);
    await handleDeclineQuestOffer(makeCtx(), makeSession(), { sceneId: 's1', offerId: 'q1' });
    expect(room.gameState.scenes[0].questOffers[0].status).toBe('declined');
    expect(broadcast).toHaveBeenCalledWith(
      room,
      expect.objectContaining({ type: 'QUEST_OFFER_UPDATE', status: 'declined' }),
    );
  });
});

describe('handleVerifyQuestObjective', () => {
  const baseRoom = () => ({
    roomCode: 'ABCD',
    gameState: {
      quests: {
        active: [
          {
            id: 'q1',
            name: 'Find ring',
            description: 'a ring',
            objectives: [{ id: 'o1', description: 'look', completed: false }],
          },
        ],
      },
      world: { eventHistory: ['Player arrived'] },
      scenes: [{ id: 's1', narrative: 'You arrived' }],
    },
  });

  it('throws when game not in progress', async () => {
    getRoom.mockReturnValue({ roomCode: 'ABCD', gameState: {} });
    await expect(
      handleVerifyQuestObjective(makeCtx(), makeSession(), {
        questId: 'q1', objectiveId: 'o1', requestId: 'r1',
      }),
    ).rejects.toThrow(/Game not in progress/);
  });

  it('sends not-found when questId does not match', async () => {
    getRoom.mockReturnValue(baseRoom());
    await handleVerifyQuestObjective(makeCtx(), makeSession(), {
      questId: 'nonexistent', objectiveId: 'o1', requestId: 'r1',
    });
    expect(sendTo).toHaveBeenCalledWith(
      expect.anything(),
      'od_me',
      expect.objectContaining({ fulfilled: false, reasoning: 'Quest not found.' }),
    );
    expect(verifyMultiplayerQuestObjective).not.toHaveBeenCalled();
  });

  it('sends already-completed early-return when objective already done', async () => {
    const room = baseRoom();
    room.gameState.quests.active[0].objectives[0].completed = true;
    getRoom.mockReturnValue(room);
    await handleVerifyQuestObjective(makeCtx(), makeSession(), {
      questId: 'q1', objectiveId: 'o1', requestId: 'r1', language: 'pl',
    });
    expect(sendTo).toHaveBeenCalledWith(
      expect.anything(),
      'od_me',
      expect.objectContaining({ fulfilled: true, alreadyCompleted: true }),
    );
    expect(verifyMultiplayerQuestObjective).not.toHaveBeenCalled();
  });

  it('marks objective completed when AI verifies fulfilled', async () => {
    const room = baseRoom();
    getRoom.mockReturnValue(room);
    verifyMultiplayerQuestObjective.mockResolvedValue({ fulfilled: true, reasoning: 'Ring found' });

    await handleVerifyQuestObjective(makeCtx(), makeSession(), {
      questId: 'q1', objectiveId: 'o1', requestId: 'r1', language: 'en',
    });

    expect(room.gameState.quests.active[0].objectives[0].completed).toBe(true);
    expect(broadcast).toHaveBeenCalledWith(room, expect.objectContaining({ type: 'ROOM_STATE' }));
    expect(sendTo).toHaveBeenCalledWith(
      room,
      'od_me',
      expect.objectContaining({ fulfilled: true, reasoning: 'Ring found' }),
    );
    expect(saveRoomToDB).toHaveBeenCalledWith('ABCD');
  });

  it('sends not-fulfilled without mutation when AI says no', async () => {
    const room = baseRoom();
    getRoom.mockReturnValue(room);
    verifyMultiplayerQuestObjective.mockResolvedValue({ fulfilled: false, reasoning: 'Not yet' });

    await handleVerifyQuestObjective(makeCtx(), makeSession(), {
      questId: 'q1', objectiveId: 'o1', requestId: 'r1',
    });

    expect(room.gameState.quests.active[0].objectives[0].completed).toBe(false);
    expect(sendTo).toHaveBeenCalledWith(
      room,
      'od_me',
      expect.objectContaining({ fulfilled: false, reasoning: 'Not yet' }),
    );
    expect(setGameState).not.toHaveBeenCalled();
  });
});
