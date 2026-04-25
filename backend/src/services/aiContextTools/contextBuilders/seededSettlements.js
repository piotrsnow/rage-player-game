import { prisma } from '../../../lib/prisma.js';

/**
 * Phase A — build SEEDED SETTLEMENTS block for a campaign. Lists every
 * settlement-type WorldLocation inside the campaign's worldBounds (or loosely
 * anchored via discovered edges if bounds are unset) plus the global capital
 * Yeralden. Returns null when bounds are unset OR no settlements exist yet.
 *
 * The premium prompt uses this to prefer existing settlements over inventing
 * new ones. Mid-play settlement creation is already blocked in
 * `processTopLevelEntry` — this block is the carrot to the stick.
 */
export async function buildSeededSettlementsBlock(campaign, currentLocation) {
  const SETTLEMENT_TYPES = ['hamlet', 'village', 'town', 'city', 'capital'];
  const bounds = (campaign?.worldBounds && typeof campaign.worldBounds === 'object')
    ? campaign.worldBounds : null;

  // Fetch capital (always visible) + in-bounds settlements.
  const capital = await prisma.worldLocation.findFirst({
    where: { locationType: 'capital', regionX: 0, regionY: 0 },
    select: { canonicalName: true, locationType: true, regionX: true, regionY: true, description: true },
  });

  let settlementsInBounds = [];
  if (bounds && Number.isFinite(bounds.minX) && Number.isFinite(bounds.maxX)) {
    settlementsInBounds = await prisma.worldLocation.findMany({
      where: {
        parentLocationId: null,
        locationType: { in: SETTLEMENT_TYPES.filter((t) => t !== 'capital') },
        regionX: { gte: bounds.minX, lte: bounds.maxX },
        regionY: { gte: bounds.minY, lte: bounds.maxY },
      },
      select: { canonicalName: true, locationType: true, regionX: true, regionY: true, description: true },
      take: 40,
    });
  }

  const all = [];
  if (capital) all.push({ ...capital, isCapital: true });
  for (const s of settlementsInBounds) all.push({ ...s, isCapital: false });

  if (all.length === 0) return null;

  // Distance from current location (approx km) so premium understands travel scale.
  const cx = currentLocation?.regionX ?? 0;
  const cy = currentLocation?.regionY ?? 0;
  const entries = all.map((s) => {
    const dx = (s.regionX ?? 0) - cx;
    const dy = (s.regionY ?? 0) - cy;
    const distanceKm = Math.round(Math.sqrt(dx * dx + dy * dy) * 10) / 10;
    return {
      name: s.canonicalName,
      type: s.locationType,
      isCapital: s.isCapital,
      distanceKm,
      description: s.description || null,
    };
  });
  entries.sort((a, b) => a.distanceKm - b.distanceKm);

  const caps = (campaign?.settlementCaps && typeof campaign.settlementCaps === 'object')
    ? campaign.settlementCaps : null;

  return { entries, caps };
}
