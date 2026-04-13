import { MOMENTUM_RANGE } from '../../data/rpgSystem.js';

const MOMENTUM_MIN = MOMENTUM_RANGE.min;  // -10
const MOMENTUM_MAX = MOMENTUM_RANGE.max;  // +10
const MOMENTUM_DECAY = 2;

/**
 * Calculate next momentum value after a skill check.
 * Called AFTER the scene — updates momentum for the NEXT roll.
 *
 * @param {number} currentMomentum - state.momentumBonus
 * @param {number} margin - margin from the resolved dice roll (total - threshold)
 * @returns {number} new momentum clamped to [-10, +10]
 */
export function calculateNextMomentum(currentMomentum, margin) {
  const current = typeof currentMomentum === 'number' && Number.isFinite(currentMomentum) ? currentMomentum : 0;
  const safeMargin = typeof margin === 'number' && Number.isFinite(margin) ? margin : 0;

  let next;

  if (safeMargin === 0) {
    // Neutral: decay toward 0
    if (current > 0) next = Math.max(0, current - MOMENTUM_DECAY);
    else if (current < 0) next = Math.min(0, current + MOMENTUM_DECAY);
    else next = 0;
  } else if (safeMargin > 0) {
    // Success: push momentum positive (scaled: +1 per 5 margin, max +10)
    const push = Math.min(MOMENTUM_MAX, Math.ceil(safeMargin / 5));
    next = current < 0 ? push : Math.max(current, push);
  } else {
    // Failure: push momentum negative
    const push = Math.max(MOMENTUM_MIN, -Math.ceil(Math.abs(safeMargin) / 5));
    next = current > 0 ? push : Math.min(current, push);
  }

  return Math.max(MOMENTUM_MIN, Math.min(MOMENTUM_MAX, next));
}
