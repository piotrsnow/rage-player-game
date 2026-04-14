import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../services/roomManager.js', () => ({
  submitAction: vi.fn(),
  withdrawAction: vi.fn(),
  approveActions: vi.fn(),
  executeSoloAction: vi.fn(),
  restorePendingActions: vi.fn(),
  getRoom: vi.fn(),
  setPhase: vi.fn(),
  setGameState: vi.fn(),
  broadcast: vi.fn(),
  sanitizeRoom: vi.fn((room) => ({ sanitized: true, roomCode: room?.roomCode })),
  saveRoomToDB: vi.fn(() => Promise.resolve()),
}));

vi.mock('../../../services/multiplayerAI.js', () => ({
  generateMultiplayerCampaign: vi.fn(),
}));

vi.mock('../../../services/multiplayerSceneFlow.js', () => ({
  runMultiplayerSceneFlow: vi.fn(),
}));

import {
  submitAction,
  withdrawAction,
  approveActions,
  executeSoloAction,
  restorePendingActions,
  getRoom,
  setPhase,
  setGameState,
  broadcast,
  saveRoomToDB,
} from '../../../services/roomManager.js';
import { generateMultiplayerCampaign } from '../../../services/multiplayerAI.js';
import { runMultiplayerSceneFlow } from '../../../services/multiplayerSceneFlow.js';
import {
  handleStartGame,
  handleSubmitAction,
  handleWithdrawAction,
  handleApproveActions,
  handleSoloAction,
} from './gameplay.js';

function makeCtx() {
  return {
    fastify: { log: { error: vi.fn(), warn: vi.fn() } },
    ws: {},
    uid: 'user_1',
    sendWs: vi.fn(),
  };
}

function makeSession(overrides = {}) {
  return { odId: 'od_host', roomCode: 'ABCD', ...overrides };
}

beforeEach(() => vi.clearAllMocks());

describe('handleStartGame', () => {
  it('rejects non-host', async () => {
    getRoom.mockReturnValue({ hostId: 'od_other', players: new Map() });
    await expect(
      handleStartGame(makeCtx(), makeSession(), {}),
    ).rejects.toThrow(/Only the host can start the game/);
  });

  it('generates campaign, sets phase, broadcasts GAME_STARTED', async () => {
    const room = {
      hostId: 'od_host',
      settings: { language: 'en' },
      players: new Map([
        ['od_host', { odId: 'od_host', name: 'Bob', gender: 'male', isHost: true, characterData: { name: 'Bob' } }],
      ]),
    };
    const updatedRoom = { ...room, phase: 'playing' };
    getRoom.mockReturnValueOnce(room).mockReturnValueOnce(updatedRoom);
    generateMultiplayerCampaign.mockResolvedValue({ scenes: [{ id: 's1' }] });

    await handleStartGame(makeCtx(), makeSession(), { language: 'en' });

    expect(broadcast).toHaveBeenCalledWith(room, { type: 'GAME_STARTING' });
    expect(generateMultiplayerCampaign).toHaveBeenCalledWith(
      room.settings,
      [expect.objectContaining({ odId: 'od_host', name: 'Bob' })],
      null,
      'en',
    );
    expect(setPhase).toHaveBeenCalledWith('ABCD', 'playing');
    expect(setGameState).toHaveBeenCalledWith('ABCD', { scenes: [{ id: 's1' }] });
    expect(broadcast).toHaveBeenCalledWith(updatedRoom, expect.objectContaining({ type: 'GAME_STARTED' }));
    expect(saveRoomToDB).toHaveBeenCalledWith('ABCD');
  });

  it('broadcasts GENERATION_FAILED on campaign generation error', async () => {
    const room = {
      hostId: 'od_host',
      settings: {},
      players: new Map([['od_host', { odId: 'od_host' }]]),
    };
    getRoom.mockReturnValue(room);
    generateMultiplayerCampaign.mockRejectedValue(new Error('AI down'));

    await handleStartGame(makeCtx(), makeSession(), {});

    expect(setPhase).not.toHaveBeenCalled();
    expect(broadcast).toHaveBeenCalledWith(room, expect.objectContaining({ type: 'GENERATION_FAILED' }));
  });
});

describe('handleSubmitAction', () => {
  it('submits action and broadcasts ACTIONS_UPDATED', async () => {
    const room = { roomCode: 'ABCD' };
    submitAction.mockReturnValue(room);
    await handleSubmitAction(makeCtx(), makeSession(), { text: 'attack', isCustom: false });
    expect(submitAction).toHaveBeenCalledWith('ABCD', 'od_host', 'attack', false);
    expect(broadcast).toHaveBeenCalledWith(room, expect.objectContaining({ type: 'ACTIONS_UPDATED' }));
  });

  it('throws when not in room', async () => {
    await expect(
      handleSubmitAction(makeCtx(), makeSession({ roomCode: null }), {}),
    ).rejects.toThrow(/Not in a room/);
  });
});

describe('handleWithdrawAction', () => {
  it('withdraws and broadcasts ACTIONS_UPDATED', async () => {
    const room = { roomCode: 'ABCD' };
    withdrawAction.mockReturnValue(room);
    await handleWithdrawAction(makeCtx(), makeSession());
    expect(withdrawAction).toHaveBeenCalledWith('ABCD', 'od_host');
    expect(broadcast).toHaveBeenCalledWith(room, expect.objectContaining({ type: 'ACTIONS_UPDATED' }));
  });
});

describe('handleApproveActions', () => {
  it('throws when no actions to approve', async () => {
    approveActions.mockReturnValue({ room: { roomCode: 'ABCD' }, actions: [] });
    await expect(
      handleApproveActions(makeCtx(), makeSession(), {}),
    ).rejects.toThrow(/No actions to approve/);
  });

  it('broadcasts SCENE_GENERATING and runs scene flow', async () => {
    const room = { roomCode: 'ABCD' };
    const actions = [{ name: 'Bob', action: 'attack' }];
    approveActions.mockReturnValue({ room, actions });
    runMultiplayerSceneFlow.mockResolvedValue();

    await handleApproveActions(makeCtx(), makeSession(), { language: 'en' });

    expect(broadcast).toHaveBeenCalledWith(room, { type: 'SCENE_GENERATING' });
    expect(runMultiplayerSceneFlow).toHaveBeenCalledWith(
      expect.objectContaining({ room, actions, soloActionName: null }),
    );
  });

  it('restores actions on scene flow failure', async () => {
    const room = { roomCode: 'ABCD' };
    const actions = [{ name: 'Bob' }];
    approveActions.mockReturnValue({ room, actions });
    runMultiplayerSceneFlow.mockRejectedValue(new Error('AI failed'));

    await handleApproveActions(makeCtx(), makeSession(), {});

    expect(restorePendingActions).toHaveBeenCalledWith('ABCD', actions);
    expect(broadcast).toHaveBeenCalledWith(room, expect.objectContaining({ type: 'GENERATION_FAILED' }));
  });
});

describe('handleSoloAction', () => {
  it('executes solo action and runs scene flow', async () => {
    const room = { roomCode: 'ABCD' };
    const action = { name: 'Bob', action: 'scout' };
    executeSoloAction.mockReturnValue({ room, action });
    runMultiplayerSceneFlow.mockResolvedValue();

    await handleSoloAction(makeCtx(), makeSession(), { text: 'scout', isCustom: true });

    expect(executeSoloAction).toHaveBeenCalledWith('ABCD', 'od_host', 'scout', true);
    expect(broadcast).toHaveBeenCalledWith(room, { type: 'SCENE_GENERATING' });
    expect(broadcast).toHaveBeenCalledWith(room, expect.objectContaining({ type: 'ACTIONS_UPDATED' }));
    expect(runMultiplayerSceneFlow).toHaveBeenCalledWith(
      expect.objectContaining({ room, actions: [action], soloActionName: 'Bob' }),
    );
  });

  it('restores action and broadcasts failure when scene flow throws', async () => {
    const room = { roomCode: 'ABCD' };
    const action = { name: 'Bob' };
    executeSoloAction.mockReturnValue({ room, action });
    runMultiplayerSceneFlow.mockRejectedValue(new Error('AI failed'));

    await handleSoloAction(makeCtx(), makeSession(), { text: 'x' });

    expect(restorePendingActions).toHaveBeenCalledWith('ABCD', [action]);
    expect(broadcast).toHaveBeenCalledWith(room, expect.objectContaining({ type: 'GENERATION_FAILED' }));
  });
});
