import { describe, it, expect } from 'vitest';
import { isHypotheticalOrQuestioning } from './intentHeuristics.js';

describe('isHypotheticalOrQuestioning', () => {
  it('returns true when input contains a question mark', () => {
    expect(isHypotheticalOrQuestioning('atakuję strażnika?')).toBe(true);
    expect(isHypotheticalOrQuestioning('czy sklep jest otwarty?')).toBe(true);
  });

  it('returns true for Polish conditional markers', () => {
    expect(isHypotheticalOrQuestioning('jakbym miał walczyć z bandytą')).toBe(true);
    expect(isHypotheticalOrQuestioning('gdybym dobył miecza')).toBe(true);
    expect(isHypotheticalOrQuestioning('gdyby bandyta mnie zaatakował')).toBe(true);
    expect(isHypotheticalOrQuestioning('jeśli sprzedałbym miecz')).toBe(true);
  });

  it('returns true for imaginative / hypothetical framing', () => {
    expect(isHypotheticalOrQuestioning('wyobraź sobie walkę z demonem')).toBe(true);
    expect(isHypotheticalOrQuestioning('hipotetycznie atakuję kupca')).toBe(true);
    expect(isHypotheticalOrQuestioning('zastanawiam się czy nie kupić konia')).toBe(true);
  });

  it('returns true for narrative questions', () => {
    expect(isHypotheticalOrQuestioning('opowiedz mi o walkach z bandytami')).toBe(true);
    expect(isHypotheticalOrQuestioning('powiedz mi więcej o smokach')).toBe(true);
    expect(isHypotheticalOrQuestioning('pytam karczmarza o bandytów')).toBe(true);
  });

  it('returns true for fear / hesitation phrasing', () => {
    expect(isHypotheticalOrQuestioning('boję się ataku')).toBe(true);
    expect(isHypotheticalOrQuestioning('boje się handlarzy niewolnikami')).toBe(true);
  });

  it('returns false for direct action statements', () => {
    expect(isHypotheticalOrQuestioning('atakuję strażnika')).toBe(false);
    expect(isHypotheticalOrQuestioning('dobywam miecza i ruszam na bandytę')).toBe(false);
    expect(isHypotheticalOrQuestioning('kupuję miecz')).toBe(false);
    expect(isHypotheticalOrQuestioning('sprzedaję złom u kowala')).toBe(false);
  });

  it('returns false for empty / non-string input', () => {
    expect(isHypotheticalOrQuestioning('')).toBe(false);
    expect(isHypotheticalOrQuestioning(null)).toBe(false);
    expect(isHypotheticalOrQuestioning(undefined)).toBe(false);
    expect(isHypotheticalOrQuestioning(42)).toBe(false);
  });
});
