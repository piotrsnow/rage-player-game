import { describe, it, expect } from 'vitest';
// Test pure logic only — importuj z matrix module (bez prisma chain).
import { computeRippleDelta, RIPPLE_MATRIX } from './relationshipRippleMatrix.js';

describe('computeRippleDelta', () => {
  it('returns 0 for unknown relation (no matrix entry)', () => {
    expect(computeRippleDelta('unrelated', { dispositionDelta: -50 })).toBe(0);
    expect(computeRippleDelta(null, { alive: false })).toBe(0);
  });

  it('returns 0 when rippleStrength=0 (NPC nie reaguje)', () => {
    expect(computeRippleDelta('brother of', { dispositionDelta: -50, rippleStrength: 0 })).toBe(0);
  });

  it('death of friend → strong negative for friend/lover', () => {
    const lover = computeRippleDelta('lover of', { alive: false, rippleStrength: 100 });
    expect(lover).toBeLessThanOrEqual(-30);  // -1.2 × 30 × 1.0 = -36, clamp to -50

    const friend = computeRippleDelta('friend of', { alive: false, rippleStrength: 100 });
    expect(friend).toBeLessThan(0);
    expect(Math.abs(friend)).toBeLessThan(Math.abs(lover));  // friend reacts less than lover
  });

  it('death of enemy → positive for rival/enemy', () => {
    const rival = computeRippleDelta('rival of', { alive: false, rippleStrength: 100 });
    expect(rival).toBeGreaterThan(0);

    const enemy = computeRippleDelta('enemy of', { alive: false, rippleStrength: 100 });
    expect(enemy).toBeGreaterThan(0);
  });

  it('player aided source → friends increase, rivals decrease', () => {
    const brother = computeRippleDelta('brother of', { dispositionDelta: 20, rippleStrength: 100 });
    expect(brother).toBeGreaterThan(0);

    const rival = computeRippleDelta('rival of', { dispositionDelta: 20, rippleStrength: 100 });
    expect(rival).toBeLessThan(0);
  });

  it('player harmed source → friends decrease, rivals increase', () => {
    const brother = computeRippleDelta('brother of', { dispositionDelta: -20, rippleStrength: 100 });
    expect(brother).toBeLessThan(0);

    const rival = computeRippleDelta('rival of', { dispositionDelta: -20, rippleStrength: 100 });
    expect(rival).toBeGreaterThan(0);
  });

  it('rippleStrength scales the effect proportionally', () => {
    const full = computeRippleDelta('brother of', { dispositionDelta: -20, rippleStrength: 100 });
    const half = computeRippleDelta('brother of', { dispositionDelta: -20, rippleStrength: 50 });
    expect(Math.abs(half)).toBeLessThanOrEqual(Math.abs(full) / 2 + 1);  // ±1 round
  });

  it('actionType=killed dominuje (independent of dispositionDelta)', () => {
    const justKilled = computeRippleDelta('brother of', { actionType: 'killed', rippleStrength: 100 });
    expect(justKilled).toBeLessThanOrEqual(-25);  // -0.8 × 30 = -24 — clamp do -50, round
  });

  it('actionType=saved → big positive for friends', () => {
    const saved = computeRippleDelta('lover of', { actionType: 'saved', rippleStrength: 100 });
    expect(saved).toBeGreaterThanOrEqual(15);
  });

  it('actionType=betrayed → big negative for friends', () => {
    const betrayed = computeRippleDelta('friend of', { actionType: 'betrayed', rippleStrength: 100 });
    expect(betrayed).toBeLessThanOrEqual(-10);
  });

  it('clamps single-event delta to ±50', () => {
    const extreme = computeRippleDelta('lover of', { actionType: 'killed', rippleStrength: 100 });
    expect(extreme).toBeGreaterThanOrEqual(-50);
    expect(extreme).toBeLessThanOrEqual(50);
  });

  it('returns integer (no fractional disposition)', () => {
    const v = computeRippleDelta('brother of', { dispositionDelta: -7, rippleStrength: 73 });
    expect(Number.isInteger(v)).toBe(true);
  });

  it('matrix has all expected core relations', () => {
    expect(RIPPLE_MATRIX).toHaveProperty('brother of');
    expect(RIPPLE_MATRIX).toHaveProperty('lover of');
    expect(RIPPLE_MATRIX).toHaveProperty('rival of');
    expect(RIPPLE_MATRIX).toHaveProperty('enemy of');
    expect(RIPPLE_MATRIX).toHaveProperty('mentor of');
  });
});
