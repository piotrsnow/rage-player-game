import { describe, it, expect } from 'vitest';
import { suggestEncounterMode, worstLabel, bestLabel } from './encounterEscalator.js';

function row({ scope = 'global', scopeKey = '', score = 0, reputationLabel, bountyAmount = 0, vendettaActive = false }) {
  return { scope, scopeKey, score, reputationLabel, bountyAmount, vendettaActive };
}

describe('worstLabel / bestLabel', () => {
  it('worstLabel returns lowest severity among rows', () => {
    const rows = [
      row({ reputationLabel: 'hero' }),
      row({ reputationLabel: 'outlaw' }),
      row({ reputationLabel: 'neutral' }),
    ];
    expect(worstLabel(rows)).toBe('outlaw');
  });

  it('bestLabel returns highest severity (most positive)', () => {
    const rows = [
      row({ reputationLabel: 'hero' }),
      row({ reputationLabel: 'outlaw' }),
      row({ reputationLabel: 'neutral' }),
    ];
    expect(bestLabel(rows)).toBe('hero');
  });

  it('empty rows → neutral', () => {
    expect(worstLabel([])).toBe('neutral');
    expect(bestLabel([])).toBe('neutral');
  });
});

describe('suggestEncounterMode', () => {
  it('empty profile → neutral/no hint', () => {
    const out = suggestEncounterMode({ rows: [] });
    expect(out.mode).toBe('neutral');
    expect(out.intensity).toBe(0);
    expect(out.narrativeHint).toBeNull();
  });

  it('vendetta wins over any other label', () => {
    const profile = {
      rows: [
        row({ scope: 'global', reputationLabel: 'hero', score: 500, vendettaActive: true }),
      ],
    };
    const out = suggestEncounterMode(profile);
    expect(out.mode).toBe('vendetta');
    expect(out.intensity).toBe(3);
    expect(out.vendettaActive).toBe(true);
  });

  it('wanted_criminal with bounty → bounty_hunters mode', () => {
    const profile = {
      rows: [
        row({ scope: 'global', reputationLabel: 'wanted_criminal', score: -400, bountyAmount: 2000 }),
      ],
    };
    const out = suggestEncounterMode(profile);
    expect(out.mode).toBe('bounty_hunters');
    expect(out.bountyAmount).toBe(2000);
    expect(out.intensity).toBe(3);
  });

  it('wanted_criminal without bounty → guards_arrest', () => {
    const profile = {
      rows: [
        row({ scope: 'region', reputationLabel: 'wanted_criminal', score: -250, bountyAmount: 0 }),
      ],
    };
    const out = suggestEncounterMode(profile);
    expect(out.mode).toBe('guards_arrest');
    expect(out.bountyAmount).toBe(0);
  });

  it('outlaw → guards_arrest intensity 2', () => {
    const profile = {
      rows: [row({ reputationLabel: 'outlaw', score: -150 })],
    };
    const out = suggestEncounterMode(profile);
    expect(out.mode).toBe('guards_arrest');
    expect(out.intensity).toBe(2);
  });

  it('suspicious → guards_question intensity 1', () => {
    const profile = {
      rows: [row({ reputationLabel: 'suspicious', score: -80 })],
    };
    const out = suggestEncounterMode(profile);
    expect(out.mode).toBe('guards_question');
    expect(out.intensity).toBe(1);
  });

  it('hero (no negatives) → celebrated', () => {
    const profile = {
      rows: [row({ reputationLabel: 'hero', score: 300 })],
    };
    const out = suggestEncounterMode(profile);
    expect(out.mode).toBe('celebrated');
  });

  it('respected (no negatives) → cautious (softened)', () => {
    const profile = {
      rows: [row({ reputationLabel: 'respected', score: 100 })],
    };
    const out = suggestEncounterMode(profile);
    expect(out.mode).toBe('cautious');
  });

  it('mixed: hero global but wanted regional → worst (wanted) wins', () => {
    const profile = {
      rows: [
        row({ scope: 'global', reputationLabel: 'hero', score: 250 }),
        row({ scope: 'region', scopeKey: 'reikland', reputationLabel: 'wanted_criminal', score: -220 }),
      ],
    };
    const out = suggestEncounterMode(profile);
    expect(out.mode).toBe('guards_arrest');
    expect(out.worstLabel).toBe('wanted_criminal');
    expect(out.bestLabel).toBe('hero');
  });
});
