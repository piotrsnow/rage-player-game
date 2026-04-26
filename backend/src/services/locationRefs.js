// F5 — bridge between the legacy in-memory shapes (FE/AI) and the
// decomposed Postgres columns introduced by the coreState surface trim.
//
// Three concerns:
//   1. worldBounds — JSONB blob {minX,maxX,minY,maxY} ↔ 4 nullable Float
//      columns on Campaign. unpackWorldBounds/packWorldBounds keep the
//      legacy shape callable so the 5 readers and the seeder don't all
//      need to learn the new column names.
//   2. currentLocation — flavor name lifted out of coreState.world into
//      Campaign.currentLocationName. liftCurrentLocationFromCoreState pulls
//      it on save; injectCurrentLocationIntoCoreState merges it back on read.
//   3. F5b — polymorphic location refs. `kind+id` pair on Campaign /
//      CampaignNPC / CampaignDiscoveredLocation / CharacterClearedDungeon /
//      LocationPromotionCandidate resolves to either a canonical WorldLocation
//      (kind=world) or a per-campaign CampaignLocation (kind=campaign).
//      No DB FK — packLocationRef / readLocationRef / lookupLocationByKindId
//      keep callsites honest about the discriminator.

// F5b — polymorphic location-kind discriminator values. Use these constants
// instead of bare string literals so a typo surfaces as a missing import.
export const LOCATION_KIND_WORLD = 'world';
export const LOCATION_KIND_CAMPAIGN = 'campaign';
const LOCATION_KINDS = new Set([LOCATION_KIND_WORLD, LOCATION_KIND_CAMPAIGN]);

/**
 * Read 4 bounds columns off a Campaign row and return the legacy
 * `{minX, maxX, minY, maxY}` shape, or `null` if any column is missing.
 * Callers expect "all four set" — partials are treated as "no bounds".
 */
export function unpackWorldBounds(campaign) {
  if (!campaign) return null;
  const minX = campaign.boundsMinX;
  const maxX = campaign.boundsMaxX;
  const minY = campaign.boundsMinY;
  const maxY = campaign.boundsMaxY;
  if (typeof minX !== 'number' || typeof maxX !== 'number'
    || typeof minY !== 'number' || typeof maxY !== 'number') return null;
  return { minX, maxX, minY, maxY };
}

/**
 * Inverse: legacy `{minX, maxX, minY, maxY}` shape → an object that can
 * be spread into a Prisma `data` payload. `null`/missing yields the four
 * column resets (so passing through with "no bounds" clears the row).
 */
export function packWorldBounds(bounds) {
  if (!bounds || typeof bounds !== 'object') {
    return { boundsMinX: null, boundsMaxX: null, boundsMinY: null, boundsMaxY: null };
  }
  return {
    boundsMinX: typeof bounds.minX === 'number' ? bounds.minX : null,
    boundsMaxX: typeof bounds.maxX === 'number' ? bounds.maxX : null,
    boundsMinY: typeof bounds.minY === 'number' ? bounds.minY : null,
    boundsMaxY: typeof bounds.maxY === 'number' ? bounds.maxY : null,
  };
}

/**
 * Pull `world.currentLocation` out of an in-memory coreState object and
 * return `{slim, currentLocationName}`. The returned slim is a shallow
 * copy with `world.currentLocation` removed; falsy/empty strings yield
 * `null` so the column writes a true NULL rather than `""`.
 */
export function liftCurrentLocationFromCoreState(coreState) {
  if (!coreState || typeof coreState !== 'object') {
    return { slim: coreState, currentLocationName: null };
  }
  const slim = { ...coreState };
  let currentLocationName = null;
  if (slim.world && typeof slim.world === 'object' && 'currentLocation' in slim.world) {
    const raw = slim.world.currentLocation;
    currentLocationName = typeof raw === 'string' && raw.trim() ? raw.trim() : null;
    const { currentLocation: _drop, ...worldRest } = slim.world;
    slim.world = worldRest;
  }
  return { slim, currentLocationName };
}

/**
 * Inverse: write a Campaign row's `currentLocationName` back into
 * `coreState.world.currentLocation` so the FE rehydrates with the same
 * shape it sent. Mutates `coreState` in place to match the existing
 * reconstructFromNormalized convention.
 */
export function injectCurrentLocationIntoCoreState(coreState, currentLocationName) {
  if (!coreState || typeof coreState !== 'object') return;
  if (!currentLocationName) return;
  if (!coreState.world || typeof coreState.world !== 'object') coreState.world = {};
  // Don't clobber an in-memory write that beat the column (paranoia — saves
  // are write-then-read, but the DB is the source of truth on a fresh load).
  if (!coreState.world.currentLocation) coreState.world.currentLocation = currentLocationName;
}

// ─── F5b polymorphic location refs ──────────────────────────────────────

/**
 * Pack a row (or `{ kind, id }` literal) into the polymorphic FK column
 * pair shape `{ kind, id }`. Returns `{ kind: null, id: null }` when input
 * is missing/invalid so the caller can spread into a Prisma `data` payload
 * to clear both columns.
 *
 * - Pass a CampaignLocation row → `{ kind: 'campaign', id }`
 * - Pass a WorldLocation row → `{ kind: 'world', id }` (assumes the row
 *   came from `prisma.worldLocation.*`; CampaignLocation must be tagged
 *   explicitly via `defaultKind` if the row source is ambiguous).
 * - Pass `{ kind, id }` directly → returned unchanged after validation.
 *
 * `defaultKind` resolves the ambiguous case: rows fetched via
 * `prisma.worldLocation` should pass `LOCATION_KIND_WORLD`, rows from
 * `prisma.campaignLocation` should pass `LOCATION_KIND_CAMPAIGN`.
 */
export function packLocationRef(loc, defaultKind = null) {
  if (!loc) return { kind: null, id: null };
  // Direct ref shape
  if (typeof loc.kind === 'string' && typeof loc.id === 'string') {
    if (!LOCATION_KINDS.has(loc.kind)) return { kind: null, id: null };
    return { kind: loc.kind, id: loc.id };
  }
  // Row shape — kind disambiguated by caller via defaultKind
  if (typeof loc.id === 'string' && defaultKind && LOCATION_KINDS.has(defaultKind)) {
    return { kind: defaultKind, id: loc.id };
  }
  return { kind: null, id: null };
}

/**
 * Read a polymorphic FK pair off a row by column-name prefix. Defaults
 * (`prefix='currentLocation'`) match the Campaign columns; pass
 * `'lastLocation'` for CampaignNPC, `'sourceLocation'` for
 * LocationPromotionCandidate, `'parentLocation'` for CampaignLocation,
 * `'location'` for CampaignDiscoveredLocation, `'dungeon'` for
 * CharacterClearedDungeon. Returns `null` when either column is missing
 * so callers can do `if (!ref) skip` without juggling two booleans.
 */
export function readLocationRef(row, prefix = 'currentLocation') {
  if (!row) return null;
  const kind = row[`${prefix}Kind`];
  const id = row[`${prefix}Id`];
  if (typeof kind !== 'string' || typeof id !== 'string') return null;
  if (!LOCATION_KINDS.has(kind)) return null;
  return { kind, id };
}

/**
 * Resolve a polymorphic ref to a single row. Returns `null` if either
 * column is missing or the target row was deleted. `select` is forwarded
 * as-is — pass the columns you actually need to keep selects narrow.
 *
 * The two table shapes overlap on `{ id, name|canonicalName, region,
 * regionX, regionY, locationType, parentLocationId, ... }` but diverge on
 * a few fields (WorldLocation has `canonicalName + displayName + aliases`,
 * CampaignLocation has `name + canonicalSlug + parentLocationKind`).
 * Callers that need cross-kind logic should normalise after this returns.
 */
export async function lookupLocationByKindId({ prisma, kind, id, select = null }) {
  if (!prisma || typeof kind !== 'string' || typeof id !== 'string') return null;
  if (!LOCATION_KINDS.has(kind)) return null;
  const args = { where: { id } };
  if (select) args.select = select;
  if (kind === LOCATION_KIND_WORLD) {
    return prisma.worldLocation.findUnique(args);
  }
  return prisma.campaignLocation.findUnique(args);
}

/**
 * Slugify a location name for the CampaignLocation `canonicalSlug` column
 * (used by the in-campaign uniqueness constraint). Lowercase, trim,
 * collapse whitespace + non-alphanum to single dashes, strip leading /
 * trailing dashes. Same shape as the WorldLocation `canonicalName`
 * convention but applied at the slug column instead of the display name.
 *
 * Handles polish letters (ąćęłńóśźż) by transliterating to ascii so
 * "Karczma Pod Skowronkiem" and "Karczma pod skowronkiem" collide.
 */
export function slugifyLocationName(name) {
  if (typeof name !== 'string') return '';
  const trimmed = name.trim().toLowerCase();
  if (!trimmed) return '';
  const transliterated = trimmed
    .replace(/ą/g, 'a').replace(/ć/g, 'c').replace(/ę/g, 'e')
    .replace(/ł/g, 'l').replace(/ń/g, 'n').replace(/ó/g, 'o')
    .replace(/ś/g, 's').replace(/ź/g, 'z').replace(/ż/g, 'z');
  return transliterated
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
