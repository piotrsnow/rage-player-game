/**
 * Luck / Szczescie mechanic — shared helper.
 *
 * Every success/failure roll in the RPGon system applies a luck check on
 * top of the base result: the `szczescie` attribute value is the percentage
 * chance of a guaranteed success, regardless of the base roll.
 *
 *   szczescie = 10  →  10% chance of auto-success on every roll
 *   szczescie = 0   →  no luck rescue
 *
 * Usage:
 *
 *   import { rollLuckCheck } from 'shared/domain/luck.js';
 *
 *   const { luckRoll, luckySuccess } = rollLuckCheck(character.attributes.szczescie, rollPercentage);
 *   const success = luckySuccess || (baseMargin >= 0);
 */

/**
 * Roll a luck check and return both the raw percentile roll and the verdict.
 * `rollPercentageFn` is injected so frontend and backend can pass their own
 * 1–100 RNG — both codebases have their own `rollPercentage` helper.
 *
 * @param {number} szczescie - The character's szczescie attribute (0-25).
 * @param {() => number} rollPercentageFn - 1..100 RNG function.
 * @returns {{ luckRoll: number, luckySuccess: boolean }}
 */
export function rollLuckCheck(szczescie, rollPercentageFn) {
  const luckRoll = rollPercentageFn();
  const luckySuccess = luckRoll <= (szczescie || 0);
  return { luckRoll, luckySuccess };
}

/**
 * Pure check against a pre-rolled value — useful when the roll is produced
 * upstream (backend pre-rolls luck alongside d50, model-resolved paths, etc).
 *
 * @param {number} szczescie
 * @param {number} luckRoll - Pre-rolled 1..100 value.
 * @returns {boolean}
 */
export function isLuckySuccess(szczescie, luckRoll) {
  return luckRoll <= (szczescie || 0);
}
