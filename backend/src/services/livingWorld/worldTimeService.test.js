import { describe, it, expect } from 'vitest';
import {
  realToGameTime,
  gameTimeSince,
  formatGameDuration,
  wasClamped,
} from './worldTimeService.js';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

describe('worldTimeService', () => {
  describe('realToGameTime', () => {
    it('1h IRL at ratio=24 → 24h game', () => {
      expect(realToGameTime(HOUR, 24, 7)).toBe(24 * HOUR);
    });
    it('0 or negative → 0', () => {
      expect(realToGameTime(0, 24, 7)).toBe(0);
      expect(realToGameTime(-1000, 24, 7)).toBe(0);
    });
    it('caps at 7 game days when real time would exceed', () => {
      // 30 days IRL × 24 = 720 game days → capped at 7
      expect(realToGameTime(30 * DAY, 24, 7)).toBe(7 * DAY);
    });
    it('below cap — passes through linearly', () => {
      expect(realToGameTime(2 * HOUR, 24, 7)).toBe(2 * 24 * HOUR);
    });
    it('ratio=1 (realtime) — identity up to cap', () => {
      expect(realToGameTime(3 * HOUR, 1, 7)).toBe(3 * HOUR);
    });
    it('invalid input (NaN, Infinity) → 0', () => {
      expect(realToGameTime(NaN, 24, 7)).toBe(0);
      expect(realToGameTime(Infinity, 24, 7)).toBe(0);
    });
  });

  describe('gameTimeSince', () => {
    it('null pausedAt → 0', () => {
      expect(gameTimeSince(null)).toBe(0);
    });
    it('future pausedAt → 0 (no negative gaps)', () => {
      const future = new Date(Date.now() + 10000);
      expect(gameTimeSince(future)).toBe(0);
    });
    it('1h ago with ratio=24 → 24h game', () => {
      const now = new Date('2026-01-15T12:00:00Z');
      const paused = new Date('2026-01-15T11:00:00Z');
      expect(gameTimeSince(paused, { ratio: 24, capDays: 7, now })).toBe(24 * HOUR);
    });
    it('accepts ISO string', () => {
      const now = new Date('2026-01-15T12:00:00Z');
      expect(gameTimeSince('2026-01-15T11:00:00Z', { ratio: 24, capDays: 7, now })).toBe(24 * HOUR);
    });
    it('invalid date → 0', () => {
      expect(gameTimeSince('not-a-date')).toBe(0);
    });
  });

  describe('wasClamped', () => {
    it('below cap → false', () => {
      expect(wasClamped(2 * HOUR, 24, 7)).toBe(false);
    });
    it('above cap → true', () => {
      expect(wasClamped(30 * DAY, 24, 7)).toBe(true);
    });
    it('exactly at cap → false (not exceeding)', () => {
      expect(wasClamped((7 * DAY) / 24, 24, 7)).toBe(false);
    });
  });

  describe('formatGameDuration', () => {
    it('0 → brief moment', () => {
      expect(formatGameDuration(0).label).toBe('brief moment');
    });
    it('24h game → 1 day', () => {
      expect(formatGameDuration(24 * HOUR).label).toBe('1 day');
    });
    it('28h game → 1 day, 4h', () => {
      expect(formatGameDuration(28 * HOUR).label).toBe('1 day, 4h');
    });
    it('72h game → 3 days', () => {
      expect(formatGameDuration(72 * HOUR).label).toBe('3 days');
    });
    it('3h game → 3h', () => {
      expect(formatGameDuration(3 * HOUR).label).toBe('3h');
    });
  });
});
