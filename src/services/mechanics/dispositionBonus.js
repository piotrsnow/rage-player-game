/**
 * Convert NPC disposition score to a target modifier.
 * Thresholds from WFRP4e social interaction rules.
 *
 * @param {number} disposition
 * @returns {number} modifier (-15 to +15)
 */
export function getDispositionModifier(disposition) {
  if (typeof disposition !== 'number' || !Number.isFinite(disposition)) return 0;
  if (disposition >= 30) return 15;
  if (disposition >= 15) return 10;
  if (disposition >= 5) return 5;
  if (disposition > -5) return 0;
  if (disposition > -15) return -5;
  if (disposition > -30) return -10;
  return -15;
}

/**
 * Find the NPC targeted by the player's action and return their disposition bonus.
 * Matches NPC names mentioned in the action text.
 *
 * @param {string} actionText
 * @param {Array} npcs - world.npcs array
 * @returns {{ npcName: string, bonus: number } | null}
 */
export function resolveActionDisposition(actionText, npcs) {
  if (typeof actionText !== 'string' || !actionText.trim()) return null;
  if (!Array.isArray(npcs) || npcs.length === 0) return null;

  const lowerAction = actionText.toLowerCase();

  // Find NPC whose name appears in the action text
  let bestMatch = null;
  for (const npc of npcs) {
    const name = typeof npc?.name === 'string' ? npc.name.trim() : '';
    if (!name) continue;

    if (lowerAction.includes(name.toLowerCase())) {
      const disposition = typeof npc.disposition === 'number' ? npc.disposition : 0;
      const bonus = getDispositionModifier(disposition);
      // Prefer longest name match (more specific)
      if (!bestMatch || name.length > bestMatch.npcName.length) {
        bestMatch = { npcName: name, bonus };
      }
    }
  }

  return bestMatch;
}
