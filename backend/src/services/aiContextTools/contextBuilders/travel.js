import { resolveLocationByName } from '../../livingWorld/worldStateService.js';
import { loadDiscovery } from '../../livingWorld/userDiscoveryService.js';
import { LOCATION_KIND_WORLD } from '../../locationRefs.js';

/**
 * Travel intent context block. Only built when the intent classifier flagged
 * `_intent='travel'` + extracted `_travelTarget`. The block tells premium:
 *
 *   - Where the player started (`startName`)
 *   - Where they want to go (`targetName`, normalized via name lookup)
 *   - Whether the destination is in the player's fog set (`targetInFog`)
 *
 * No path metadata, no waypoints, no encounter generation. Edge = stricte
 * zbudowana droga (bezpieczne przejście) — it does not gate travel and is
 * not surfaced here. Travel is montage-only this round (see
 * `knowledge/concepts/scene-generation.md`); biome-tile context lands later
 * (`knowledge/ideas/biome-tiles.md`).
 *
 * `targetInFog=false` is the signal premium uses to refuse the move and
 * narrate disorientation rather than emitting `stateChanges.currentLocation`
 * for a place the player has no way of knowing about.
 *
 * Returns null on no-op (missing target, target equals start, or both
 * endpoints unresolved).
 */
export async function buildTravelBlock({ campaignId, userId, startLocation, targetName }) {
  if (!startLocation?.id || !targetName) return null;

  // Canonical OR per-campaign sandbox match. Sandbox-only matches are still
  // travel-eligible (the player created the location themselves earlier).
  const targetRef = await resolveLocationByName(targetName, { campaignId }).catch(() => null);
  if (!targetRef?.row?.id) {
    return {
      kind: 'travel',
      startName: startLocation.canonicalName || startLocation.name || '',
      targetName,
      targetInFog: false,
    };
  }
  if (targetRef.row.id === startLocation.id) return null;

  const targetDisplay = targetRef.kind === LOCATION_KIND_WORLD
    ? (targetRef.row.canonicalName || targetName)
    : (targetRef.row.name || targetName);

  // Fog check — canonical locations live in the user's account fog;
  // CampaignLocations live in the campaign fog. We treat any sandbox match
  // as in-fog because the player already saw / created it in this campaign.
  let targetInFog = true;
  if (targetRef.kind === LOCATION_KIND_WORLD) {
    const { locationIds } = await loadDiscovery(userId).catch(() => ({ locationIds: new Set() }));
    targetInFog = locationIds.has(targetRef.row.id);
  }

  return {
    kind: 'travel',
    startName: startLocation.canonicalName || startLocation.name || '',
    targetName: targetDisplay,
    targetInFog,
  };
}
