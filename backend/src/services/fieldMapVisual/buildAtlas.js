// Compose generated per-asset PNGs into a single atlas PNG with deterministic
// (col, row) placement so the FE renderer can locate each asset by its
// `palette[assetId]` entry.
//
// Layout strategy:
//   - Atlas cell size = baseTilePx (so a 1×1 tile takes 1 cell, a 2×2 stamp
//     takes 4 cells). Stamps occupy a w×h contiguous block; the buildAtlas
//     output records the top-left (col, row) for each placed asset.
//   - Skyline-style packing — left-to-right, top-to-bottom, advancing one
//     row whenever a row can't fit the next asset's footprint. Stamps are
//     sorted by footprint descending so big tiles claim their slots first.
//   - Final atlas dim capped at 4096 (sharp's hard limit on stitched output
//     is comfortable at 4096; below that, decoded textures stay GPU-friendly).
//
// Output shape matches Map Studio expectations:
//   - PNG buffer (atlas).
//   - tiles[] — one entry per asset, with { localId, col, row, w, h } so
//     the Tileset row's `tiles` are seeded directly from this list.
//   - palette — assetId → { localId, col, row, w, h } (passed back into the
//     ExplorationBoard so renderer can `drawImage(atlas, col*cell, row*cell, ...)`).

import sharp from 'sharp';

const MAX_ATLAS_PX = 4096;

/**
 * Lay out assets into a single atlas grid.
 *
 * @param {{
 *   assets: { id: string, footprint: { w: number, h: number } }[],
 *   buffers: Map<string, Buffer>,
 *   baseTilePx: number
 * }} args
 */
export async function buildAtlas({ assets, buffers, baseTilePx }) {
  if (!Array.isArray(assets) || assets.length === 0) {
    throw new Error('buildAtlas: no assets supplied');
  }
  if (!buffers || typeof buffers.get !== 'function') {
    throw new Error('buildAtlas: buffers must be a Map');
  }
  if (!Number.isInteger(baseTilePx) || baseTilePx < 8) {
    throw new Error('buildAtlas: invalid baseTilePx');
  }

  // Stamps first (largest footprint) — they need contiguous space, so packing
  // them while the atlas is empty avoids leaving awkward holes.
  const sorted = [...assets].sort((a, b) => {
    const aArea = a.footprint.w * a.footprint.h;
    const bArea = b.footprint.w * b.footprint.h;
    return bArea - aArea;
  });

  // Choose atlas dimensions: aim for square-ish at ~sqrt(totalCells) but
  // round up to a multiple of the widest footprint so wide stamps fit.
  const totalCells = sorted.reduce((s, a) => s + a.footprint.w * a.footprint.h, 0);
  const widest = sorted.reduce((m, a) => Math.max(m, a.footprint.w), 1);
  let cols = Math.max(widest, Math.ceil(Math.sqrt(totalCells)));
  // Ensure pixel width fits the cap.
  while (cols * baseTilePx > MAX_ATLAS_PX) cols--;
  if (cols < widest) {
    throw new Error(`buildAtlas: widest asset footprint (${widest}) does not fit in ${MAX_ATLAS_PX}px at baseTilePx=${baseTilePx}`);
  }

  // First-fit skyline: occupancy grid grows as we place.
  const occupied = []; // 2D: occupied[row][col] = boolean
  function isFree(col, row, w, h) {
    for (let dy = 0; dy < h; dy++) {
      const r = occupied[row + dy];
      if (!r) continue; // unallocated row counts as free
      for (let dx = 0; dx < w; dx++) {
        if (r[col + dx]) return false;
      }
    }
    return true;
  }
  function markOccupied(col, row, w, h) {
    for (let dy = 0; dy < h; dy++) {
      const ry = row + dy;
      if (!occupied[ry]) occupied[ry] = [];
      for (let dx = 0; dx < w; dx++) {
        occupied[ry][col + dx] = true;
      }
    }
  }

  const placements = [];
  let nextLocalId = 0;
  let maxRow = 0;

  for (const asset of sorted) {
    const { w, h } = asset.footprint;
    let placed = false;
    // Probe rows top-to-bottom for first fit.
    for (let r = 0; !placed; r++) {
      for (let c = 0; c <= cols - w; c++) {
        if (isFree(c, r, w, h)) {
          markOccupied(c, r, w, h);
          placements.push({
            assetId: asset.id,
            localId: nextLocalId++,
            col: c,
            row: r,
            w,
            h,
          });
          maxRow = Math.max(maxRow, r + h);
          placed = true;
          break;
        }
      }
      // Safety net — atlas growth past 1024 rows means something is wrong.
      if (r > 2048) throw new Error('buildAtlas: layout overflow');
    }
  }

  const atlasW = cols * baseTilePx;
  const atlasH = maxRow * baseTilePx;
  if (atlasH > MAX_ATLAS_PX || atlasW > MAX_ATLAS_PX) {
    throw new Error(`buildAtlas: result exceeds max dim (${atlasW}×${atlasH} > ${MAX_ATLAS_PX})`);
  }

  // Composite all per-asset PNGs onto a transparent canvas at their placement.
  const composites = [];
  for (const p of placements) {
    const buf = buffers.get(p.assetId);
    if (!buf) throw new Error(`buildAtlas: missing buffer for asset ${p.assetId}`);
    composites.push({
      input: buf,
      left: p.col * baseTilePx,
      top: p.row * baseTilePx,
    });
  }

  const atlasBuffer = await sharp({
    create: {
      width: atlasW,
      height: atlasH,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(composites)
    .png({ compressionLevel: 9 })
    .toBuffer();

  // palette: assetId → atlas slot (FE looks up per visualPlacement)
  const palette = {};
  for (const p of placements) {
    palette[p.assetId] = { localId: p.localId, col: p.col, row: p.row, w: p.w, h: p.h };
  }

  // tiles[] format matches the Map Studio Tile schema (one row per atlas cell).
  // For stamps we emit a single row at the top-left cell — the FE knows to
  // span w×h cells from `palette[assetId].w/h`.
  const tiles = placements.map((p) => ({
    localId: p.localId,
    regionId: '',
    col: p.col,
    row: p.row,
    nativeSize: baseTilePx,
  }));

  return {
    buffer: atlasBuffer,
    width: atlasW,
    height: atlasH,
    cols,
    rows: maxRow,
    nativeTilesize: baseTilePx,
    tiles,
    palette,
  };
}
