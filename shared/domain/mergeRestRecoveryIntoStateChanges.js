/**
 * Merge deterministic rest recovery (computed on FE before the AI call) into
 * scene stateChanges. Rest healing overrides AI woundsChange so BE persist +
 * FE RECONCILE stay aligned with the chat toast.
 *
 * @param {object|null|undefined} stateChanges
 * @param {{ isRest?: boolean, restRecovery?: object|null, needsSystemEnabled?: boolean }} resolved
 * @returns {object|null|undefined}
 */
export function mergeRestRecoveryIntoStateChanges(stateChanges, resolved = {}) {
  const { isRest, restRecovery, needsSystemEnabled = false } = resolved;
  let next = stateChanges && typeof stateChanges === 'object' ? { ...stateChanges } : {};

  if (needsSystemEnabled) {
    const rawTimeAdvance = next.timeAdvance;
    if (typeof rawTimeAdvance === 'number' && Number.isFinite(rawTimeAdvance)) {
      next.timeAdvance = { hoursElapsed: rawTimeAdvance };
    } else if (typeof rawTimeAdvance === 'string') {
      const parsedHours = Number(rawTimeAdvance);
      next.timeAdvance = Number.isFinite(parsedHours)
        ? { hoursElapsed: parsedHours }
        : {};
    } else if (!rawTimeAdvance || typeof rawTimeAdvance !== 'object' || Array.isArray(rawTimeAdvance)) {
      next.timeAdvance = {};
    }
    if (!next.timeAdvance) {
      next.timeAdvance = { hoursElapsed: 0.5 };
    } else if (next.timeAdvance.hoursElapsed == null) {
      next.timeAdvance.hoursElapsed = 0.5;
    }
  }

  if (isRest && restRecovery) {
    const mergedNeedsChanges = {
      ...(next.needsChanges || {}),
      ...(restRecovery.needsChanges || {}),
    };
    const restMana = restRecovery.manaChange;
    next = {
      ...next,
      ...(restRecovery.woundsChange !== undefined
        ? { woundsChange: restRecovery.woundsChange }
        : {}),
      ...(Object.keys(mergedNeedsChanges).length > 0 ? { needsChanges: mergedNeedsChanges } : {}),
      ...(restMana != null ? { manaChange: restMana } : {}),
    };
  }

  return Object.keys(next).length > 0 ? next : stateChanges;
}
