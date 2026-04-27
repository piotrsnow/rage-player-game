import { resolveLocationByName } from '../../livingWorld/worldStateService.js';
import { loadCampaignFog } from '../../livingWorld/userDiscoveryService.js';
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

  // Fog check — accept BOTH visited and heard-about as travel-eligible.
  // Heard-about (NPC mentioned the place) flips the location to visible on
  // the map and clickable for travel; the player doesn't need to have been
  // there before. `loadCampaignFog` merges canonical (UserDiscoveredLocation)
  // and sandbox (CampaignDiscoveredLocation) fog, so this works for both
  // kinds. `loadDiscovery` was visited-only — wrong helper for this.
  const fog = await loadCampaignFog({ userId, campaignId }).catch(() => ({
    visited: new Set(), heardAbout: new Set(),
  }));
  const targetInFog = fog.visited.has(targetRef.row.id) || fog.heardAbout.has(targetRef.row.id);

  return {
    kind: 'travel',
    startName: startLocation.canonicalName || startLocation.name || '',
    targetName: targetDisplay,
    targetInFog,
  };
}
