import { biomeLabel, getBiomeForCoords } from '../../../../../shared/domain/biomeMap.js';

/**
 * Resolves the biome at the player's current world position. Prefers the
 * continuous Campaign.currentX/Y when set (Phase 2 step movement — player
 * walked off the POI graph), otherwise falls back to the location's
 * regionX/regionY. Returns null when no coordinates are available (e.g.
 * unresolved AI-emitted location name) — the prompt block is then skipped.
 */
export function computeCurrentBiome(campaign, location) {
  const fromCampaignXY = typeof campaign?.currentX === 'number' && typeof campaign?.currentY === 'number';
  const x = fromCampaignXY ? campaign.currentX : location?.regionX;
  const y = fromCampaignXY ? campaign.currentY : location?.regionY;
  if (typeof x !== 'number' || typeof y !== 'number') return null;

  const region = getBiomeForCoords(x, y);
  return {
    biome: region.biome,
    name: region.name || null,
    danger: region.danger,
    label: biomeLabel(region),
  };
}
