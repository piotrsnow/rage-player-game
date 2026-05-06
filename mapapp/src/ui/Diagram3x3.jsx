// Diagram3x3 — tiny 3x3 SVG grid used in tooltips to visualize edge/role atoms.
//
// The 3x3 layout maps directly to the 8-direction edge atoms + center:
//
//   NW  N  NE
//   W  cen  E
//   SW  S  SE
//
// Props:
//   highlight - object of { N, E, S, W, NE, NW, SE, SW, center } booleans.
//               Cells flagged true are drawn filled; the rest are outlined.
//   size      - total SVG size in px (default 48).
//   label     - optional caption drawn below the grid.
//
// Convenience presets also accepted via `preset`:
//   'corner'  - 3 corner cells highlighted
//   'edge'    - 4 edge (N/E/S/W) highlighted
//   'inner'   - only center
//   'fill'    - all 9 highlighted

import React from 'react';

const CELLS = [
  { key: 'NW', col: 0, row: 0 },
  { key: 'N',  col: 1, row: 0 },
  { key: 'NE', col: 2, row: 0 },
  { key: 'W',  col: 0, row: 1 },
  { key: 'center', col: 1, row: 1 },
  { key: 'E',  col: 2, row: 1 },
  { key: 'SW', col: 0, row: 2 },
  { key: 'S',  col: 1, row: 2 },
  { key: 'SE', col: 2, row: 2 },
];

const PRESETS = {
  corner: { NE: true, NW: true, SE: true, SW: true },
  edge: { N: true, E: true, S: true, W: true },
  inner: { center: true },
  fill: { N: true, E: true, S: true, W: true, NE: true, NW: true, SE: true, SW: true, center: true },
};

export default function Diagram3x3({
  highlight,
  preset,
  size = 48,
  label,
  onToggle,
  mixedKeys,
  disabledKeys,
}) {
  const active = preset && PRESETS[preset] ? PRESETS[preset] : (highlight || {});
  const mixed = mixedKeys || {};
  const disabled = disabledKeys || {};
  const interactive = typeof onToggle === 'function';
  const cell = size / 3;
  const stroke = 'rgba(148,163,184,0.35)';
  const fillOn = 'rgba(250,204,21,0.55)';
  const fillMixed = 'rgba(250,204,21,0.25)';
  const fillOff = 'rgba(15,23,42,0.4)';
  const hoverFill = 'rgba(250,204,21,0.35)';

  function cellFill(key) {
    if (active[key]) return fillOn;
    if (mixed[key]) return fillMixed;
    return fillOff;
  }

  return (
    <div className="inline-flex flex-col items-center gap-1">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={label || 'diagram 3x3'}
        className={interactive ? 'cursor-pointer' : undefined}
      >
        {interactive && (
          <defs>
            <style>{`
              .d3x3-cell { transition: fill 0.1s; }
              .d3x3-cell:not([data-disabled]):hover { fill: ${hoverFill} !important; }
            `}</style>
          </defs>
        )}
        {CELLS.map((c) => (
          <rect
            key={c.key}
            className={interactive ? 'd3x3-cell' : undefined}
            data-disabled={disabled[c.key] ? '' : undefined}
            x={c.col * cell + 0.5}
            y={c.row * cell + 0.5}
            width={cell - 1}
            height={cell - 1}
            fill={cellFill(c.key)}
            stroke={mixed[c.key] ? 'rgba(250,204,21,0.6)' : stroke}
            strokeWidth={mixed[c.key] ? '1.5' : '1'}
            strokeDasharray={mixed[c.key] ? '3 2' : undefined}
            rx={interactive ? 2 : 0}
            onClick={interactive && !disabled[c.key] ? () => onToggle(c.key) : undefined}
          />
        ))}
      </svg>
      {label && (
        <div className="text-[10px] text-on-surface-variant/80 leading-tight text-center max-w-[110px]">
          {label}
        </div>
      )}
    </div>
  );
}

export { CELLS, PRESETS };
