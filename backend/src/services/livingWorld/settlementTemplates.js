// Living World Phase 7 — settlement templates.
//
// Declarative data driving capacity caps + sublocation slot classification.
// `required` sublocations are seeded by BE automatically at top-level creation
// (AI never emits them). `optional` slots are dynamically listed in the
// Living World prompt block — AI picks up to `optionalCap` of these. `custom`
// is unbounded by count (user decision) but AI MUST name custom sublocations
// with narrative distinctiveness ("Wieża Maga", "Chata Wiedźmy") — generic
// names are rejected as optional attempts.
//
// Hard cap on total sublocations = `maxSubLocations` regardless of type.

export const SETTLEMENT_TEMPLATES = {
  hamlet: {
    maxKeyNpcs: 5,
    maxSubLocations: 2,
    required: [],
    optional: ['tavern', 'elder_home'],
    optionalCap: 2,
  },
  village: {
    maxKeyNpcs: 10,
    maxSubLocations: 5,
    required: ['tavern'],
    optional: ['church', 'blacksmith', 'alchemist', 'market', 'watchtower', 'mill', 'elder_home'],
    optionalCap: 3,
  },
  town: {
    maxKeyNpcs: 20,
    maxSubLocations: 10,
    required: ['tavern', 'market'],
    optional: ['church', 'blacksmith', 'alchemist', 'barracks', 'temple', 'guild_hall', 'bathhouse', 'library'],
    optionalCap: 6,
  },
  city: {
    maxKeyNpcs: 40,
    maxSubLocations: 18,
    required: ['tavern', 'market', 'barracks'],
    optional: [
      'church', 'blacksmith', 'alchemist', 'temple', 'guild_hall', 'bathhouse', 'library',
      'arena', 'jail', 'docks', 'magic_shop', 'apothecary', 'scribe', 'stable', 'bank',
    ],
    optionalCap: 12,
  },
  capital: {
    maxKeyNpcs: 70,
    maxSubLocations: 25,
    required: ['tavern', 'market', 'barracks', 'palace', 'grand_temple'],
    optional: [
      'church', 'blacksmith', 'alchemist', 'guild_hall', 'bathhouse', 'library',
      'arena', 'jail', 'docks', 'magic_shop', 'apothecary', 'scribe', 'stable', 'bank',
      'academy', 'embassy', 'hall_of_justice', 'garrison',
    ],
    optionalCap: 18,
  },
  wilderness: {
    maxKeyNpcs: 3,
    maxSubLocations: 3,
    required: [],
    optional: ['camp', 'ruin', 'cave'],
    optionalCap: 3,
  },
  // Dungeons are handled by dungeonSeedGenerator — rooms are custom + deterministic,
  // slot system doesn't apply. The template is here so callers can query
  // isGeneratedLocationType(type) and bypass topologyGuard.
  dungeon: {
    maxKeyNpcs: 5,
    maxSubLocations: 50, // room cap, enforced by seed generator
    generated: true,
  },
};

const DEFAULT_TEMPLATE = {
  maxKeyNpcs: 5,
  maxSubLocations: 3,
  required: [],
  optional: [],
  optionalCap: 0,
};

export function getTemplate(locationType) {
  return SETTLEMENT_TEMPLATES[locationType] || DEFAULT_TEMPLATE;
}

export function isGeneratedLocationType(locationType) {
  return SETTLEMENT_TEMPLATES[locationType]?.generated === true;
}

/**
 * Classify an AI-emitted sublocation `slotType` against its parent's template.
 *
 * Returns one of:
 *   { kind: 'required', slotType }        — matches parent's required list
 *   { kind: 'optional', slotType }        — matches parent's optional list
 *   { kind: 'custom' }                    — narratively distinctive, goes as custom
 *   { kind: 'reject', reason }            — generic/duplicate/invalid
 *
 * Heuristic for custom distinctiveness (per user spec):
 *   - Name must be >= 2 words, OR
 *   - Contain a proper-noun-looking token (capitalized non-initial word)
 * Generic short names ("mały dom", "hut") are rejected.
 *
 * This is a pure function — given (slotType, name, parentTemplate),
 * returns the classification deterministically.
 */
export function classifySublocation({ slotType, name, parentLocationType }) {
  const template = getTemplate(parentLocationType);
  const slot = (slotType || '').toLowerCase().trim();

  if (slot && template.required?.includes(slot)) {
    return { kind: 'required', slotType: slot };
  }
  if (slot && template.optional?.includes(slot)) {
    return { kind: 'optional', slotType: slot };
  }
  // Unknown slotType — candidate for custom. Enforce narrative distinctiveness.
  const cleanName = String(name || '').trim();
  if (!cleanName) return { kind: 'reject', reason: 'missing_name' };

  // At least 2 non-trivial words (words of length >= 3 after dropping stop-like fillers)
  const significantWords = cleanName
    .split(/\s+/)
    .filter((w) => w.length >= 3);
  if (significantWords.length < 2) {
    return { kind: 'reject', reason: 'generic_name' };
  }

  return { kind: 'custom', slotType: slot || null };
}
