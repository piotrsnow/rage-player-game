/**
 * Atlas-based renderer for v2 ExplorationBoard visual layer.
 *
 * Replaces the colored-tile fallback in fieldMapDraw.drawFieldGrid when the
 * board has a ready visualPack — for every visualPlacement we drawImage()
 * from the atlas at (palette.col, palette.row) × baseTilePx into the on-screen
 * cell grid (origin + col * cellSize, origin + row * cellSize).
 *
 * Stamps (footprint > 1×1) span palette.w × palette.h atlas cells and
 * cellSize × footprint on-screen cells — they get drawn once at their anchor,
 * scaled to the right pixel area.
 *
 * Layers paint in this order, low to high:
 *   1. ground   — base tiles. Always covers full grid.
 *   2. overlay  — decorative (grass tufts, puddles).
 *   3. object   — chests, furniture, large stamps.
 *
 * Within a layer we paint by ascending row, then column — gives a poor-man's
 * y-sort so taller stamps occlude shorter assets behind them.
 */

import { getFieldCellSize, getFieldGridOrigin } from './fieldMapDraw';

const LAYER_ORDER = ['ground', 'overlay', 'object'];

/**
 * @param {{
 *   ctx: CanvasRenderingContext2D,
 *   board: import('../../../../shared/domain/explorationBoard.js').ExplorationBoardV2,
 *   atlasImage: HTMLImageElement,
 *   canvasW: number,
 *   canvasH: number,
 * }} args
 * @returns true if rendered, false if no visualPack yet (caller falls back).
 */
export function drawAtlasLayer({ ctx, board, atlasImage, canvasW, canvasH }) {
  if (!board || board.version !== 2) return false;
  if (!atlasImage || !board.visualPack) return false;

  const pack = board.visualPack;
  const palette = pack.palette || {};
  const native = pack.nativeTilesize || board.baseTilePx || 64;

  const gridW = board.width;
  const gridH = board.height;
  const cellSize = getFieldCellSize(canvasW, canvasH, gridW, gridH);
  const origin = getFieldGridOrigin(canvasW, canvasH, gridW, gridH);

  const placements = Array.isArray(board.visualPlacements) ? board.visualPlacements : [];

  // Group + sort by layer / row so painter's order is stable.
  const byLayer = { ground: [], overlay: [], object: [] };
  for (const p of placements) {
    const bucket = byLayer[p.layer] || byLayer.object;
    bucket.push(p);
  }

  ctx.imageSmoothingEnabled = false;

  for (const layer of LAYER_ORDER) {
    const list = byLayer[layer];
    if (!list.length) continue;
    list.sort((a, b) => a.anchor.y - b.anchor.y || a.anchor.x - b.anchor.x);
    for (const p of list) {
      const slot = palette[p.assetId];
      if (!slot) continue;
      const w = slot.w || 1;
      const h = slot.h || 1;
      const sx = slot.col * native;
      const sy = slot.row * native;
      const sw = w * native;
      const sh = h * native;
      const dx = origin.x + p.anchor.x * cellSize;
      const dy = origin.y + p.anchor.y * cellSize;
      const dw = w * cellSize;
      const dh = h * cellSize;
      try {
        ctx.drawImage(atlasImage, sx, sy, sw, sh, dx, dy, dw, dh);
      } catch {
        // Defensive: if the atlas hasn't fully decoded yet, drawImage throws.
        // Skip the placement; the next animation frame will retry.
      }
    }
  }

  return true;
}

/**
 * Resolve the atlas sprite slot for an object's visualAssetId, used by the
 * objects layer above the tile atlas. Returns null when there's no atlas or
 * no matching asset.
 */
export function resolveObjectSprite({ board, atlasImage, visualAssetId }) {
  if (!visualAssetId) return null;
  if (!board || board.version !== 2 || !atlasImage || !board.visualPack) return null;
  const slot = board.visualPack.palette?.[visualAssetId];
  if (!slot) return null;
  const native = board.visualPack.nativeTilesize || board.baseTilePx || 64;
  return {
    image: atlasImage,
    sx: slot.col * native,
    sy: slot.row * native,
    sw: (slot.w || 1) * native,
    sh: (slot.h || 1) * native,
    w: slot.w || 1,
    h: slot.h || 1,
  };
}
