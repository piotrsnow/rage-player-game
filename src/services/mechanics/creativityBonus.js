import { CREATIVITY_BONUS_MAX } from '../../data/rpgSystem.js';

/**
 * Calculate a creativity bonus based on action text complexity and keyword matches.
 * Reusable across exploration, combat, and other action contexts.
 *
 * @param {string} text - The action description
 * @param {string[]} keywords - Context-specific keywords that indicate creativity
 * @param {number} [max] - Maximum bonus (defaults to CREATIVITY_BONUS_MAX from rpgSystem)
 * @returns {number} 0 to max
 */
export function calculateCreativityBonus(text, keywords, max = CREATIVITY_BONUS_MAX) {
  const normalized = typeof text === 'string' ? text.trim().toLowerCase() : '';
  if (!normalized) return 0;

  const words = normalized.match(/[\p{L}\p{N}'-]+/gu) || [];
  const uniqueWords = new Set(words);
  const keywordHits = keywords.filter((kw) => normalized.includes(kw)).length;

  let bonus = 2;
  if (words.length >= 6) bonus += 2;
  if (words.length >= 10) bonus += 2;
  if (keywordHits >= 2) bonus += 2;
  if (words.length >= 14 && uniqueWords.size >= 10) bonus += 2;

  return Math.min(bonus, max);
}
