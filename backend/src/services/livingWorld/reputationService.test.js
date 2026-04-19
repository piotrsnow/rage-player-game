import { describe, it, expect } from 'vitest';
import {
  computeReputationDeltas,
  computeReputationLabel,
  computeBountyAmount,
  shouldActivateVendetta,
  shouldClearVendetta,
  applyDiminishingReturns,
} from './reputationService.js';

// Pure-function tests — the DB-touching applyAttribution / getReputationProfile
// are covered by manual playtest Phase 3 scenarios.

describe('computeReputationDeltas', () => {
  it('killed good unprovoked → heavy penalty across scopes', () => {
    const d = computeReputationDeltas({ actionType: 'killed', victimAlignment: 'good', justified: false });
    expect(d).toEqual({ global: -10, region: -20 });
  });

  it('killed good justified → questioned but not condemned (zeros)', () => {
    const d = computeReputationDeltas({ actionType: 'killed', victimAlignment: 'good', justified: true });
    expect(d).toEqual({ global: 0, region: 0 });
  });

  it('killed evil justified → reward', () => {
    const d = computeReputationDeltas({ actionType: 'killed', victimAlignment: 'evil', justified: true });
    expect(d).toEqual({ global: 5, region: 20 });
  });

  it('killed evil unprovoked → mixed (regional +, global -)', () => {
    const d = computeReputationDeltas({ actionType: 'killed', victimAlignment: 'evil', justified: false });
    expect(d).toEqual({ global: -5, region: 10 });
  });

  it('killed neutral unprovoked → mild penalty everywhere', () => {
    const d = computeReputationDeltas({ actionType: 'killed', victimAlignment: 'neutral', justified: false });
    expect(d).toEqual({ global: -5, region: -10 });
  });

  it('robbed → region penalty, global unchanged', () => {
    const d = computeReputationDeltas({ actionType: 'robbed' });
    expect(d).toEqual({ global: 0, region: -15 });
  });

  it('helped good NPC → positive region', () => {
    const d = computeReputationDeltas({ actionType: 'helped', victimAlignment: 'good' });
    expect(d).toEqual({ global: 0, region: 5 });
  });

  it('helped evil NPC → negative (helping a bandit lord is not heroic)', () => {
    const d = computeReputationDeltas({ actionType: 'helped', victimAlignment: 'evil' });
    expect(d).toEqual({ global: 0, region: -5 });
  });

  it('betrayed → region penalty', () => {
    const d = computeReputationDeltas({ actionType: 'betrayed' });
    expect(d).toEqual({ global: -5, region: -10 });
  });

  it('unknown actionType → all zeros (no crash)', () => {
    const d = computeReputationDeltas({ actionType: 'danced' });
    expect(d).toEqual({ global: 0, region: 0 });
  });

  it('invalid alignment falls back to neutral', () => {
    const d = computeReputationDeltas({ actionType: 'killed', victimAlignment: 'chaotic-evil', justified: false });
    expect(d).toEqual({ global: -5, region: -10 });
  });
});

describe('computeReputationLabel', () => {
  it.each([
    [-1000, 'wanted_criminal'],
    [-201, 'wanted_criminal'],
    [-200, 'wanted_criminal'],
    [-199, 'outlaw'],
    [-100, 'outlaw'],
    [-99, 'suspicious'],
    [-50, 'suspicious'],
    [-49, 'neutral'],
    [0, 'neutral'],
    [49, 'neutral'],
    [50, 'respected'],
    [199, 'respected'],
    [200, 'hero'],
    [1000, 'hero'],
  ])('score %i → %s', (score, label) => {
    expect(computeReputationLabel(score)).toBe(label);
  });

  it('NaN score → neutral (no crash)', () => {
    expect(computeReputationLabel(NaN)).toBe('neutral');
  });
});

describe('computeBountyAmount', () => {
  const now = new Date('2026-04-18T12:00:00Z');

  it('no bounty above threshold', () => {
    expect(computeBountyAmount(-299, now, now)).toBe(0);
    expect(computeBountyAmount(0, now, now)).toBe(0);
    expect(computeBountyAmount(500, now, now)).toBe(0);
  });

  it('scales linearly with abs(score) below threshold', () => {
    expect(computeBountyAmount(-300, now, now)).toBe(1500); // capped? abs * 5 = 1500
    expect(computeBountyAmount(-400, now, now)).toBe(2000); // capped at 2000 SK
    expect(computeBountyAmount(-1000, now, now)).toBe(2000);
  });

  it('expires after 7 game-days of no incidents', () => {
    const old = new Date('2026-04-10T00:00:00Z'); // >7 days before now
    expect(computeBountyAmount(-500, old, now)).toBe(0);
  });

  it('no lastIncidentAt → no bounty', () => {
    expect(computeBountyAmount(-500, null, now)).toBe(0);
  });
});

describe('vendetta activation/clearing', () => {
  it('activates at global score ≤ -500', () => {
    expect(shouldActivateVendetta(-500, false)).toBe(true);
    expect(shouldActivateVendetta(-499, false)).toBe(false);
    expect(shouldActivateVendetta(0, false)).toBe(false);
  });

  it('stays active once on, regardless of later score drift', () => {
    expect(shouldActivateVendetta(-200, true)).toBe(true);
    expect(shouldActivateVendetta(0, true)).toBe(true);
  });

  it('clears after 2 game-weeks without incident', () => {
    const now = new Date('2026-04-18T12:00:00Z');
    const recent = new Date('2026-04-15T12:00:00Z'); // 3 days ago
    const old = new Date('2026-04-01T00:00:00Z'); // ~17 days ago
    expect(shouldClearVendetta(recent, now)).toBe(false);
    expect(shouldClearVendetta(old, now)).toBe(true);
    expect(shouldClearVendetta(null, now)).toBe(false);
  });
});

describe('applyDiminishingReturns', () => {
  it('penalties pass through unchanged', () => {
    expect(applyDiminishingReturns({ rawDelta: -20, sameDayGain: 0, sameDayCount: 0 })).toBe(-20);
    expect(applyDiminishingReturns({ rawDelta: -20, sameDayGain: 15, sameDayCount: 5 })).toBe(-20);
  });

  it('first positive gain on day passes through', () => {
    expect(applyDiminishingReturns({ rawDelta: 10, sameDayGain: 0, sameDayCount: 0 })).toBe(10);
  });

  it('second positive gain same day is reduced 30%', () => {
    expect(applyDiminishingReturns({ rawDelta: 10, sameDayGain: 10, sameDayCount: 1 })).toBe(7);
  });

  it('hits daily cap at +20 total per scope', () => {
    // sameDayCount=0 so no multiplicative reduction, but sameDayGain=18 → remaining 2
    expect(applyDiminishingReturns({ rawDelta: 10, sameDayGain: 18, sameDayCount: 0 })).toBe(2);
  });
});
