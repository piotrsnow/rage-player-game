/**
 * Single source of truth for combat test fixtures.
 * Used by hook tests and (eventually) e2e seed helpers.
 */

function makeCombatant(overrides = {}) {
  return {
    id: overrides.id || 'combatant',
    name: overrides.name || 'Combatant',
    type: overrides.type || 'player',
    attributes: {
      sila: 12,
      inteligencja: 10,
      charyzma: 8,
      zrecznosc: 10,
      wytrzymalosc: 10,
      szczescie: 0,
      ...(overrides.attributes || {}),
    },
    skills: overrides.skills || {},
    inventory: overrides.inventory || [],
    weapons: overrides.weapons || ['Hand Weapon'],
    equipped: overrides.equipped || { mainHand: null, offHand: null, armour: null },
    armour: overrides.armour || {},
    conditions: overrides.conditions || [],
    wounds: overrides.wounds ?? 12,
    maxWounds: overrides.maxWounds ?? 12,
    isDefeated: overrides.isDefeated ?? false,
    position: overrides.position ?? 2,
    movementUsed: overrides.movementUsed ?? 0,
    movementAllowance: overrides.movementAllowance ?? 4,
    traits: overrides.traits || [],
    ...overrides,
  };
}

export function buildCombatState(overrides = {}) {
  const defaults = {
    active: true,
    round: 1,
    turnIndex: 0,
    log: [],
    combatants: [
      makeCombatant({ id: 'player', name: 'Hero', type: 'player' }),
      makeCombatant({
        id: 'enemy_guard',
        name: 'Guard',
        type: 'enemy',
        attributes: { sila: 10, inteligencja: 8, charyzma: 6, zrecznosc: 8, wytrzymalosc: 10, szczescie: 0 },
        wounds: 10,
        maxWounds: 10,
        position: 3,
      }),
    ],
  };

  if (overrides.combatants) {
    return { ...defaults, ...overrides };
  }

  const { player, enemies, ...rest } = overrides;
  const combatants = [];
  combatants.push(makeCombatant({ id: 'player', name: 'Hero', type: 'player', ...(player || {}) }));
  if (Array.isArray(enemies)) {
    enemies.forEach((e, i) =>
      combatants.push(
        makeCombatant({
          id: e.id || `enemy_${i}`,
          name: e.name || `Enemy ${i + 1}`,
          type: 'enemy',
          attributes: { sila: 10, inteligencja: 8, charyzma: 6, zrecznosc: 8, wytrzymalosc: 10, szczescie: 0 },
          wounds: 10,
          maxWounds: 10,
          position: 3 + i,
          ...e,
        })
      )
    );
  } else {
    combatants.push(
      makeCombatant({
        id: 'enemy_guard',
        name: 'Guard',
        type: 'enemy',
        attributes: { sila: 10, inteligencja: 8, charyzma: 6, zrecznosc: 8, wytrzymalosc: 10, szczescie: 0 },
        wounds: 10,
        maxWounds: 10,
        position: 3,
      })
    );
  }

  return { ...defaults, ...rest, combatants };
}

export function buildCombatSummary(overrides = {}) {
  return {
    outcome: 'victory',
    playerSurvived: true,
    enemiesDefeated: 1,
    totalEnemies: 1,
    rounds: 3,
    woundsChange: -2,
    skillProgress: null,
    combatStats: { hits: 3, misses: 1 },
    flawless: false,
    remainingEnemies: [],
    perCharacter: {},
    reason: null,
    ...overrides,
  };
}
