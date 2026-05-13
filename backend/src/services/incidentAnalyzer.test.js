import { describe, it, expect } from 'vitest';
import {
  detectDuplicateCorrection,
  isWorldCorrectionConfirmedApplied,
} from './incidentAnalyzer.js';

describe('isWorldCorrectionConfirmedApplied', () => {
  it('is true only when player-right and world correction succeeded', () => {
    expect(isWorldCorrectionConfirmedApplied({ isPlayerRight: true, worldCorrectionApplied: true })).toBe(true);
    expect(isWorldCorrectionConfirmedApplied({ isPlayerRight: true, worldCorrectionApplied: false })).toBe(false);
    expect(isWorldCorrectionConfirmedApplied({ isPlayerRight: true, worldCorrectionApplied: null })).toBe(false);
    expect(isWorldCorrectionConfirmedApplied({ isPlayerRight: false, worldCorrectionApplied: true })).toBe(false);
    expect(isWorldCorrectionConfirmedApplied(null)).toBe(false);
  });
});

describe('detectDuplicateCorrection', () => {
  const prevApplied = {
    id: 'a',
    sceneIndex: 1,
    createdAt: new Date(),
    corrections: {
      stateChanges: { currentLocation: 'Dolina' },
    },
    isPlayerRight: true,
    worldCorrectionApplied: true,
  };

  it('matches when prior incident had the same location correction (caller passes confirmed incidents only)', () => {
    const dup = detectDuplicateCorrection(
      { currentLocation: 'Dolina' },
      [prevApplied],
    );
    expect(dup).not.toBeNull();
    expect(dup.reason).toBe('currentLocation');
  });

  it('mixed list: filter to confirmed-applied before passing to detectDuplicateCorrection', () => {
    const mixed = [
      prevApplied,
      {
        ...prevApplied,
        id: 'b',
        worldCorrectionApplied: false,
        corrections: { stateChanges: { currentLocation: 'Inna' } },
      },
    ];
    const confirmedOnly = mixed.filter(isWorldCorrectionConfirmedApplied);
    expect(confirmedOnly).toHaveLength(1);
    expect(
      detectDuplicateCorrection({ currentLocation: 'Inna' }, confirmedOnly),
    ).toBeNull();
    expect(
      detectDuplicateCorrection({ currentLocation: 'Dolina' }, confirmedOnly),
    ).not.toBeNull();
  });
});
