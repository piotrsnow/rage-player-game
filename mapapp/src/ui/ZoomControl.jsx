// ZoomControl — slider + `Nx` label.
//
// Two sites currently render this shape inline with their own ranges:
//   ToolPalette → 0.25 .. 4, step 0.25 (map canvas zoom)
//   StudioPage  → 1 .. 6, step 1     (tile-grid zoom)
//
// Props:
//   value        — current numeric zoom
//   onChange     — called with the next number
//   min, max, step — range bounds (defaults tuned for the map canvas)
//   format       — optional `(v) => string` for the label (default `${v}×`)
//   label        — prefix text (default "Zoom")
//   accent       — recolour the slider thumb/track via `accent-*` utility

import React from 'react';

const ACCENT_CLASS = {
  primary: 'accent-primary',
  tertiary: 'accent-tertiary',
  emerald: 'accent-emerald-500',
  sky: 'accent-sky-500',
  rose: 'accent-rose-500',
  amber: 'accent-amber-500',
  indigo: 'accent-indigo-500',
  orange: 'accent-orange-500',
  violet: 'accent-violet-500',
  fuchsia: 'accent-fuchsia-500',
};

export default function ZoomControl({
  value,
  onChange,
  min = 0.25,
  max = 4,
  step = 0.25,
  format,
  label = 'Zoom',
  accent = 'primary',
  className = '',
}) {
  const display = format ? format(value) : `${value}×`;
  const accentCls = ACCENT_CLASS[accent] || ACCENT_CLASS.primary;
  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      {label && <span className="text-xs text-on-surface-variant">{label}</span>}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange?.(Number(e.target.value))}
        className={`${accentCls} cursor-pointer`}
      />
      <span className="text-xs w-10 text-right tabular-nums text-on-surface-variant">
        {display}
      </span>
    </div>
  );
}
