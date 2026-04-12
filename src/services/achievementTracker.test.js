import { describe, it, expect } from 'vitest';
import {
  createAchievementState,
  updateStats,
  processStateChanges,
} from './achievementTracker.js';

function minimalGameState(overrides = {}) {
  return {
    campaign: { name: 'test' },
    character: {
      name: 'Test',
      wounds: 10,
      maxWounds: 12,
      career: { tier: 1 },
    },
    scenes: [],
    world: {},
    ...overrides,
  };
}

describe('createAchievementState', () => {
  it('returns valid defaults', () => {
    const state = createAchievementState();
    expect(state.unlocked).toEqual([]);
    expect(state.stats.scenesPlayed).toBe(0);
  });
});

describe('updateStats', () => {
  it('increments scenesPlayed on scene_completed', () => {
    const base = createAchievementState();
    const next = updateStats(base, { type: 'scene_completed', payload: {} });
    expect(next.stats.scenesPlayed).toBe(1);
  });

  it('increments combatWins on combat_victory', () => {
    const base = createAchievementState();
    const next = updateStats(base, { type: 'combat_victory', payload: {} });
    expect(next.stats.combatWins).toBe(1);
  });

  it('tracks location_visited', () => {
    const base = createAchievementState();
    const next = updateStats(base, {
      type: 'location_visited',
      payload: { location: 'Stary Las' },
    });
    expect(next.stats.locationsVisited).toContain('stary_las');
  });
});

describe('processStateChanges', () => {
  it('detects scene_completed from timeAdvance when campaign has scene history', () => {
    const achievementState = createAchievementState();
    const gameState = minimalGameState({
      scenes: Array.from({ length: 10 }, () => ({})),
    });
    const { updatedAchievementState } = processStateChanges(
      achievementState,
      { timeAdvance: { hoursElapsed: 1 } },
      gameState,
    );
    expect(updatedAchievementState.stats.scenesPlayed).toBe(1);
  });

  it('does not throw on empty stateChanges and leaves newlyUnlocked empty', () => {
    const achievementState = createAchievementState();
    const gameState = minimalGameState({
      campaign: null,
      world: { currentLocation: 'test_region' },
    });
    const { newlyUnlocked } = processStateChanges(achievementState, {}, gameState);
    expect(newlyUnlocked).toEqual([]);
  });
});
