// Faza 1 — `useCurrentLocationNode`: zwraca aktualny node grafu lokacji
// dla scenePlannera/Scene3D/walk integracji.
//
// Po Fazie 3a state będzie miał `world.currentLocationRef: { kind, id }` —
// hook resolve direct po ref. Aktualnie (przed Fazą 3a) state ciągle używa
// `world.currentLocation: string` — hook fallback do match-by-name.
//
// Strategia hybrydowa: jeśli `world.currentLocationRef` jest ustawiony, używaj
// go; w przeciwnym razie szukaj po nazwie w grafie. Po Fazie 3a fallback string
// znika, a hook upraszcza się do single ref-based lookup.

import { useMemo } from 'react';
import { useGameSlice } from '../stores/gameSelectors';

/**
 * Resolve current location node from `useLocationGraph` graph + state ref/name.
 *
 * @param {{ nodes: Array<object> } | null} graph — output z `useLocationGraph()`.
 * @returns {object|null} node grafu lub null jeśli nie udało się sresolwować.
 */
export function useCurrentLocationNode(graph) {
  // Faza 3a — preferowane źródło: composite ref.
  const currentLocationRef = useGameSlice((s) => s.world?.currentLocationRef);
  // Legacy fallback (do Fazy 3a): plain string name.
  const currentLocationName = useGameSlice((s) => s.world?.currentLocation);

  return useMemo(() => {
    const nodes = graph?.nodes;
    if (!Array.isArray(nodes) || nodes.length === 0) return null;

    // 1) Ref-based lookup (UUID + kind).
    if (currentLocationRef && currentLocationRef.id && currentLocationRef.kind) {
      const found = nodes.find(
        (n) => n.id === currentLocationRef.id && (n.kind === currentLocationRef.kind || n._kind === currentLocationRef.kind),
      );
      if (found) return found;
    }

    // 2) Name-based fallback (legacy). Case-insensitive match.
    if (typeof currentLocationName === 'string' && currentLocationName.trim()) {
      const target = currentLocationName.trim().toLowerCase();
      const found = nodes.find((n) => {
        const candidates = [n.name, n.canonicalName, n.displayName].filter(Boolean);
        return candidates.some((c) => String(c).toLowerCase() === target);
      });
      if (found) return found;
    }

    return null;
  }, [graph, currentLocationRef, currentLocationName]);
}
