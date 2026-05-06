// Heuristic auto-detection of RPG Maker A1 / A2 autotile groups inside a
// tileset atlas.
//
// The idea is narrow on purpose — we only recognise the two widespread
// layouts and emit a proposal per detected block. Every proposal is
// user-reviewable; nothing is destructive.
//
// A1 (animated waterfalls / liquids) layout:
//   Block is 2 tiles wide × 3 tiles tall (the 1st column of the "animated
//   frames"). A1 atlases stack four such blocks horizontally and usually
//   three rows of them vertically, yielding an 8×6 tile atlas.
//   We emit one group per detected (originCol, originRow), sized 2×3.
//
// A2 (ground autotiles):
//   Block is 2 tiles wide × 3 tiles tall; A2 atlases tile them in an 8×16
//   grid. Same detection — every 2×3 block is a candidate.
//
// The caller passes image dimensions + nativeTilesize. We derive the grid
// and propose groups at every (col mod 2 === 0, row mod 3 === 0) origin
// that lands inside the image.
//
// Which layout we propose is a pure heuristic based on the atlas aspect
// ratio and the name hint the caller provides:
//   - width/height ratio < 1 and file name contains "A2" → a2
//   - otherwise → a1
// The Studio UI lets the user fix the layout via a dropdown before saving.

const A1_BLOCK_COLS = 2;
const A1_BLOCK_ROWS = 3;
const A2_BLOCK_COLS = 2;
const A2_BLOCK_ROWS = 3;

export function detectRpgMakerAutotileGroups({
  imageWidth,
  imageHeight,
  nativeTilesize,
  nameHint = '',
  maxGroups = 64,
} = {}) {
  if (!imageWidth || !imageHeight || !nativeTilesize) return [];
  const cols = Math.floor(imageWidth / nativeTilesize);
  const rows = Math.floor(imageHeight / nativeTilesize);

  const hint = String(nameHint).toLowerCase();
  const layout = hint.includes('a2') || (rows > cols * 1.5) ? 'rpgmaker_a2' : 'rpgmaker_a1';
  const bCols = layout === 'rpgmaker_a2' ? A2_BLOCK_COLS : A1_BLOCK_COLS;
  const bRows = layout === 'rpgmaker_a2' ? A2_BLOCK_ROWS : A1_BLOCK_ROWS;

  // Only emit when the image dimensions look plausible for the layout.
  // Reject images where the grid isn't an integer multiple of the block.
  if (cols % bCols !== 0 || rows % bRows !== 0) return [];

  // Reject absurdly small or large grids.
  if (cols < bCols || rows < bRows) return [];

  const proposals = [];
  let n = 0;
  for (let row = 0; row + bRows <= rows; row += bRows) {
    for (let col = 0; col + bCols <= cols; col += bCols) {
      proposals.push({
        name: `${layout === 'rpgmaker_a1' ? 'A1' : 'A2'} block ${n + 1}`,
        layout,
        originCol: col,
        originRow: row,
        cols: bCols,
        rows: bRows,
      });
      n++;
      if (n >= maxGroups) return proposals;
    }
  }
  return proposals;
}

// Convenience: given a group + tileset native size, return the tile localIds
// that belong to the block (assuming a whole-image region in row-major id
// enumeration).
export function autotileGroupTileIds(group, { imageWidth, nativeTilesize }) {
  const cols = Math.floor(imageWidth / nativeTilesize);
  const ids = [];
  for (let r = 0; r < group.rows; r++) {
    for (let c = 0; c < group.cols; c++) {
      const col = group.originCol + c;
      const row = group.originRow + r;
      ids.push(row * cols + col);
    }
  }
  return ids;
}
