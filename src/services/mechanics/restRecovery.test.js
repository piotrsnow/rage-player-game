import { describe, it, expect } from 'vitest';
import { isRestAction, calculateRestRecovery } from './restRecovery.js';

describe('isRestAction', () => {
  it('detects rest keywords', () => {
    expect(isRestAction('idę spac')).toBe(true);
    expect(isRestAction('rest')).toBe(true);
    expect(isRestAction('sleep at the inn')).toBe(true);
    expect(isRestAction('odpoczywam')).toBe(true);
  });

  it('rejects non-rest actions', () => {
    expect(isRestAction('atakuję goblina')).toBe(false);
    expect(isRestAction('')).toBe(false);
    expect(isRestAction(null)).toBe(false);
  });

  it('detects localized rest action via t()', () => {
    const t = (key) => key === 'gameplay.restAction' ? 'Odpoczywam' : '';
    expect(isRestAction('Odpoczywam', t)).toBe(true);
  });
});

describe('calculateRestRecovery', () => {
  it('returns null for no character', () => {
    expect(calculateRestRecovery(null)).toBeNull();
  });

  it('heals wounds based on hours slept', () => {
    const char = { wounds: 5, maxWounds: 20, needs: {} };
    const result = calculateRestRecovery(char, 4);
    expect(result.woundsChange).toBeGreaterThan(0);
    expect(result.woundsChange).toBeLessThanOrEqual(15); // max missing
  });

  it('does not overheal', () => {
    const char = { wounds: 19, maxWounds: 20, needs: {} };
    const result = calculateRestRecovery(char, 10);
    expect(result.woundsChange).toBeLessThanOrEqual(1);
  });

  it('returns undefined woundsChange when at full hp', () => {
    const char = { wounds: 20, maxWounds: 20, needs: {} };
    const result = calculateRestRecovery(char, 8);
    expect(result.woundsChange).toBeUndefined();
  });

  it('restores needs to 100', () => {
    const char = { wounds: 10, maxWounds: 10, needs: { hunger: 30, thirst: 50, rest: 10 } };
    const result = calculateRestRecovery(char, 1);
    expect(result.needsChanges.hunger).toBe(70);
    expect(result.needsChanges.thirst).toBe(50);
    expect(result.needsChanges.rest).toBe(90);
  });

  it('skips needs already at 100', () => {
    const char = { wounds: 10, maxWounds: 10, needs: { hunger: 100 } };
    const result = calculateRestRecovery(char, 1);
    expect(result.needsChanges.hunger).toBeUndefined();
  });

  it('defaults to 0.5 hours for invalid input', () => {
    const char = { wounds: 0, maxWounds: 20, needs: {} };
    const result = calculateRestRecovery(char, -1);
    expect(result).not.toBeNull();
  });
});
