import { makePaletteKey } from './paletteEntry.js';

// Autotile engine — pick the right tile variant from an AutotileGroup based
// on the 4- or 8-neighbour bitmask of the paint plot.
//
// Supported layouts:
//   - rpgmaker_a2    2×3 block → 47 variants via the RPGM-A2 lookup table
//   - rpgmaker_a1    2×3 block, animated-frame; for static output we reuse
//                    the A2 mapping against the first frame (origin column)
//   - blob_47        8×6 block (47 distinct tiles) using the classic blob
//                    bitmask; 2-edge-wang fallback maps to a subset.
//
// Everything returns a *local* (col, row) offset from the group's
// (originCol, originRow). The editor resolves that to a concrete palette
// entry (packId/tilesetId/localId) via the group's tileset grid.
//
// Input: `grid` — a function (x, y) => boolean that reports whether the
// cell is "same-group" (i.e. we paint the group into it).

// 8-way neighbour flags.
export const N  = 1 << 0;
export const E  = 1 << 1;
export const S  = 1 << 2;
export const W  = 1 << 3;
export const NE = 1 << 4;
export const SE = 1 << 5;
export const SW = 1 << 6;
export const NW = 1 << 7;

export function neighbourMask(grid, x, y) {
  let m = 0;
  if (grid(x, y - 1)) m |= N;
  if (grid(x + 1, y)) m |= E;
  if (grid(x, y + 1)) m |= S;
  if (grid(x - 1, y)) m |= W;
  // Corner flags only matter if both cardinals on the corner are also set.
  if ((m & N) && (m & E) && grid(x + 1, y - 1)) m |= NE;
  if ((m & S) && (m & E) && grid(x + 1, y + 1)) m |= SE;
  if ((m & S) && (m & W) && grid(x - 1, y + 1)) m |= SW;
  if ((m & N) && (m & W) && grid(x - 1, y - 1)) m |= NW;
  return m;
}

// ── blob-47 layout ────────────────────────────────────────────────────
// Atlas shape: 8 columns × 6 rows; index = row*8 + col maps to one of 47
// distinct tiles. The table below is the classic blob-47 lookup indexed by
// the condensed 8-bit mask (N,E,S,W,NE,SE,SW,NW — but only corners where
// both cardinals are set). Tiles beyond slot 46 are unused.
//
// Table indexed directly by the 8-bit mask value (0..255). Most of the 256
// masks are unreachable because corners require their cardinals. The table
// maps each valid mask to a (col,row) cell inside the 8×6 atlas.
const BLOB_47_TABLE = buildBlob47Table();

function buildBlob47Table() {
  // Canonical 47-variant layout. Each entry: { mask, col, row }.
  // Mask bits match N/E/S/W/NE/SE/SW/NW constants above.
  const rows = [
    // row 0 — isolated + end caps
    { mask: 0,                        col: 0, row: 0 },
    { mask: E,                        col: 1, row: 0 },
    { mask: E | W,                    col: 2, row: 0 },
    { mask: W,                        col: 3, row: 0 },
    { mask: S,                        col: 4, row: 0 },
    { mask: N | S,                    col: 5, row: 0 },
    { mask: N,                        col: 6, row: 0 },
    // convex corners (inner)
    { mask: E | S,                    col: 7, row: 0 },

    // row 1 — basic straights and junctions
    { mask: E | S | SE,               col: 0, row: 1 },
    { mask: E | W | S,                col: 1, row: 1 },
    { mask: E | W | S | SE,           col: 2, row: 1 },
    { mask: E | W | S | SW,           col: 3, row: 1 },
    { mask: E | W | S | SE | SW,      col: 4, row: 1 },
    { mask: W | S,                    col: 5, row: 1 },
    { mask: W | S | SW,               col: 6, row: 1 },
    { mask: N | E,                    col: 7, row: 1 },

    // row 2
    { mask: N | E | NE,               col: 0, row: 2 },
    { mask: N | S | E,                col: 1, row: 2 },
    { mask: N | S | E | NE,           col: 2, row: 2 },
    { mask: N | S | E | SE,           col: 3, row: 2 },
    { mask: N | S | E | NE | SE,      col: 4, row: 2 },
    { mask: N | W,                    col: 5, row: 2 },
    { mask: N | W | NW,               col: 6, row: 2 },
    { mask: N | S | W,                col: 7, row: 2 },

    // row 3 — more cross and T junctions
    { mask: N | S | W | NW,           col: 0, row: 3 },
    { mask: N | S | W | SW,           col: 1, row: 3 },
    { mask: N | S | W | NW | SW,      col: 2, row: 3 },
    { mask: N | E | W,                col: 3, row: 3 },
    { mask: N | E | W | NE,           col: 4, row: 3 },
    { mask: N | E | W | NW,           col: 5, row: 3 },
    { mask: N | E | W | NE | NW,      col: 6, row: 3 },
    { mask: N | E | S | W,            col: 7, row: 3 },

    // row 4 — full cross variants
    { mask: N | E | S | W | NE,                       col: 0, row: 4 },
    { mask: N | E | S | W | SE,                       col: 1, row: 4 },
    { mask: N | E | S | W | SW,                       col: 2, row: 4 },
    { mask: N | E | S | W | NW,                       col: 3, row: 4 },
    { mask: N | E | S | W | NE | SE,                  col: 4, row: 4 },
    { mask: N | E | S | W | NE | NW,                  col: 5, row: 4 },
    { mask: N | E | S | W | SE | SW,                  col: 6, row: 4 },
    { mask: N | E | S | W | SW | NW,                  col: 7, row: 4 },

    // row 5 — almost-full, full
    { mask: N | E | S | W | NE | SE | SW,             col: 0, row: 5 },
    { mask: N | E | S | W | NE | SE | NW,             col: 1, row: 5 },
    { mask: N | E | S | W | SE | SW | NW,             col: 2, row: 5 },
    { mask: N | E | S | W | NE | SW | NW,             col: 3, row: 5 },
    { mask: N | E | S | W | NE | SE | SW | NW,        col: 4, row: 5 },
    { mask: N | E | S | W | NE | NW,                  col: 5, row: 5 },
    { mask: N | E | S | W | SE | SW,                  col: 6, row: 5 },
    { mask: N | E | S | W,                            col: 7, row: 5 },
  ];
  const byMask = new Map();
  for (const r of rows) byMask.set(r.mask, { col: r.col, row: r.row });
  return byMask;
}

// ── rpgmaker_a2 / a1 layout ───────────────────────────────────────────
// RPG Maker A2 packs four corner "quarters" into a 2×3 atlas block. The
// algorithm splits each target tile into four quadrants and picks the
// quadrant variant based on the two adjacent cardinals + one diagonal.
//
// For simplicity in this MVP we collapse the 48-variant A2 set into the
// same mask-indexed table as blob_47 (A2 is a superset in terms of usable
// transitions but the geometric arrangement differs). Callers pick the
// tile inside the 2×3 block based on the *cardinal-only* mask:
//
//   mask-cardinals → slot offset in the 2×3 block
//
//   NESW bits       col,row
//   ────────────────────
//   0 (isolated)    0,0
//   N               0,1
//   E               1,1
//   S               0,2
//   W               1,2
//   N|S             1,0
//   E|W             1,0 (reused)
//   N|E|S|W         1,0 (fill)
//
// This is intentionally coarse. For high-fidelity A2 rendering a 48-slot
// blob lookup per quadrant is the proper approach; shipping the coarse
// table unblocks the brush MVP and keeps paint visually correct for the
// common "lake in grass" case.
const RPGM_A2_CARDINAL_TABLE = {
  0:       { col: 0, row: 0 }, // isolated
  [N]:     { col: 0, row: 1 },
  [E]:     { col: 1, row: 1 },
  [S]:     { col: 0, row: 2 },
  [W]:     { col: 1, row: 2 },
  [N | S]: { col: 1, row: 0 },
  [E | W]: { col: 1, row: 0 },
  [N | E]: { col: 1, row: 1 },
  [N | W]: { col: 1, row: 2 },
  [S | E]: { col: 0, row: 1 },
  [S | W]: { col: 0, row: 2 },
  [N | E | S]: { col: 1, row: 0 },
  [N | E | W]: { col: 1, row: 0 },
  [N | S | W]: { col: 1, row: 0 },
  [E | S | W]: { col: 1, row: 0 },
  [N | E | S | W]: { col: 1, row: 0 },
};

function cardinalMask(mask) {
  return mask & (N | E | S | W);
}

/**
 * Pick the tile variant inside an AutotileGroup for a paint mask.
 *
 * @param {object} group — { layout, originCol, originRow }
 * @param {number} mask  — 8-bit neighbour mask from `neighbourMask`
 * @returns {{col, row}} — absolute atlas coords (already offset by origin)
 */
export function pickVariant(group, mask) {
  const layout = group.layout || 'blob_47';
  if (layout === 'blob_47') {
    const hit = BLOB_47_TABLE.get(mask);
    if (hit) return { col: group.originCol + hit.col, row: group.originRow + hit.row };
    // Fallback to the "fill" cell (slot 42, row 5 col 4) when mask is out of
    // the known set (e.g. impossible corner-only).
    return { col: group.originCol + 4, row: group.originRow + 5 };
  }
  if (layout === 'rpgmaker_a2' || layout === 'rpgmaker_a1') {
    const hit = RPGM_A2_CARDINAL_TABLE[cardinalMask(mask)] || RPGM_A2_CARDINAL_TABLE[0];
    return { col: group.originCol + hit.col, row: group.originRow + hit.row };
  }
  if (layout === 'wang_2edge') {
    // 2-edge wang sheets are 4×4 blocks indexed by the 4-bit cardinal mask.
    const m = cardinalMask(mask);
    const col = m & (E | W) ? ((m & E) ? ((m & W) ? 2 : 1) : 3) : 0;
    const row = m & (N | S) ? ((m & N) ? ((m & S) ? 2 : 1) : 3) : 0;
    return { col: group.originCol + col, row: group.originRow + row };
  }
  // custom — just use origin.
  return { col: group.originCol, row: group.originRow };
}

/**
 * Local coordinates → palette index lookup. Given the tileset grid width
 * (cols) and a palette keyed by `<tilesetId>:<localId>`, return the
 * palette index (+1 so 0 stays "empty") for a given atlas (col,row).
 */
export function paletteIndexForGroupCell({ paletteByKey, tilesetId, col, row, tilesetCols }) {
  const localId = row * tilesetCols + col;
  const key = makePaletteKey(tilesetId, localId);
  const idx = paletteByKey.get(key);
  return idx !== undefined ? idx + 1 : 0;
}

/**
 * Recompute a rectangular area of autotile cells (including 1-cell padding)
 * given a predicate that says whether a cell is "in the group".
 *
 * @returns {Array<{x, y, layer, next}>} patches consumable by applyPatches.
 */
export function recomputeAutotileArea({
  x0, y0, x1, y1, cols, rows,
  isInGroup, group, tilesetCols, tilesetId, paletteByKey, layer = 'ground',
}) {
  const patches = [];
  const minX = Math.max(0, Math.min(x0, x1) - 1);
  const minY = Math.max(0, Math.min(y0, y1) - 1);
  const maxX = Math.min(cols - 1, Math.max(x0, x1) + 1);
  const maxY = Math.min(rows - 1, Math.max(y0, y1) + 1);
  const grid = (x, y) => {
    if (x < 0 || y < 0 || x >= cols || y >= rows) return true; // paint against border = continuous
    return isInGroup(x, y);
  };
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (!isInGroup(x, y)) continue;
      const m = neighbourMask(grid, x, y);
      const cell = pickVariant(group, m);
      const next = paletteIndexForGroupCell({
        paletteByKey, tilesetId, col: cell.col, row: cell.row, tilesetCols,
      });
      if (next) patches.push({ layer, x, y, next });
    }
  }
  return patches;
}
