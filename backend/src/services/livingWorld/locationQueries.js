// Living World — Round B (Phase 4d).
//
// Unified query for "every location this campaign is allowed to see" —
// canonical WorldLocation rows + per-campaign CampaignLocation rows. Used by:
//   - fog-of-war discovery endpoint (Round C player map)
//   - travel-graph pathfinding (so Dijkstra sees campaign-specific anchors)
//   - scene-gen location-list blocks
//
// F5b — the canonical/non-canonical split moved from a single
// `WorldLocation.isCanonical` flag to two separate tables. Returned rows
// carry a `kind` discriminator ('world' | 'campaign') so callers can branch
// on it (e.g. only canonical rows have Roads).

import { prisma } from '../../lib/prisma.js';
import { loadCampaignFog } from './userDiscoveryService.js';
import { LOCATION_KIND_WORLD, LOCATION_KIND_CAMPAIGN } from '../locationRefs.js';

/**
 * Return every location this campaign may reference — canonical WorldLocation
 * rows + this campaign's CampaignLocation rows. Each row is augmented with a
 * `kind` discriminator + a `displayName` field that is `canonicalName` for
 * canonical rows and `name` for campaign rows so the caller can render
 * uniformly.
 *
 * Options:
 *   topLevelOnly   — drop rows with a `parentLocationId` set.
 *   includeSubs    — include sublocations (default: true).
 *   visibleOnly    — filter to locations the player has visited or heard
 *                    about. Requires userId.
 *   userId         — required if visibleOnly=true.
 *   select         — Prisma select shape (optional). Applied symmetrically
 *                    to both tables — pass keys both tables share.
 */
export async function listLocationsForCampaign(campaignId, opts = {}) {
  const {
    topLevelOnly = false,
    includeSubs = true,
    visibleOnly = false,
    userId = null,
    select = null,
  } = opts;

  const wlWhere = {};
  const clWhere = { campaignId };
  if (topLevelOnly || !includeSubs) {
    wlWhere.parentLocationId = null;
    clWhere.parentLocationId = null;
  }

  const [wlRows, clRows] = await Promise.all([
    prisma.worldLocation.findMany({
      where: wlWhere,
      ...(select ? { select } : {}),
      orderBy: [{ parentLocationId: 'asc' }, { regionX: 'asc' }, { regionY: 'asc' }],
    }),
    prisma.campaignLocation.findMany({
      where: clWhere,
      ...(select ? { select } : {}),
      orderBy: [{ parentLocationId: 'asc' }, { regionX: 'asc' }, { regionY: 'asc' }],
    }),
  ]);

  const merged = [
    ...wlRows.map((r) => ({
      ...r,
      kind: LOCATION_KIND_WORLD,
      displayName: r.displayName || r.canonicalName || null,
    })),
    ...clRows.map((r) => ({
      ...r,
      kind: LOCATION_KIND_CAMPAIGN,
      displayName: r.name,
      canonicalName: r.name,
    })),
  ];

  if (!visibleOnly) return merged;

  if (!userId) throw new Error('listLocationsForCampaign: userId required when visibleOnly=true');
  const fog = await loadCampaignFog({ userId, campaignId });
  return merged.filter((r) => fog.visited.has(r.id) || fog.heardAbout.has(r.id));
}

/**
 * Cheaper variant for callers that only need the set of visible refs — skips
 * fetching full rows. Returns `{ visited: Set<refKey>, heardAbout: Set<refKey> }`
 * where refKey is `${kind}:${id}`.
 */
export async function loadVisibleLocationIds({ userId, campaignId }) {
  const fog = await loadCampaignFog({ userId, campaignId });
  return { visited: fog.visited, heardAbout: fog.heardAbout };
}
