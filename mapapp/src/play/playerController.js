// Pure grid-based player controller for the walk-test.
//
// State:
//   { x, y, targetX, targetY, dir, moving, moveStart, moveDuration }
// Input:
//   { up, down, left, right } booleans.
//
// On each tick, if the player isn't already animating between tiles and a
// directional key is held, we start a new tile-to-tile move after checking
// `canMoveTo(nx, ny)` (map collision + NPC collision).

export const GRID_MOVE_MS = 180;

export function createPlayerState(startCell) {
  return {
    x: startCell?.x ?? 0,
    y: startCell?.y ?? 0,
    targetX: startCell?.x ?? 0,
    targetY: startCell?.y ?? 0,
    dir: 'down',
    moving: false,
    moveStart: 0,
    moveDuration: GRID_MOVE_MS,
    blockedAt: 0, // timestamp of last refused move (for bump animation)
  };
}

// `onBlocked(nx, ny, dir)` is called if the player tried to step into a
// non-walkable cell. Used to trigger NPC speech bubbles.
export function tickPlayer(state, input, now, { canMoveTo, onBlocked } = {}) {
  if (state.moving) {
    const elapsed = now - state.moveStart;
    if (elapsed >= state.moveDuration) {
      state.x = state.targetX;
      state.y = state.targetY;
      state.moving = false;
    }
    return state;
  }
  let dx = 0; let dy = 0; let dir = state.dir;
  if (input.up)    { dy = -1; dir = 'up'; }
  else if (input.down)  { dy = 1; dir = 'down'; }
  else if (input.left)  { dx = -1; dir = 'left'; }
  else if (input.right) { dx = 1; dir = 'right'; }
  if (dx === 0 && dy === 0) return state;

  state.dir = dir;
  const nx = state.x + dx;
  const ny = state.y + dy;
  if (canMoveTo && !canMoveTo(nx, ny)) {
    state.blockedAt = now;
    onBlocked?.(nx, ny, dir);
    return state;
  }
  state.targetX = nx;
  state.targetY = ny;
  state.moving = true;
  state.moveStart = now;
  return state;
}

// Pixel position given optional in-transit easing. Linear interpolation.
export function playerPixelPos(state, now, cellSize) {
  if (!state.moving) {
    return { px: state.x * cellSize, py: state.y * cellSize };
  }
  const t = Math.min(1, Math.max(0, (now - state.moveStart) / state.moveDuration));
  const ix = state.x + (state.targetX - state.x) * t;
  const iy = state.y + (state.targetY - state.y) * t;
  return { px: ix * cellSize, py: iy * cellSize };
}

export function animIdFor(state) {
  return `${state.moving ? 'walk' : 'idle'}_${state.dir}`;
}
