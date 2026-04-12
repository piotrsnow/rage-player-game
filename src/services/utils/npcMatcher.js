// Shared NPC name matching utility
// Normalizes Polish diacritics, case-insensitive, longest match wins

const POLISH_DIACRITICS = {
  ą: 'a', ć: 'c', ę: 'e', ł: 'l', ń: 'n',
  ó: 'o', ś: 's', ź: 'z', ż: 'z',
  Ą: 'a', Ć: 'c', Ę: 'e', Ł: 'l', Ń: 'n',
  Ó: 'o', Ś: 's', Ź: 'z', Ż: 'z',
};

const DIACRITICS_REGEX = /[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/g;

/**
 * Normalize a string for NPC name matching: lowercase, strip Polish diacritics, collapse whitespace.
 */
export function normalizeNpcName(name) {
  if (typeof name !== 'string') return '';
  return name
    .toLowerCase()
    .replace(DIACRITICS_REGEX, (ch) => POLISH_DIACRITICS[ch] || ch)
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Find the best NPC match in `actionText` by substring inclusion.
 * Returns the NPC with the longest matching name (most specific), or null.
 *
 * @param {string} actionText - The player action or text to search in
 * @param {Array<{name: string, [key: string]: any}>} npcs - NPC list
 * @returns {{ npc: object, matchedName: string } | null}
 */
export function findNpcByName(actionText, npcs) {
  if (typeof actionText !== 'string' || !actionText.trim()) return null;
  if (!Array.isArray(npcs) || npcs.length === 0) return null;

  const normalizedAction = normalizeNpcName(actionText);

  let bestMatch = null;
  for (const npc of npcs) {
    const name = typeof npc?.name === 'string' ? npc.name.trim() : '';
    if (!name) continue;

    const normalizedName = normalizeNpcName(name);
    if (!normalizedName) continue;

    if (normalizedAction.includes(normalizedName)) {
      if (!bestMatch || normalizedName.length > normalizeNpcName(bestMatch.matchedName).length) {
        bestMatch = { npc, matchedName: name };
      }
    }
  }

  return bestMatch;
}
