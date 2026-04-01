const MOMENTUM_MIN = -30;
const MOMENTUM_MAX = 30;
const MOMENTUM_DECAY = 5;
const SL_MULTIPLIER = 5;

/**
 * Calculate next momentum value after a skill check.
 * Called AFTER the scene - updates momentum for the NEXT roll.
 *
 * @param {number} currentMomentum - state.momentumBonus
 * @param {number} sl - success levels from the resolved dice roll
 * @returns {number} new momentum clamped to [-30, +30]
 */
export function calculateNextMomentum(currentMomentum, sl) {
  const current = typeof currentMomentum === 'number' && Number.isFinite(currentMomentum) ? currentMomentum : 0;
  const safeSl = typeof sl === 'number' && Number.isFinite(sl) ? sl : 0;

  const newValue = safeSl * SL_MULTIPLIER;
  let next;

  if (safeSl === 0) {
    // Neutral result: decay toward 0
    if (current > 0) {
      next = Math.max(0, current - MOMENTUM_DECAY);
    } else if (current < 0) {
      next = Math.min(0, current + MOMENTUM_DECAY);
    } else {
      next = 0;
    }
  } else if (safeSl > 0) {
    // Success: momentum becomes more positive
    if (current < 0) {
      next = newValue;
    } else {
      next = newValue > current ? newValue : Math.round((newValue + current) / 2);
    }
  } else {
    // Failure: momentum becomes more negative
    if (current > 0) {
      next = newValue;
    } else {
      next = newValue < current ? newValue : Math.round((newValue + current) / 2);
    }
  }

  return Math.max(MOMENTUM_MIN, Math.min(MOMENTUM_MAX, next));
}
