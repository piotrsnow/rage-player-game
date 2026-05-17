// Location reference helpers — unified table version.
//
// With the unified Location table (campaignId=NULL for canonical,
// campaignId=uuid for campaign-scoped), polymorphic kind+id dispatch
// is no longer needed. Location IDs are plain UUIDs pointing to one table.
//
// Remaining concerns:
//   1. worldBounds — JSONB blob ↔ 4 nullable Float columns on Campaign.
//   2. currentLocation — flavor name bridge (coreState ↔ column).
//   3. slugifyLocationName — slug generation for canonicalName.
//
// Legacy exports (packLocationRef, readLocationRef, lookupLocationByKindId)
// are kept as thin pass-throughs for callsites not yet migrated, but they
// no longer do any table dispatch.

// Legacy constants — kept for backward compat during transition.
// Both resolve to the same unified Location table now.
export const LOCATION_KIND_WORLD = 'world';
export const LOCATION_KIND_CAMPAIGN = 'campaign';

// ─── World Bounds ────────────────────────────────────────────────────

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

// ─── Current Location (coreState bridge) ─────────────────────────────

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

export function injectCurrentLocationIntoCoreState(coreState, currentLocationName) {
  if (!coreState || typeof coreState !== 'object') return;
  if (!currentLocationName) return;
  if (!coreState.world || typeof coreState.world !== 'object') coreState.world = {};
  if (!coreState.world.currentLocation) coreState.world.currentLocation = currentLocationName;
}

// ─── Location name slug ──────────────────────────────────────────────

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

// ─── Legacy compat (thin pass-throughs) ──────────────────────────────
// These used to dispatch between WorldLocation and CampaignLocation.
// Now they just validate/pass through the UUID. Kept so unmodified
// callsites don't break; remove once all consumers are migrated.

/**
 * @deprecated — Location IDs are plain UUIDs now. Just use the ID directly.
 */
export function packLocationRef(loc, _defaultKind = null) {
  if (!loc) return { kind: null, id: null };
  if (typeof loc.kind === 'string' && typeof loc.id === 'string') {
    return { kind: loc.kind, id: loc.id };
  }
  if (typeof loc.id === 'string') {
    return { kind: 'world', id: loc.id };
  }
  return { kind: null, id: null };
}

/**
 * @deprecated — No more kind+id pairs. Use row.currentLocationId directly.
 */
export function readLocationRef(row, prefix = 'currentLocation') {
  if (!row) return null;
  const id = row[`${prefix}Id`];
  if (typeof id !== 'string') return null;
  // Return compat shape — kind is always 'world' now (unified table)
  return { kind: 'world', id };
}

/**
 * @deprecated — Use prisma.location.findUnique({ where: { id } }) directly.
 */
export async function lookupLocationByKindId({ prisma, kind, id, select = null }) {
  if (!prisma || typeof id !== 'string') return null;
  const args = { where: { id } };
  if (select) args.select = select;
  return prisma.location.findUnique(args);
}
