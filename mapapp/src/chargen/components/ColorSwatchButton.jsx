// ColorSwatchButton — one 28×28 color swatch in the LPC slot editor.
//
// Sampled from the middle of the LPC palette so it reflects the actual
// tint used at composition time. Falls back to a transparent
// checkerboard for `none` / empty palettes and a textual hint if the
// colormap hasn't loaded yet.
//
// Bumped from the historical 22×22 to 28×28 — the new size doubles the
// hit area, matches the bigger toolbar, and exposes enough of the hue
// that desaturated swatches (skintones, cloaks) are actually readable
// without clicking through.

import React, { useMemo } from 'react';
import { buildPalette, packedRgbaToCss, sampleSwatch } from '../colormap.js';

const SIZE = 28;

// Four-layer 45° checkerboard used for "no palette available" / "none"
// swatches so they never render as a solid grey tile (which would look
// like "applied" grey).
const CHECKERBOARD_BG = [
  'linear-gradient(45deg, #333 25%, transparent 25%)',
  'linear-gradient(-45deg, #333 25%, transparent 25%)',
  'linear-gradient(45deg, transparent 75%, #333 75%)',
  'linear-gradient(-45deg, transparent 75%, #333 75%)',
].join(', ');

export default function ColorSwatchButton({ cm, colorId, selected, onClick }) {
  const swatch = useMemo(() => {
    if (!cm || colorId === 'none') return null;
    const pal = buildPalette(cm, colorId);
    const packed = sampleSwatch(pal);
    if (!packed) return null;
    return packedRgbaToCss(packed);
  }, [cm, colorId]);

  const shortLabel = colorId.split('_').pop().slice(0, 5);
  return (
    <button
      type="button"
      onClick={onClick}
      title={colorId}
      aria-label={colorId}
      className="inline-flex items-center justify-center p-0 rounded-sm cursor-pointer transition-transform hover:scale-105"
      style={{
        width: SIZE,
        height: SIZE,
        background: swatch || CHECKERBOARD_BG,
        backgroundSize: swatch ? undefined : '8px 8px',
        backgroundPosition: swatch ? undefined : '0 0, 0 4px, 4px -4px, -4px 0',
        outline: selected ? '2px solid #fde68a' : '1px solid #2a2a2a',
        outlineOffset: 0,
        border: 'none',
        color: '#bbb',
      }}
    >
      {!swatch && (
        <span style={{ fontSize: 10, color: '#bbb', mixBlendMode: 'difference' }}>
          {shortLabel}
        </span>
      )}
    </button>
  );
}
