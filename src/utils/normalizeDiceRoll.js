import { getSkillAttribute } from '../data/rpgSystem.js';

/**
 * Normalize dice roll data from any source (backend, combat engine, legacy)
 * into a single canonical shape for display components.
 *
 * Field mapping:
 *   backend  → attribute (string key), attributeValue, skillLevel, difficulty
 *   combat   → attribute (NUMBER = value), skillLevel, no attributeKey
 *   legacy   → characteristic, characteristicValue, skillAdvances
 */
export function normalizeDiceRoll(dr) {
  if (!dr) return null;

  const attributeKey =
    (typeof dr.attribute === 'string' ? dr.attribute : null)
    ?? dr.attributeKey
    ?? dr.characteristic
    ?? inferAttributeKeyFromSkill(dr.skill)
    ?? null;

  const attributeValue =
    dr.attributeValue
    ?? dr.characteristicValue
    ?? (typeof dr.attribute === 'number' ? dr.attribute : null);

  return {
    ...dr,
    attributeKey,
    attributeValue,
    skillLevel: dr.skillLevel ?? dr.skillAdvances ?? 0,
    difficulty: dr.difficulty || null,
    threshold: dr.threshold ?? dr.target ?? dr.dc ?? null,
  };
}

function inferAttributeKeyFromSkill(skillName) {
  if (!skillName) return null;
  return getSkillAttribute(skillName) || null;
}
