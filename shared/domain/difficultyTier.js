// Campaign difficulty tier — shared helpers so both the frontend
// CampaignCreator and the backend create-route agree on valid choices
// per character level. Also feeds `selectBestiaryEncounter` so nano
// can't slip a dragon past the cap.
//
// Tiers form a total order: low < medium < high < deadly.

export const DIFFICULTY_TIERS = ['low', 'medium', 'high', 'deadly'];

/**
 * Return the tiers a character of `level` is allowed to choose.
 * Level rules match the user's spec:
 *   1-5   → ['low']
 *   6-10  → ['low', 'medium', 'high']
 *   11+   → all four
 */
export function allowedTiersForLevel(level) {
  const lv = Number(level) || 1;
  if (lv <= 5) return ['low'];
  if (lv <= 10) return ['low', 'medium', 'high'];
  return ['low', 'medium', 'high', 'deadly'];
}

/**
 * True when `tier` is legal for a character of `level`.
 */
export function isTierAllowedForLevel(tier, level) {
  return allowedTiersForLevel(level).includes(tier);
}

/**
 * Clamp `requested` down to the campaign's `cap` if it would exceed it.
 * Returns the valid tier — either the requested one or the cap.
 */
export function clampTier(requested, cap) {
  const capIdx = DIFFICULTY_TIERS.indexOf(cap);
  const reqIdx = DIFFICULTY_TIERS.indexOf(requested);
  if (capIdx < 0) return requested; // unknown cap → passthrough
  if (reqIdx < 0) return cap;       // unknown requested → default to cap
  return reqIdx > capIdx ? cap : requested;
}

/**
 * Short prose describing what a tier means — feeds campaignGenerator so
 * fabuła respects the cap from the first scene on.
 */
export function tierNarrativeDescription(tier) {
  switch (tier) {
    case 'low':
      return 'bandyci, wilki, zbóje, drobne potwory leśne. Żadnych smoków, demonów, lichów, archmagów ani pradawnych stworów.';
    case 'medium':
      return 'większe grupy bandytów, dzikie bestie, trolle, niewielka nieumarli, sekty kultystów. Smoki/archmagi/wielkie demony tylko jako odległe zagrożenia, nie w walce bezpośredniej.';
    case 'high':
      return 'elitarni wrogowie, niebezpieczne potwory, silne sekty magów, bossowie regionalni. Smoki i demony dostępne, ale jako ukoronowanie dużych wątków — nie walki przypadkowe.';
    case 'deadly':
      return 'wszystkie możliwe zagrożenia — smoki, archmagi, pradawne byty, lichowe, demony wyższych kręgów. Kampania dla weteranów.';
    default:
      return 'bandyci, wilki, zbóje.';
  }
}
