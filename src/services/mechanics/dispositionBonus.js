/**
 * Convert NPC disposition score to a bonus/penalty for d50 tests.
 * Scaled for the d50 system (smaller modifiers than d100).
 *
 * @param {number} disposition - NPC disposition (-50 to +50)
 * @returns {number} modifier (-5 to +5)
 */
export function getDispositionModifier(disposition) {
  if (typeof disposition !== 'number' || !Number.isFinite(disposition)) return 0;
  if (disposition >= 30) return 5;
  if (disposition >= 15) return 3;
  if (disposition >= 5) return 1;
  if (disposition > -5) return 0;
  if (disposition > -15) return -1;
  if (disposition > -30) return -3;
  return -5;
}

import { findNpcByName } from '../utils/npcMatcher.js';

/**
 * Find the NPC targeted by the player's action and return their disposition bonus.
 * Matches NPC names mentioned in the action text (diacritics-insensitive).
 *
 * @param {string} actionText
 * @param {Array} npcs - world.npcs array
 * @returns {{ npcName: string, bonus: number } | null}
 */
export function resolveActionDisposition(actionText, npcs) {
  const match = findNpcByName(actionText, npcs);
  if (!match) return null;

  const disposition = typeof match.npc.disposition === 'number' ? match.npc.disposition : 0;
  return { npcName: match.matchedName, bonus: getDispositionModifier(disposition) };
}
