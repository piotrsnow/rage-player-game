// tileFilter — shared match predicate used by both Studio (focus/dimming)
// and the Editor palette (filter bar).
//
// A "tile-like entry" only needs three optional fields:
//   - atoms:            string[]
//   - traits:           Record<string, string | true>
//   - tags:             string[]
//   - autotileGroupId?: string | null
//   - localId?:         number  (used for "#42" search matches)
//   - tilesetName?:     string  (used for free-text search)
//
// Spec shape:
//   {
//     search?: string,
//     atoms?: Set<string> | string[],
//     traits?: Record<string, string>,   // trait key → required value
//     tags?: Set<string> | string[],
//     autotileGroupId?: string,
//     untaggedOnly?: boolean,
//   }
//
// Returns { match: boolean, score: number }. Score is a rough relevance
// signal (more matched dimensions → higher score) so callers can sort
// palettes or weigh outline thickness later. Not used yet.

function toSet(value) {
  if (!value) return null;
  if (value instanceof Set) return value.size ? value : null;
  if (Array.isArray(value)) return value.length ? new Set(value) : null;
  return null;
}

export function matchTileFilter(entry, spec) {
  if (!spec || typeof spec !== 'object') return { match: true, score: 0 };

  const atoms = Array.isArray(entry?.atoms) ? entry.atoms : [];
  const traits = entry?.traits && typeof entry.traits === 'object' ? entry.traits : {};
  const tags = Array.isArray(entry?.tags) ? entry.tags : [];

  const isUntagged =
    atoms.length === 0 &&
    Object.keys(traits).length === 0 &&
    tags.length === 0;

  if (spec.untaggedOnly && !isUntagged) return { match: false, score: 0 };

  let score = 0;

  const atomSpec = toSet(spec.atoms);
  if (atomSpec) {
    for (const required of atomSpec) {
      if (!atoms.includes(required)) return { match: false, score: 0 };
    }
    score += atomSpec.size;
  }

  if (spec.traits && typeof spec.traits === 'object') {
    for (const [k, v] of Object.entries(spec.traits)) {
      if (v === undefined || v === null || v === '') continue;
      if (traits[k] !== v) return { match: false, score: 0 };
      score += 1;
    }
  }

  const tagSpec = toSet(spec.tags);
  if (tagSpec) {
    for (const required of tagSpec) {
      if (!tags.includes(required)) return { match: false, score: 0 };
    }
    score += tagSpec.size;
  }

  if (spec.autotileGroupId) {
    if (entry?.autotileGroupId !== spec.autotileGroupId) {
      return { match: false, score: 0 };
    }
    score += 2;
  }

  const rawSearch = typeof spec.search === 'string' ? spec.search.trim().toLowerCase() : '';
  if (rawSearch) {
    const hay = [];
    if (Number.isFinite(entry?.localId)) hay.push(`#${entry.localId}`);
    if (entry?.tilesetName) hay.push(String(entry.tilesetName).toLowerCase());
    for (const a of atoms) hay.push(a);
    for (const t of tags) hay.push(t);
    for (const [k, v] of Object.entries(traits)) {
      hay.push(k);
      if (v && v !== true) hay.push(String(v).toLowerCase());
    }
    const joined = hay.join(' ').toLowerCase();
    if (!joined.includes(rawSearch)) return { match: false, score: 0 };
    score += 1;
  }

  return { match: true, score };
}

export const EMPTY_PALETTE_FILTER = Object.freeze({
  search: '',
  atoms: [],
  traitKey: null,
  traitValue: null,
  autotileGroupId: null,
  untaggedOnly: false,
  displayMode: 'dim',
});

export function isEmptyPaletteFilter(f) {
  if (!f) return true;
  if (f.search) return false;
  if (Array.isArray(f.atoms) && f.atoms.length) return false;
  if (f.traitKey && f.traitValue) return false;
  if (f.autotileGroupId) return false;
  if (f.untaggedOnly) return false;
  return true;
}

export function paletteFilterToSpec(f) {
  if (!f) return null;
  const spec = {};
  if (f.search) spec.search = f.search;
  if (Array.isArray(f.atoms) && f.atoms.length) spec.atoms = f.atoms;
  if (f.traitKey && f.traitValue) spec.traits = { [f.traitKey]: f.traitValue };
  if (f.autotileGroupId) spec.autotileGroupId = f.autotileGroupId;
  if (f.untaggedOnly) spec.untaggedOnly = true;
  return spec;
}
