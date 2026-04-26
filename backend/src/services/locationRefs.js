// F5 — bridge between the legacy in-memory shapes (FE/AI) and the
// decomposed Postgres columns introduced by the coreState surface trim.
//
// Two concerns:
//   1. worldBounds — JSONB blob {minX,maxX,minY,maxY} ↔ 4 nullable Float
//      columns on Campaign. unpackWorldBounds/packWorldBounds keep the
//      legacy shape callable so the 5 readers and the seeder don't all
//      need to learn the new column names.
//   2. currentLocation — flavor name lifted out of coreState.world into
//      Campaign.currentLocationName. liftCurrentLocationFromCoreState pulls
//      it on save; injectCurrentLocationIntoCoreState merges it back on read.

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
