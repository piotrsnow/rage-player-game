// Faza 3a — utils dla composite location ref `{ kind: 'world'|'campaign', id: UUID }`.
//
// Używane w handlerach, selektorach, komponentach UI, multiplayer sync.
// Niezależna kopia helperów z `shared/domain/locationGraph.js` (te same
// kontrakty, ale bez Zod runtime — lekki utility).

const COMPOSITE_REF_REGEX = /^(world|campaign):([0-9a-f-]{36})$/i;

/**
 * Null-safe equality dla dwóch composite refs.
 */
export function refsEqual(a, b) {
  if (!a || !b) return a === b;
  return a.kind === b.kind && a.id === b.id;
}

/**
 * Serializacja do "kind:id" stringa (np. dla AI promptu lub klucza React).
 */
export function refToString(ref) {
  if (!ref || !ref.kind || !ref.id) return null;
  return `${ref.kind}:${ref.id}`;
}

/**
 * Parsowanie "kind:id" stringa lub object passthrough → ref.
 * Zwraca null przy błędzie.
 */
export function parseRef(input) {
  if (!input) return null;
  if (typeof input === 'object' && input.kind && input.id) {
    return { kind: input.kind, id: input.id };
  }
  if (typeof input !== 'string') return null;
  const m = input.trim().match(COMPOSITE_REF_REGEX);
  if (!m) return null;
  return { kind: m[1].toLowerCase(), id: m[2] };
}

/**
 * Helper: znajdź node w grafie po composite ref.
 * @param {Array} nodes — z `useLocationGraph()` graph.nodes
 * @param {object|null} ref
 * @returns {object|null}
 */
export function findNodeByRef(nodes, ref) {
  if (!Array.isArray(nodes) || !ref) return null;
  return nodes.find(
    (n) => n.id === ref.id && (n.kind === ref.kind || n._kind === ref.kind),
  ) || null;
}
