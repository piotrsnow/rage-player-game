import { clamp, rollD50 } from '../diceResolver.js';
import { resolveDiceRollAttribute } from '../../../../shared/domain/diceRollInference.js';

export { rollD50 };

export const MAX_COMBINED_BONUS = 30;
const MIN_DIFFICULTY_MODIFIER = -40;
const MAX_DIFFICULTY_MODIFIER = 40;

function normalizeDifficultyModifier(value) {
  return typeof value === 'number' && Number.isFinite(value)
    ? clamp(value, MIN_DIFFICULTY_MODIFIER, MAX_DIFFICULTY_MODIFIER)
    : 0;
}

function snapDifficultyModifier(value) {
  if (!Number.isFinite(value)) return 0;
  return clamp(Math.round(value / 10) * 10, MIN_DIFFICULTY_MODIFIER, MAX_DIFFICULTY_MODIFIER);
}

/**
 * Resolve the dice roll's attribute + attributeValue from context.
 * Returns the mutated dr on success, or null if the attribute cannot be
 * determined (caller filters these out).
 *
 * `actionByName` / `characterByName` supply context that was previously
 * closed-over inside generateMultiplayerScene.
 */
export function normalizeDiceRoll(dr, { actionByName, characterByName, fallbackActionText = '', fallbackCharacterName = null }) {
  if (!dr || dr.roll == null || dr.target == null) return dr;

  const characterName = dr.character || fallbackCharacterName;
  const actionText = actionByName.get(characterName)?.action || fallbackActionText || '';
  const characterData = characterByName.get(characterName) || null;
  const resolvedAttribute = resolveDiceRollAttribute(dr, actionText);
  if (!resolvedAttribute) return null;

  dr.attribute = resolvedAttribute;
  if (dr.attributeValue == null) {
    dr.attributeValue = characterData?.attributes?.[resolvedAttribute] ?? null;
  }

  return dr.attributeValue == null ? null : dr;
}

/**
 * Recompute baseTarget / difficultyModifier / effective target / success /
 * margin / critical flags for a dice roll. Pure — no closures, mutates the dr
 * in place.
 */
export function recalcDiceRoll(dr) {
  if (!dr || dr.roll == null || dr.target == null) return;

  const originalTarget = dr.target;
  const roll = dr.roll;
  const bonus = dr.creativityBonus || 0;
  const momentum = dr.momentumBonus || 0;
  const disposition = dr.dispositionBonus || 0;
  const providedDifficultyModifier = dr.difficultyModifier != null
    ? normalizeDifficultyModifier(dr.difficultyModifier)
    : null;

  let baseTarget;
  if (dr.baseTarget) {
    baseTarget = dr.baseTarget;
  } else if (dr.attributeValue != null && dr.skillLevel != null) {
    baseTarget = dr.attributeValue + dr.skillLevel;
  } else {
    baseTarget = dr.target - bonus - momentum - disposition - (providedDifficultyModifier ?? 0);
  }
  dr.baseTarget = baseTarget;

  if (dr.skillLevel == null && dr.attributeValue != null) {
    dr.skillLevel = Math.max(0, baseTarget - dr.attributeValue);
  }

  const totalBonus = bonus + momentum + disposition;
  const cappedBonus = Math.min(totalBonus, MAX_COMBINED_BONUS);
  const difficultyModifier = providedDifficultyModifier ?? snapDifficultyModifier(originalTarget - baseTarget - cappedBonus);
  dr.difficultyModifier = difficultyModifier;
  const effectiveTarget = baseTarget + cappedBonus + difficultyModifier;
  dr.target = effectiveTarget;

  const isCriticalSuccess = roll === 1;
  const isCriticalFailure = roll === 50;
  dr.success = isCriticalSuccess || (!isCriticalFailure && roll <= effectiveTarget);
  dr.criticalSuccess = isCriticalSuccess;
  dr.criticalFailure = isCriticalFailure;
  dr.margin = roll <= effectiveTarget ? effectiveTarget - roll : -(roll - effectiveTarget);
}
