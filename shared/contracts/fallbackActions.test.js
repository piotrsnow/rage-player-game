import { describe, it, expect } from 'vitest';
import {
  postProcessSuggestedActions,
  ensureSuggestedActions,
  normalizeSuggestedActions,
  buildFallbackActions,
  buildFallbackNarrative,
} from '../domain/fallbackActions.js';

describe('normalizeSuggestedActions', () => {
  it('trims, dedupes, and caps', () => {
    const result = normalizeSuggestedActions(
      ['  Go north  ', 'Go north', 'Wait', '', null, 'Attack'],
      3,
    );
    expect(result).toEqual(['Go north', 'Wait', 'Attack']);
  });

  it('returns [] for non-array', () => {
    expect(normalizeSuggestedActions(null)).toEqual([]);
    expect(normalizeSuggestedActions('nope')).toEqual([]);
  });
});

describe('postProcessSuggestedActions (FE entry)', () => {
  it('returns up to 3 AI-provided actions, deduped', () => {
    const result = postProcessSuggestedActions({
      suggestedActions: ['Look around', 'Look around', 'Attack', 'Flee', 'Wait'],
      language: 'en',
    });
    expect(result).toEqual(['Look around', 'Attack', 'Flee']);
  });

  it('falls back to contextual fallback when AI gives nothing', () => {
    const result = postProcessSuggestedActions({
      suggestedActions: [],
      language: 'en',
      narrative: 'A tense standoff in the market square.',
      gameState: { world: { currentLocation: 'market square', npcs: [] }, scenes: [] },
    });
    expect(result).toHaveLength(3);
    expect(result.every((a) => typeof a === 'string' && a.length > 0)).toBe(true);
  });

  it('sanitizes Polish AI leakage ("I say:" → "Mówię:")', () => {
    const result = postProcessSuggestedActions({
      suggestedActions: ['I say: Witajcie', 'I shout to Jan: Stój!'],
      language: 'pl',
    });
    expect(result[0]).toBe('Mówię: Witajcie');
    expect(result[1]).toBe('Krzyczę do Jan: Stój!');
  });
});

describe('ensureSuggestedActions (BE entry)', () => {
  it('returns payload actions normalized (up to 8) when present', () => {
    const result = ensureSuggestedActions(
      { suggestedActions: ['Attack', 'Defend', 'Attack', 'Flee'] },
      { language: 'en' },
    );
    expect(result).toEqual(['Attack', 'Defend', 'Flee']);
  });

  it('falls back to 4-category builder when payload is empty', () => {
    const result = ensureSuggestedActions(
      { suggestedActions: [] },
      {
        language: 'pl',
        currentLocation: 'Tawerna',
        npcsHere: [{ name: 'Karczmarz' }],
        sceneIndex: 1,
      },
    );
    expect(result.length).toBeGreaterThan(0);
    expect(result.length).toBeLessThanOrEqual(4);
    expect(result.some((a) => a.includes('Karczmarz'))).toBe(true);
  });
});

describe('buildFallbackActions (FE-style builder)', () => {
  it('produces 6 actions with dialogue fallbacks', () => {
    const result = buildFallbackActions('en', {
      narrative: 'Some text',
      currentLocation: 'crypt',
      npcs: [{ name: 'Erik' }],
    });
    expect(result.length).toBe(6);
    // Last 2 are dialogue fallbacks
    expect(result[4]).toMatch(/Erik/);
    expect(result[5]).toMatch(/Erik/);
  });

  it('Polish variant produces Polish strings', () => {
    const result = buildFallbackActions('pl', { narrative: 'coś', currentLocation: 'rynek' });
    expect(result.some((a) => /[ąćęłńóśźż]/i.test(a))).toBe(true);
  });
});

describe('buildFallbackNarrative', () => {
  it('returns Polish narrative for pl', () => {
    expect(buildFallbackNarrative('pl')).toMatch(/Sytuacja/);
  });
  it('returns English narrative for en', () => {
    expect(buildFallbackNarrative('en')).toMatch(/situation/i);
  });
});
