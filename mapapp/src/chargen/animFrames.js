// Animation frame helpers for LPC sheets.
//
// The manifest.anim map is produced from data/character.anim where each
// animation holds:
//   { loop, frames: [[sx, sy, w, h, anchorX, anchorY, durationMs], ...] }
//
// We expose two small helpers:
//   - getAnimation(anim, id)     → {loop, frames[]} or null
//   - playbackState(anim, startedAt, nowMs) → {index, frame} for single-loop playback

export const DIRECTIONS = ['up', 'left', 'down', 'right'];

export function getAnimation(animMap, id) {
  return animMap?.[id] || null;
}

export function totalDuration(anim) {
  if (!anim?.frames) return 0;
  let total = 0;
  for (const f of anim.frames) total += Number(f[6]) || 0;
  return total;
}

// Given the current wall-clock offset (ms since anim started), compute which
// frame to show. Returns { index, frame, frameProgressMs, done }.
export function frameAt(anim, elapsedMs) {
  if (!anim?.frames?.length) return { index: 0, frame: null, done: true };
  const total = totalDuration(anim);
  if (total === 0) return { index: 0, frame: anim.frames[0], done: true };
  let t = elapsedMs;
  if (anim.loop) {
    t = ((t % total) + total) % total;
  } else if (t >= total) {
    const last = anim.frames[anim.frames.length - 1];
    return { index: anim.frames.length - 1, frame: last, done: true };
  }
  let acc = 0;
  for (let i = 0; i < anim.frames.length; i++) {
    const dur = Number(anim.frames[i][6]) || 0;
    if (t < acc + dur) return { index: i, frame: anim.frames[i], done: false, frameProgressMs: t - acc };
    acc += dur;
  }
  const lastIdx = anim.frames.length - 1;
  return { index: lastIdx, frame: anim.frames[lastIdx], done: !anim.loop };
}

// Convenience: pick the walk/idle animation for a given direction + movement state.
export function directionalAnimId(state, direction) {
  return `${state}_${direction}`;
}
