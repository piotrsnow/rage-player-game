import { describe, expect, it } from 'vitest';
import { inferDeterministicItemAttackModes } from './itemAttackModesGenerator.js';

describe('inferDeterministicItemAttackModes', () => {
  it('treats backpacks as non-combat even when bad attackModes are cached', () => {
    const result = inferDeterministicItemAttackModes({
      name: 'Plecak podróżny',
      itemKey: 'plecak-podrozny',
      props: {
        attackModes: {
          melee: { damageComponents: [{ type: 'fizyczne', formula: 'str', bonus: 3 }] },
          ranged: null,
          aoe: null,
        },
      },
    });

    expect(result).toEqual({ resolved: true, attackModes: null });
  });

  it('gives knives a real short-blade melee formula instead of cached zero damage', () => {
    const result = inferDeterministicItemAttackModes({
      name: 'Nóż',
      itemKey: 'noz',
      props: {
        attackModes: {
          melee: { damageComponents: [{ type: 'fizyczne', bonus: 0 }] },
          ranged: null,
          aoe: null,
        },
      },
    });

    expect(result.resolved).toBe(true);
    expect(result.attackModes.melee.damageComponents[0]).toEqual({
      type: 'fizyczne',
      formula: 'str',
      bonus: 2,
    });
  });

  it('does not turn empty props into the legacy hand-weapon fallback', () => {
    const result = inferDeterministicItemAttackModes({
      name: 'Dziwny przedmiot',
      itemKey: 'dziwny-przedmiot',
      props: {},
    });

    expect(result).toEqual({ resolved: false });
  });

  it('still supports real legacy weapon props', () => {
    const result = inferDeterministicItemAttackModes({
      name: 'Stara broń',
      props: { damageType: 'melee-1h', bonus: 5 },
    });

    expect(result.resolved).toBe(true);
    expect(result.attackModes.melee.damageComponents[0]).toEqual({
      type: 'fizyczne',
      formula: 'str',
      bonus: 5,
    });
  });
});
