import { describe, it, expect } from 'vitest';
import { mergeRestRecoveryIntoStateChanges } from './mergeRestRecoveryIntoStateChanges.js';

describe('mergeRestRecoveryIntoStateChanges', () => {
  it('overrides AI woundsChange with deterministic rest recovery', () => {
    const result = mergeRestRecoveryIntoStateChanges(
      { woundsChange: 10, needsChanges: { rest: 5 } },
      {
        isRest: true,
        restRecovery: { woundsChange: 4, needsChanges: { rest: 90, hunger: 50 } },
        needsSystemEnabled: false,
      },
    );
    expect(result.woundsChange).toBe(4);
    expect(result.needsChanges).toEqual({ rest: 90, hunger: 50 });
  });

  it('normalizes numeric timeAdvance when needs system is enabled', () => {
    const result = mergeRestRecoveryIntoStateChanges(
      { timeAdvance: 2 },
      { needsSystemEnabled: true },
    );
    expect(result.timeAdvance).toEqual({ hoursElapsed: 2 });
  });

  it('returns original when no rest merge applies', () => {
    const input = { woundsChange: 3 };
    const result = mergeRestRecoveryIntoStateChanges(input, {});
    expect(result).toEqual(input);
  });
});
