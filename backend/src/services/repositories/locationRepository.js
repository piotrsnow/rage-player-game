/**
 * Unified Location repository — query helpers for the merged Location table.
 *
 * Scope convention:
 *   campaignId IS NULL → canonical (world-level)
 *   campaignId = uuid  → campaign-scoped (sandbox)
 */

import { slugifyLocationName } from '../locationRefs.js';

// ─── Canonical (world-level) queries ─────────────────────────────────

export function findCanonicalById(prisma, id, { select } = {}) {
  return prisma.location.findFirst({
    where: { id, campaignId: null },
    ...(select && { select }),
  });
}

export function findCanonicalByName(prisma, canonicalName, { select } = {}) {
  return prisma.location.findFirst({
    where: { canonicalName, campaignId: null },
    ...(select && { select }),
  });
}

export function listCanonical(prisma, { where = {}, select, take, skip, orderBy } = {}) {
  return prisma.location.findMany({
    where: { ...where, campaignId: null },
    ...(select && { select }),
    ...(take && { take }),
    ...(skip && { skip }),
    ...(orderBy && { orderBy }),
  });
}

// ─── Campaign-scoped queries ─────────────────────────────────────────

export function findForCampaign(prisma, campaignId, locationId, { select } = {}) {
  return prisma.location.findFirst({
    where: { id: locationId, campaignId },
    ...(select && { select }),
  });
}

export function findForCampaignBySlug(prisma, campaignId, slug, { select } = {}) {
  return prisma.location.findFirst({
    where: { campaignId, canonicalName: slug },
    ...(select && { select }),
  });
}

export function listForCampaign(prisma, campaignId, { where = {}, select, orderBy } = {}) {
  return prisma.location.findMany({
    where: { ...where, campaignId },
    ...(select && { select }),
    ...(orderBy && { orderBy }),
  });
}

/**
 * All locations visible in a campaign = canonical + campaign-scoped.
 */
export function listVisibleForCampaign(prisma, campaignId, { where = {}, select } = {}) {
  return prisma.location.findMany({
    where: {
      ...where,
      OR: [
        { campaignId: null },
        { campaignId },
      ],
    },
    ...(select && { select }),
  });
}

// ─── Resolution (name → Location) ───────────────────────────────────

/**
 * Resolve a location by name. Canonical wins over campaign-scoped.
 * Returns { location, isCanonical } or null.
 */
export async function resolveByName(prisma, rawName, { campaignId = null } = {}) {
  const slug = slugifyLocationName(rawName);

  const canonical = await prisma.location.findFirst({
    where: {
      campaignId: null,
      OR: [
        { canonicalName: slug },
        { canonicalName: { equals: slug, mode: 'insensitive' } },
      ],
    },
  });
  if (canonical) return { location: canonical, isCanonical: true };

  if (campaignId) {
    const campaignLoc = await prisma.location.findFirst({
      where: {
        campaignId,
        canonicalName: slug,
      },
    });
    if (campaignLoc) return { location: campaignLoc, isCanonical: false };
  }

  return null;
}

/**
 * Find or create a campaign-scoped location.
 */
export async function findOrCreateForCampaign(prisma, rawName, { campaignId, ...data }) {
  const slug = slugifyLocationName(rawName);

  const existing = await prisma.location.findFirst({
    where: { campaignId, canonicalName: slug },
  });
  if (existing) return existing;

  return prisma.location.create({
    data: {
      campaignId,
      canonicalName: slug,
      displayName: rawName,
      ...data,
    },
  });
}

// ─── Promotion ───────────────────────────────────────────────────────

/**
 * Promotes a campaign-scoped location to canonical.
 * Just flips campaignId to null. No cross-table copy needed.
 */
export function promoteToCanonical(prisma, locationId, { canonicalName }) {
  return prisma.location.update({
    where: { id: locationId },
    data: {
      campaignId: null,
      canonicalName,
      knownByDefault: false,
      positionConfidence: 1,
      globallyActive: true,
    },
  });
}

// ─── Lookup by ID (replaces lookupLocationByKindId) ──────────────────

/**
 * Simple lookup by ID in the unified table. No more kind dispatch needed.
 */
export function findById(prisma, id, { select } = {}) {
  return prisma.location.findUnique({
    where: { id },
    ...(select && { select }),
  });
}

// ─── Parent chain traversal ──────────────────────────────────────────

/**
 * Walk up the parent chain. Returns Set of ancestor location IDs.
 */
export async function walkUpAncestors(prisma, locationId, { maxDepth = 10 } = {}) {
  const ancestors = new Set();
  let current = locationId;
  let depth = 0;

  while (current && depth < maxDepth) {
    const loc = await prisma.location.findUnique({
      where: { id: current },
      select: { parentLocationId: true },
    });
    if (!loc?.parentLocationId) break;
    ancestors.add(loc.parentLocationId);
    current = loc.parentLocationId;
    depth++;
  }

  return ancestors;
}
