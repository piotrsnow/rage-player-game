import { describe, it, expect } from 'vitest';
import { shouldEscalateQuickBeat } from './quickBeat.js';

// pickPresentNpcs is an internal helper but the escalation contract is the
// piece that genuinely keeps quick beats in their lane — it's the seam
// between "this is RP flavor" and "this needs a full scene". A regression
// here lets combat / travel / shopping leak past nano with no dice rolls.

describe('shouldEscalateQuickBeat', () => {
  it('rejects empty / whitespace input', () => {
    expect(shouldEscalateQuickBeat('').escalate).toBe(true);
    expect(shouldEscalateQuickBeat('   ').escalate).toBe(true);
    expect(shouldEscalateQuickBeat(null).escalate).toBe(true);
  });

  it('rejects system markers wholesale', () => {
    expect(shouldEscalateQuickBeat('[ATTACK: Goblin]').reason).toBe('system_marker');
    expect(shouldEscalateQuickBeat('[INITIATE COMBAT]').reason).toBe('system_marker');
    expect(shouldEscalateQuickBeat('[TALK: Bartender]').reason).toBe('system_marker');
    expect(shouldEscalateQuickBeat('[WAIT]').reason).toBe('system_marker');
    expect(shouldEscalateQuickBeat('[CONTINUE]').reason).toBe('system_marker');
    expect(shouldEscalateQuickBeat('[IDLE_WORLD_EVENT: ...]').reason).toBe('system_marker');
  });

  it('rejects spell-cast entity tags', () => {
    const result = shouldEscalateQuickBeat('rzucam czar', [
      { kind: 'spell', name: 'Pocisk Magiczny' },
    ]);
    expect(result).toEqual({ escalate: true, reason: 'spell_cast' });
  });

  it('rejects combat verbs (Polish + English)', () => {
    expect(shouldEscalateQuickBeat('atakuję bandytę').reason).toBe('combat');
    expect(shouldEscalateQuickBeat('I attack the goblin').reason).toBe('combat');
  });

  it('rejects named-target travel', () => {
    expect(shouldEscalateQuickBeat('idę do Kamionki').reason).toBe('travel_named');
  });

  it('rejects free-vector travel', () => {
    expect(shouldEscalateQuickBeat('idę 1 km na północ').reason).toBe('travel_vector');
  });

  it('rejects trade verbs', () => {
    expect(shouldEscalateQuickBeat('kupuję miecz').reason).toBe('trade');
    expect(shouldEscalateQuickBeat('sprzedaję skóry').reason).toBe('trade');
    expect(shouldEscalateQuickBeat('I want to buy a sword').reason).toBe('trade');
    expect(shouldEscalateQuickBeat('targuję się z kupcem').reason).toBe('trade');
  });

  it('rejects long rest / sleep', () => {
    expect(shouldEscalateQuickBeat('śpię do rana').reason).toBe('long_rest');
    expect(shouldEscalateQuickBeat('rozbijam obóz').reason).toBe('long_rest');
    expect(shouldEscalateQuickBeat('długi odpoczynek').reason).toBe('long_rest');
  });

  it('rejects oversized inputs (>400 chars)', () => {
    const long = 'x'.repeat(401);
    expect(shouldEscalateQuickBeat(long).reason).toBe('too_long');
  });

  it('accepts genuine quick beats', () => {
    const beats = [
      'rozglądam się po karczmie',
      'biorę łyk piwa',
      'pytam barmana o plotki',
      'sprawdzam czy mam jeszcze monety',
      'kiwam głową w zamyśleniu',
      'patrzę w ogień kominka',
    ];
    for (const action of beats) {
      const v = shouldEscalateQuickBeat(action);
      expect(v.escalate, `expected non-escalation for "${action}"`).toBe(false);
    }
  });

  it('accepts quick beat with non-spell entity tags (e.g. NPC reference)', () => {
    const result = shouldEscalateQuickBeat('uśmiecham się do barmana', [
      { kind: 'npc', name: 'Geralt' },
    ]);
    expect(result.escalate).toBe(false);
  });
});
