import { describe, it, expect } from 'vitest';
import { classifyHeuristic, formatTranscript } from './voiceModeClassifier';

describe('classifyHeuristic — Polish defaults', () => {
  it('treats explicit opening quote as dialogue', () => {
    const r = classifyHeuristic('"witaj wędrowcze"');
    expect(r.mode).toBe('dialogue');
    expect(r.confidence).toBeGreaterThan(0.9);
  });

  it('detects first-person dialogue verbs', () => {
    const r = classifyHeuristic('mówię do niego: chodź ze mną');
    expect(r.mode).toBe('dialogue');
  });

  it('detects imperative dialogue verbs', () => {
    const r = classifyHeuristic('powiedz mu, że nie żyjemy');
    expect(r.mode).toBe('dialogue');
  });

  it('detects movement action verbs', () => {
    const r = classifyHeuristic('idę na północ ostrożnie');
    expect(r.mode).toBe('action');
  });

  it('detects combat action verbs', () => {
    const r = classifyHeuristic('atakuję orka mieczem');
    expect(r.mode).toBe('action');
  });

  it('boosts dialogue when an NPC is active and verb is ambiguous', () => {
    const r = classifyHeuristic('cześć', { activeDialogueNpc: 'Kowal' });
    expect(r.mode).toBe('dialogue');
  });

  it('boosts action when combat is active and verb is ambiguous', () => {
    const r = classifyHeuristic('go', { combatActive: true, lang: 'en' });
    // unsure either way, but the combat boost should win over a no-verb default.
    expect(r.mode).toBe('action');
  });

  it('falls back to sticky mode when nothing else fires', () => {
    const r = classifyHeuristic('blah blah', { stickyMode: 'dialogue' });
    expect(r.mode).toBe('dialogue');
  });
});

describe('classifyHeuristic — English coverage', () => {
  it('detects English first-person dialogue', () => {
    const r = classifyHeuristic('I tell him to leave', { lang: 'en' });
    expect(r.mode).toBe('dialogue');
  });

  it('detects English imperative dialogue at start', () => {
    const r = classifyHeuristic('say hello to the merchant', { lang: 'en' });
    expect(r.mode).toBe('dialogue');
  });

  it('detects English action verbs', () => {
    const r = classifyHeuristic('I attack the bandit', { lang: 'en' });
    expect(r.mode).toBe('action');
  });
});

describe('formatTranscript', () => {
  it('wraps dialogue in quotes when missing', () => {
    expect(formatTranscript('witaj', 'dialogue')).toBe('"witaj"');
  });

  it('does not double-wrap already-quoted dialogue', () => {
    expect(formatTranscript('"witaj"', 'dialogue')).toBe('"witaj"');
  });

  it('passes action through unchanged', () => {
    expect(formatTranscript('idę dalej', 'action')).toBe('idę dalej');
  });

  it('preserves leading whitespace in action', () => {
    expect(formatTranscript(' idę', 'action')).toBe(' idę');
  });
});
