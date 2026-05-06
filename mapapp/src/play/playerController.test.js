// Unit tests for playerController.js — createPlayerState, tickPlayer,
// playerPixelPos, animIdFor.

import { describe, it, expect, vi } from 'vitest';
import {
  GRID_MOVE_MS,
  createPlayerState,
  tickPlayer,
  playerPixelPos,
  animIdFor,
} from './playerController.js';

function noInput() {
  return { up: false, down: false, left: false, right: false };
}

describe('createPlayerState', () => {
  it('initialises from a start cell', () => {
    const s = createPlayerState({ x: 3, y: 4 });
    expect(s).toMatchObject({
      x: 3, y: 4, targetX: 3, targetY: 4,
      dir: 'down', moving: false, blockedAt: 0,
      moveDuration: GRID_MOVE_MS,
    });
  });

  it('defaults to (0,0) when no cell is provided', () => {
    const s = createPlayerState();
    expect(s.x).toBe(0);
    expect(s.y).toBe(0);
  });

  it('defaults to (0,0) when cell is nullish', () => {
    expect(createPlayerState(null).x).toBe(0);
    expect(createPlayerState(undefined).y).toBe(0);
  });
});

describe('tickPlayer — direction input', () => {
  it('does not move without input', () => {
    const s = createPlayerState({ x: 2, y: 2 });
    tickPlayer(s, noInput(), 1000, { canMoveTo: () => true });
    expect(s.moving).toBe(false);
    expect(s.x).toBe(2);
    expect(s.y).toBe(2);
  });

  it('starts a move when a direction is held and the target is walkable', () => {
    const s = createPlayerState({ x: 2, y: 2 });
    tickPlayer(s, { ...noInput(), right: true }, 100, {
      canMoveTo: () => true,
    });
    expect(s.dir).toBe('right');
    expect(s.moving).toBe(true);
    expect(s.targetX).toBe(3);
    expect(s.targetY).toBe(2);
    expect(s.moveStart).toBe(100);
  });

  it('prioritises up over other directions', () => {
    const s = createPlayerState();
    tickPlayer(s, { up: true, down: true, left: true, right: true }, 0, {
      canMoveTo: () => true,
    });
    expect(s.dir).toBe('up');
    expect(s.targetY).toBe(-1);
  });

  it('falls through to down / left / right when higher-priority input is off', () => {
    const dirs = [
      { input: { ...noInput(), down: true }, expected: 'down', dx: 0, dy: 1 },
      { input: { ...noInput(), left: true }, expected: 'left', dx: -1, dy: 0 },
      { input: { ...noInput(), right: true }, expected: 'right', dx: 1, dy: 0 },
    ];
    for (const d of dirs) {
      const s = createPlayerState({ x: 5, y: 5 });
      tickPlayer(s, d.input, 0, { canMoveTo: () => true });
      expect(s.dir).toBe(d.expected);
      expect(s.targetX).toBe(5 + d.dx);
      expect(s.targetY).toBe(5 + d.dy);
    }
  });

  it('updates dir even when the target is blocked', () => {
    const s = createPlayerState({ x: 2, y: 2 });
    const onBlocked = vi.fn();
    tickPlayer(s, { ...noInput(), left: true }, 500, {
      canMoveTo: () => false,
      onBlocked,
    });
    expect(s.dir).toBe('left');
    expect(s.moving).toBe(false);
    expect(s.x).toBe(2);
    expect(s.blockedAt).toBe(500);
    expect(onBlocked).toHaveBeenCalledWith(1, 2, 'left');
  });

  it('tolerates missing canMoveTo (treats everything as walkable)', () => {
    const s = createPlayerState({ x: 0, y: 0 });
    tickPlayer(s, { ...noInput(), right: true }, 0);
    expect(s.moving).toBe(true);
    expect(s.targetX).toBe(1);
  });

  it('tolerates missing onBlocked callback', () => {
    const s = createPlayerState();
    expect(() => {
      tickPlayer(s, { ...noInput(), down: true }, 0, { canMoveTo: () => false });
    }).not.toThrow();
    expect(s.moving).toBe(false);
  });
});

describe('tickPlayer — in-transit state', () => {
  it('ignores input while moving', () => {
    const s = createPlayerState({ x: 0, y: 0 });
    tickPlayer(s, { ...noInput(), right: true }, 0, { canMoveTo: () => true });
    expect(s.moving).toBe(true);
    // Later tick, still moving — attempt to change direction should no-op.
    tickPlayer(s, { ...noInput(), up: true }, 50, { canMoveTo: () => true });
    expect(s.dir).toBe('right');
    expect(s.targetX).toBe(1);
    expect(s.targetY).toBe(0);
    expect(s.moving).toBe(true);
  });

  it('snaps to the target cell once the move duration elapses', () => {
    const s = createPlayerState({ x: 0, y: 0 });
    tickPlayer(s, { ...noInput(), down: true }, 0, { canMoveTo: () => true });
    expect(s.moving).toBe(true);
    tickPlayer(s, noInput(), GRID_MOVE_MS, { canMoveTo: () => true });
    expect(s.moving).toBe(false);
    expect(s.x).toBe(0);
    expect(s.y).toBe(1);
  });

  it('can start a new move the tick after completing one', () => {
    const s = createPlayerState({ x: 0, y: 0 });
    tickPlayer(s, { ...noInput(), right: true }, 0, { canMoveTo: () => true });
    tickPlayer(s, noInput(), GRID_MOVE_MS, { canMoveTo: () => true });
    expect(s.moving).toBe(false);
    tickPlayer(s, { ...noInput(), right: true }, GRID_MOVE_MS + 1, {
      canMoveTo: () => true,
    });
    expect(s.moving).toBe(true);
    expect(s.targetX).toBe(2);
  });
});

describe('playerPixelPos', () => {
  it('returns the grid position * cellSize when idle', () => {
    const s = createPlayerState({ x: 3, y: 4 });
    expect(playerPixelPos(s, 1000, 16)).toEqual({ px: 48, py: 64 });
  });

  it('interpolates linearly halfway through a move', () => {
    const s = createPlayerState({ x: 0, y: 0 });
    tickPlayer(s, { ...noInput(), right: true }, 0, { canMoveTo: () => true });
    const mid = playerPixelPos(s, GRID_MOVE_MS / 2, 32);
    expect(mid.px).toBeCloseTo(16);
    expect(mid.py).toBe(0);
  });

  it('clamps t to [0,1] — negative elapsed → start position', () => {
    const s = createPlayerState({ x: 0, y: 0 });
    tickPlayer(s, { ...noInput(), right: true }, 1000, { canMoveTo: () => true });
    // now < moveStart → t clamps to 0
    expect(playerPixelPos(s, 500, 32)).toEqual({ px: 0, py: 0 });
  });

  it('clamps t to [0,1] — over-elapsed → target position', () => {
    const s = createPlayerState({ x: 0, y: 0 });
    tickPlayer(s, { ...noInput(), down: true }, 0, { canMoveTo: () => true });
    // still "moving" flag true, but t should saturate to 1.
    const p = playerPixelPos(s, GRID_MOVE_MS * 10, 32);
    expect(p.px).toBe(0);
    expect(p.py).toBe(32);
  });
});

describe('animIdFor', () => {
  it('returns idle_<dir> when not moving', () => {
    const s = createPlayerState();
    s.dir = 'left';
    expect(animIdFor(s)).toBe('idle_left');
  });

  it('returns walk_<dir> when moving', () => {
    const s = createPlayerState();
    s.moving = true;
    s.dir = 'up';
    expect(animIdFor(s)).toBe('walk_up');
  });
});
