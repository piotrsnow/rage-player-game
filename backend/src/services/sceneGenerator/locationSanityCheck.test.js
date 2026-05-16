import { describe, it, expect } from 'vitest';
import { detectSuspiciousLocationChange } from './locationSanityCheck.js';

const baseSceneResult = (currentLocation) => ({ stateChanges: { currentLocation } });

describe('detectSuspiciousLocationChange', () => {
  it('returns score 0 when no currentLocation emitted', () => {
    const v = detectSuspiciousLocationChange({
      playerAction: 'rozglądam się',
      sceneResult: { stateChanges: {} },
      prevLocName: 'Karczma',
      recentTrail: [],
    });
    expect(v.score).toBe(0);
    expect(v.signals).toEqual([]);
  });

  it('returns score 0 for no-op (same location emitted)', () => {
    const v = detectSuspiciousLocationChange({
      playerAction: 'rozglądam się',
      sceneResult: baseSceneResult('Karczma'),
      prevLocName: 'Karczma',
      recentTrail: [],
    });
    expect(v.score).toBe(0);
  });

  it('bypasses to score 0 when intent is travel', () => {
    const v = detectSuspiciousLocationChange({
      playerAction: 'idę dalej',
      sceneResult: baseSceneResult('Las'),
      prevLocName: 'Karczma',
      recentTrail: [],
      intentResult: { _intent: 'travel' },
    });
    expect(v.score).toBe(0);
  });

  it('detects no_movement_cue when location changes without movement words (PL)', () => {
    const v = detectSuspiciousLocationChange({
      playerAction: 'rozglądam się dookoła',
      sceneResult: baseSceneResult('Karczma'),
      prevLocName: 'Las',
      recentTrail: [],
    });
    expect(v.score).toBe(2);
    expect(v.signals).toContain('no_movement_cue');
  });

  it('passes when player action contains PL movement word', () => {
    const v = detectSuspiciousLocationChange({
      playerAction: 'wracam do karczmy',
      sceneResult: baseSceneResult('Karczma'),
      prevLocName: 'Las',
      recentTrail: [],
    });
    expect(v.score).toBe(0);
  });

  it('passes when player action contains EN movement word', () => {
    const v = detectSuspiciousLocationChange({
      playerAction: 'I head to the tavern',
      sceneResult: baseSceneResult('Karczma'),
      prevLocName: 'Las',
      recentTrail: [],
    });
    expect(v.score).toBe(0);
  });

  it('detects A→B→A flip pattern (score >= 3 → retry)', () => {
    const v = detectSuspiciousLocationChange({
      playerAction: 'rozglądam się',
      sceneResult: baseSceneResult('Karczma'),
      prevLocName: 'Las',
      recentTrail: [
        { idx: 12, loc: 'Karczma' },
        { idx: 13, loc: 'Las' },
      ],
    });
    expect(v.score).toBeGreaterThanOrEqual(3);
    expect(v.signals).toContain('flip_pattern');
    expect(v.signals).toContain('no_movement_cue');
  });

  it('flip pattern does NOT fire when player has movement vocabulary (intentional return)', () => {
    const v = detectSuspiciousLocationChange({
      playerAction: 'wracam do karczmy',
      sceneResult: baseSceneResult('Karczma'),
      prevLocName: 'Las',
      recentTrail: [
        { idx: 12, loc: 'Karczma' },
        { idx: 13, loc: 'Las' },
      ],
    });
    expect(v.score).toBe(0);
    expect(v.signals).toEqual([]);
  });

  it('case-insensitive name comparison', () => {
    const v = detectSuspiciousLocationChange({
      playerAction: 'rozglądam się',
      sceneResult: baseSceneResult('karczma'),
      prevLocName: 'KARCZMA',
      recentTrail: [],
    });
    expect(v.score).toBe(0);
  });

  it('no flip when N-1 matches the new emit (player simply stays)', () => {
    const v = detectSuspiciousLocationChange({
      playerAction: 'patrzę',
      sceneResult: baseSceneResult('Las'),
      prevLocName: 'Las',
      recentTrail: [
        { idx: 12, loc: 'Karczma' },
        { idx: 13, loc: 'Las' },
      ],
    });
    // Same as prev → no change → score 0.
    expect(v.score).toBe(0);
  });

  it('exposes suspect.from and suspect.to', () => {
    const v = detectSuspiciousLocationChange({
      playerAction: 'rozglądam się',
      sceneResult: baseSceneResult('Karczma'),
      prevLocName: 'Las',
      recentTrail: [],
    });
    expect(v.suspect).toEqual({ from: 'Las', to: 'Karczma' });
  });

  // ── Signal C: exit_reanchor ──

  it('detects exit_reanchor when exit vocabulary + model re-emits same location', () => {
    const v = detectSuspiciousLocationChange({
      playerAction: 'idę pogłaskać psa wychodząc z piwnicy',
      sceneResult: baseSceneResult('Piwnica'),
      prevLocName: 'Piwnica',
      recentTrail: [],
    });
    expect(v.score).toBeGreaterThanOrEqual(3);
    expect(v.signals).toContain('exit_reanchor');
  });

  it('detects exit_reanchor with "opuszczam"', () => {
    const v = detectSuspiciousLocationChange({
      playerAction: 'opuszczam piwnicę i idę na górę',
      sceneResult: baseSceneResult('Piwnica'),
      prevLocName: 'Piwnica',
      recentTrail: [],
    });
    expect(v.score).toBeGreaterThanOrEqual(3);
    expect(v.signals).toContain('exit_reanchor');
  });

  it('does NOT fire exit_reanchor for same-loc emit without exit vocabulary', () => {
    const v = detectSuspiciousLocationChange({
      playerAction: 'rozglądam się po piwnicy',
      sceneResult: baseSceneResult('Piwnica'),
      prevLocName: 'Piwnica',
      recentTrail: [],
    });
    expect(v.score).toBe(0);
  });

  // ── Signal D: exit_as_destination ──

  it('detects exit_as_destination when exit vocabulary + "z <emitted name>" in player text', () => {
    const v = detectSuspiciousLocationChange({
      playerAction: 'wychodząc z piwnicy idę pogłaskać psa',
      sceneResult: baseSceneResult('Piwnica'),
      prevLocName: 'Karczma',
      recentTrail: [],
    });
    expect(v.score).toBeGreaterThanOrEqual(3);
    expect(v.signals).toContain('exit_as_destination');
  });

  it('detects exit_as_destination with multi-word location name', () => {
    const v = detectSuspiciousLocationChange({
      playerAction: 'uciekam z mrocznej piwnicy tak szybko jak mogę',
      sceneResult: baseSceneResult('Mroczna Piwnica'),
      prevLocName: 'Karczma',
      recentTrail: [],
    });
    expect(v.score).toBeGreaterThanOrEqual(3);
    expect(v.signals).toContain('exit_as_destination');
  });

  it('does NOT fire exit_as_destination without exit vocabulary', () => {
    const v = detectSuspiciousLocationChange({
      playerAction: 'idę do piwnicy',
      sceneResult: baseSceneResult('Piwnica'),
      prevLocName: 'Karczma',
      recentTrail: [],
    });
    expect(v.score).toBe(0);
    expect(v.signals).not.toContain('exit_as_destination');
  });
});
