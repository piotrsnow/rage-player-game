// Tileset slicer — pure parsing utilities + browser-only stitching helpers.
//
// Responsibilities:
//   - parseTset(text)       — parse a `.tset` v2.1.x-lite JSON into a
//                             canonical shape (tilesize, per-tile sources,
//                             placements in the author's grid).
//   - parseManifest(json)   — validate an ImportManifest JSON against the
//                             shared Zod schema.
//   - detectTilesize(w, h)  — pick a likely tilesize for a plain PNG.
//   - sliceGrid({w,h,tilesize,offsetX,offsetY,regionId}) — produce a tile
//                             inventory for a rectangular region of pixels.
//   - buildTsetAtlasBlob(parsed, opts) — BROWSER ONLY. Renders the parsed
//                             `.tset` into one big PNG atlas via an
//                             OffscreenCanvas. Returns { blob, width, height,
//                             tiles[] } where each tile carries col/row in the
//                             atlas grid.
//
// This module stays environment-agnostic except for the last function which
// guards itself with `typeof OffscreenCanvas !== 'undefined'`. The CLI
// (import-tset.mjs) reimplements the stitching with `sharp`.

// Relative path so this module works identically in Vite (browser) and raw
// Node (CLI). The `@mapSchemas` alias is not available to `node` directly.
import { ImportManifestSchema } from '../../../shared/mapSchemas/importManifest.js';

export const COMMON_TILE_SIZES = [8, 16, 24, 32, 48, 64, 96, 128];

// ── .tset parser ─────────────────────────────────────────────────────
export function parseTset(input) {
  const doc = typeof input === 'string' ? JSON.parse(input) : input;
  if (!doc || typeof doc !== 'object') {
    throw new Error('Invalid .tset: not a JSON object');
  }
  const version = String(doc.version || '');
  if (!version.startsWith('2.')) {
    throw new Error(`Unsupported .tset version: ${version || 'missing'}`);
  }
  const tilesize = Number(doc.tilesize);
  if (!Number.isInteger(tilesize) || tilesize < 4 || tilesize > 256) {
    throw new Error(`Invalid tilesize: ${doc.tilesize}`);
  }

  const sources = Array.isArray(doc.sources)
    ? doc.sources.map((s, i) => decodeSource(s, i))
    : [];

  const tiles = Array.isArray(doc.tiles)
    ? doc.tiles.map((t, i) => ({
        tileID: i,
        sourceID: Number.isInteger(t?.sourceID) ? t.sourceID : i,
        type: t?.type || 'base',
      }))
    : sources.map((_, i) => ({ tileID: i, sourceID: i, type: 'base' }));

  const placements = Array.isArray(doc.set)
    ? doc.set
        .filter((p) => p && p.pos && Number.isInteger(p.tileID))
        .map((p) => ({
          x: Number(p.pos.x) | 0,
          y: Number(p.pos.y) | 0,
          tileID: p.tileID,
        }))
    : [];

  const bounds = computeBounds(placements);

  return {
    version,
    tilesize,
    sources,
    tiles,
    placements,
    bounds,
  };
}

function decodeSource(src, i) {
  const url = src?.url || '';
  const m = /^data:([^;]+);base64,(.+)$/.exec(url);
  if (!m) {
    return { id: i, contentType: 'image/png', base64: '', valid: false };
  }
  return { id: i, contentType: m[1], base64: m[2], valid: true };
}

function computeBounds(placements) {
  if (!placements.length) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0, cols: 0, rows: 0 };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of placements) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return {
    minX,
    minY,
    maxX,
    maxY,
    cols: maxX - minX + 1,
    rows: maxY - minY + 1,
  };
}

// ── manifest parser ──────────────────────────────────────────────────
export function parseManifest(input) {
  const obj = typeof input === 'string' ? JSON.parse(input) : input;
  return ImportManifestSchema.parse(obj);
}

// ── tilesize detection ───────────────────────────────────────────────
// Given image pixel dimensions, return a sorted list of candidate tilesizes
// (most likely first). Heuristic:
//   1. filter COMMON_TILE_SIZES down to divisors of both w and h,
//   2. prefer sizes that produce an integer >=4 tiles-per-side but not absurd
//      counts (penalise > 128 tiles/side, typical pixel-art ceiling).
export function detectTilesize(width, height, { hint } = {}) {
  const candidates = COMMON_TILE_SIZES.filter(
    (s) => width % s === 0 && height % s === 0
  );
  const scored = candidates.map((s) => {
    const cols = width / s;
    const rows = height / s;
    let score = 0;
    if (cols >= 4 && rows >= 4) score += 10;
    if (cols <= 128 && rows <= 128) score += 5;
    score -= Math.abs(Math.log2(s) - Math.log2(hint || 16)) * 2;
    if (s === hint) score += 20;
    return { size: s, cols, rows, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return {
    best: scored[0]?.size ?? hint ?? 16,
    candidates: scored,
  };
}

// ── grid slicer ──────────────────────────────────────────────────────
// Turn a rectangular region (regionX..regionX+w, regionY..regionY+h) into a
// list of `{ localId, regionId, col, row, sx, sy, w, h }` tile entries
// enumerated in row-major order. `localIdStart` lets the caller stitch
// multiple regions into one tileset-wide id space.
export function sliceGrid({
  width,
  height,
  tilesize,
  offsetX = 0,
  offsetY = 0,
  regionId = '',
  localIdStart = 0,
} = {}) {
  if (!Number.isInteger(tilesize) || tilesize <= 0) {
    throw new Error('sliceGrid: tilesize must be a positive integer');
  }
  const cols = Math.floor(width / tilesize);
  const rows = Math.floor(height / tilesize);
  const tiles = [];
  let localId = localIdStart;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      tiles.push({
        localId: localId++,
        regionId,
        col: c,
        row: r,
        sx: offsetX + c * tilesize,
        sy: offsetY + r * tilesize,
        w: tilesize,
        h: tilesize,
      });
    }
  }
  return { cols, rows, tiles };
}

// ── browser stitcher ─────────────────────────────────────────────────
// Render a parsed `.tset` into a single atlas PNG using OffscreenCanvas.
// Returns:
//   { blob, width, height, tilesize, tiles:[{localId, col, row, sx, sy, w, h, tileID}] }
// where `col`/`row` are in the atlas grid produced here (author's original
// bounds compacted to (0,0) origin).
//
// Memory note: previously this loaded ALL `ImageBitmap`s up-front into a
// cache and kept them alive until GC. For a `.tset` with hundreds of large
// source images that's enough GPU memory to make Chrome kill the tab's
// WebGL contexts — surfaced to the user as "WebGL context was lost" right
// before/after the upload. We now stream: load one source, draw every
// placement that uses it, close the bitmap, move on. Peak GPU memory is
// bounded by the largest single source image.
export async function buildTsetAtlasBlob(parsed, { algo = 'pixelated' } = {}) {
  if (typeof OffscreenCanvas === 'undefined') {
    throw new Error('buildTsetAtlasBlob requires a browser environment');
  }
  const { tilesize, placements, tiles: tileDefs, sources, bounds } = parsed;
  const cols = bounds.cols || 1;
  const rows = bounds.rows || 1;
  const width = cols * tilesize;
  const height = rows * tilesize;

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = algo !== 'pixelated';

  // Pre-index placements by sourceID so we can draw them all in one pass
  // per source image and then close the bitmap.
  const placementsBySource = new Map();
  for (const p of placements) {
    const tileDef = tileDefs[p.tileID];
    if (!tileDef) continue;
    const list = placementsBySource.get(tileDef.sourceID);
    if (list) list.push(p);
    else placementsBySource.set(tileDef.sourceID, [p]);
  }

  for (const src of sources) {
    if (!src.valid) continue;
    const uses = placementsBySource.get(src.id);
    if (!uses || !uses.length) continue; // skip unreferenced sources entirely
    const bytes = base64ToBytes(src.base64);
    const blob = new Blob([bytes], { type: src.contentType });
    const bmp = await createImageBitmap(blob);
    try {
      for (const p of uses) {
        const col = p.x - bounds.minX;
        const row = p.y - bounds.minY;
        ctx.drawImage(
          bmp, 0, 0, bmp.width, bmp.height,
          col * tilesize, row * tilesize, tilesize, tilesize
        );
      }
    } finally {
      // Critical: release the GPU-backed bitmap before moving to the next
      // source. Without this, large `.tset`s queue up hundreds of live
      // bitmaps and exhaust GPU memory.
      try { bmp.close?.(); } catch { /* ignore */ }
    }
  }

  const atlasTiles = placements.map((p) => {
    const col = p.x - bounds.minX;
    const row = p.y - bounds.minY;
    return {
      tileID: p.tileID,
      col,
      row,
      sx: col * tilesize,
      sy: row * tilesize,
      w: tilesize,
      h: tilesize,
    };
  });
  atlasTiles.sort((a, b) => a.row - b.row || a.col - b.col);
  atlasTiles.forEach((t, i) => { t.localId = i; });

  const blob = await canvas.convertToBlob({ type: 'image/png' });
  return { blob, width, height, tilesize, cols, rows, tiles: atlasTiles };
}

export function base64ToBytes(b64) {
  if (typeof atob === 'function') {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }
  return Uint8Array.from(Buffer.from(b64, 'base64'));
}

export async function blobToBase64(blob) {
  // Prefer FileReader.readAsDataURL — browser-internal async base64 encoder
  // that does NOT block the main thread. The previous implementation built
  // a giant String via `String.fromCharCode(byte) +=` in a loop, which froze
  // the tab for several seconds on multi-MB atlases and was enough for
  // Chromium's GPU watchdog to kill the page's WebGL context mid-upload.
  if (typeof FileReader !== 'undefined') {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const s = String(reader.result || '');
        const comma = s.indexOf(',');
        resolve(comma >= 0 ? s.slice(comma + 1) : s);
      };
      reader.onerror = () => reject(reader.error || new Error('FileReader failed'));
      reader.readAsDataURL(blob);
    });
  }
  const buf = await blob.arrayBuffer();
  return bytesToBase64(new Uint8Array(buf));
}

export function bytesToBase64(bytes) {
  if (typeof btoa === 'function') {
    // Chunked `String.fromCharCode.apply(...)` — ~50× faster than
    // per-byte `+=` concat and avoids building a giant intermediate string.
    const CHUNK = 0x8000;
    const parts = [];
    for (let i = 0; i < bytes.length; i += CHUNK) {
      parts.push(String.fromCharCode.apply(
        null,
        bytes.subarray(i, Math.min(i + CHUNK, bytes.length))
      ));
    }
    return btoa(parts.join(''));
  }
  return Buffer.from(bytes).toString('base64');
}
