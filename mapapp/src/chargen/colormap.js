// Colormap palette builder — reads an LPC `.cm` file and produces a
// Uint32Array(256) palette mirroring what the GLSL shader does:
//
//   vec4 pixel = texture2D(texture, ...);
//   gl_FragColor = vec4(palette[int(pixel.r * 255)].rgb, pixel.a);
//
// A `.cm` file is JSON: { items: [ { id, name, color, colors: [idx, rgba, idx, rgba, ...] }, ... ] }
// `colors` is an array of (index, packed RGBA uint32) pairs. Between any
// two pairs we interpolate linearly; indices below the first pair clamp to
// the first color (typically transparent at index 0), indices above the
// last pair clamp to the last color.
//
// Packed RGBA format: (R<<24) | (G<<16) | (B<<8) | A. See the shader.

const cmCache = new Map(); // name → { items: Map<id, { colors: [[idx,rgba],...] }> }
const paletteCache = new Map(); // `${name}:${colorId}` → Uint32Array(256)

export async function loadCm(name, manifest, { signal } = {}) {
  if (cmCache.has(name)) return cmCache.get(name);
  const entry = manifest?.colormaps?.[name];
  if (!entry) throw new Error(`colormap ${name} not in manifest`);
  const res = await fetch(entry.url, { signal, cache: 'force-cache' });
  if (!res.ok) throw new Error(`colormap ${name}: HTTP ${res.status}`);
  const json = await res.json();
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
  cmCache.set(name, loaded);
  return loaded;
}

// Build a 256-entry palette (Uint32Array of packed RGBA) for a single colour id.
export function buildPalette(cm, colorId) {
  const cacheKey = `${cm.id}:${colorId}`;
  if (paletteCache.has(cacheKey)) return paletteCache.get(cacheKey);
  const item = cm.items.get(colorId);
  const pal = new Uint32Array(256);
  if (!item || item.colors.length === 0) {
    paletteCache.set(cacheKey, pal); // all zero = fully transparent
    return pal;
  }
  const pairs = item.colors;
  // Fill ranges with linear interpolation.
  const first = pairs[0];
  for (let i = 0; i < first[0]; i++) pal[i] = first[1];
  for (let p = 0; p < pairs.length - 1; p++) {
    const [ai, arg] = pairs[p];
    const [bi, brg] = pairs[p + 1];
    const ar = (arg >>> 24) & 0xff;
    const ag = (arg >>> 16) & 0xff;
    const ab = (arg >>> 8) & 0xff;
    const aa = arg & 0xff;
    const br = (brg >>> 24) & 0xff;
    const bg = (brg >>> 16) & 0xff;
    const bb = (brg >>> 8) & 0xff;
    const ba = brg & 0xff;
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
  paletteCache.set(cacheKey, pal);
  return pal;
}

// Pick one representative packed-RGBA sample from a 256-entry palette.
// Prefers the middle index (pal[128]); if that slot is fully transparent
// (e.g. palettes that only define low-index hair shades) walks outward
// until it finds a non-transparent entry. Returns 0 if the palette is
// entirely empty.
export function sampleSwatch(palette) {
  if (!palette || palette.length === 0) return 0;
  const mid = palette[128] >>> 0;
  if ((mid & 0xff) !== 0) return mid;
  for (let d = 1; d < 128; d++) {
    const hi = palette[128 + d] >>> 0;
    if ((hi & 0xff) !== 0) return hi;
    const lo = palette[128 - d] >>> 0;
    if ((lo & 0xff) !== 0) return lo;
  }
  return 0;
}

// Convert a packed RGBA uint32 to a CSS `rgba(r,g,b,a)` string.
export function packedRgbaToCss(rgba) {
  const r = (rgba >>> 24) & 0xff;
  const g = (rgba >>> 16) & 0xff;
  const b = (rgba >>> 8) & 0xff;
  const a = (rgba & 0xff) / 255;
  return `rgba(${r},${g},${b},${a})`;
}

export function clearColormapCache() {
  cmCache.clear();
  paletteCache.clear();
}
