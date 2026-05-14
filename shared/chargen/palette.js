// Palette math for LPC colormap remapping.
//
// Works on raw Uint8Array / Uint32Array buffers — no DOM, no fetch.
// Colormap data must be pre-loaded and passed in as:
//   cm = { id, name, items: Map<id, { color, colors: [[idx, rgba], ...] }> }

/**
 * Build a 256-entry palette (Uint32Array of packed RGBA) for a single color id.
 *
 * Packed RGBA format: (R<<24) | (G<<16) | (B<<8) | A.
 * Between any two index/color pairs we interpolate linearly; indices below the
 * first pair clamp to the first color, indices above the last clamp to the last.
 */
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

  return pal;
}

/**
 * Apply a 256-entry palette to an RGBA pixel buffer using the BLUE channel
 * as the palette index.
 *
 * LPC mask convention: the palette index is stored in the BLUE channel
 * (R=G=0, A=opacity). The original CharGen GLSL shader samples `pixel.r`
 * which works because its texture loader uploads BGRA — in JS we always
 * get RGBA so we read byte +2 (blue).
 *
 * @param {Uint8Array} srcBuffer  RGBA pixels (length = width * height * 4)
 * @param {Uint32Array} palette   256-entry packed RGBA palette
 * @returns {Uint8Array} New RGBA pixel buffer with palette applied
 */
export function applyPalette(srcBuffer, palette) {
  const out = new Uint8Array(srcBuffer.length);
  for (let i = 0; i < srcBuffer.length; i += 4) {
    const idx = srcBuffer[i + 2];       // blue channel
    const a = srcBuffer[i + 3];
    if (a === 0) continue;              // already transparent
    const rgba = palette[idx];
    if (!rgba) continue;                // transparent palette entry
    const pr = (rgba >>> 24) & 0xff;
    const pg = (rgba >>> 16) & 0xff;
    const pb = (rgba >>> 8) & 0xff;
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
