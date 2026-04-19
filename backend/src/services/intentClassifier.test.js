import { describe, it, expect } from 'vitest';
import { detectTravelIntent, classifyIntentHeuristic } from './intentClassifier.js';

describe('intentClassifier — detectTravelIntent', () => {
  it('matches Polish "idę do X"', () => {
    expect(detectTravelIntent('Idę do Watonga')).toEqual({ target: 'Watonga' });
  });

  it('matches Polish "wyruszam do X"', () => {
    expect(detectTravelIntent('Wyruszam do Avaltro o świcie')).toEqual({ target: 'Avaltro' });
  });

  it('matches multi-word location names', () => {
    expect(detectTravelIntent('Jadę do Czarnego Lasu')).toEqual({ target: 'Czarnego Lasu' });
  });

  it('matches English "travel to X"', () => {
    expect(detectTravelIntent('I travel to Watonga')).toEqual({ target: 'Watonga' });
  });

  it('matches "go to X"', () => {
    expect(detectTravelIntent('I go to Yeralden')).toEqual({ target: 'Yeralden' });
  });

  it('rejects lowercase targets (prevents "idę do domu" false positive)', () => {
    expect(detectTravelIntent('idę do domu')).toBeNull();
    expect(detectTravelIntent('idę do lasu')).toBeNull();
  });

  it('returns null for non-travel actions', () => {
    expect(detectTravelIntent('atakuję strażnika')).toBeNull();
    expect(detectTravelIntent('szukam skarbu')).toBeNull();
    expect(detectTravelIntent('')).toBeNull();
    expect(detectTravelIntent(null)).toBeNull();
  });

  it('strips trailing punctuation from target', () => {
    expect(detectTravelIntent('Idę do Watonga.')).toEqual({ target: 'Watonga' });
    expect(detectTravelIntent('Idę do Watonga, bo jest noc')).toEqual({ target: 'Watonga' });
  });
});

describe('intentClassifier — classifyIntentHeuristic travel flow', () => {
  it('flags travel intent with _travelTarget', () => {
    const result = classifyIntentHeuristic('Wyruszam do Avaltro');
    expect(result).not.toBeNull();
    expect(result._intent).toBe('travel');
    expect(result._travelTarget).toBe('Avaltro');
    expect(result.expand_location).toBe(true);
  });

  it('combat intent takes precedence over travel when present', () => {
    // "atakuję" is detected by detectCombatIntent before travel regex runs
    const result = classifyIntentHeuristic('atakuję strażników idąc do Watonga');
    expect(result?._intent).toBe('combat');
  });
});
