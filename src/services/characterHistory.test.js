import { describe, it, expect } from 'vitest';
import { buildHistorySummary, buildTimeline } from './characterHistory';

const makeScene = (overrides = {}) => ({
  timestamp: Date.now(),
  chosenAction: 'I open the door',
  narrative: 'The door creaks open revealing a dark corridor.',
  diceRoll: null,
  actions: [],
  ...overrides,
});

describe('buildHistorySummary', () => {
  it('returns zeroed summary for empty scenes', () => {
    const result = buildHistorySummary([]);
    expect(result).toEqual({
      totalScenes: 0,
      diceRolls: 0,
      successes: 0,
      failures: 0,
      lastAction: null,
      lastNarrative: '',
    });
  });

  it('returns zeroed summary for undefined', () => {
    const result = buildHistorySummary(undefined);
    expect(result.totalScenes).toBe(0);
  });

  it('counts scenes correctly', () => {
    const scenes = [makeScene(), makeScene(), makeScene()];
    const result = buildHistorySummary(scenes);
    expect(result.totalScenes).toBe(3);
  });

  it('counts dice rolls, successes and failures', () => {
    const scenes = [
      makeScene({ diceRoll: { skill: 'Melee', roll: 30, target: 50, sl: 2, success: true } }),
      makeScene({ diceRoll: { skill: 'Dodge', roll: 80, target: 40, sl: -4, success: false } }),
      makeScene(),
    ];
    const result = buildHistorySummary(scenes);
    expect(result.diceRolls).toBe(2);
    expect(result.successes).toBe(1);
    expect(result.failures).toBe(1);
  });

  it('returns the last action and truncated narrative', () => {
    const scenes = [
      makeScene({ chosenAction: 'first' }),
      makeScene({ chosenAction: 'second', narrative: 'A'.repeat(300) }),
    ];
    const result = buildHistorySummary(scenes);
    expect(result.lastAction).toBe('second');
    expect(result.lastNarrative.length).toBeLessThanOrEqual(201);
    expect(result.lastNarrative.endsWith('…')).toBe(true);
  });
});

describe('buildTimeline', () => {
  it('returns empty array for no scenes', () => {
    expect(buildTimeline([])).toEqual([]);
    expect(buildTimeline(undefined)).toEqual([]);
  });

  it('returns entries in reverse chronological order', () => {
    const scenes = [
      makeScene({ chosenAction: 'first' }),
      makeScene({ chosenAction: 'second' }),
      makeScene({ chosenAction: 'third' }),
    ];
    const entries = buildTimeline(scenes);
    expect(entries).toHaveLength(3);
    expect(entries[0].index).toBe(3);
    expect(entries[0].action).toBe('third');
    expect(entries[2].index).toBe(1);
    expect(entries[2].action).toBe('first');
  });

  it('caps at 50 entries for very long histories', () => {
    const scenes = Array.from({ length: 80 }, (_, i) =>
      makeScene({ chosenAction: `action-${i}` })
    );
    const entries = buildTimeline(scenes);
    expect(entries).toHaveLength(50);
    expect(entries[0].index).toBe(80);
    expect(entries[49].index).toBe(31);
  });

  it('maps dice roll data correctly', () => {
    const scenes = [
      makeScene({
        diceRoll: { skill: 'Athletics', roll: 22, target: 55, sl: 3, success: true },
      }),
    ];
    const [entry] = buildTimeline(scenes);
    expect(entry.diceRoll).toEqual({
      skill: 'Athletics',
      roll: 22,
      target: 55,
      sl: 3,
      success: true,
    });
  });

  it('handles scenes without optional fields', () => {
    const scenes = [makeScene({ chosenAction: undefined, narrative: undefined, diceRoll: null, timestamp: null })];
    const [entry] = buildTimeline(scenes);
    expect(entry.action).toBeNull();
    expect(entry.narrativeSnippet).toBe('');
    expect(entry.diceRoll).toBeNull();
    expect(entry.timestamp).toBeNull();
  });
});
