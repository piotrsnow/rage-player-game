import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../services/roomManager.js', () => ({
  getRoom: vi.fn(),
  sendTo: vi.fn(),
}));

import { getRoom, sendTo } from '../../../services/roomManager.js';
import {
  handleWebrtcOffer,
  handleWebrtcAnswer,
  handleWebrtcIce,
  handleWebrtcTrackState,
} from './webrtc.js';

function makeSession(overrides = {}) {
  return { odId: 'od_me', roomCode: 'ABCD', ...overrides };
}

function makeCtx() {
  return { fastify: {}, ws: {}, uid: 'user_1', sendWs: vi.fn(), log: { warn: vi.fn() } };
}

describe('webrtc handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('handleWebrtcOffer forwards offer to target', async () => {
    const room = { roomCode: 'ABCD' };
    getRoom.mockReturnValue(room);

    await handleWebrtcOffer(makeCtx(), makeSession(), {
      targetOdId: 'od_them',
      offer: { sdp: 'x' },
    });

    expect(sendTo).toHaveBeenCalledWith(room, 'od_them', {
      type: 'WEBRTC_OFFER',
      fromOdId: 'od_me',
      offer: { sdp: 'x' },
    });
  });

  it('handleWebrtcAnswer forwards answer to target', async () => {
    const room = { roomCode: 'ABCD' };
    getRoom.mockReturnValue(room);

    await handleWebrtcAnswer(makeCtx(), makeSession(), {
      targetOdId: 'od_them',
      answer: { sdp: 'a' },
    });

    expect(sendTo).toHaveBeenCalledWith(room, 'od_them', {
      type: 'WEBRTC_ANSWER',
      fromOdId: 'od_me',
      answer: { sdp: 'a' },
    });
  });

  it('handleWebrtcIce forwards ICE candidate', async () => {
    const room = { roomCode: 'ABCD' };
    getRoom.mockReturnValue(room);

    await handleWebrtcIce(makeCtx(), makeSession(), {
      targetOdId: 'od_them',
      candidate: { foundation: '1' },
    });

    expect(sendTo).toHaveBeenCalledWith(room, 'od_them', {
      type: 'WEBRTC_ICE',
      fromOdId: 'od_me',
      candidate: { foundation: '1' },
    });
  });

  it('handleWebrtcTrackState forwards audio/video state', async () => {
    const room = { roomCode: 'ABCD' };
    getRoom.mockReturnValue(room);

    await handleWebrtcTrackState(makeCtx(), makeSession(), {
      targetOdId: 'od_them',
      videoEnabled: false,
      audioEnabled: true,
    });

    expect(sendTo).toHaveBeenCalledWith(room, 'od_them', {
      type: 'WEBRTC_TRACK_STATE',
      fromOdId: 'od_me',
      videoEnabled: false,
      audioEnabled: true,
    });
  });

  it('skips forwarding when session has no roomCode', async () => {
    await handleWebrtcOffer(makeCtx(), makeSession({ roomCode: null }), {
      targetOdId: 'od_them',
      offer: {},
    });
    expect(sendTo).not.toHaveBeenCalled();
    expect(getRoom).not.toHaveBeenCalled();
  });

  it('skips forwarding when room not found', async () => {
    getRoom.mockReturnValue(null);
    await handleWebrtcOffer(makeCtx(), makeSession(), { targetOdId: 'od_them', offer: {} });
    expect(sendTo).not.toHaveBeenCalled();
  });

  it('skips forwarding when targetOdId is missing', async () => {
    getRoom.mockReturnValue({ roomCode: 'ABCD' });
    await handleWebrtcOffer(makeCtx(), makeSession(), { offer: {} });
    expect(sendTo).not.toHaveBeenCalled();
  });
});
