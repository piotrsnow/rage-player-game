import { useCallback } from 'react';
import { gameData } from '../services/gameDataService';
import {
  resolveManoeuvre,
  advanceTurn,
} from '../services/combatEngine';

const CHARGE_SLIDE_MS = 500;

function normalizePos(p) {
  if (p && typeof p === 'object' && 'x' in p) return p;
  if (typeof p === 'number') return { x: p, y: 4 };
  return { x: 0, y: 0 };
}

function snapshotPositions(combatants) {
  const map = {};
  for (const c of combatants) map[c.id] = normalizePos(c.position);
  return map;
}

function diffPositionAnims(combatants, positionsBefore, durationMs) {
  const anims = {};
  for (const c of combatants) {
    const after = normalizePos(c.position);
    const before = positionsBefore[c.id];
    if (before && (before.x !== after.x || before.y !== after.y)) {
      anims[c.id] = { durationMs };
    }
  }
  return anims;
}

function isCustomAttackManoeuvre(key) {
  return Boolean(key && gameData.manoeuvres[key]?.type === 'offensive');
}

/**
 * Pure-factory executor for manoeuvre resolution.
 * Extracted from CombatPanel so execution logic can be tested independently.
 */
export function buildManoeuvreExecutor({
  combat,
  isMultiplayer,
  isHost,
  myPlayerId,
  dispatch,
  onHostResolve,
  onSendManoeuvre,
  dispatchCombatChatMessage,
  addResultToLog,
  persistCustomAttack,
  triggerActionAnim,
  triggerProjectileAnim,
  scheduleTokenAnim,
  flushRoundEffectEvents,
  setActionAnim,
}) {
  function finalizeResult(updatedCombat, result) {
    dispatchCombatChatMessage(result);
    addResultToLog(result);
    const allResults = result ? [result] : [];
    const finalCombat = advanceTurn(updatedCombat);
    flushRoundEffectEvents(finalCombat);

    if (isMultiplayer) {
      finalCombat.lastResults = allResults;
      finalCombat.lastResultsTs = Date.now();
      onHostResolve?.(finalCombat);
    } else {
      dispatch({ type: 'UPDATE_COMBAT', payload: finalCombat });
    }
  }

  async function executeManoeuvre(manoeuvreKey, targetId, customDesc, extraOpts = {}) {
    if (!manoeuvreKey) return;

    if (isCustomAttackManoeuvre(manoeuvreKey) && customDesc) {
      persistCustomAttack(customDesc);
    }

    if (isMultiplayer && !isHost) {
      onSendManoeuvre?.(manoeuvreKey, targetId, customDesc, extraOpts);
      return;
    }

    const actorId = isMultiplayer ? myPlayerId : 'player';
    const isCharge = gameData.manoeuvres[manoeuvreKey]?.closesDistance;
    const positionsBefore = snapshotPositions(combat.combatants);

    if (isCharge) {
      const { combat: updatedCombat, result } = resolveManoeuvre(
        combat, actorId, manoeuvreKey, targetId, { customDescription: customDesc, ...extraOpts },
      );

      const slideState = {
        ...combat,
        combatants: combat.combatants.map((c) => {
          const updated = updatedCombat.combatants.find((u) => u.id === c.id);
          return updated ? { ...c, position: updated.position } : c;
        }),
      };

      const anims = diffPositionAnims(updatedCombat.combatants, positionsBefore, CHARGE_SLIDE_MS);
      if (Object.keys(anims).length) scheduleTokenAnim(anims);

      dispatch({ type: 'UPDATE_COMBAT', payload: slideState });
      await new Promise((r) => setTimeout(r, CHARGE_SLIDE_MS + 50));

      await triggerActionAnim(actorId, targetId || null);
      setActionAnim(null);
      finalizeResult(updatedCombat, result);
      return;
    }

    const isRanged = gameData.manoeuvres[manoeuvreKey]?.range === 'ranged';

    if (isRanged && targetId) {
      const { combat: updatedCombat, result } = resolveManoeuvre(
        combat, actorId, manoeuvreKey, targetId, { customDescription: customDesc, ...extraOpts },
      );
      const hit = result?.outcome === 'hit';
      await triggerProjectileAnim(actorId, targetId, hit);

      const anims = diffPositionAnims(updatedCombat.combatants, positionsBefore, 1000);
      if (Object.keys(anims).length) scheduleTokenAnim(anims);
      finalizeResult(updatedCombat, result);
      return;
    }

    const isShove = gameData.manoeuvres[manoeuvreKey]?.modifiers?.shove;
    await triggerActionAnim(actorId, targetId || null, isShove ? 'shove' : undefined);
    setActionAnim(null);

    const { combat: updatedCombat, result } = resolveManoeuvre(
      combat, actorId, manoeuvreKey, targetId, { customDescription: customDesc, ...extraOpts },
    );

    const anims = diffPositionAnims(updatedCombat.combatants, positionsBefore, 1000);
    if (Object.keys(anims).length) scheduleTokenAnim(anims);
    finalizeResult(updatedCombat, result);
  }

  return { executeManoeuvre };
}

/**
 * React hook wrapper — thin facade over buildManoeuvreExecutor.
 * Guards on isMyTurn / actionAnim / projectileAnim before delegating.
 */
export function useCombatExecution({
  combat, isMyTurn, actionAnim, projectileAnim,
  isMultiplayer, isHost, myPlayerId,
  dispatch, onHostResolve, onSendManoeuvre,
  dispatchCombatChatMessage, addResultToLog,
  persistCustomAttack, triggerActionAnim, triggerProjectileAnim,
  scheduleTokenAnim, flushRoundEffectEvents, setActionAnim,
}) {
  const handleExecuteManoeuvre = useCallback(async (manoeuvreKey, targetId, customDesc, extraOpts = {}) => {
    if (!isMyTurn || actionAnim || projectileAnim) return;

    const executor = buildManoeuvreExecutor({
      combat, isMultiplayer, isHost, myPlayerId,
      dispatch, onHostResolve, onSendManoeuvre,
      dispatchCombatChatMessage, addResultToLog,
      persistCustomAttack, triggerActionAnim, triggerProjectileAnim,
      scheduleTokenAnim, flushRoundEffectEvents, setActionAnim,
    });
    await executor.executeManoeuvre(manoeuvreKey, targetId, customDesc, extraOpts);
  }, [
    isMyTurn, actionAnim, projectileAnim,
    combat, isMultiplayer, isHost, myPlayerId,
    dispatch, onHostResolve, onSendManoeuvre,
    dispatchCombatChatMessage, addResultToLog,
    persistCustomAttack, triggerActionAnim, triggerProjectileAnim,
    scheduleTokenAnim, flushRoundEffectEvents, setActionAnim,
  ]);

  return { handleExecuteManoeuvre };
}
