import { describe, it, expect, vi } from 'vitest';

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    multiplayerSession: {
      delete: vi.fn().mockResolvedValue({}),
      upsert: vi.fn().mockResolvedValue({}),
    },
  },
}));

import {
  createRoom,
  joinRoom,
  leaveRoom,
  broadcast,
  sendTo,
  getRoom,
} from './roomManager.js';

describe('roomManager', () => {
  it('broadcast handles null ws gracefully', () => {
    const mockWs = { readyState: 1, send: vi.fn(), close: vi.fn() };
    const { room, odId } = createRoom('u1', mockWs);
    room.players.get(odId).ws = null;
    expect(() => broadcast(room, { type: 'ping' })).not.toThrow();
    leaveRoom(room.roomCode, odId);
  });

  it('broadcast handles disconnected ws gracefully', () => {
    const mockWs = { readyState: 1, send: vi.fn(), close: vi.fn() };
    const { room, odId } = createRoom('u1', mockWs);
    mockWs.readyState = 3;
    broadcast(room, { type: 'ping' });
    expect(mockWs.send).not.toHaveBeenCalled();
    leaveRoom(room.roomCode, odId);
  });

  it('sendTo handles null ws gracefully', () => {
    const mockWs = { readyState: 1, send: vi.fn(), close: vi.fn() };
    const { room, odId } = createRoom('u1', mockWs);
    room.players.get(odId).ws = null;
    expect(() => sendTo(room, odId, { type: 'ping' })).not.toThrow();
    leaveRoom(room.roomCode, odId);
  });

  it('leaveRoom cleans up empty rooms', () => {
    const mockWs = { readyState: 1, send: vi.fn(), close: vi.fn() };
    const { room, odId } = createRoom('u1', mockWs);
    const { roomCode } = room;
    expect(leaveRoom(roomCode, odId)).toBeNull();
    expect(getRoom(roomCode)).toBeNull();
  });

  it('leaveRoom transfers host when host leaves', () => {
    const ws1 = { readyState: 1, send: vi.fn(), close: vi.fn() };
    const ws2 = { readyState: 1, send: vi.fn(), close: vi.fn() };
    const { room, odId: hostOdId } = createRoom('host-user', ws1);
    const { odId: guestOdId } = joinRoom(room.roomCode, 'guest-user', ws2);
    const updated = leaveRoom(room.roomCode, hostOdId);
    expect(updated).not.toBeNull();
    expect(updated.hostId).toBe(guestOdId);
    expect(updated.players.get(guestOdId).isHost).toBe(true);
    leaveRoom(room.roomCode, guestOdId);
  });
});
