// LPC sprite-sheet compositor.
//
// Given an `appearance` JSON (race + config + per-slot { id, color }) and
// the loaded manifest, produces a single composited RGBA canvas that can be
// fed to Pixi as a texture (`Texture.from(canvas)`).
//
// Algorithm mirrors the CharGen colormap shader:
//   for each layer in z-order:
//     pixel.rgb = palette[pixel.R].rgb
//     pixel.a   = pixel.a
// then alpha-blend onto the main canvas.
//
// Textures are loaded via `Image` + drawImage to an offscreen canvas to get
// `ImageData`. All textures cached in `textureCache`.

import { buildPalette, loadCm } from './colormap.js';
import { getItem, pickTexture, resolveConfig, resolveTextureUrl } from './manifest.js';
import { Z_ORDER_BACK, Z_ORDER_FRONT } from './zOrder.js';

export const SHEET_WIDTH = 832;
export const SHEET_HEIGHT = 1344;

// Simple LRU over insertion-ordered Map. On `get`/`set` we re-insert to
// move the key to the most-recently-used end; oldest key is evicted when
// size exceeds `max`. Prevents unbounded growth in long editing sessions
// (raw ImageData is ~4 MB per LPC texture).
class LRU {
  constructor(max) { this.max = max; this.map = new Map(); }
  has(k) { return this.map.has(k); }
  get(k) {
    if (!this.map.has(k)) return undefined;
    const v = this.map.get(k);
    this.map.delete(k);
    this.map.set(k, v);
    return v;
  }
  set(k, v) {
    if (this.map.has(k)) this.map.delete(k);
    this.map.set(k, v);
    if (this.map.size > this.max) {
      const oldest = this.map.keys().next().value;
      this.map.delete(oldest);
    }
  }
  clear() { this.map.clear(); }
}

// HTMLImageElement promises are lightweight, ImageData is heavy. Keep
// separate limits that reflect that.
const IMAGE_CACHE_MAX = 200;
const IMAGE_DATA_CACHE_MAX = 50;

const imageCache = new LRU(IMAGE_CACHE_MAX); // url → Promise<HTMLImageElement>
const imageDataCache = new LRU(IMAGE_DATA_CACHE_MAX); // url → ImageData

function loadImage(url) {
  const cached = imageCache.get(url);
  if (cached) return cached;
  const p = new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`image ${url}`));
    img.src = url;
  });
  imageCache.set(url, p);
  return p;
}

async function getImageData(url) {
  const cached = imageDataCache.get(url);
  if (cached) return cached;
  const img = await loadImage(url);
  const off = document.createElement('canvas');
  off.width = img.width;
  off.height = img.height;
  const ctx = off.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, img.width, img.height);
  imageDataCache.set(url, data);
  return data;
}

// Apply palette to a mask ImageData, returning a fresh ImageData with the
// palette-mapped RGB and original alpha.
//
// LPC mask convention used by these assets: the palette index is stored in
// the BLUE channel (R=G=0, A=opacity). The original CharGen GLSL shader
// samples `pixel.r`, which works there because its texture loader uploads
// pixels as BGRA — so `pixel.r` in the shader actually reads the file's
// blue byte. In JS / Canvas 2D we always get RGBA, so we must read byte
// +2 directly, otherwise every pixel resolves to palette[0] = transparent
// and the character renders invisible (only the shadow, which uses a
// different palette, shows through).
function applyPalette(src, palette) {
  const out = new ImageData(src.width, src.height);
  const s = src.data;
  const d = out.data;
  for (let i = 0; i < s.length; i += 4) {
    const idx = s[i + 2];        // blue channel — see note above
    const a = s[i + 3];
    if (a === 0) continue;       // already transparent
    const rgba = palette[idx];
    if (!rgba) continue;         // transparent palette entry
    const pr = (rgba >>> 24) & 0xff;
    const pg = (rgba >>> 16) & 0xff;
    const pb = (rgba >>> 8) & 0xff;
    const pa = rgba & 0xff;
    const finalA = Math.round((a / 255) * (pa / 255) * 255);
    if (finalA === 0) continue;
    d[i]     = pr;
    d[i + 1] = pg;
    d[i + 2] = pb;
    d[i + 3] = finalA;
  }
  return out;
}

// Pick the colour id for a slot's entry, preferring explicit user choice,
// then item's fixedcolors[0], then primarycolors[0], then `none`.
function chooseColorId(appearanceEntry, item) {
  if (appearanceEntry?.color) return appearanceEntry.color;
  if (Array.isArray(item?.fixedcolors) && item.fixedcolors.length) return item.fixedcolors[0];
  if (Array.isArray(item?.primarycolors) && item.primarycolors.length) return item.primarycolors[0];
  return 'none';
}

// Render one texture variant ("back" or "front") of a single slot onto ctx.
// Returns true iff a texture was actually blitted (used to avoid
// double-stamping the `shadow` slot which lives in both Z_ORDER arrays).
async function drawSlotTexture({
  ctx, manifest, cm, slot, appearance, variant, warnings,
}) {
  const entry = appearance.slots?.[slot];
  if (!entry || !entry.id) return false;
  const item = getItem(manifest, slot, entry.id);
  if (!item) { warnings.push(`missing item ${slot}/${entry.id}`); return false; }

  const tex = pickTexture(item, appearance.bodyType, appearance.headType);
  if (!tex) return false;
  const relPath = tex[variant];
  if (!relPath || relPath === 'none') return false;
  const url = resolveTextureUrl(relPath, manifest);
  if (!url) return false;

  let srcData;
  try {
    srcData = await getImageData(url);
  } catch (err) {
    warnings.push(`load ${slot}/${entry.id}: ${err.message}`);
    return false;
  }

  const colorId = chooseColorId(entry, item);
  const palette = buildPalette(cm, colorId);
  const mapped = applyPalette(srcData, palette);

  // Blit onto the main canvas at (0,0). LPC textures are pre-positioned.
  const tmp = document.createElement('canvas');
  tmp.width = mapped.width;
  tmp.height = mapped.height;
  tmp.getContext('2d').putImageData(mapped, 0, 0);
  ctx.drawImage(tmp, 0, 0);
  return true;
}

// Allocate a private offscreen canvas for composition. We deliberately
// do NOT let callers pass in a canvas to paint on: composition is async
// (image loads, palette builds), and if two concurrent composeSheet
// calls shared one destination canvas their `clearRect` + `drawImage`
// calls would interleave, leaving a random subset of layers visible.
// That's the "random transparencies" bug — see useChargenStore for how
// the caller synchronously blits this result onto a shared preview
// canvas after an up-to-date check.
function allocCanvas() {
  const c = document.createElement('canvas');
  c.width = SHEET_WIDTH;
  c.height = SHEET_HEIGHT;
  return c;
}

// Compose the sheet. Always returns a FRESH HTMLCanvasElement that was
// never exposed to concurrent callers. The caller is responsible for
// blitting the pixels onto any shared/reused canvas it holds (e.g. a
// Pixi texture source) — see useChargenStore._runRecompose.
export async function composeSheet(appearance, {
  manifest, cmName = 'default', signal,
} = {}) {
  if (!manifest) throw new Error('composeSheet: manifest required');
  if (!appearance?.race) {
    return { canvas: allocCanvas(), warnings: ['no race selected'] };
  }
  const cfg = resolveConfig(manifest, appearance.race, appearance.config);
  if (!cfg) throw new Error(`unknown race/config: ${appearance.race}/${appearance.config}`);

  const cm = await loadCm(cmName, manifest, { signal });
  const warnings = [];

  const canvas = allocCanvas();
  const ctx = canvas.getContext('2d');

  const fullAppearance = {
    ...appearance,
    bodyType: appearance.bodyType || cfg['body-type'],
    headType: appearance.headType || cfg['head-type'],
  };

  // `shadow` appears in BOTH Z_ORDER_BACK and Z_ORDER_FRONT so it always
  // lands at the bottom regardless of whether the asset defines its
  // shadow under the `back` or `front` texture key. But if an item
  // happens to define both, we must NOT blit it twice (the alphas would
  // stack). Track it across passes.
  let shadowDrawn = false;

  // Pass 1: back-layer textures (everything that has a non-none "back").
  for (const slot of Z_ORDER_BACK) {
    const drew = await drawSlotTexture({
      ctx, manifest, cm, slot, appearance: fullAppearance, variant: 'back', warnings,
    });
    if (slot === 'shadow' && drew) shadowDrawn = true;
  }
  // Pass 2: front-layer textures.
  for (const slot of Z_ORDER_FRONT) {
    if (slot === 'shadow' && shadowDrawn) continue;
    await drawSlotTexture({
      ctx, manifest, cm, slot, appearance: fullAppearance, variant: 'front', warnings,
    });
  }

  return { canvas, warnings };
}

export function clearComposeCache() {
  imageCache.clear();
  imageDataCache.clear();
}
