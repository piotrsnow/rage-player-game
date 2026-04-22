// Living World — Round B (Phase 4d).
//
// Unified query for "every location this campaign is allowed to see" —
// canonical rows + non-canonical rows scoped to this campaign. Used by:
//   - fog-of-war discovery endpoint (Round C player map)
//   - travel-graph pathfinding (so Dijkstra sees campaign-specific edges)
//   - scene-gen location-list blocks
//
// The query relies on the composite index
// `@@index([isCanonical, createdByCampaignId])` added in Round A.

import { prisma } from '../../lib/prisma.js';
import { loadCampaignFog } from './userDiscoveryService.js';

/**
 * Return every WorldLocation this campaign may reference — canonical core
 * + non-canonical rows it created itself.
 *
 * Options:
 *   topLevelOnly   — drop rows where `parentLocationId` is non-null.
 *   includeSubs    — include sublocations (default: true).
 *   visibleOnly    — filter to locations the player has visited or heard
 *                    about. Requires userId.
 *   userId         — required if visibleOnly=true.
 *   select         — Prisma select shape (optional).
 */
export async function listLocationsForCampaign(campaignId, opts = {}) {
  const {
    topLevelOnly = false,
    includeSubs = true,
    visibleOnly = false,
    userId = null,
    select = null,
  } = opts;

  const where = {
    OR: [
      { isCanonical: true },
      { isCanonical: false, createdByCampaignId: campaignId },
    ],
  };
  if (topLevelOnly) where.parentLocationId = null;
  if (!includeSubs && !topLevelOnly) where.parentLocationId = null;

  const rows = await prisma.worldLocation.findMany({
    where,
    ...(select ? { select } : {}),
    orderBy: [{ parentLocationId: 'asc' }, { regionX: 'asc' }, { regionY: 'asc' }],
  });

  if (!visibleOnly) return rows;

  if (!userId) throw new Error('listLocationsForCampaign: userId required when visibleOnly=true');
  const fog = await loadCampaignFog({ userId, campaignId });
  return rows.filter((r) => fog.visited.has(r.id) || fog.heardAbout.has(r.id));
}

/**
 * Cheaper variant for callers that only need the set of visible ids — skips
 * fetching full WorldLocation rows. Returns `{ visited: Set<id>, heardAbout: Set<id> }`.
 */
export async function loadVisibleLocationIds({ userId, campaignId }) {
  const fog = await loadCampaignFog({ userId, campaignId });
  return { visited: fog.visited, heardAbout: fog.heardAbout };
}
