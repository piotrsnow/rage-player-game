// groupColor — deterministic hue per autotile group id.
//
// Used in two places so they stay visually in sync:
//   * AutotileGroupPicker swatch next to each group row
//   * TileGrid overlay (the colored rectangle drawn around the group's tiles)
//
// Both call `groupHex(groupId)` and get the same color.

function hashString(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

export function groupHue(id) {
  if (!id) return 210;
  return hashString(String(id)) % 360;
}

function hueToRgb(h, s, l) {
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + h / 30) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
  };
  return [f(0), f(8), f(4)];
}

export function groupHex(id) {
  const hue = groupHue(id);
  const [r, g, b] = hueToRgb(hue, 0.7, 0.58);
  const to255 = (v) => Math.max(0, Math.min(255, Math.round(v * 255)));
  return (to255(r) << 16) | (to255(g) << 8) | to255(b);
}

export function groupCssColor(id, alpha = 1) {
  const hue = groupHue(id);
  return `hsla(${hue}, 70%, 58%, ${alpha})`;
}

// Deterministic hue per trait key/value pair. Mirrors the algorithm used
// by `TraitSwatch` (TilePreview.jsx) so the stripe painted under a tile
// in TileGrid matches the swatch shown in tooltips / inspector.
export function traitHue(key, value) {
  if (!value) return 230;
  let h = 2166136261 >>> 0;
  const s = `${key}:${value}`;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h % 360;
}

export function traitHex(key, value) {
  if (!value) return null;
  const hue = traitHue(key, value);
  const [r, g, b] = hueToRgb(hue, 0.6, 0.62);
  const to255 = (v) => Math.max(0, Math.min(255, Math.round(v * 255)));
  return (to255(r) << 16) | (to255(g) << 8) | to255(b);
}

export function traitCssColor(key, value, alpha = 1) {
  if (!value) return `hsla(230, 10%, 50%, ${alpha})`;
  const hue = traitHue(key, value);
  return `hsla(${hue}, 60%, 62%, ${alpha})`;
}
