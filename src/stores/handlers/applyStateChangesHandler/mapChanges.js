import { shortId } from '../../../utils/ids';

/**
 * Location mutations from AI: `mapChanges` (per-location descriptive mods),
 * and `currentLocation` (teleport/walk target). currentLocation also seeds
 * the explored-set, the mapConnections edge list, and a mapState entry for
 * any previously-unseen location so the FE map has a node to render.
 */
export function applyMapChanges(draft, changes) {
  if (!changes.mapChanges?.length) return;
  if (!draft.world.mapState) draft.world.mapState = [];

  for (const change of changes.mapChanges) {
    const idx = draft.world.mapState.findIndex(
      (m) => m.name?.toLowerCase() === change.location?.toLowerCase(),
    );
    const modification = {
      description: change.modification,
      type: change.type || 'other',
      timestamp: Date.now(),
    };
    if (idx >= 0) {
      if (!draft.world.mapState[idx].modifications) draft.world.mapState[idx].modifications = [];
      draft.world.mapState[idx].modifications.push(modification);
    } else {
      draft.world.mapState.push({
        id: `loc_${Date.now()}_${shortId(5)}`,
        name: change.location,
        description: '',
        modifications: [modification],
      });
    }
  }
}

export function applyCurrentLocation(draft, changes) {
  if (!changes.currentLocation) return;

  if (!draft.world.exploredLocations) draft.world.exploredLocations = [];
  const explored = new Set(draft.world.exploredLocations);
  explored.add(changes.currentLocation);
  draft.world.exploredLocations = [...explored];

  const prevLoc = draft.world.currentLocation;
  const newLoc = changes.currentLocation;

  if (prevLoc && newLoc && prevLoc.toLowerCase() !== newLoc.toLowerCase()) {
    if (!draft.world.mapConnections) draft.world.mapConnections = [];
    const already = draft.world.mapConnections.some(
      (c) =>
        (c.from.toLowerCase() === prevLoc.toLowerCase() && c.to.toLowerCase() === newLoc.toLowerCase())
        || (c.from.toLowerCase() === newLoc.toLowerCase() && c.to.toLowerCase() === prevLoc.toLowerCase()),
    );
    if (!already) {
      draft.world.mapConnections.push({ from: prevLoc, to: newLoc });
    }

    if (!draft.world.mapState) draft.world.mapState = [];
    for (const locName of [prevLoc, newLoc]) {
      if (!draft.world.mapState.some((m) => m.name?.toLowerCase() === locName.toLowerCase())) {
        draft.world.mapState.push({
          id: `loc_${Date.now()}_${shortId(5)}`,
          name: locName,
          description: '',
          modifications: [],
        });
      }
    }
  }

  draft.world.currentLocation = newLoc;
}
