import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../services/combatEngine', () => ({
  getCurrentTurnCombatant: vi.fn(),
  resolveEnemyTurns: vi.fn(),
}));

import { getCurrentTurnCombatant, resolveEnemyTurns } from '../services/combatEngine';
import { resolveEnemyTurnStep, shouldScheduleEnemyTurn, AI_TURN_DELAY_MS } from './useEnemyTurnResolver.js';
import { buildCombatState } from '../test-fixtures/combatState.js';

function makeStepDeps(overrides = {}) {
  return {
    dispatch: vi.fn(),
    onHostResolve: vi.fn(),
    addResultToLog: vi.fn(),
    dispatchCombatChatMessage: vi.fn(),
    setIsAwaitingAiTurn: vi.fn(),
    now: () => 1_700_000_000_000,
    ...overrides,
  };
}

describe('AI_TURN_DELAY_MS', () => {
  it('stays at 2500ms so tests pin the contract', () => {
    expect(AI_TURN_DELAY_MS).toBe(2500);
  });
});

describe('shouldScheduleEnemyTurn', () => {
  beforeEach(() => {
    vi.mocked(getCurrentTurnCombatant).mockReset();
  });

  it('returns false when combat is over', () => {
    vi.mocked(getCurrentTurnCombatant).mockReturnValue({ type: 'enemy' });
    expect(
      shouldScheduleEnemyTurn({
        combat: buildCombatState(),
        combatOver: true,
        isMultiplayer: false,
        isHost: false,
      })
    ).toBe(false);
  });

  it('returns false for non-host client in multiplayer', () => {
    vi.mocked(getCurrentTurnCombatant).mockReturnValue({ type: 'enemy' });
    expect(
      shouldScheduleEnemyTurn({
        combat: buildCombatState(),
        combatOver: false,
        isMultiplayer: true,
        isHost: false,
      })
    ).toBe(false);
  });

  it('returns true for multiplayer host when current combatant is enemy', () => {
    vi.mocked(getCurrentTurnCombatant).mockReturnValue({ type: 'enemy', id: 'enemy_guard' });
    expect(
      shouldScheduleEnemyTurn({
        combat: buildCombatState(),
        combatOver: false,
        isMultiplayer: true,
        isHost: true,
      })
    ).toBe(true);
  });

  it('returns false when current combatant is player', () => {
    vi.mocked(getCurrentTurnCombatant).mockReturnValue({ type: 'player', id: 'player' });
    expect(
      shouldScheduleEnemyTurn({
        combat: buildCombatState(),
        combatOver: false,
        isMultiplayer: false,
        isHost: false,
      })
    ).toBe(false);
  });

  it('returns false when getCurrentTurnCombatant returns null', () => {
    vi.mocked(getCurrentTurnCombatant).mockReturnValue(null);
    expect(
      shouldScheduleEnemyTurn({
        combat: buildCombatState(),
        combatOver: false,
        isMultiplayer: false,
        isHost: false,
      })
    ).toBe(false);
  });

  it('returns true in solo mode when current combatant is enemy', () => {
    vi.mocked(getCurrentTurnCombatant).mockReturnValue({ type: 'enemy' });
    expect(
      shouldScheduleEnemyTurn({
        combat: buildCombatState(),
        combatOver: false,
        isMultiplayer: false,
        isHost: false,
      })
    ).toBe(true);
  });
});

describe('resolveEnemyTurnStep — solo mode', () => {
  beforeEach(() => {
    vi.mocked(resolveEnemyTurns).mockReset();
  });

  it('clears awaiting flag, dispatches chat for each result, logs all, then UPDATE_COMBAT', () => {
    const results = [
      { actor: 'enemy_guard', outcome: 'hit', damage: 3 },
      { actor: 'enemy_guard', outcome: 'miss' },
    ];
    const afterEnemies = { ...buildCombatState(), turnIndex: 0, round: 2 };
    vi.mocked(resolveEnemyTurns).mockReturnValue({ combat: afterEnemies, results });

    const deps = makeStepDeps();
    const ret = resolveEnemyTurnStep({
      combat: buildCombatState(),
      isMultiplayer: false,
      ...deps,
    });

    expect(deps.setIsAwaitingAiTurn).toHaveBeenCalledWith(false);
    expect(deps.dispatchCombatChatMessage).toHaveBeenCalledTimes(2);
    expect(deps.addResultToLog).toHaveBeenCalledTimes(2);
    expect(deps.dispatch).toHaveBeenCalledTimes(1);
    expect(deps.dispatch).toHaveBeenCalledWith({ type: 'UPDATE_COMBAT', payload: afterEnemies });
    expect(deps.onHostResolve).not.toHaveBeenCalled();
    expect(ret.afterEnemies).toBe(afterEnemies);
    expect(ret.enemyResults).toBe(results);
  });
});

describe('resolveEnemyTurnStep — multiplayer host mode', () => {
  beforeEach(() => {
    vi.mocked(resolveEnemyTurns).mockReset();
  });

  it('writes lastResults+lastResultsTs onto afterEnemies, forwards via onHostResolve, skips dispatch+chat', () => {
    const results = [{ actor: 'enemy_guard', outcome: 'hit', damage: 3 }];
    const afterEnemies = { ...buildCombatState(), turnIndex: 0, round: 2 };
    vi.mocked(resolveEnemyTurns).mockReturnValue({ combat: afterEnemies, results });

    const deps = makeStepDeps({ now: () => 42 });
    resolveEnemyTurnStep({
      combat: buildCombatState(),
      isMultiplayer: true,
      ...deps,
    });

    expect(afterEnemies.lastResults).toBe(results);
    expect(afterEnemies.lastResultsTs).toBe(42);
    expect(deps.onHostResolve).toHaveBeenCalledWith(afterEnemies);
    expect(deps.dispatch).not.toHaveBeenCalled();
    expect(deps.dispatchCombatChatMessage).not.toHaveBeenCalled();
    expect(deps.addResultToLog).toHaveBeenCalledTimes(1);
  });
});
