export const COMBAT_MOVE_MS_PER_CELL = 500;

export function getCombatMoveDurationMs(distance) {
  return Math.max(0, distance) * COMBAT_MOVE_MS_PER_CELL;
}
