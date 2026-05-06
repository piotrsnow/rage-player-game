// Wall tool — pick a wall tile variant based on the 8-neighbour mask of
// already-painted "wall" cells.
//
// Unlike autotile groups, walls don't have a dedicated origin block — they
// pick from any tile tagged with the `wall` atom plus one or more `edge_*`
// atoms. The selection scoring is:
//
//   * all required edges present on the tile: score = popcount(required)
//   * no extra edges:                           score -= popcount(extra)
//   * ties broken by `autotileRole` preference (corner > edge > inner > fill)
//
// Returns a palette index (+1 so 0 means "no suitable tile").
//
// The wall atlas concept: for each "wall group" (set of tiles sharing
// `material` trait + `wall` atom), the caller provides the list of
// candidate palette entries with their atoms. We produce a mask→palette
// index lookup by scoring each candidate once.

import { N, E, S, W, NE, SE, SW, NW, neighbourMask } from './autotile.js';

export const EDGE_BITS = {
  edge_N: N,
  edge_E: E,
  edge_S: S,
  edge_W: W,
  edge_NE: NE,
  edge_SE: SE,
  edge_SW: SW,
  edge_NW: NW,
};

// Given a mask of "same-wall-group" neighbours, the EDGES a suitable
// wall tile should expose are the DIRECTIONS that are EMPTY (i.e. where
// this tile faces open air). A wall facing an open north is `edge_N`.
export function requiredEdgesForMask(mask) {
  // Cardinals: required when that neighbour is absent.
  let req = 0;
  if (!(mask & N)) req |= N;
  if (!(mask & E)) req |= E;
  if (!(mask & S)) req |= S;
  if (!(mask & W)) req |= W;
  // Diagonals: required only when both adjacent cardinals are present but
  // the diagonal neighbour is absent — that indicates an inner corner.
  if ((mask & N) && (mask & E) && !(mask & NE)) req |= NE;
  if ((mask & S) && (mask & E) && !(mask & SE)) req |= SE;
  if ((mask & S) && (mask & W) && !(mask & SW)) req |= SW;
  if ((mask & N) && (mask & W) && !(mask & NW)) req |= NW;
  return req;
}

function edgesFromAtoms(atoms) {
  let m = 0;
  for (const a of atoms || []) {
    if (EDGE_BITS[a]) m |= EDGE_BITS[a];
  }
  return m;
}

const ROLE_SCORE = { corner: 4, edge: 3, inner: 2, fill: 1 };

/**
 * Score a candidate tile against a desired edges mask.
 * Higher is better.
 */
export function scoreCandidate(candidate, requiredEdges) {
  const candEdges = edgesFromAtoms(candidate.atoms);
  if ((candEdges & requiredEdges) !== requiredEdges) {
    // Missing a required edge — strong penalty. Keep a non-zero score so
    // ties aren't 0-0 and a "closest" fallback is still picked.
    const missing = popcount(requiredEdges & ~candEdges);
    return -10 * missing;
  }
  const extra = popcount(candEdges & ~requiredEdges);
  let score = popcount(requiredEdges) * 10 - extra;
  if (candidate.autotileRole && ROLE_SCORE[candidate.autotileRole]) {
    score += ROLE_SCORE[candidate.autotileRole];
  }
  return score;
}

function popcount(n) {
  let c = 0;
  while (n) { c += n & 1; n >>>= 1; }
  return c;
}

/**
 * Build a mask→candidate lookup for a set of wall candidates. Returns a
 * Map keyed by 0..255 of the best candidate for each mask (or undefined
 * if no candidate is suitable).
 */
export function buildWallLookup(candidates) {
  const byMask = new Map();
  for (let mask = 0; mask < 256; mask++) {
    const req = requiredEdgesForMask(mask);
    let bestScore = -Infinity;
    let best = null;
    for (const c of candidates) {
      const s = scoreCandidate(c, req);
      if (s > bestScore) { bestScore = s; best = c; }
    }
    if (best) byMask.set(mask, best);
  }
  return byMask;
}

/**
 * Produce a patch list to repaint a rectangular area of wall cells based
 * on the 8-neighbour mask of adjacent wall cells.
 *
 * @param {object} p
 * @param {Array}  p.candidates — [{ paletteIndex, atoms, autotileRole }]
 * @param {(x,y)=>boolean} p.isWall — treats out-of-bounds as false
 * @param {number} p.x0,p.y0,p.x1,p.y1 — paint region bounds
 * @param {number} p.cols,p.rows
 * @returns {Array<{x,y,layer,next}>}
 */
export function recomputeWallArea({
  candidates, isWall, x0, y0, x1, y1, cols, rows, layer = 'ground',
}) {
  const lookup = buildWallLookup(candidates);
  const minX = Math.max(0, Math.min(x0, x1) - 1);
  const minY = Math.max(0, Math.min(y0, y1) - 1);
  const maxX = Math.min(cols - 1, Math.max(x0, x1) + 1);
  const maxY = Math.min(rows - 1, Math.max(y0, y1) + 1);
  const patches = [];
  const grid = (x, y) => {
    if (x < 0 || y < 0 || x >= cols || y >= rows) return false;
    return isWall(x, y);
  };
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (!isWall(x, y)) continue;
      const m = neighbourMask(grid, x, y);
      const hit = lookup.get(m);
      if (hit) patches.push({ layer, x, y, next: hit.paletteIndex });
    }
  }
  return patches;
}
