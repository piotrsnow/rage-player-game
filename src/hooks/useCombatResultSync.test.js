import { describe, expect, it } from 'vitest';
import { planCombatResultDrain } from './useCombatResultSync.js';

const SAMPLE_RESULTS = [{ outcome: 'hit', damage: 4 }, { outcome: 'miss' }];

function makeCombat(overrides = {}) {
  return {
    active: true,
    round: 1,
    turnIndex: 0,
    combatants: [],
    lastResults: SAMPLE_RESULTS,
    lastResultsTs: 42,
    ...overrides,
  };
}

describe('planCombatResultDrain — gating', () => {
  it('no-ops when lastResults is empty', () => {
    const plan = planCombatResultDrain({
      combat: makeCombat({ lastResults: [] }),
      lastProcessedTs: null,
      isMultiplayer: true,
      isHost: false,
    });
    expect(plan.shouldApply).toBe(false);
    expect(plan.results).toEqual([]);
    expect(plan.nextTs).toBeNull();
  });

  it('no-ops when lastResults is missing', () => {
    const plan = planCombatResultDrain({
      combat: makeCombat({ lastResults: undefined }),
      lastProcessedTs: null,
      isMultiplayer: true,
      isHost: false,
    });
    expect(plan.shouldApply).toBe(false);
  });

  it('no-ops when lastResultsTs is missing', () => {
    const plan = planCombatResultDrain({
      combat: makeCombat({ lastResultsTs: null }),
      lastProcessedTs: null,
      isMultiplayer: true,
      isHost: false,
    });
    expect(plan.shouldApply).toBe(false);
  });

  it('no-ops when ts matches already processed ts (duplicate guard)', () => {
    const plan = planCombatResultDrain({
      combat: makeCombat({ lastResultsTs: 99 }),
      lastProcessedTs: 99,
      isMultiplayer: true,
      isHost: false,
    });
    expect(plan.shouldApply).toBe(false);
    expect(plan.nextTs).toBe(99);
  });

  it('no-ops for solo player (not multiplayer)', () => {
    const plan = planCombatResultDrain({
      combat: makeCombat(),
      lastProcessedTs: null,
      isMultiplayer: false,
      isHost: false,
    });
    expect(plan.shouldApply).toBe(false);
  });

  it('no-ops for multiplayer host (host produces results — does not consume them)', () => {
    const plan = planCombatResultDrain({
      combat: makeCombat(),
      lastProcessedTs: null,
      isMultiplayer: true,
      isHost: true,
    });
    expect(plan.shouldApply).toBe(false);
  });
});

describe('planCombatResultDrain — apply path', () => {
  it('applies results for non-host MP client with fresh ts', () => {
    const plan = planCombatResultDrain({
      combat: makeCombat(),
      lastProcessedTs: null,
      isMultiplayer: true,
      isHost: false,
    });
    expect(plan.shouldApply).toBe(true);
    expect(plan.results).toBe(SAMPLE_RESULTS);
    expect(plan.nextTs).toBe(42);
  });

  it('applies when ts increments past previous processed ts', () => {
    const plan = planCombatResultDrain({
      combat: makeCombat({ lastResultsTs: 100 }),
      lastProcessedTs: 42,
      isMultiplayer: true,
      isHost: false,
    });
    expect(plan.shouldApply).toBe(true);
    expect(plan.nextTs).toBe(100);
  });

  it('applies when ts drifts backwards after reconnect (host restart scenario)', () => {
    const plan = planCombatResultDrain({
      combat: makeCombat({ lastResultsTs: 10 }),
      lastProcessedTs: 100,
      isMultiplayer: true,
      isHost: false,
    });
    expect(plan.shouldApply).toBe(true);
    expect(plan.nextTs).toBe(10);
  });
});
