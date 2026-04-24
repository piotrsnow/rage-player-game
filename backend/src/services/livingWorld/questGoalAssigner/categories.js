/**
 * Broad NPC category buckets (Round A).
 *
 * Picker + dialog flavor + scene-gen hints read this. Five starter values;
 * extend via CATEGORY_KEYWORDS when the picker runs out of variety.
 *
 * Kept in sync with `roleAffinity.js` so a quest-type `combat` quest picks
 * the same NPCs as a `guard`/`adventurer` category filter would.
 */

export const NPC_CATEGORIES = ['guard', 'merchant', 'commoner', 'priest', 'adventurer'];

// Order matters — first match wins. Priest/guard/merchant are checked before
// adventurer so "kapłan-wojownik" lands under `priest`, not `adventurer`.
const CATEGORY_KEYWORDS = {
  priest: ['kapłan', 'kapłanka', 'arcykapłan', 'mnich', 'zakonnik', 'priest', 'monk', 'cleric'],
  guard: ['strażnik', 'żołnierz', 'kapitan', 'gwardzist', 'rycerz', 'guard', 'soldier', 'captain', 'knight'],
  merchant: ['kupiec', 'kupcowa', 'handlarz', 'karczmarz', 'karczmarka', 'szuler', 'posłaniec', 'goniec', 'merchant', 'trader', 'innkeeper', 'messenger'],
  adventurer: [
    'mistrz', 'mistrzyni', 'mag', 'czarodziej', 'wiedźma', 'alchemik', 'alchemiczka',
    'łowca', 'łowczyni', 'tropiciel', 'myśliwy', 'myśliwa', 'złodziej', 'rozbójnik',
    'najemnik', 'awanturnik', 'przygodowiec', 'wojownik', 'wróżbitka',
    'adventurer', 'mage', 'wizard', 'witch', 'alchemist', 'hunter', 'ranger',
    'rogue', 'thief', 'mercenary', 'warrior',
  ],
  // `commoner` is the fallback — any NPC without a match above.
};

/**
 * Map a freeform role/personality string to one of NPC_CATEGORIES. Used
 * during seeding, cloning from WorldNPC → CampaignNPC, and post-hoc backfill.
 * Pure, exported for tests.
 */
export function categorize(role, { fallback = 'commoner' } = {}) {
  const text = String(role || '').toLowerCase();
  if (!text) return fallback;
  for (const category of ['priest', 'guard', 'merchant', 'adventurer']) {
    const keys = CATEGORY_KEYWORDS[category] || [];
    if (keys.some((kw) => text.includes(kw))) return category;
  }
  return fallback;
}
