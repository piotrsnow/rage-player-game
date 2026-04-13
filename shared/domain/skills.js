/**
 * Shared skill-lookup helpers. Keeping this in `shared/` so frontend and
 * backend agree on how a skill entry is decoded — skills are stored as
 * either a number (legacy) or an object shaped `{ level, xp, ... }`.
 */

/**
 * Resolve a character's skill level from a skills map.
 *
 *   getSkillLevel(character.skills, 'Alchemia')
 */
export function getSkillLevel(skills, skillName) {
  const entry = skills?.[skillName];
  if (!entry) return 0;
  return typeof entry === 'object' ? (entry.level || 0) : (entry || 0);
}
