import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildCombatResolutionHandlers, soloPerCharForServer } from './useCombatResolution.js';
import { buildCombatSummary } from '../test-fixtures/combatState.js';

function makeDeps(overrides = {}) {
  const dispatch = vi.fn();
  const autoSave = vi.fn();
  const narratorStop = vi.fn();
  const generateScene = vi.fn(() => Promise.resolve());
  const mpEnd = vi.fn();
  const mpSoloAction = vi.fn();
  const t = (key, fallback, vars) => {
    if (typeof fallback === 'string' && vars) {
      return fallback.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '');
    }
    return fallback || key;
  };
  return {
    isMultiplayer: false,
    dispatch,
    autoSave,
    narrator: { stop: narratorStop },
    generateScene,
    mp: { endMultiplayerCombat: mpEnd, soloAction: mpSoloAction },
    settings: { language: 'pl', dmSettings: {} },
    t,
    _spies: { dispatch, autoSave, narratorStop, generateScene, mpEnd, mpSoloAction },
    ...overrides,
  };
}

function dispatchedType(dispatch, type) {
  return dispatch.mock.calls.map((c) => c[0]).filter((a) => a.type === type);
}

describe('soloPerCharForServer', () => {
  it('normalizes sparse per-character data with safe defaults', () => {
    const result = soloPerCharForServer({
      Hero: { wounds: 5, xp: 200 },
      Ally: { manaChange: -2 },
    });
    expect(result).toEqual({
      Hero: { wounds: 5, xp: 200, manaChange: 0 },
      Ally: { wounds: 0, xp: 0, manaChange: -2 },
    });
  });

  it('returns empty object for null/undefined input', () => {
    expect(soloPerCharForServer(null)).toEqual({});
    expect(soloPerCharForServer(undefined)).toEqual({});
  });
});

describe('buildCombatResolutionHandlers — solo victory flow', () => {
  let deps;
  let handlers;

  beforeEach(() => {
    deps = makeDeps();
    handlers = buildCombatResolutionHandlers(deps);
  });

  it('dispatches END_COMBAT, journal entry without forceStatus, chat message, then generates scene', () => {
    const summary = buildCombatSummary({ playerSurvived: true, enemiesDefeated: 3, totalEnemies: 3, rounds: 4, woundsChange: -5 });
    handlers.onEndCombat(summary);

    expect(dispatchedType(deps._spies.dispatch, 'END_COMBAT')).toHaveLength(1);

    const applyCalls = dispatchedType(deps._spies.dispatch, 'APPLY_STATE_CHANGES');
    expect(applyCalls).toHaveLength(1);
    expect(applyCalls[0].payload.journalEntries[0]).toContain('Victory');
    expect(applyCalls[0].payload.journalEntries[0]).toContain('3/3 enemies');
    expect(applyCalls[0].payload.journalEntries[0]).toContain('4 rounds');
    expect(applyCalls[0].payload.forceStatus).toBeUndefined();

    const chatCalls = dispatchedType(deps._spies.dispatch, 'ADD_CHAT_MESSAGE');
    expect(chatCalls).toHaveLength(1);
    expect(chatCalls[0].payload.subtype).toBe('combat_end');

    expect(deps._spies.autoSave).toHaveBeenCalledTimes(1);
    expect(deps._spies.generateScene).toHaveBeenCalledTimes(1);
    const [actionText, , , , opts] = deps._spies.generateScene.mock.calls[0];
    expect(actionText).toContain('defeated 3/3 enemies');
    expect(opts.combatResult.outcome).toBe('victory');
    expect(deps._spies.narratorStop).not.toHaveBeenCalled();
  });

  it('sets forceStatus=dead, stops narrator and does NOT call generateScene on defeat', () => {
    const summary = buildCombatSummary({ playerSurvived: false, enemiesDefeated: 1, totalEnemies: 3, rounds: 5 });
    handlers.onEndCombat(summary);

    const applyCalls = dispatchedType(deps._spies.dispatch, 'APPLY_STATE_CHANGES');
    expect(applyCalls[0].payload.forceStatus).toBe('dead');
    expect(applyCalls[0].payload.journalEntries[0]).toContain('Defeat');

    const chatCalls = dispatchedType(deps._spies.dispatch, 'ADD_CHAT_MESSAGE');
    expect(chatCalls[0].payload.subtype).toBe('combat_death');

    expect(deps._spies.generateScene).not.toHaveBeenCalled();
    expect(deps._spies.narratorStop).toHaveBeenCalledTimes(1);
  });

  it('omits wound mention in journal when woundsChange is 0 and victorious', () => {
    const summary = buildCombatSummary({ playerSurvived: true, woundsChange: 0, enemiesDefeated: 2, totalEnemies: 2 });
    handlers.onEndCombat(summary);

    const applyCalls = dispatchedType(deps._spies.dispatch, 'APPLY_STATE_CHANGES');
    expect(applyCalls[0].payload.journalEntries[0]).not.toContain('wounds');

    const [actionText] = deps._spies.generateScene.mock.calls[0];
    expect(actionText).toContain('Unscathed');
  });
});

describe('buildCombatResolutionHandlers — solo surrender flow', () => {
  it('dispatches surrender journal + chat, passes surrender outcome to generateScene', () => {
    const deps = makeDeps();
    const handlers = buildCombatResolutionHandlers(deps);
    const summary = buildCombatSummary({
      enemiesDefeated: 1,
      totalEnemies: 3,
      rounds: 2,
      remainingEnemies: [
        { name: 'Brigand', wounds: 6, maxWounds: 8 },
        { name: 'Captain', wounds: 10, maxWounds: 10 },
      ],
      reason: 'outnumbered',
    });

    handlers.onSurrender(summary);

    const applyCalls = dispatchedType(deps._spies.dispatch, 'APPLY_STATE_CHANGES');
    expect(applyCalls[0].payload.journalEntries[0]).toContain('Surrender');
    expect(applyCalls[0].payload.journalEntries[0]).toContain('Brigand (6/8 HP)');
    expect(applyCalls[0].payload.forceStatus).toBeUndefined();

    const chatCalls = dispatchedType(deps._spies.dispatch, 'ADD_CHAT_MESSAGE');
    expect(chatCalls[0].payload.subtype).toBe('combat_end');

    const [actionText, , , , opts] = deps._spies.generateScene.mock.calls[0];
    expect(actionText).toContain('player surrendered');
    expect(actionText).toContain('Reason for combat: outnumbered');
    expect(opts.combatResult.outcome).toBe('surrender');
  });
});

describe('buildCombatResolutionHandlers — solo truce flow', () => {
  it('dispatches truce journal + chat, passes truce outcome to generateScene', () => {
    const deps = makeDeps();
    const handlers = buildCombatResolutionHandlers(deps);
    const summary = buildCombatSummary({
      enemiesDefeated: 2,
      totalEnemies: 3,
      rounds: 4,
      remainingEnemies: [{ name: 'Wounded Cultist', wounds: 3, maxWounds: 10 }],
      reason: 'ritual disruption',
    });

    handlers.onForceTruce(summary);

    const applyCalls = dispatchedType(deps._spies.dispatch, 'APPLY_STATE_CHANGES');
    expect(applyCalls[0].payload.journalEntries[0]).toContain('Truce');

    const [actionText, , , , opts] = deps._spies.generateScene.mock.calls[0];
    expect(actionText).toContain('player forced a truce');
    expect(actionText).toContain('upper hand');
    expect(opts.combatResult.outcome).toBe('truce');
  });
});

describe('buildCombatResolutionHandlers — multiplayer victory flow', () => {
  it('routes through mp.endMultiplayerCombat + mp.soloAction when every party member survived', () => {
    const deps = makeDeps({ isMultiplayer: true });
    const handlers = buildCombatResolutionHandlers(deps);
    const summary = buildCombatSummary({
      perCharacter: {
        Hero: { wounds: 3, xp: 150, manaChange: 0, survived: true },
        Ally: { wounds: 0, xp: 50, manaChange: -2, survived: true },
      },
      enemiesDefeated: 2,
      totalEnemies: 2,
      rounds: 3,
    });

    handlers.onEndCombat(summary);

    expect(deps._spies.dispatch).not.toHaveBeenCalled();
    expect(deps._spies.mpEnd).toHaveBeenCalledTimes(1);
    const payload = deps._spies.mpEnd.mock.calls[0][0];
    expect(payload.outcome).toBe('victory');
    expect(payload.perCharacter.Hero.wounds).toBe(3);
    expect(payload.perCharacter.Ally.manaChange).toBe(-2);
    expect(payload.journalEntry).toContain('Victory');

    expect(deps._spies.mpSoloAction).toHaveBeenCalledTimes(1);
    const [actionText, autoMode, language, dmSettings] = deps._spies.mpSoloAction.mock.calls[0];
    expect(actionText).toContain('party defeated 2/2 enemies');
    expect(autoMode).toBe(false);
    expect(language).toBe('pl');
    expect(dmSettings).toEqual({});
  });

  it('routes through defeat aftermath prompt when any party member fell', () => {
    const deps = makeDeps({ isMultiplayer: true });
    const handlers = buildCombatResolutionHandlers(deps);
    const summary = buildCombatSummary({
      perCharacter: {
        Hero: { wounds: 0, survived: false },
        Ally: { wounds: 2, survived: true },
      },
      enemiesDefeated: 1,
      totalEnemies: 4,
      rounds: 5,
    });

    handlers.onEndCombat(summary);

    const payload = deps._spies.mpEnd.mock.calls[0][0];
    expect(payload.outcome).toBe('defeat');
    expect(payload.journalEntry).toContain('Defeat');

    const [actionText] = deps._spies.mpSoloAction.mock.calls[0];
    expect(actionText).toContain('LOST the fight');
    expect(actionText).toContain('NEVER describe this as a victory');
  });
});

describe('buildCombatResolutionHandlers — handler picker', () => {
  it('returns solo handlers when isMultiplayer=false', () => {
    const deps = makeDeps({ isMultiplayer: false });
    const handlers = buildCombatResolutionHandlers(deps);
    handlers.onEndCombat(buildCombatSummary());
    expect(deps._spies.dispatch).toHaveBeenCalled();
    expect(deps._spies.mpEnd).not.toHaveBeenCalled();
  });

  it('returns MP handlers when isMultiplayer=true', () => {
    const deps = makeDeps({ isMultiplayer: true });
    const handlers = buildCombatResolutionHandlers(deps);
    handlers.onEndCombat(buildCombatSummary({ perCharacter: { Hero: { survived: true } } }));
    expect(deps._spies.dispatch).not.toHaveBeenCalled();
    expect(deps._spies.mpEnd).toHaveBeenCalled();
  });
});
