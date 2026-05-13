import { describe, it, expect } from 'vitest';
import { resolveTrailingSpellAtMention } from './resolveSpellAtMention.js';

describe('resolveTrailingSpellAtMention', () => {
  it('replaces lone @ when exactly one spell is known', () => {
    const ch = { spells: { known: ['Iskrzykról'] } };
    expect(resolveTrailingSpellAtMention('rzucam na nie @', ch)).toBe('rzucam na nie Iskrzykról');
  });

  it('does not resolve lone @ when multiple spells match query scope', () => {
    const ch = { spells: { known: ['A', 'B'] } };
    expect(resolveTrailingSpellAtMention('foo @', ch)).toBe('foo @');
  });

  it('resolves @prefix when uniquely identifiable', () => {
    const ch = { spells: { known: ['Iskrzykról', 'Mgła'] } };
    expect(resolveTrailingSpellAtMention('atak @Iskrz', ch)).toBe('atak Iskrzykról');
  });

  it('does not touch @ inside a word', () => {
    const ch = { spells: { known: ['X'] } };
    expect(resolveTrailingSpellAtMention('email@test.com', ch)).toBe('email@test.com');
  });
});
