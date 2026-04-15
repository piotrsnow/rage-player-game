import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./gameState.js', async () => {
  const actual = await vi.importActual('./gameState.js');
  return {
    ...actual,
    rollD50: vi.fn(() => 25),
  };
});

vi.mock('./gameDataService.js', () => ({
  gameData: {
    getWeaponData: (name) => {
      const weapons = {
        'Hand Weapon': { damageType: 'melee-1h', bonus: 3, qualities: [], group: 'Melee (Basic)', twoHanded: false, enchantSlots: 1 },
        'Dagger': { damageType: 'melee-1h', bonus: 2, qualities: ['Fast'], group: 'Melee (Basic)', twoHanded: false, enchantSlots: 0 },
      };
      return weapons[name] || weapons['Hand Weapon'];
    },
    armour: {},
    shields: {},
    manoeuvres: {
      attack: { name: 'Attack', type: 'offensive', range: 'melee', modifiers: {}, closesDistance: false },
      defend: { name: 'Defend', type: 'defensive', range: 'self', modifiers: {} },
      dodge: { name: 'Dodge', type: 'defensive', range: 'self', modifiers: {} },
      charge: { name: 'Charge', type: 'offensive', range: 'melee', modifiers: {}, closesDistance: true },
      feint: { name: 'Feint', type: 'offensive', range: 'melee', modifiers: { feint: true }, closesDistance: false },
      flee: { name: 'Flee', type: 'utility', range: 'self', modifiers: { flee: true } },
      magic: { name: 'Magic', type: 'magic', range: 'ranged', modifiers: {} },
    },
    MELEE_RANGE: 2,
    BATTLEFIELD_MAX: 20,
    DEFAULT_MOVEMENT: 4,
  },
}));

import { rollD50 } from './gameState.js';
import {
  createCombatState,
  resolveManoeuvre,
  isCombatOver,
  endCombat,
  getDistance,
  isInMeleeRange,
  advanceTurn,
  advanceRound,
  getCurrentTurnCombatant,
} from './combatEngine.js';

function makeCombatState({ actor = {}, target = {} } = {}) {
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
        attributes: { sila: 12, inteligencja: 10, charyzma: 8, zrecznosc: 10, wytrzymalosc: 10, szczescie: 0 },
        skills: { 'Walka bronia jednoręczna': 5 },
        inventory: ['Hand Weapon'],
        weapons: ['Hand Weapon'],
        equipped: { mainHand: null, offHand: null, armour: null },
        armour: {},
        conditions: [],
        wounds: 12,
        maxWounds: 12,
        isDefeated: false,
        position: 2,
        movementUsed: 0,
        movementAllowance: 4,
        traits: [],
        ...actor,
      },
      {
        id: 'enemy_guard',
        name: 'Guard',
        type: 'enemy',
        attributes: { sila: 10, inteligencja: 8, charyzma: 6, zrecznosc: 8, wytrzymalosc: 10, szczescie: 0 },
        skills: {},
        inventory: [],
        weapons: ['Hand Weapon'],
        equipped: { mainHand: null, offHand: null, armour: null },
        armour: {},
        conditions: [],
        wounds: 10,
        maxWounds: 10,
        isDefeated: false,
        position: 3,
        movementUsed: 0,
        movementAllowance: 4,
        traits: [],
        ...target,
      },
    ],
  };
}

describe('createCombatState', () => {
  beforeEach(() => {
    vi.mocked(rollD50).mockReturnValue(25);
  });

  it('creates a combat state with player and enemies', () => {
    const player = {
      name: 'Hero',
      attributes: { sila: 12, zrecznosc: 10, wytrzymalosc: 10, szczescie: 5 },
      wounds: 12,
      maxWounds: 12,
      skills: {},
    };
    const enemies = [
      { name: 'Goblin', attributes: { sila: 6, zrecznosc: 8 }, wounds: 5, maxWounds: 5, skills: {} },
    ];

    const combat = createCombatState(player, enemies);

    expect(combat.active).toBe(true);
    expect(combat.round).toBe(1);
    expect(combat.combatants.length).toBe(2);
    expect(combat.combatants.some((c) => c.type === 'player')).toBe(true);
    expect(combat.combatants.some((c) => c.type === 'enemy')).toBe(true);
    expect(combat.log.length).toBeGreaterThan(0);
  });
});

describe('resolveManoeuvre — new combat system', () => {
  beforeEach(() => {
    vi.mocked(rollD50).mockReset();
  });

  it('resolves a hit when roll + attribute + skill exceeds threshold', () => {
    // d50=35, attr(sila)=12, skill=5 => total=52
    // threshold = medium(35) + defendBonus(0) + defenseAttr(zrecznosc=8) + defenseSkillLevel(0) = 43
    // margin = 52 - 43 = 9 => hit
    vi.mocked(rollD50).mockReturnValue(35);

    const combat = makeCombatState();
    const { result } = resolveManoeuvre(combat, 'player', 'attack', 'enemy_guard');

    expect(result.outcome).toBe('hit');
    expect(result.damage).toBeGreaterThanOrEqual(1);
    expect(result.rolls[0].success).toBe(true);
    expect(result.rolls[0].margin).toBe(9);
  });

  it('resolves a miss when roll + attribute + skill is below threshold', () => {
    vi.mocked(rollD50).mockReturnValue(10);

    const combat = makeCombatState();
    const { result } = resolveManoeuvre(combat, 'player', 'attack', 'enemy_guard');

    // total = 10 + 12 + 5 = 27 vs 48 => margin = -21 => miss
    expect(result.outcome).toBe('miss');
    expect(result.rolls[0].success).toBe(false);
  });

  it('adds creativity bonus from custom description', () => {
    vi.mocked(rollD50).mockReturnValue(30);

    const combat = makeCombatState();
    const customDescription = 'I leap from the table, twist past his shield, and drive low.';

    const { result } = resolveManoeuvre(combat, 'player', 'attack', 'enemy_guard', { customDescription });

    expect(result.customDescription).toBe(customDescription);
    expect(result.creativityBonus).toBeGreaterThan(0);
    expect(result.attackBreakdown.creativityBonus).toBeGreaterThan(0);
  });

  it('applies damage = weapon + marginBonus - DR (shield block possible)', () => {
    vi.mocked(rollD50).mockReturnValue(40);

    const combat = makeCombatState();
    const { result } = resolveManoeuvre(combat, 'player', 'attack', 'enemy_guard');

    expect(result.outcome).toBe('hit');
    expect(result.damageBreakdown).toBeDefined();
    expect(result.damageBreakdown.weaponDmg).toBeDefined();
    expect(result.damageBreakdown.dr).toBeDefined();
    expect(result.damageBreakdown.totalDamage).toBeGreaterThanOrEqual(1);
  });

  it('defender with defending condition raises effective threshold', () => {
    vi.mocked(rollD50).mockReturnValue(35);

    const combat = makeCombatState({
      target: { conditions: ['defending'] },
    });
    const { result } = resolveManoeuvre(combat, 'player', 'attack', 'enemy_guard');

    // threshold = 40 + 10 (defending) + 8 (defAttr) + 0 = 58
    // total = 35 + 12 + 5 = 52 => margin = -6 => miss
    expect(result.outcome).toBe('miss');
  });

  it('defeats target when wounds reach 0', () => {
    vi.mocked(rollD50).mockReturnValue(45);

    const combat = makeCombatState({
      target: { wounds: 1, maxWounds: 10 },
    });
    const { result, combat: updated } = resolveManoeuvre(combat, 'player', 'attack', 'enemy_guard');

    expect(result.outcome).toBe('hit');
    expect(result.targetDefeated).toBe(true);
    expect(updated.combatants[1].isDefeated).toBe(true);
  });

  it('handles defensive manoeuvres', () => {
    const combat = makeCombatState();
    const { result, combat: updated } = resolveManoeuvre(combat, 'player', 'defend', null);

    expect(result.outcome).toBe('defensive');
    expect(updated.combatants[0].conditions).toContain('defending');
  });

  it('returns out_of_range when target too far for melee', () => {
    const combat = makeCombatState({
      actor: { position: 0 },
      target: { position: 10 },
    });
    const { result } = resolveManoeuvre(combat, 'player', 'attack', 'enemy_guard');

    expect(result.outcome).toBe('out_of_range');
  });
});

describe('isCombatOver', () => {
  it('returns true when all enemies are defeated', () => {
    const combat = makeCombatState({
      target: { isDefeated: true },
    });
    expect(isCombatOver(combat)).toBe(true);
  });

  it('returns false when enemies remain', () => {
    const combat = makeCombatState();
    expect(isCombatOver(combat)).toBe(false);
  });

  it('returns true when player is defeated', () => {
    const combat = makeCombatState({
      actor: { isDefeated: true },
    });
    expect(isCombatOver(combat)).toBe(true);
  });
});

describe('endCombat', () => {
  it('returns combat summary with outcome, wounds, and stats (no direct xp field)', () => {
    const combat = makeCombatState({
      target: { isDefeated: true },
    });
    // Simulate player took 3 damage during combat
    combat.combatants[0].wounds = 9;

    const playerChar = { wounds: 12 };
    const summary = endCombat(combat, playerChar);

    expect(summary.woundsChange).toBe(-3);
    expect(summary.xp).toBeUndefined();
    expect(summary.outcome).toBe('victory');
    expect(summary.combatStats).toBeDefined();
    expect(summary.enemiesDefeated).toBe(1);
    expect(summary.playerSurvived).toBe(true);
  });

  it('reports player did not survive when defeated', () => {
    const combat = makeCombatState({
      actor: { isDefeated: true, wounds: 0 },
    });

    const playerChar = { wounds: 12 };
    const summary = endCombat(combat, playerChar);

    expect(summary.playerSurvived).toBe(false);
    expect(summary.woundsChange).toBe(-12);
  });
});

describe('distance and melee range', () => {
  it('calculates distance between combatants', () => {
    expect(getDistance({ position: 2 }, { position: 5 })).toBe(3);
    expect(getDistance({ position: 5 }, { position: 2 })).toBe(3);
  });

  it('detects melee range (distance <= 2)', () => {
    expect(isInMeleeRange({ position: 2 }, { position: 3 })).toBe(true);
    expect(isInMeleeRange({ position: 2 }, { position: 4 })).toBe(true);
    expect(isInMeleeRange({ position: 2 }, { position: 5 })).toBe(false);
  });
});

describe('turn management', () => {
  it('advances to next non-defeated combatant', () => {
    const combat = makeCombatState();
    const next = advanceTurn(combat);
    expect(next.turnIndex).toBe(1);
  });

  it('advances round when all combatants have acted', () => {
    const combat = makeCombatState();
    combat.turnIndex = 1;
    const next = advanceTurn(combat);
    expect(next.round).toBe(2);
    expect(next.turnIndex).toBe(0);
  });

  it('getCurrentTurnCombatant returns the active combatant', () => {
    const combat = makeCombatState();
    const current = getCurrentTurnCombatant(combat);
    expect(current.id).toBe('player');
  });
});
