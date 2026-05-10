import { describe, it, expect } from 'vitest';
import { looksLikeQuickBeat } from './quickBeatDetector.js';

// FE soft-hint heuristic. False negatives are fine (BE has the final say
// and will escalate if needed). False positives are the bug we're guarding
// against — the chip suggests "send as quick beat" but the BE rejects it.

describe('looksLikeQuickBeat', () => {
  it('accepts short RP-flavor inputs', () => {
    const beats = [
      'rozglądam się po karczmie',
      'biorę łyk piwa',
      'kiwam głową',
      'patrzę w ogień',
      'sprawdzam zawartość sakiewki',
      'I look around the room',
    ];
    for (const text of beats) {
      expect(looksLikeQuickBeat(text), text).toBe(true);
    }
  });

  it('rejects empty / whitespace / non-string', () => {
    expect(looksLikeQuickBeat('')).toBe(false);
    expect(looksLikeQuickBeat('   ')).toBe(false);
    expect(looksLikeQuickBeat(null)).toBe(false);
    expect(looksLikeQuickBeat(undefined)).toBe(false);
    expect(looksLikeQuickBeat(42)).toBe(false);
  });

  it('rejects system markers', () => {
    expect(looksLikeQuickBeat('[ATTACK: Goblin]')).toBe(false);
    expect(looksLikeQuickBeat('[CONTINUE]')).toBe(false);
  });

  it('rejects combat phrases', () => {
    expect(looksLikeQuickBeat('atakuję bandytę mieczem')).toBe(false);
    expect(looksLikeQuickBeat('I attack the goblin')).toBe(false);
  });

  it('rejects travel intents (named + free vector)', () => {
    expect(looksLikeQuickBeat('idę do Kamionki')).toBe(false);
    expect(looksLikeQuickBeat('idę 1 km na północ')).toBe(false);
    expect(looksLikeQuickBeat('I head to the docks')).toBe(false);
  });

  it('rejects trade verbs', () => {
    expect(looksLikeQuickBeat('kupuję miecz')).toBe(false);
    expect(looksLikeQuickBeat('sprzedaję zbroję')).toBe(false);
    expect(looksLikeQuickBeat('I want to buy potions')).toBe(false);
  });

  it('rejects rest / sleep', () => {
    expect(looksLikeQuickBeat('śpię do rana')).toBe(false);
    expect(looksLikeQuickBeat('rozbijam obóz')).toBe(false);
  });

  it('rejects spell-cast verbs', () => {
    expect(looksLikeQuickBeat('rzucam zaklęcie ognia')).toBe(false);
    expect(looksLikeQuickBeat('casting fireball')).toBe(false);
  });

  it('rejects oversized text (>200 chars)', () => {
    expect(looksLikeQuickBeat('x'.repeat(201))).toBe(false);
  });
});
