import { describe, expect, it } from 'vitest';
import {
  ATTACK_MODE_KEYS,
  AttackModesSchema,
  hasAttackMode,
  getAvailableAttackModes,
  getEffectiveAttackMode,
  pickAttackMode,
  evaluateAttackMode,
  formatAttackModeLabel,
  formatAttackModeSummary,
  inferAttackModesFromLegacy,
} from './attackModes.js';

const MELEE_WEAPON = {
  attackModes: {
    melee: { damageComponents: [{ type: 'fizyczne', formula: 'str', bonus: 3 }] },
    ranged: null,
    aoe: null,
  },
};

const RANGED_WEAPON = {
  attackModes: {
    melee: { damageComponents: [{ type: 'fizyczne', formula: 'str', bonus: -2 }], qualities: ['Improvised'] },
    ranged: { damageComponents: [{ type: 'fizyczne', formula: 'dex', bonus: 2 }], range: 20 },
    aoe: null,
  },
};

const FIREBALL_SPELL = {
  attackModes: {
    melee: { damageComponents: [{ type: 'ogien', intScale: 0.25, flat: 1 }] },
    ranged: { damageComponents: [{ type: 'ogien', intScale: 0.5, flat: 2 }], range: 10 },
    aoe: { damageComponents: [{ type: 'ogien', intScale: 0.5, flat: 4 }], range: 10, aoeShape: 'radius', aoeSize: 2 },
  },
};

describe('AttackModesSchema validation', () => {
  it('validates a melee-only weapon', () => {
    const result = AttackModesSchema.safeParse(MELEE_WEAPON.attackModes);
    expect(result.success).toBe(true);
  });

  it('validates a ranged weapon with melee fallback', () => {
    const result = AttackModesSchema.safeParse(RANGED_WEAPON.attackModes);
    expect(result.success).toBe(true);
  });

  it('validates a full 3-mode spell', () => {
    const result = AttackModesSchema.safeParse(FIREBALL_SPELL.attackModes);
    expect(result.success).toBe(true);
  });

  it('rejects empty damageComponents', () => {
    const result = AttackModesSchema.safeParse({
      melee: { damageComponents: [] },
      ranged: null,
      aoe: null,
    });
    expect(result.success).toBe(false);
  });

  it('rejects aoe without shape', () => {
    const result = AttackModesSchema.safeParse({
      melee: null,
      ranged: null,
      aoe: { damageComponents: [{ type: 'ogien', flat: 2 }], range: 5, aoeSize: 2 },
    });
    expect(result.success).toBe(false);
  });
});

describe('hasAttackMode / getAvailableAttackModes / getEffectiveAttackMode', () => {
  it('detects melee mode', () => {
    expect(hasAttackMode(MELEE_WEAPON, 'melee')).toBe(true);
    expect(hasAttackMode(MELEE_WEAPON, 'ranged')).toBe(false);
  });

  it('lists available modes', () => {
    const modes = getAvailableAttackModes(FIREBALL_SPELL);
    expect(modes).toHaveLength(3);
    expect(modes.map(([k]) => k)).toEqual(['melee', 'ranged', 'aoe']);
  });

  it('returns null for missing mode', () => {
    expect(getEffectiveAttackMode(MELEE_WEAPON, 'ranged')).toBeNull();
  });
});

describe('pickAttackMode', () => {
  it('picks melee when in range', () => {
    expect(pickAttackMode(RANGED_WEAPON, 1)).toBe('melee');
  });

  it('picks ranged when out of melee range', () => {
    expect(pickAttackMode(RANGED_WEAPON, 5)).toBe('ranged');
  });

  it('falls back to melee when no ranged mode', () => {
    expect(pickAttackMode(MELEE_WEAPON, 5)).toBe('melee');
  });
});

describe('evaluateAttackMode', () => {
  it('computes STR-based melee damage', () => {
    const result = evaluateAttackMode(MELEE_WEAPON.attackModes.melee, { sila: 12 });
    expect(result.total).toBe(15); // 12 + 3
    expect(result.components[0].type).toBe('fizyczne');
  });

  it('computes INT-scaled spell damage', () => {
    const result = evaluateAttackMode(FIREBALL_SPELL.attackModes.ranged, { inteligencja: 14 });
    // floor(14 * 0.5) + 2 = 9
    expect(result.total).toBe(9);
    expect(result.components[0].type).toBe('ogien');
  });

  it('returns zero for null mode', () => {
    const result = evaluateAttackMode(null, { sila: 10 });
    expect(result.total).toBe(0);
  });
});

describe('formatAttackModeLabel', () => {
  it('formats melee weapon damage', () => {
    const label = formatAttackModeLabel(MELEE_WEAPON.attackModes.melee, 'melee');
    expect(label).toContain('Fizyczne');
    expect(label).toContain('STR');
  });

  it('includes range for ranged mode', () => {
    const label = formatAttackModeLabel(RANGED_WEAPON.attackModes.ranged, 'ranged');
    expect(label).toContain('20m');
  });

  it('includes aoe shape info', () => {
    const label = formatAttackModeLabel(FIREBALL_SPELL.attackModes.aoe, 'aoe');
    expect(label).toContain('radius');
  });

  it('includes computed damage when attrs provided', () => {
    const label = formatAttackModeLabel(MELEE_WEAPON.attackModes.melee, 'melee', { sila: 10 });
    expect(label).toContain('= 13'); // 10 + 3
  });
});

describe('formatAttackModeSummary', () => {
  it('formats all modes', () => {
    const summary = formatAttackModeSummary(FIREBALL_SPELL.attackModes);
    expect(summary).toContain('Walka wręcz');
    expect(summary).toContain('Dystans');
    expect(summary).toContain('Obszar');
  });
});

describe('inferAttackModesFromLegacy', () => {
  it('infers melee-1h weapon', () => {
    const modes = inferAttackModesFromLegacy({ damageType: 'melee-1h', bonus: 5 });
    expect(modes.melee).not.toBeNull();
    expect(modes.melee.damageComponents[0].formula).toBe('str');
    expect(modes.melee.damageComponents[0].bonus).toBe(5);
    expect(modes.ranged).toBeNull();
  });

  it('infers ranged-dex weapon with weak melee', () => {
    const modes = inferAttackModesFromLegacy({ damageType: 'ranged-dex', bonus: 2, range: 20 });
    expect(modes.ranged).not.toBeNull();
    expect(modes.ranged.damageComponents[0].formula).toBe('dex');
    expect(modes.melee).not.toBeNull();
    expect(modes.melee.qualities).toContain('Improvised');
  });

  it('passes through existing attackModes', () => {
    const existing = { melee: { damageComponents: [{ type: 'fizyczne', flat: 99 }] }, ranged: null, aoe: null };
    const modes = inferAttackModesFromLegacy({ attackModes: existing });
    expect(modes).toBe(existing);
  });

  it('handles null input', () => {
    const modes = inferAttackModesFromLegacy(null);
    expect(modes.melee).not.toBeNull();
    expect(modes.melee.damageComponents[0].formula).toBe('str');
  });
});
