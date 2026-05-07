import { shortId } from '../../../utils/ids';

/**
 * Location mutations from AI: `mapChanges` (per-location descriptive mods),
 * and `currentLocation` (teleport/walk target).
 *
 * DEPRECATION: mapState, mapConnections, and exploredLocations are DEPRECATED
 * as independent state — the Location Graph (LocationEdge table) is now the
 * source of truth for spatial relationships. These fields are kept for backward
 * compatibility reads only. New mapConnections entries are NO LONGER created;
 * the graph edges are the canonical connectivity data.
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

/**
 * Parse composite ref string "kind:UUID" → { kind, id } or null.
 */
function parseCompositeRef(value) {
  if (!value) return null;
  if (typeof value === 'object' && value.kind && value.id) {
    return { kind: value.kind, id: value.id };
  }
  if (typeof value !== 'string') return null;
  const m = value.match(/^(world|campaign):([0-9a-f-]{36})$/i);
  if (!m) return null;
  return { kind: m[1].toLowerCase(), id: m[2] };
}

export function applyCurrentLocation(draft, changes) {
  // Faza 3a — preferowane źródło: composite ref. AI/BE może zwrócić
  // `currentLocationRef` (string "kind:UUID" lub object). Legacy `currentLocation`
  // (free-text string) zachowane jako fallback do Fazy 8.
  const ref = parseCompositeRef(changes.currentLocationRef);
  if (ref) {
    draft.world.currentLocationRef = ref;
  }

  if (!changes.currentLocation) return;

  if (!draft.world.exploredLocations) draft.world.exploredLocations = [];
  const explored = new Set(draft.world.exploredLocations);
  explored.add(changes.currentLocation);
  draft.world.exploredLocations = [...explored];

  // DEPRECATED: mapConnections writes removed — the LocationEdge graph is the
  // source of truth for location connectivity. Graph edges are maintained by
  // the post-scene graph extractor (postSceneWork → extractGraphUpdate).

  draft.world.currentLocation = changes.currentLocation;
}
