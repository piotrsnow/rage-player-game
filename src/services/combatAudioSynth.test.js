import { describe, expect, it } from 'vitest';
import { mapResultToSynthCategory, SYNTH_CATEGORIES } from './combatAudioSynth.js';

describe('mapResultToSynthCategory', () => {
  it('maps hit outcome to hit category', () => {
    expect(mapResultToSynthCategory({ outcome: 'hit' })).toBe(SYNTH_CATEGORIES.hit);
  });

  it('maps miss outcome to miss category', () => {
    expect(mapResultToSynthCategory({ outcome: 'miss' })).toBe(SYNTH_CATEGORIES.miss);
  });

  it('maps defend manoeuvre to defend category', () => {
    expect(mapResultToSynthCategory({ outcome: 'defensive', manoeuvreKey: 'defend' })).toBe(SYNTH_CATEGORIES.defend);
  });

  it('maps dodge manoeuvre to dodge category', () => {
    expect(mapResultToSynthCategory({ outcome: 'defensive', manoeuvreKey: 'dodge' })).toBe(SYNTH_CATEGORIES.dodge);
  });

  it('maps charge manoeuvre to charge category', () => {
    expect(mapResultToSynthCategory({ outcome: 'hit', manoeuvreKey: 'charge' })).toBe(SYNTH_CATEGORIES.hit);
    expect(mapResultToSynthCategory({ outcome: 'miss', manoeuvreKey: 'charge' })).toBe(SYNTH_CATEGORIES.miss);
  });

  it('maps fled outcome to dodge category', () => {
    expect(mapResultToSynthCategory({ outcome: 'fled' })).toBe(SYNTH_CATEGORIES.dodge);
  });

  it('maps failed_flee outcome to dodge category', () => {
    expect(mapResultToSynthCategory({ outcome: 'failed_flee' })).toBe(SYNTH_CATEGORIES.dodge);
  });

  it('maps targetDefeated to defeat category when outcome is not hit/miss', () => {
    expect(mapResultToSynthCategory({ outcome: 'other', targetDefeated: true })).toBe(SYNTH_CATEGORIES.defeat);
  });

  it('returns null for unknown outcome without targetDefeated', () => {
    expect(mapResultToSynthCategory({ outcome: 'unknown_other' })).toBeNull();
  });

  it('returns null for null/undefined result', () => {
    expect(mapResultToSynthCategory(null)).toBeNull();
    expect(mapResultToSynthCategory(undefined)).toBeNull();
  });
});

describe('SYNTH_CATEGORIES', () => {
  it('has all expected categories', () => {
    expect(SYNTH_CATEGORIES).toEqual({
      hit: 'hit',
      miss: 'miss',
      defend: 'defend',
      dodge: 'dodge',
      turnStart: 'turnStart',
      defeat: 'defeat',
      charge: 'charge',
    });
  });
});
