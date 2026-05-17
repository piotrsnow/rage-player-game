import { useCallback } from 'react';
import { gameData } from '../services/gameDataService';
import {
  resolveManoeuvre,
  advanceTurn,
} from '../services/combatEngine';
import { getCombatMoveDurationMs } from '../services/combatAnimationTiming';
import { SPELL_VFX_COUNT } from '../components/gameplay/combat/combatCanvasDraw';

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

function diffPositionAnims(combatants, positionsBefore) {
  const anims = {};
  let maxDurationMs = 0;
  for (const c of combatants) {
    const after = normalizePos(c.position);
    const before = positionsBefore[c.id];
    if (before && (before.x !== after.x || before.y !== after.y)) {
      const distance = Math.max(Math.abs(after.x - before.x), Math.abs(after.y - before.y));
      const durationMs = getCombatMoveDurationMs(distance);
      anims[c.id] = { durationMs };
      maxDurationMs = Math.max(maxDurationMs, durationMs);
    }
  }
  return { anims, maxDurationMs };
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
  campaignTier,
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

    return result;
  }

  async function executeManoeuvre(manoeuvreKey, targetId, customDesc, extraOpts = {}) {
    if (!manoeuvreKey) return;

    if (isCustomAttackManoeuvre(manoeuvreKey) && customDesc) {
      persistCustomAttack(customDesc);
    }

    if (isMultiplayer && !isHost) {
      onSendManoeuvre?.(manoeuvreKey, targetId, customDesc, extraOpts);
      return null;
    }

    const actorId = isMultiplayer ? myPlayerId : 'player';
    const isCharge = gameData.manoeuvres[manoeuvreKey]?.closesDistance;
    const positionsBefore = snapshotPositions(combat.combatants);

    if (isCharge) {
      const { combat: updatedCombat, result } = resolveManoeuvre(
        combat, actorId, manoeuvreKey, targetId, { customDescription: customDesc, campaignTier, ...extraOpts },
      );

      const slideState = {
        ...combat,
        combatants: combat.combatants.map((c) => {
          const updated = updatedCombat.combatants.find((u) => u.id === c.id);
          return updated ? { ...c, position: updated.position } : c;
        }),
      };

      const { anims, maxDurationMs } = diffPositionAnims(updatedCombat.combatants, positionsBefore);
      if (Object.keys(anims).length) scheduleTokenAnim(anims);

      dispatch({ type: 'UPDATE_COMBAT', payload: slideState });
      await new Promise((r) => setTimeout(r, maxDurationMs + 50));

      await triggerActionAnim(actorId, targetId || null);
      setActionAnim(null);
      return finalizeResult(updatedCombat, result);
    }

    const isRanged = gameData.manoeuvres[manoeuvreKey]?.range === 'ranged';

    if (isRanged && targetId) {
      const { combat: updatedCombat, result } = resolveManoeuvre(
        combat, actorId, manoeuvreKey, targetId, { customDescription: customDesc, campaignTier, ...extraOpts },
      );
      const hit = result?.outcome === 'hit';
      const isSpell = manoeuvreKey === 'castSpell';
      const spellVfxVariant = isSpell
        ? Math.floor(Math.random() * SPELL_VFX_COUNT)
        : undefined;
      if (result && spellVfxVariant != null) result.spellVfxVariant = spellVfxVariant;
      const spellName = isSpell ? (extraOpts.spellName || null) : undefined;
      await triggerProjectileAnim(actorId, targetId, hit, { spellVfxVariant, spellName });

      const { anims } = diffPositionAnims(updatedCombat.combatants, positionsBefore);
      if (Object.keys(anims).length) scheduleTokenAnim(anims);
      return finalizeResult(updatedCombat, result);
    }

    const isShove = gameData.manoeuvres[manoeuvreKey]?.modifiers?.shove;
    await triggerActionAnim(actorId, targetId || null, isShove ? 'shove' : undefined);
    setActionAnim(null);

    const { combat: updatedCombat, result } = resolveManoeuvre(
      combat, actorId, manoeuvreKey, targetId, { customDescription: customDesc, campaignTier, ...extraOpts },
    );

    const { anims } = diffPositionAnims(updatedCombat.combatants, positionsBefore);
    if (Object.keys(anims).length) scheduleTokenAnim(anims);
    return finalizeResult(updatedCombat, result);
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
  campaignTier,
}) {
  const handleExecuteManoeuvre = useCallback(async (manoeuvreKey, targetId, customDesc, extraOpts = {}) => {
    if (!isMyTurn || actionAnim || projectileAnim) return;

    const executor = buildManoeuvreExecutor({
      combat, isMultiplayer, isHost, myPlayerId,
      dispatch, onHostResolve, onSendManoeuvre,
      dispatchCombatChatMessage, addResultToLog,
      persistCustomAttack, triggerActionAnim, triggerProjectileAnim,
      scheduleTokenAnim, flushRoundEffectEvents, setActionAnim,
      campaignTier,
    });
    return await executor.executeManoeuvre(manoeuvreKey, targetId, customDesc, extraOpts);
  }, [
    isMyTurn, actionAnim, projectileAnim,
    combat, isMultiplayer, isHost, myPlayerId,
    dispatch, onHostResolve, onSendManoeuvre,
    dispatchCombatChatMessage, addResultToLog,
    persistCustomAttack, triggerActionAnim, triggerProjectileAnim,
    scheduleTokenAnim, flushRoundEffectEvents, setActionAnim,
    campaignTier,
  ]);

  return { handleExecuteManoeuvre };
}
