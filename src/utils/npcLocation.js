import { refsEqual } from './locationRef.js';

/**
 * Check whether an NPC's tracked location matches a given location.
 * Prefers composite ref ({kind,id}) match; falls back to case-insensitive
 * legacy string comparison for old campaign saves that lack refs.
 */
export function isNpcAtLocation(npc, currentLocationRef, currentLocationName) {
  if (!npc) return false;
  if (currentLocationRef && npc.locationRef) {
    return refsEqual(npc.locationRef, currentLocationRef);
  }
  if (!currentLocationName) return false;
  const npcLoc = npc.lastLocation;
  if (!npcLoc || typeof npcLoc !== 'string') return false;
  return npcLoc.toLowerCase() === currentLocationName.toLowerCase();
}

/**
 * Filter an NPC list to only those alive and at the current location.
 */
export function filterNpcsHere(npcs, currentLocationRef, currentLocationName) {
  if (!Array.isArray(npcs)) return [];
  return npcs.filter(
    (npc) => npc.alive !== false && isNpcAtLocation(npc, currentLocationRef, currentLocationName),
  );
}
