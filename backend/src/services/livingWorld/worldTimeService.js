// Living World — hybrid real-time-capped time model.
//
// 1h IRL = worldTimeRatio game hours (default 24 → 1h IRL = 1 game day).
// Cap offline gaps at worldTimeMaxGapDays so players returning after months
// don't come back to a world they can't recognise.
//
// Pure functions — unit-tested without MongoDB.

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * Map wall-clock milliseconds to game milliseconds, capped at maxGapDays.
 *
 * @param {number} realMs   — elapsed real time in ms
 * @param {number} ratio    — 1 IRL hour = N game hours (default 24)
 * @param {number} capDays  — cap on game-time gap in game days (default 7)
 * @returns {number} game time elapsed in ms
 */
export function realToGameTime(realMs, ratio = 24, capDays = 7) {
  if (!Number.isFinite(realMs) || realMs <= 0) return 0;
  const rawGameMs = realMs * ratio;
  const capMs = capDays * DAY_MS;
  return Math.min(rawGameMs, capMs);
}

/**
 * Return game-time elapsed since a pausedAt timestamp, honoring campaign
 * time-ratio and cap. Returns 0 if pausedAt is in the future or invalid.
 *
 * @param {Date|string|number|null} pausedAt
 * @param {{ ratio?: number, capDays?: number, now?: Date }} [opts]
 * @returns {number} game ms elapsed (0 .. capDays * DAY_MS)
 */
export function gameTimeSince(pausedAt, { ratio = 24, capDays = 7, now = new Date() } = {}) {
  if (!pausedAt) return 0;
  const past = pausedAt instanceof Date ? pausedAt : new Date(pausedAt);
  if (Number.isNaN(past.getTime())) return 0;
  const realMs = now.getTime() - past.getTime();
  return realToGameTime(realMs, ratio, capDays);
}

/**
 * Convert game ms to a human-friendly breakdown. Used for narrative blurbs
 * ("3 game-days, 4 game-hours since pause").
 */
export function formatGameDuration(gameMs) {
  if (!Number.isFinite(gameMs) || gameMs <= 0) {
    return { days: 0, hours: 0, totalHours: 0, label: 'brief moment' };
  }
  const totalHours = gameMs / HOUR_MS;
  const days = Math.floor(totalHours / 24);
  const hours = Math.floor(totalHours - days * 24);
  let label;
  if (days >= 2) label = `${days} days`;
  else if (days === 1) label = hours > 0 ? `1 day, ${hours}h` : '1 day';
  else if (hours >= 1) label = `${hours}h`;
  else label = 'brief moment';
  return { days, hours, totalHours, label };
}

/**
 * Whether the gap exceeds the cap (i.e. was clamped). Callers may want to
 * narrate "weeks or more — you lost count" when this is true.
 */
export function wasClamped(realMs, ratio = 24, capDays = 7) {
  if (!Number.isFinite(realMs) || realMs <= 0) return false;
  return realMs * ratio > capDays * DAY_MS;
}
