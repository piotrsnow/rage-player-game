import { describe, it, expect } from 'vitest';
// Pure rules tests — import z modułu bez prisma chain.
import { checkFailsOn } from './questDynamicsRules.js';

describe('checkFailsOn', () => {
  const baseCtx = {
    sceneGameTime: new Date(Date.UTC(2026, 0, 10)),
    locationsDestroyed: [],
  };

  it('returns no match for empty failsOn', () => {
    expect(checkFailsOn(null, baseCtx)).toEqual({ matched: false });
    expect(checkFailsOn({}, { ...baseCtx, changedNpcs: [] })).toEqual({ matched: false });
  });

  it('matches npcDead by case-insensitive name', () => {
    const result = checkFailsOn(
      { npcDead: ['Baron Hugo'] },
      { ...baseCtx, changedNpcs: [{ name: 'baron hugo', alive: false }] },
    );
    expect(result.matched).toBe(true);
    expect(result.reason).toContain('Baron Hugo');
  });

  it('does not match when NPC is alive', () => {
    const result = checkFailsOn(
      { npcDead: ['Baron Hugo'] },
      { ...baseCtx, changedNpcs: [{ name: 'Baron Hugo', alive: true }] },
    );
    expect(result.matched).toBe(false);
  });

  it('matches deadline when sceneGameTime > deadline', () => {
    const result = checkFailsOn(
      { deadline: '2026-01-05T00:00:00.000Z' },
      { ...baseCtx, changedNpcs: [] },  // sceneGameTime is jan 10, deadline is jan 5
    );
    expect(result.matched).toBe(true);
    expect(result.reason).toContain('Deadline');
  });

  it('does not match deadline when not yet passed', () => {
    const result = checkFailsOn(
      { deadline: '2026-12-31T00:00:00.000Z' },
      { ...baseCtx, changedNpcs: [] },
    );
    expect(result.matched).toBe(false);
  });

  it('matches locationDestroyed', () => {
    const result = checkFailsOn(
      { locationDestroyed: ['Manor Hugo'] },
      { ...baseCtx, changedNpcs: [], locationsDestroyed: ['manor hugo'] },
    );
    expect(result.matched).toBe(true);
    expect(result.reason).toContain('Manor Hugo');
  });

  it('first match wins', () => {
    const result = checkFailsOn(
      { npcDead: ['X'], deadline: '2020-01-01T00:00:00.000Z' },
      { ...baseCtx, changedNpcs: [{ name: 'X', alive: false }] },
    );
    expect(result.matched).toBe(true);
    expect(result.reason).toContain('X');  // npcDead matched first
  });
});
