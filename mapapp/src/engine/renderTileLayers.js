// Shared tile-layer renderer. Used by the editor MapCanvas and the
// read-only walk-test PlayCanvas.
//
// Given a `{ layers, palette, textures }` snapshot and a set of Pixi
// containers (one per layer name), clears and redraws the layer sprites.
//
// Palette entries follow the canonical `PaletteEntry` shape defined in
// `engine/paletteEntry.js` (constructed via `makePaletteEntry`).
// `textures` is a Map<imageKey, PIXI.Texture> with the full atlas.

import { Rectangle, Sprite, Texture } from 'pixi.js';
import { makePaletteEntry, makePaletteKey } from './paletteEntry.js';

export function renderTileLayers({
  containers, layerNames, layers, palette, textures,
  cols, rows, cellSize, tsize,
}) {
  for (const name of layerNames) {
    const c = containers[name];
    if (!c) continue;
    c.removeChildren();
    const arr = layers[name];
    if (!arr) continue;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const v = arr[y * cols + x];
        if (!v) continue;
        const entry = palette[v - 1];
        if (!entry) continue;
        const baseTex = textures.get(entry.imageKey);
        if (!baseTex) continue;
        const size = entry.tilesize || tsize;
        const frame = new Rectangle(entry.col * size, entry.row * size, size, size);
        const tex = new Texture({ source: baseTex.source, frame });
        const sprite = new Sprite(tex);
        sprite.x = x * cellSize;
        sprite.y = y * cellSize;
        sprite.width = cellSize;
        sprite.height = cellSize;
        c.addChild(sprite);
      }
    }
  }
}

// Rebuild a dense palette from loaded packs. The editor version inlines
// this in EditorPage; walk-test loads packs fresh and this helper keeps
// the two paths aligned.
//
// Returns { palette, paletteByKey, textureUrls }.
export async function buildPaletteFromPacks({
  api, packIds, projectTilesize, mediaUrlForKey,
}) {
  const palette = [];
  const paletteByKey = new Map();
  const textureUrls = {};

  for (const packId of packIds) {
    const tilesets = await api.listTilesets(packId);
    for (const ts of tilesets) {
      const tiles = await api.listTiles(ts.id);
      const variant = pickBestVariant(ts.renderedVariants, projectTilesize);
      const imageKey = variant?.imageKey || ts.imageKey;
      const variantTilesize = variant ? projectTilesize : (ts.nativeTilesize || 16);
      const tileCols = Math.max(1, Math.floor((ts.imageWidth || 0) / (ts.nativeTilesize || 16)));
      const tileRows = Math.max(1, Math.floor((ts.imageHeight || 0) / (ts.nativeTilesize || 16)));
      const tileByLocalId = new Map(tiles.map((t) => [t.localId, t]));

      if (imageKey && !textureUrls[imageKey]) textureUrls[imageKey] = mediaUrlForKey(imageKey);

      for (let localId = 0; localId < tileCols * tileRows; localId++) {
        const col = localId % tileCols;
        const row = Math.floor(localId / tileCols);
        const tile = tileByLocalId.get(localId);
        const entry = makePaletteEntry({
          packId, ts, tile, imageKey, tilesize: variantTilesize, localId, col, row,
        });
        paletteByKey.set(entry.key, palette.length);
        palette.push(entry);
      }
    }
  }
  return { palette, paletteByKey, textureUrls };
}

function pickBestVariant(rendered, target) {
  if (!rendered) return null;
  return rendered[String(target)] || null;
}

// Decode MapDoc.layers (2D arrays of { packId, tilesetId, localId }) into
// flat Uint32Array layers keyed by layer name — indices into `palette`+1.
export function decodeLayers({ mapDoc, layerNames, paletteByKey, cols, rows }) {
  const layers = {};
  const src = mapDoc.layers || {};
  for (const name of layerNames) {
    const grid = src[name];
    const arr = new Uint32Array(cols * rows);
    if (!Array.isArray(grid)) { layers[name] = arr; continue; }
    for (let y = 0; y < rows; y++) {
      const row = grid[y];
      if (!Array.isArray(row)) continue;
      for (let x = 0; x < cols; x++) {
        const cell = row[x];
        if (!cell) continue;
        const key = typeof cell === 'object'
          ? makePaletteKey(cell.tilesetId, cell.localId)
          : String(cell);
        const idx = paletteByKey.get(key);
        if (idx !== undefined) arr[y * cols + x] = idx + 1;
      }
    }
    layers[name] = arr;
  }
  return layers;
}

// Decode MapDoc.collision (string of '0'/'1') → Uint8Array.
export function decodeCollision({ mapDoc, cols, rows }) {
  const arr = new Uint8Array(cols * rows);
  const s = typeof mapDoc.collision === 'string' ? mapDoc.collision : '';
  if (s.length !== cols * rows) return arr;
  for (let i = 0; i < arr.length; i++) {
    arr[i] = s.charCodeAt(i) === 49 ? 1 : 0;
  }
  return arr;
}
