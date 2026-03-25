import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./gameState.js', async () => {
  const actual = await vi.importActual('./gameState.js');
  return {
    ...actual,
    rollD100: vi.fn(),
  };
});

import { rollD100 } from './gameState.js';
import { resolveManoeuvre } from './combatEngine.js';

function createCombatState({ actor = {}, target = {} } = {}) {
  return {
    active: true,
    round: 1,
    turnIndex: 0,
    log: [],
    combatants: [
      {
        id: 'player',
        name: 'Hero',
        type: 'player',
        characteristics: { ws: 30, s: 30, t: 30 },
        skills: { 'Melee (Basic)': 5 },
        inventory: ['Hand Weapon'],
        weapons: ['Hand Weapon'],
        advantage: 0,
        conditions: [],
        wounds: 12,
        maxWounds: 12,
        isDefeated: false,
        ...actor,
      },
      {
        id: 'enemy_guard',
        name: 'Guard',
        type: 'enemy',
        characteristics: { ws: 30, t: 30 },
        skills: { 'Melee (Basic)': 0 },
        inventory: [],
        weapons: ['Hand Weapon'],
        armour: {},
        advantage: 0,
        conditions: [],
        wounds: 10,
        maxWounds: 10,
        isDefeated: false,
        ...target,
      },
    ],
  };
}

describe('resolveManoeuvre critical hit damage', () => {
  beforeEach(() => {
    vi.mocked(rollD100).mockReset();
  });

  it('adds a creativity bonus from a custom attack description', () => {
    vi.mocked(rollD100).mockReturnValueOnce(50).mockReturnValueOnce(90);

    const combat = createCombatState();
    const customDescription = 'I leap from the table, twist past his shield, and drive low.';

    const { result } = resolveManoeuvre(
      combat,
      'player',
      'attack',
      'enemy_guard',
      { customDescription }
    );

    expect(result.outcome).toBe('hit');
    expect(result.customDescription).toBe(customDescription);
    expect(result.creativityBonus).toBe(20);
    expect(result.attackBreakdown.baseTarget).toBe(35);
    expect(result.attackBreakdown.target).toBe(55);
    expect(result.damageBreakdown.netSL).toBe(6);
  });

  it('keeps non-critical hits at 0 damage when armour and toughness absorb everything', () => {
    vi.mocked(rollD100).mockReturnValueOnce(23).mockReturnValueOnce(44);

    const combat = createCombatState({
      actor: {
        inventory: ['Dagger'],
        weapons: ['Dagger'],
      },
      target: {
        characteristics: { ws: 30, t: 30 },
        armour: { body: 3 },
      },
    });

    const { combat: updatedCombat, result } = resolveManoeuvre(combat, 'player', 'attack', 'enemy_guard');

    expect(result.outcome).toBe('hit');
    expect(result.criticalHit).toBeFalsy();
    expect(result.damage).toBe(0);
    expect(updatedCombat.combatants[1].wounds).toBe(10);
  });

  it('adds bonus damage to a landed critical hit', () => {
    vi.mocked(rollD100).mockReturnValueOnce(1).mockReturnValueOnce(92);

    const combat = createCombatState({
      target: {
        characteristics: { ws: 30, t: 20 },
      },
    });

    const { combat: updatedCombat, result } = resolveManoeuvre(combat, 'player', 'attack', 'enemy_guard');

    expect(result.outcome).toBe('hit');
    expect(result.criticalHit).toBe(true);
    expect(result.criticalBonusDamage).toBe(2);
    expect(result.damage).toBe(12);
    expect(result.minimumDamageApplied).toBe(false);
    expect(updatedCombat.combatants[1].wounds).toBe(0);
  });

  it('forces at least 1 damage on a landed critical hit after reductions', () => {
    vi.mocked(rollD100).mockReturnValueOnce(2).mockReturnValueOnce(44);

    const combat = createCombatState({
      actor: {
        inventory: ['Dagger'],
        weapons: ['Dagger'],
      },
      target: {
        characteristics: { ws: 30, t: 60 },
        armour: { head: 2 },
      },
    });

    const { combat: updatedCombat, result } = resolveManoeuvre(combat, 'player', 'attack', 'enemy_guard');

    expect(result.outcome).toBe('hit');
    expect(result.criticalHit).toBe(true);
    expect(result.criticalBonusDamage).toBe(2);
    expect(result.minimumDamageApplied).toBe(true);
    expect(result.damage).toBe(1);
    expect(updatedCombat.combatants[1].wounds).toBe(9);
  });
});
