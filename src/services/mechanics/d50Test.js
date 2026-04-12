import { rollD50, rollPercentage } from '../gameState.js';
import { DIFFICULTY_THRESHOLDS } from '../../data/rpgSystem.js';

/**
 * Resolve a raw d50 test with pre-computed values.
 * Used by combatEngine (and any other engine needing a d50 roll).
 *
 * @param {Object} params
 * @param {number} params.attribute - attribute value
 * @param {number} [params.skillLevel=0] - skill level
 * @param {number} [params.creativityBonus=0] - creativity bonus
 * @param {number} [params.threshold] - difficulty threshold (default: medium)
 * @param {number} [params.luck=0] - szczescie value for auto-success check
 * @returns {{ roll, total, threshold, margin, success, luckySuccess, attribute, skillLevel, creativityBonus }}
 */
export function resolveD50Test({
  attribute,
  skillLevel = 0,
  creativityBonus = 0,
  threshold = DIFFICULTY_THRESHOLDS.medium,
  luck = 0,
}) {
  const luckRoll = rollPercentage();
  const luckySuccess = luckRoll <= luck;

  const roll = rollD50();
  const total = roll + attribute + skillLevel + creativityBonus;
  const margin = total - threshold;
  const success = luckySuccess || margin >= 0;

  return { roll, total, threshold, margin, success, luckySuccess, attribute, skillLevel, creativityBonus };
}
