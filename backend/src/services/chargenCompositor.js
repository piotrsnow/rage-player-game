// Server-side LPC sprite-sheet compositor.
//
// Port of mapapp/src/chargen/compose.js — produces an 832×1344 PNG buffer
// using `sharp` instead of Canvas 2D.  No browser APIs, no node-canvas.

import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const DEFAULT_ASSETS_PATH =
  process.env.CHARGEN_ASSETS_PATH ||
  path.resolve(__dirname, '../../../mapapp/public/chargen');

export const SHEET_WIDTH = 832;
export const SHEET_HEIGHT = 1344;

// ── Z-order (duplicated from mapapp/src/chargen/zOrder.js to avoid
//    importing browser-side modules) ─────────────────────────────────

const Z_ORDER_BACK = [
  'shadow', 'back', 'tail', 'wings', 'hair', 'offhand', 'mainhand', 'ammo',
];

const Z_ORDER_FRONT = [
  'shadow', 'body', 'ears', 'nose', 'eyes', 'head', 'facial', 'tail',
  'wings', 'pants', 'shirt', 'belt', 'shoes', 'gloves', 'jacket', 'suit',
  'mask', 'hair', 'glasses', 'hat', 'back', 'offhand', 'mainhand', 'ammo',
  'add1', 'add2', 'add3',
];

// ── Manifest + colormap loaders (filesystem, cached) ────────────────

let manifestCache = null;
const colormapCache = new Map();

export async function loadManifestFromDisk(chargenAssetsPath = DEFAULT_ASSETS_PATH) {
  if (manifestCache) return manifestCache;
  const p = path.join(chargenAssetsPath, 'INDEX.json');
  const raw = await fs.readFile(p, 'utf8');
  manifestCache = JSON.parse(raw);
  return manifestCache;
}

async function loadColormapFromDisk(name, manifest, chargenAssetsPath) {
  if (colormapCache.has(name)) return colormapCache.get(name);
  const entry = manifest?.colormaps?.[name];
  if (!entry) throw new Error(`colormap "${name}" not in manifest`);

  const assetBase = manifest.assetBase || '/chargen';
  const relPath = entry.url.startsWith(assetBase)
    ? entry.url.slice(assetBase.length + 1)
    : entry.url.replace(/^\//, '');

  const raw = await fs.readFile(path.join(chargenAssetsPath, relPath), 'utf8');
  const json = JSON.parse(raw);

  const items = new Map();
  for (const it of json.items || []) {
    const pairs = [];
    const arr = Array.isArray(it.colors) ? it.colors : [];
    for (let i = 0; i < arr.length - 1; i += 2) {
      pairs.push([arr[i] | 0, arr[i + 1] >>> 0]);
    }
    items.set(it.id, { color: it.color >>> 0, colors: pairs });
  }

  const loaded = { id: json.id, name: json.name, items };
  colormapCache.set(name, loaded);
  return loaded;
}

// ── Palette math (ported from colormap.js) ──────────────────────────

export function buildPalette(cm, colorId) {
  const item = cm.items.get(colorId);
  const pal = new Uint32Array(256);
  if (!item || item.colors.length === 0) return pal;

  const pairs = item.colors;
  const first = pairs[0];
  for (let i = 0; i < first[0]; i++) pal[i] = first[1];

  for (let p = 0; p < pairs.length - 1; p++) {
    const [ai, arg] = pairs[p];
    const [bi, brg] = pairs[p + 1];
    const ar = (arg >>> 24) & 0xff, ag = (arg >>> 16) & 0xff;
    const ab = (arg >>> 8)  & 0xff, aa = arg & 0xff;
    const br = (brg >>> 24) & 0xff, bg = (brg >>> 16) & 0xff;
    const bb = (brg >>> 8)  & 0xff, ba = brg & 0xff;
    const span = Math.max(1, bi - ai);
    for (let i = ai; i <= bi && i < 256; i++) {
      const t = (i - ai) / span;
      const r = Math.round(ar + (br - ar) * t);
      const g = Math.round(ag + (bg - ag) * t);
      const b = Math.round(ab + (bb - ab) * t);
      const a = Math.round(aa + (ba - aa) * t);
      pal[i] = ((r & 0xff) << 24) | ((g & 0xff) << 16) | ((b & 0xff) << 8) | (a & 0xff);
    }
  }
  const last = pairs[pairs.length - 1];
  for (let i = last[0] + 1; i < 256; i++) pal[i] = last[1];
  return pal;
}

// ── Pixel remapping ─────────────────────────────────────────────────
// LPC mask convention: palette index lives in the BLUE channel (byte
// offset +2 in RGBA order). See compose.js lines 87-93 for the full
// explanation of why it's blue, not red.

export function applyPaletteBuffer(src, width, height, palette) {
  const out = Buffer.alloc(width * height * 4);
  for (let i = 0; i < src.length; i += 4) {
    const idx = src[i + 2];     // blue channel
    const a = src[i + 3];
    if (a === 0) continue;
    const rgba = palette[idx];
    if (!rgba) continue;
    const pr = (rgba >>> 24) & 0xff;
    const pg = (rgba >>> 16) & 0xff;
    const pb = (rgba >>> 8)  & 0xff;
    const pa = rgba & 0xff;
    const finalA = Math.round((a / 255) * (pa / 255) * 255);
    if (finalA === 0) continue;
    out[i]     = pr;
    out[i + 1] = pg;
    out[i + 2] = pb;
    out[i + 3] = finalA;
  }
  return out;
}

// ── Manifest helpers (inlined from manifest.js) ─────────────────────

function getItem(manifest, slot, itemKey) {
  return manifest?.categories?.[slot]?.items?.[itemKey] || null;
}

function pickTexture(item, bodyType, headType) {
  if (!item || !Array.isArray(item.textures)) return null;
  for (const tex of item.textures) {
    if (tex.body === bodyType) return tex;
    if (tex.head === headType) return tex;
  }
  for (const tex of item.textures) {
    if (tex.front && tex.front !== 'none') return tex;
    if (tex.back && tex.back !== 'none') return tex;
  }
  return item.textures[0] || null;
}

function resolveConfig(manifest, raceId, configId) {
  const race = manifest?.races?.[raceId];
  if (!race) return null;
  return race.configs.find((c) => c.id === configId) || null;
}

function chooseColorId(appearanceEntry, item) {
  if (appearanceEntry?.color) return appearanceEntry.color;
  if (Array.isArray(item?.fixedcolors) && item.fixedcolors.length) return item.fixedcolors[0];
  if (Array.isArray(item?.primarycolors) && item.primarycolors.length) return item.primarycolors[0];
  return 'none';
}

// The manifest defines no primarycolors for head/nose/ears items, so without
// this sync their color resolves to 'none' → empty palette → the face,
// nose, and ears render fully transparent (the "missing head" bug). LPC
// head/nose/ears textures use the same paletted-skin convention as body,
// so they share the body's skin color id.
export const SKIN_SYNCED_SLOTS = ['head', 'nose', 'ears'];

export function syncSkinColoredSlots(appearance) {
  const skin = appearance?.slots?.body?.color;
  if (!skin || skin === 'none') return;
  for (const slot of SKIN_SYNCED_SLOTS) {
    const entry = appearance.slots?.[slot];
    if (!entry) continue;
    if (!entry.color || entry.color === 'none') {
      appearance.slots[slot] = { ...entry, color: skin };
    }
  }
}

// ── Layer renderer ──────────────────────────────────────────────────
// Returns a raw RGBA Buffer sized to the texture, or null if skipped.

async function renderSlotLayer({
  manifest, cm, slot, appearance, variant, chargenAssetsPath, warnings,
}) {
  const entry = appearance.slots?.[slot];
  if (!entry || !entry.id) return null;

  const item = getItem(manifest, slot, entry.id);
  if (!item) { warnings.push(`missing item ${slot}/${entry.id}`); return null; }

  const tex = pickTexture(item, appearance.bodyType, appearance.headType);
  if (!tex) return null;

  const relPath = tex[variant];
  if (!relPath || relPath === 'none') return null;

  const filePath = path.join(chargenAssetsPath, relPath);
  let rawBuf, info;
  try {
    ({ data: rawBuf, info } = await sharp(filePath).raw().toBuffer({ resolveWithObject: true }));
  } catch (err) {
    warnings.push(`load ${slot}/${entry.id}: ${err.message}`);
    return null;
  }

  const colorId = chooseColorId(entry, item);
  const palette = buildPalette(cm, colorId);
  const mapped = applyPaletteBuffer(rawBuf, info.width, info.height, palette);

  return { buffer: mapped, width: info.width, height: info.height };
}

// ── Main entry point ────────────────────────────────────────────────

export async function composeSheetServer(appearance, {
  chargenAssetsPath = DEFAULT_ASSETS_PATH,
  cmName = 'default',
} = {}) {
  const manifest = await loadManifestFromDisk(chargenAssetsPath);
  if (!appearance?.race) {
    const empty = await sharp({
      create: { width: SHEET_WIDTH, height: SHEET_HEIGHT, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    }).png().toBuffer();
    return { buffer: empty, warnings: ['no race selected'] };
  }

  const cfg = resolveConfig(manifest, appearance.race, appearance.config);
  if (!cfg) throw new Error(`unknown race/config: ${appearance.race}/${appearance.config}`);

  const cm = await loadColormapFromDisk(cmName, manifest, chargenAssetsPath);
  const warnings = [];

  const fullAppearance = {
    ...appearance,
    bodyType: appearance.bodyType || cfg['body-type'],
    headType: appearance.headType || cfg['head-type'],
  };

  syncSkinColoredSlots(fullAppearance);

  const layers = [];
  let shadowDrawn = false;

  for (const slot of Z_ORDER_BACK) {
    const layer = await renderSlotLayer({
      manifest, cm, slot, appearance: fullAppearance,
      variant: 'back', chargenAssetsPath, warnings,
    });
    if (layer) {
      layers.push(layer);
      if (slot === 'shadow') shadowDrawn = true;
    }
  }

  for (const slot of Z_ORDER_FRONT) {
    if (slot === 'shadow' && shadowDrawn) continue;
    const layer = await renderSlotLayer({
      manifest, cm, slot, appearance: fullAppearance,
      variant: 'front', chargenAssetsPath, warnings,
    });
    if (layer) layers.push(layer);
  }

  const compositeInputs = layers.map((l) => ({
    input: l.buffer,
    raw: { width: l.width, height: l.height, channels: 4 },
    top: 0,
    left: 0,
  }));

  const buffer = await sharp({
    create: {
      width: SHEET_WIDTH,
      height: SHEET_HEIGHT,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(compositeInputs)
    .png()
    .toBuffer();

  return { buffer, warnings };
}

export function clearCompositorCache() {
  manifestCache = null;
  colormapCache.clear();
}
