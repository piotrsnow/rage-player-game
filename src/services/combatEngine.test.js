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
      charge: { name: 'Charge', type: 'offensive', range: 'charge', modifiers: {}, closesDistance: true },
      feint: { name: 'Feint', type: 'offensive', range: 'melee', modifiers: { feint: true }, closesDistance: false },
      flee: { name: 'Flee', type: 'utility', range: 'self', modifiers: { flee: true } },
      magic: { name: 'Magic', type: 'magic', range: 'ranged', modifiers: {} },
    },
    MELEE_RANGE: 1,
    BATTLEFIELD_WIDTH: 16,
    BATTLEFIELD_HEIGHT: 9,
    DEFAULT_MOVEMENT: 8,
    terrainSpawnConfig: { minCount: 0, maxCount: 0, spawnMarginCols: 1 },
    terrainTiles: {},
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
  canCharge,
  advanceTurn,
  advanceRound,
  getCurrentTurnCombatant,
  moveCombatant,
  resolveEnemyTurns,
  isCellOccupied,
  computeAttackPreview,
  getRemainingMovementPoints,
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
        position: { x: 2, y: 3 },
        movementUsed: 0,
        movementAllowance: 9,
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
        position: { x: 3, y: 3 },
        movementUsed: 0,
        movementAllowance: 8,
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

  it('creates beer duel skirmish metadata when mode is beer_duel', () => {
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

    const combat = createCombatState(player, enemies, [], {
      mode: 'beer_duel',
      modeConfig: { beerCountMin: 2, beerCountMax: 2 },
    });

    expect(combat.mode).toBe('beer_duel');
    expect(combat.skirmish).toBeTruthy();
    expect(combat.skirmish.beerTokens).toHaveLength(2);
    expect(combat.skirmish.beersRemaining).toBe(2);
    const playerCombatant = combat.combatants.find((c) => c.type === 'player');
    // Base allowance for zr=10 is max(6, floor(10/2)+4)=9; beer duel doubles for the player.
    expect(playerCombatant?.movementAllowance).toBe(18);
  });

  it('exposes remaining movement consistent with moveCombatant', () => {
    expect(getRemainingMovementPoints({
      movementAllowance: 10,
      movementUsed: 3,
      activeEffects: [],
    })).toBe(7);
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
      actor: { position: { x: 0, y: 0 } },
      target: { position: { x: 10, y: 0 } },
    });
    const { result } = resolveManoeuvre(combat, 'player', 'attack', 'enemy_guard');

    expect(result.outcome).toBe('out_of_range');
  });
});

describe('beer duel vomit', () => {
  it('crossing a vomit patch spends one slip charge and slides one tile for free', () => {
    const combat = {
      mode: 'beer_duel',
      active: true,
      round: 1,
      turnIndex: 0,
      log: [],
      terrainTiles: [],
      combatants: [
        {
          id: 'player',
          name: 'Hero',
          type: 'player',
          position: { x: 1, y: 4 },
          movementUsed: 0,
          movementAllowance: 10,
          beerDuelVomitSlipUses: 0,
          beerDuelVomitPlaceUses: 0,
          isDefeated: false,
          activeEffects: [],
          attributes: { zrecznosc: 10 },
          skills: {},
        },
        {
          id: 'e1',
          name: 'Gob',
          type: 'enemy',
          position: { x: 14, y: 4 },
          movementUsed: 0,
          movementAllowance: 8,
          isDefeated: false,
          activeEffects: [],
        },
      ],
      skirmish: {
        beerTokens: [],
        beersRemaining: 0,
        scoreByCombatantId: {},
        winnerIds: [],
        winnerScore: 0,
        isComplete: false,
        vomitPatches: [{ id: 'v1', x: 2, y: 4 }],
      },
    };
    const { combat: after, moved } = moveCombatant(combat, 'player', { x: 4, y: 4 });
    expect(moved).toBe(true);
    const p = after.combatants.find((c) => c.id === 'player');
    expect(p.position).toEqual({ x: 4, y: 4 });
    expect(p.movementUsed).toBe(1);
    expect(p.beerDuelVomitSlipUses).toBe(1);
  });

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

  it('returns beer duel tie metadata', () => {
    const combat = makeCombatState();
    combat.mode = 'beer_duel';
    combat.skirmish = {
      beerTokens: [],
      beersRemaining: 0,
      scoreByCombatantId: { player: 3, enemy_guard: 3 },
      winnerIds: ['player', 'enemy_guard'],
      winnerScore: 3,
      isComplete: true,
    };

    const summary = endCombat(combat, { wounds: 12 });
    expect(summary.mode).toBe('beer_duel');
    expect(summary.skirmishSummary?.isTie).toBe(true);
    expect(summary.skirmishSummary?.winnerIds).toEqual(['player', 'enemy_guard']);
    expect(summary.outcome).toBe('victory');
  });
});

describe('distance and melee range', () => {
  it('calculates Chebyshev distance between combatants', () => {
    expect(getDistance({ position: { x: 2, y: 3 } }, { position: { x: 3, y: 3 } })).toBe(1);
    expect(getDistance({ position: { x: 5, y: 1 } }, { position: { x: 2, y: 4 } })).toBe(3);
    expect(getDistance({ position: { x: 0, y: 0 } }, { position: { x: 3, y: 7 } })).toBe(7);
  });

  it('detects melee range (Chebyshev distance <= 1)', () => {
    expect(isInMeleeRange({ position: { x: 2, y: 2 } }, { position: { x: 3, y: 3 } })).toBe(true);
    expect(isInMeleeRange({ position: { x: 2, y: 2 } }, { position: { x: 3, y: 2 } })).toBe(true);
    expect(isInMeleeRange({ position: { x: 2, y: 2 } }, { position: { x: 2, y: 2 } })).toBe(true);
    expect(isInMeleeRange({ position: { x: 2, y: 2 } }, { position: { x: 4, y: 2 } })).toBe(false);
    expect(isInMeleeRange({ position: { x: 0, y: 0 } }, { position: { x: 2, y: 0 } })).toBe(false);
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

describe('canCharge', () => {
  it('allows charge on same row (horizontal)', () => {
    const actor = { id: 'a', position: { x: 1, y: 3 }, isDefeated: false };
    const target = { id: 'b', position: { x: 8, y: 3 }, isDefeated: false };
    expect(canCharge(actor, target, [actor, target])).toEqual({ valid: true });
  });

  it('allows charge on same column (vertical)', () => {
    const actor = { id: 'a', position: { x: 4, y: 0 }, isDefeated: false };
    const target = { id: 'b', position: { x: 4, y: 7 }, isDefeated: false };
    expect(canCharge(actor, target, [actor, target])).toEqual({ valid: true });
  });

  it('allows charge on exact diagonal', () => {
    const actor = { id: 'a', position: { x: 2, y: 2 }, isDefeated: false };
    const target = { id: 'b', position: { x: 5, y: 5 }, isDefeated: false };
    expect(canCharge(actor, target, [actor, target])).toEqual({ valid: true });
  });

  it('rejects charge on non-straight path', () => {
    const actor = { id: 'a', position: { x: 2, y: 2 }, isDefeated: false };
    const target = { id: 'b', position: { x: 5, y: 4 }, isDefeated: false };
    expect(canCharge(actor, target, [actor, target])).toEqual({ valid: false, reason: 'not_straight_line' });
  });

  it('rejects charge when a combatant blocks the path', () => {
    const actor = { id: 'a', position: { x: 1, y: 3 }, isDefeated: false };
    const blocker = { id: 'c', position: { x: 4, y: 3 }, isDefeated: false };
    const target = { id: 'b', position: { x: 8, y: 3 }, isDefeated: false };
    expect(canCharge(actor, target, [actor, blocker, target])).toEqual({ valid: false, reason: 'path_blocked' });
  });

  it('allows charge over defeated combatants', () => {
    const actor = { id: 'a', position: { x: 1, y: 3 }, isDefeated: false };
    const dead = { id: 'c', position: { x: 4, y: 3 }, isDefeated: true };
    const target = { id: 'b', position: { x: 8, y: 3 }, isDefeated: false };
    expect(canCharge(actor, target, [actor, dead, target])).toEqual({ valid: true });
  });
});

describe('resolveManoeuvre — charge validation', () => {
  beforeEach(() => {
    vi.mocked(rollD50).mockReset();
  });

  it('returns charge_blocked when target is not on a straight line', () => {
    const combat = makeCombatState({
      actor: { position: { x: 1, y: 1 } },
      target: { position: { x: 4, y: 3 } },
    });
    const { result } = resolveManoeuvre(combat, 'player', 'charge', 'enemy_guard');
    expect(result.outcome).toBe('charge_blocked');
    expect(result.reason).toBe('not_straight_line');
  });

  it('returns charge_blocked when path is blocked by another combatant', () => {
    const combat = makeCombatState({
      actor: { position: { x: 0, y: 3 } },
      target: { position: { x: 8, y: 3 } },
    });
    combat.combatants.push({
      id: 'blocker', name: 'Blocker', type: 'enemy',
      attributes: { sila: 10, zrecznosc: 8, wytrzymalosc: 10, szczescie: 0 },
      skills: {}, inventory: [], weapons: [], equipped: {}, armour: {},
      conditions: [], wounds: 10, maxWounds: 10, isDefeated: false,
      position: { x: 4, y: 3 }, movementUsed: 0, movementAllowance: 8, traits: [],
    });
    const { result } = resolveManoeuvre(combat, 'player', 'charge', 'enemy_guard');
    expect(result.outcome).toBe('charge_blocked');
    expect(result.reason).toBe('path_blocked');
  });

  it('allows charge on a clear straight line and resolves attack', () => {
    vi.mocked(rollD50).mockReturnValue(40);
    const combat = makeCombatState({
      actor: { position: { x: 0, y: 3 } },
      target: { position: { x: 8, y: 3 } },
    });
    const { result, combat: updated } = resolveManoeuvre(combat, 'player', 'charge', 'enemy_guard');
    expect(result.outcome).not.toBe('charge_blocked');
    const actor = updated.combatants.find(c => c.id === 'player');
    expect(actor.position.x).toBe(7);
    expect(actor.position.y).toBe(3);
  });
});

describe('moveCombatant — occupancy block', () => {
  it('blocks movement onto a cell occupied by a live combatant', () => {
    const combat = makeCombatState({
      actor: { position: { x: 2, y: 3 } },
      target: { position: { x: 3, y: 3 } },
    });
    const { moved } = moveCombatant(combat, 'player', { x: 3, y: 3 });
    expect(moved).toBe(false);
  });

  it('allows movement onto a cell occupied by a defeated combatant', () => {
    const combat = makeCombatState({
      actor: { position: { x: 2, y: 3 } },
      target: { position: { x: 3, y: 3 }, isDefeated: true },
    });
    const { moved } = moveCombatant(combat, 'player', { x: 3, y: 3 });
    expect(moved).toBe(true);
  });

  it('allows movement to an empty cell', () => {
    const combat = makeCombatState({
      actor: { position: { x: 2, y: 3 } },
      target: { position: { x: 8, y: 3 } },
    });
    const { moved, distance } = moveCombatant(combat, 'player', { x: 4, y: 4 });
    expect(moved).toBe(true);
    expect(distance).toBe(2);
  });
});

describe('isCellOccupied', () => {
  it('returns true for a live combatant cell', () => {
    const combatants = [
      { id: 'a', position: { x: 3, y: 3 }, isDefeated: false },
    ];
    expect(isCellOccupied(combatants, 3, 3)).toBe(true);
  });

  it('returns false when excludeId matches', () => {
    const combatants = [
      { id: 'a', position: { x: 3, y: 3 }, isDefeated: false },
    ];
    expect(isCellOccupied(combatants, 3, 3, 'a')).toBe(false);
  });
});

describe('resolveManoeuvre — extraOpts passthrough', () => {
  it('passes spellName from extraOpts to magic resolution', () => {
    vi.mocked(rollD50).mockReturnValue(10);
    const combat = makeCombatState({
      actor: {
        position: { x: 2, y: 3 },
        mana: { current: 10, max: 10 },
        spells: { known: ['Ognista kula'], usageCounts: {}, scrolls: [] },
      },
      target: { position: { x: 3, y: 3 } },
    });
    const { result } = resolveManoeuvre(combat, 'player', 'magic', 'enemy_guard', {
      spellName: 'Ognista kula',
    });
    expect(result.castBreakdown?.spellName).toBe('Ognista kula');
  });

  it('passes pushTarget from extraOpts to shove resolution', async () => {
    vi.mocked(rollD50).mockReturnValue(5);
    const combat = makeCombatState({
      actor: { position: { x: 2, y: 3 }, attributes: { sila: 20, zrecznosc: 10, wytrzymalosc: 10, szczescie: 0 } },
      target: { position: { x: 3, y: 3 } },
    });
    combat.combatants[0].skills = { 'Walka bronia jednoręczna': 10 };
    const { gameData: gd } = await import('./gameDataService.js');
    gd.manoeuvres.shove = { name: 'Shove', type: 'offensive', range: 'melee', modifiers: { shove: true }, closesDistance: false };
    try {
      const { result } = resolveManoeuvre(combat, 'player', 'shove', 'enemy_guard', {
        pushTarget: { x: 4, y: 3 },
      });
      expect(['shoved', 'shove_failed', 'shove_blocked']).toContain(result.outcome);
    } finally {
      delete gd.manoeuvres.shove;
    }
  });
});

describe('computeAttackPreview', () => {
  it('returns null for defensive manoeuvres', () => {
    const combat = makeCombatState();
    expect(computeAttackPreview(combat, 'player', 'defend', null)).toBeNull();
    expect(computeAttackPreview(combat, 'player', 'dodge', null)).toBeNull();
  });

  it('computes offensive preview with correct minRoll', () => {
    const combat = makeCombatState({
      actor: {
        attributes: { sila: 12, zrecznosc: 10, wytrzymalosc: 10, szczescie: 0 },
        skills: { 'Walka bronia jednoręczna': 5 },
        activeEffects: [],
        position: { x: 2, y: 3 },
      },
      target: {
        attributes: { sila: 10, zrecznosc: 8, wytrzymalosc: 10, szczescie: 0 },
        conditions: [],
        activeEffects: [],
        position: { x: 3, y: 3 },
      },
    });

    const preview = computeAttackPreview(combat, 'player', 'attack', 'enemy_guard');
    expect(preview).not.toBeNull();
    expect(preview.type).toBe('offensive');
    expect(preview.actor.attributeValue).toBe(12);
    expect(preview.actor.skillLevel).toBe(5);
    expect(preview.actor.luckChance).toBe(0);

    // threshold = medium(35) + defenseAttr(8) + defenseSkill(0) + defendBonus(0) = 43
    expect(preview.threshold.base).toBe(35);
    expect(preview.threshold.final).toBe(43);

    // totalBonus = sila(12) + skill(5) + effects(0) + creativity(0) + luck(0) = 17
    expect(preview.bonuses.total).toBe(17);

    // minRoll = max(1, 43 - 17) = 26
    expect(preview.minRoll).toBe(26);
    expect(preview.sureHit).toBe(false);
  });

  it('computes offensive preview with defending target', () => {
    const combat = makeCombatState({
      actor: {
        attributes: { sila: 12, zrecznosc: 10, wytrzymalosc: 10, szczescie: 0 },
        skills: { 'Walka bronia jednoręczna': 5 },
        activeEffects: [],
        position: { x: 2, y: 3 },
      },
      target: {
        attributes: { sila: 10, zrecznosc: 8, wytrzymalosc: 10, szczescie: 0 },
        conditions: ['defending'],
        activeEffects: [],
        position: { x: 3, y: 3 },
      },
    });

    const preview = computeAttackPreview(combat, 'player', 'attack', 'enemy_guard');
    // threshold = 35 + 8 + 0 + 10(defend) = 53
    expect(preview.threshold.final).toBe(53);
    expect(preview.target.defendBonus).toBe(10);
  });

  it('computes flee preview', () => {
    const combat = makeCombatState({
      actor: {
        attributes: { sila: 12, zrecznosc: 14, wytrzymalosc: 10, szczescie: 3 },
        skills: { Atletyka: 4 },
        activeEffects: [],
      },
    });

    const preview = computeAttackPreview(combat, 'player', 'flee', null);
    expect(preview).not.toBeNull();
    expect(preview.type).toBe('flee');
    // totalBonus = zrecznosc(14) + skill(4) + luck(3) = 21
    expect(preview.bonuses.total).toBe(21);
    // minRoll = max(1, 35 - 21) = 14
    expect(preview.minRoll).toBe(14);
    expect(preview.actor.luckChance).toBe(3);
  });

  it('computes magic preview', () => {
    const combat = makeCombatState({
      actor: {
        attributes: { sila: 10, inteligencja: 16, zrecznosc: 10, wytrzymalosc: 10, szczescie: 0 },
        activeEffects: [],
      },
    });

    const preview = computeAttackPreview(combat, 'player', 'magic', 'enemy_guard');
    expect(preview).not.toBeNull();
    expect(preview.type).toBe('magic');
    expect(preview.actor.attributeValue).toBe(16);
    // totalBonus = inteligencja(16) + luck(0) = 16
    expect(preview.bonuses.total).toBe(16);
    // minRoll = max(1, 35 - 16) = 19
    expect(preview.minRoll).toBe(19);
  });

  it('marks sureHit when on sureHit terrain tile', () => {
    const combat = makeCombatState({
      actor: {
        attributes: { sila: 12, zrecznosc: 10, wytrzymalosc: 10, szczescie: 0 },
        skills: { 'Walka bronia jednoręczna': 5 },
        activeEffects: [],
        position: { x: 2, y: 3 },
      },
      target: {
        attributes: { sila: 10, zrecznosc: 8, wytrzymalosc: 10, szczescie: 0 },
        conditions: [],
        activeEffects: [],
        position: { x: 3, y: 3 },
      },
    });
    combat.terrainTiles = [{ x: 2, y: 3, type: 'sureHit', consumed: false }];

    const preview = computeAttackPreview(combat, 'player', 'attack', 'enemy_guard');
    expect(preview.sureHit).toBe(true);
    expect(preview.minRoll).toBe(0);
    expect(preview.terrainTile).toBe('sureHit');
  });

  it('includes luck in bonuses when szczescie > 0', () => {
    const combat = makeCombatState({
      actor: {
        attributes: { sila: 12, zrecznosc: 10, wytrzymalosc: 10, szczescie: 7 },
        skills: { 'Walka bronia jednoręczna': 5 },
        activeEffects: [],
        position: { x: 2, y: 3 },
      },
      target: {
        attributes: { sila: 10, zrecznosc: 8, wytrzymalosc: 10, szczescie: 0 },
        conditions: [],
        activeEffects: [],
        position: { x: 3, y: 3 },
      },
    });

    const preview = computeAttackPreview(combat, 'player', 'attack', 'enemy_guard');
    // totalBonus = sila(12) + skill(5) + luck(7) = 24
    expect(preview.bonuses.total).toBe(24);
    expect(preview.actor.luckChance).toBe(7);
    // minRoll = max(1, 43 - 24) = 19
    expect(preview.minRoll).toBe(19);
  });

  it('computes shove preview', async () => {
    const { gameData: gd } = await import('./gameDataService.js');
    gd.manoeuvres.shove = { name: 'Shove', type: 'offensive', range: 'melee', modifiers: { shove: true }, closesDistance: false };
    try {
      const combat = makeCombatState({
        actor: {
          attributes: { sila: 15, zrecznosc: 10, wytrzymalosc: 10, szczescie: 0 },
          skills: { 'Walka bronia jednoręczna': 5 },
          activeEffects: [],
          position: { x: 2, y: 3 },
        },
        target: {
          attributes: { sila: 10, zrecznosc: 8, wytrzymalosc: 12, szczescie: 0 },
          conditions: [],
          activeEffects: [],
          position: { x: 3, y: 3 },
        },
      });

      const preview = computeAttackPreview(combat, 'player', 'shove', 'enemy_guard');
      expect(preview).not.toBeNull();
      expect(preview.type).toBe('shove');
      // threshold = easy(20) + target wytrzymalosc(12) = 32
      expect(preview.threshold.base).toBe(20);
      expect(preview.threshold.final).toBe(32);
      // totalBonus = sila(15) + skill(5) = 20
      expect(preview.bonuses.total).toBe(20);
      // minRoll = max(1, 32 - 20) = 12
      expect(preview.minRoll).toBe(12);
    } finally {
      delete gd.manoeuvres.shove;
    }
  });
});
