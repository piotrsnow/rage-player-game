// tileCompleteness — single source of truth for "is this tile fully
// described". A tile is considered complete when at least one atom from
// every one of the four canonical sections (passability / structure /
// autotile role / layer hint) is present.
//
// Consumed by:
//   mapapp/src/studio/TileInspector.jsx   — completeness banner + section list
//   mapapp/src/studio/TileGrid.jsx        — dims incomplete tiles
//   mapapp/src/editor/Palette.jsx         — blocks incomplete tiles from brush
//   mapapp/src/editor/usePaletteBuilder.js— excludes from wallCandidates
//
// Keep keys and ordering stable — UI renders them in the order defined here.

export const ATOM_SECTIONS = Object.freeze({
  passability: Object.freeze(['solid', 'walkable', 'water', 'hazard']),
  structure: Object.freeze(['wall', 'floor', 'door', 'window', 'stairs']),
  role: Object.freeze([
    'autotile_role_corner',
    'autotile_role_edge',
    'autotile_role_inner',
    'autotile_role_fill',
  ]),
  layer: Object.freeze(['layer_hint_ground', 'layer_hint_overlay', 'layer_hint_object']),
});

// Polish labels for the completeness banner + palette tooltip. Kept here
// (not in atomDocs.js) so backend and shared code don't need to depend on
// FE-only doc tables.
export const SECTION_LABELS_PL = Object.freeze({
  passability: 'Przejezdność',
  structure: 'Struktura',
  role: 'Rola autotile',
  layer: 'Hint warstwy',
});

export const SECTION_ORDER = Object.freeze(['passability', 'structure', 'role', 'layer']);
export const SECTION_COUNT = SECTION_ORDER.length;

/**
 * Evaluate tile completeness.
 *
 * @param {string[] | null | undefined} atoms tile atoms
 * @returns {{ complete: boolean, present: string[], missing: string[], filled: number, total: number }}
 *   `present` / `missing` are section keys (e.g. 'passability'), in SECTION_ORDER.
 */
export function tileCompleteness(atoms) {
  const set = new Set(Array.isArray(atoms) ? atoms : []);
  const present = [];
  const missing = [];
  for (const key of SECTION_ORDER) {
    const members = ATOM_SECTIONS[key];
    let hit = false;
    for (const a of members) {
      if (set.has(a)) { hit = true; break; }
    }
    (hit ? present : missing).push(key);
  }
  return {
    complete: missing.length === 0,
    present,
    missing,
    filled: present.length,
    total: SECTION_COUNT,
  };
}

/**
 * Format the missing sections for a UI hint.
 * @param {string[]} missing section keys
 */
export function formatMissingSectionsPl(missing) {
  if (!missing || !missing.length) return '';
  return missing.map((k) => SECTION_LABELS_PL[k] || k).join(', ');
}
