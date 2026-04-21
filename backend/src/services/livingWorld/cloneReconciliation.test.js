import { describe, it, expect } from 'vitest';
import { classifyDivergence } from './cloneReconciliation.js';

describe('classifyDivergence', () => {
  it('returns none when either side is missing', () => {
    expect(classifyDivergence(null, { alive: true })).toMatchObject({ verdict: 'none' });
    expect(classifyDivergence({ alive: true }, null)).toMatchObject({ verdict: 'none' });
  });

  it('flags announce_death when global is dead and clone still alive', () => {
    const clone = { alive: true };
    const global = { alive: false };
    expect(classifyDivergence(clone, global)).toMatchObject({ verdict: 'announce_death' });
  });

  it('treats clone-killed-independently as no-op (Witcher-style multiverse)', () => {
    const clone = { alive: false };
    const global = { alive: true };
    expect(classifyDivergence(clone, global)).toMatchObject({ verdict: 'none', reason: 'clone_killed_independently' });
  });

  it('no-op when both alive or both dead', () => {
    expect(classifyDivergence({ alive: true }, { alive: true })).toMatchObject({ verdict: 'none' });
    expect(classifyDivergence({ alive: false }, { alive: false })).toMatchObject({ verdict: 'none' });
  });
});
