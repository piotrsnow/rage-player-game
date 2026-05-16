/**
 * Extract world location (+ optional NPCs) from POST /campaigns response
 * so the FE store matches BE-authoritative start spawn without a full reload.
 */
export function extractWorldHydrationFromCreateResponse(created) {
  if (!created) return null;

  const world = created.coreState?.world;
  const currentLocation = (typeof world?.currentLocation === 'string' && world.currentLocation)
    || (typeof created.currentLocationName === 'string' && created.currentLocationName)
    || null;

  const currentLocationRef = (world?.currentLocationRef?.kind && world?.currentLocationRef?.id)
    ? { kind: world.currentLocationRef.kind, id: world.currentLocationRef.id }
    : (created.currentLocationKind && created.currentLocationId
      ? { kind: created.currentLocationKind, id: created.currentLocationId }
      : null);

  const npcs = Array.isArray(world?.npcs) && world.npcs.length > 0 ? world.npcs : undefined;

  if (!currentLocation && !currentLocationRef) return null;

  return { currentLocation, currentLocationRef, npcs };
}
