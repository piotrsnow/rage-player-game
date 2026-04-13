import { describe, it, expect } from 'vitest';
import { calculateNextMomentum } from './momentumTracker.js';

describe('calculateNextMomentum', () => {
  it('pushes positive on success', () => {
    const next = calculateNextMomentum(0, 10);
    expect(next).toBeGreaterThan(0);
  });

  it('pushes negative on failure', () => {
    const next = calculateNextMomentum(0, -10);
    expect(next).toBeLessThan(0);
  });

  it('decays toward 0 on neutral margin', () => {
    expect(calculateNextMomentum(5, 0)).toBeLessThan(5);
    expect(calculateNextMomentum(5, 0)).toBeGreaterThanOrEqual(0);
    expect(calculateNextMomentum(-5, 0)).toBeGreaterThan(-5);
    expect(calculateNextMomentum(-5, 0)).toBeLessThanOrEqual(0);
  });

  it('stays 0 when already 0 and margin is 0', () => {
    expect(calculateNextMomentum(0, 0)).toBe(0);
  });

  it('clamps to +10 max', () => {
    expect(calculateNextMomentum(10, 100)).toBe(10);
    expect(calculateNextMomentum(8, 50)).toBe(10);
  });

  it('clamps to -10 min', () => {
    expect(calculateNextMomentum(-10, -100)).toBe(-10);
    expect(calculateNextMomentum(-8, -50)).toBe(-10);
  });

  it('resets positive momentum on failure', () => {
    const next = calculateNextMomentum(5, -10);
    expect(next).toBeLessThan(0);
  });

  it('resets negative momentum on success', () => {
    const next = calculateNextMomentum(-5, 10);
    expect(next).toBeGreaterThan(0);
  });

  it('handles non-finite inputs gracefully', () => {
    expect(calculateNextMomentum(NaN, 5)).toBeGreaterThan(0);
    expect(calculateNextMomentum(0, NaN)).toBe(0);
    expect(calculateNextMomentum(undefined, null)).toBe(0);
  });

  it('scales push by margin magnitude', () => {
    const small = calculateNextMomentum(0, 3);
    const large = calculateNextMomentum(0, 25);
    expect(large).toBeGreaterThanOrEqual(small);
  });
});
