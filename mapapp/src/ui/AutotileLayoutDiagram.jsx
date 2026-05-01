// AutotileLayoutDiagram — autotile group cheat sheet + interactive editor.
//
// Two rendering modes:
//   • schematic (default for non-custom layouts or when no tileset is passed):
//     per-layout static SVG with short role labels (F/C/E/I/…). Purely
//     illustrative — no runtime autotile logic touches this component.
//   • thumbs_overlay (default when a tileset is passed): cells are rendered as
//     HTML divs that slice the atlas via `background-image` + `-position`.
//     Each cell is overlaid with the role color + a tiny role badge. Unassigned
//     cells still show the thumbnail with a faint "?" glyph. When `interactive`
//     is true, clicking a cell fires
//     `onCellClick(col, row, currentRole, { event, anchorRect })`.
//     The `event` is the raw MouseEvent so the parent can read modifier
//     keys (ctrl/meta/shift) to drive multi-select. `anchorRect` is the
//     bounding client rect of the clicked cell so the parent can anchor
//     a popover (RolePickerPopover) in fixed positioning.
//
//   Selection overlay: pass `selectedCells` (a Set of "col,row" keys) to
//   render a yellow outline on those cells on top of the role overlay.
//   This is purely visual — the parent owns the selection state.
//
// Layouts covered (mirrors AutotileGroupPicker LAYOUTS):
//   rpgmaker_a1  — 2x3 (water animation template)
//   rpgmaker_a2  — 2x3 (ground blob — canonical RM A2 shape)
//   wang_2edge   — 4x4 (16 permutations of 4 edges)
//   blob_47      — 8x6 (47 blob variants; we show a compact 8x6 preview)
//   custom       — arbitrary cols×rows grid (typically N×N like 5×5)

import React from 'react';
import { mediaUrlForKey } from '../services/api.js';

// Schematic-mode letter colors (legacy code path).
const COLORS = {
  F: 'rgba(34,197,94,0.50)',
  C: 'rgba(251,146,60,0.55)',
  E: 'rgba(56,189,248,0.55)',
  I: 'rgba(234,179,8,0.55)',
  '?': 'rgba(148,163,184,0.35)',
  '.': 'rgba(15,23,42,0.3)',
};

// Full-role palette used by thumbs_overlay mode. Keys match
// AutotileRoleSchema values from shared/mapSchemas/tilesetPack.js.
export const ROLE_COLORS = {
  fill: 'rgba(34,197,94,0.45)',
  corner: 'rgba(251,146,60,0.50)',
  corner_NW: 'rgba(251,146,60,0.55)',
  corner_NE: 'rgba(244,114,182,0.55)',
  corner_SE: 'rgba(239,68,68,0.55)',
  corner_SW: 'rgba(217,70,239,0.55)',
  inner: 'rgba(234,179,8,0.55)',
  inner_NW: 'rgba(234,179,8,0.55)',
  inner_NE: 'rgba(250,204,21,0.55)',
  inner_SE: 'rgba(253,224,71,0.55)',
  inner_SW: 'rgba(202,138,4,0.55)',
  edge: 'rgba(56,189,248,0.55)',
  edge_N: 'rgba(56,189,248,0.55)',
  edge_E: 'rgba(14,165,233,0.55)',
  edge_S: 'rgba(2,132,199,0.55)',
  edge_W: 'rgba(125,211,252,0.55)',
  edge_NE: 'rgba(96,165,250,0.55)',
  edge_NW: 'rgba(59,130,246,0.55)',
  edge_SE: 'rgba(37,99,235,0.55)',
  edge_SW: 'rgba(29,78,216,0.55)',
};

// Short badge text for each role.
export const ROLE_BADGE = {
  fill: 'F',
  corner: 'C',
  corner_NW: 'NW',
  corner_NE: 'NE',
  corner_SE: 'SE',
  corner_SW: 'SW',
  inner: 'I',
  inner_NW: 'iNW',
  inner_NE: 'iNE',
  inner_SE: 'iSE',
  inner_SW: 'iSW',
  edge: 'E',
  edge_N: 'N',
  edge_E: 'E',
  edge_S: 'S',
  edge_W: 'W',
  edge_NE: 'NE',
  edge_NW: 'NW',
  edge_SE: 'SE',
  edge_SW: 'SW',
};

const A2_LAYOUT = [
  ['F', 'E'],
  ['E', 'C'],
  ['I', 'E'],
];

const A1_LAYOUT = [
  ['F', 'E'],
  ['E', 'C'],
  ['I', 'E'],
];

const WANG_LAYOUT = Array.from({ length: 4 }, () =>
  Array.from({ length: 4 }, (_v, ci) => (ci === 0 ? 'F' : 'E'))
);

const BLOB_LAYOUT = Array.from({ length: 6 }, (_r, ri) =>
  Array.from({ length: 8 }, (_c, ci) => {
    if (ri === 0 && ci === 0) return 'F';
    if (ri % 2 === 0) return 'E';
    return 'C';
  })
);

const CUSTOM_LAYOUT = [
  ['?', '?'],
  ['?', '?'],
];

const LAYOUTS = {
  rpgmaker_a1: { cols: 2, rows: 3, cells: A1_LAYOUT, labelPl: 'A1 (animacja wody 2×3)' },
  rpgmaker_a2: { cols: 2, rows: 3, cells: A2_LAYOUT, labelPl: 'A2 (blob terenu 2×3)' },
  wang_2edge: { cols: 4, rows: 4, cells: WANG_LAYOUT, labelPl: 'Wang 2-edge (4×4 = 16 wariantów)' },
  blob_47: { cols: 8, rows: 6, cells: BLOB_LAYOUT, labelPl: 'Blob 47 (8×6 wariantów)' },
  custom: { cols: 2, rows: 2, cells: CUSTOM_LAYOUT, labelPl: 'Custom (ręczna definicja)' },
};

const CUSTOM_MAX_PX = 240;

function buildCustomSpec(cols, rows) {
  const c = Math.max(1, Math.min(32, Number(cols) || 2));
  const r = Math.max(1, Math.min(32, Number(rows) || 2));
  const cells = Array.from({ length: r }, () => Array.from({ length: c }, () => '?'));
  return { cols: c, rows: r, cells, labelPl: `Custom (${c}×${r})` };
}

// Derive grid dimensions (cols, rows) for thumbs_overlay mode. When rendering
// for a standard layout we still want the user to see the atlas thumbnails,
// so we fall back to the LAYOUTS entry.
function specForThumbs(layout, cols, rows) {
  if (layout === 'custom') {
    const c = Math.max(1, Math.min(32, Number(cols) || 2));
    const r = Math.max(1, Math.min(32, Number(rows) || 2));
    return { cols: c, rows: r, labelPl: `Custom (${c}×${r})` };
  }
  const base = LAYOUTS[layout] || LAYOUTS.custom;
  return { cols: base.cols, rows: base.rows, labelPl: base.labelPl };
}

export default function AutotileLayoutDiagram({
  layout = 'rpgmaker_a2',
  size = 14,
  showLegend = true,
  cols,
  rows,
  showOriginMarker = false,
  // Thumbs / interactive extensions:
  tileset = null,          // Tileset row ({ imageKey, imageWidth, nativeTilesize, ... })
  originCol = 0,
  originRow = 0,
  cellsMap = null,         // { "c,r": role } — role map for overlay
  interactive = false,
  onCellClick = null,      // (col, row, currentRole, { event, anchorRect }) => void
  selectedCells = null,    // Set<"c,r"> — visual multi-select highlight
  mode,                    // 'schematic' | 'thumbs_overlay'
}) {
  const effectiveMode = mode || (tileset ? 'thumbs_overlay' : 'schematic');

  if (effectiveMode === 'thumbs_overlay' && tileset) {
    return (
      <ThumbsOverlayDiagram
        layout={layout}
        size={size}
        cols={cols}
        rows={rows}
        tileset={tileset}
        originCol={originCol}
        originRow={originRow}
        cellsMap={cellsMap || {}}
        interactive={interactive}
        onCellClick={onCellClick}
        selectedCells={selectedCells}
        showLegend={showLegend}
      />
    );
  }

  // Schematic fallback (unchanged legacy behavior).
  let spec;
  let effectiveSize = size;
  if (layout === 'custom' && (cols != null || rows != null)) {
    spec = buildCustomSpec(cols ?? 2, rows ?? 2);
    const maxDim = Math.max(spec.cols, spec.rows);
    const fit = Math.floor(CUSTOM_MAX_PX / maxDim);
    if (fit < size) effectiveSize = Math.max(4, fit);
  } else {
    spec = LAYOUTS[layout] || LAYOUTS.custom;
  }
  const w = spec.cols * effectiveSize;
  const h = spec.rows * effectiveSize;
  return (
    <div className="inline-flex flex-col gap-1">
      <div className="text-[10px] text-on-surface-variant/70">{spec.labelPl}</div>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`layout ${layout}`}>
        {spec.cells.map((row, ri) =>
          row.map((code, ci) => {
            const color = COLORS[code] || COLORS['.'];
            return (
              <g key={`${ri}-${ci}`}>
                <rect
                  x={ci * effectiveSize + 0.5}
                  y={ri * effectiveSize + 0.5}
                  width={effectiveSize - 1}
                  height={effectiveSize - 1}
                  fill={color}
                  stroke="rgba(148,163,184,0.3)"
                  strokeWidth="1"
                />
                {effectiveSize >= 12 && (
                  <text
                    x={ci * effectiveSize + effectiveSize / 2}
                    y={ri * effectiveSize + effectiveSize / 2 + 3}
                    textAnchor="middle"
                    fontSize={Math.max(8, effectiveSize * 0.55)}
                    fill="rgba(15,23,42,0.85)"
                    fontWeight="700"
                  >
                    {code === '.' ? '' : code}
                  </text>
                )}
              </g>
            );
          })
        )}
        {showOriginMarker && (
          <g aria-label="origin (0,0)">
            <rect
              x={0.5}
              y={0.5}
              width={effectiveSize - 1}
              height={effectiveSize - 1}
              fill="none"
              stroke="rgba(236,72,153,0.95)"
              strokeWidth="2"
            />
            <circle cx={2} cy={2} r={2} fill="rgba(236,72,153,0.95)" />
          </g>
        )}
      </svg>
      {showLegend && (
        <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-[9px] text-on-surface-variant/60">
          <span><span className="inline-block w-2 h-2 align-middle mr-0.5" style={{ background: COLORS.F }} />F=fill</span>
          <span><span className="inline-block w-2 h-2 align-middle mr-0.5" style={{ background: COLORS.C }} />C=corner</span>
          <span><span className="inline-block w-2 h-2 align-middle mr-0.5" style={{ background: COLORS.E }} />E=edge</span>
          <span><span className="inline-block w-2 h-2 align-middle mr-0.5" style={{ background: COLORS.I }} />I=inner</span>
          {showOriginMarker && (
            <span>
              <span
                className="inline-block w-2 h-2 align-middle mr-0.5 border-2"
                style={{ borderColor: 'rgba(236,72,153,0.95)' }}
              />
              origin (0,0)
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function ThumbsOverlayDiagram({
  layout,
  size,
  cols,
  rows,
  tileset,
  originCol,
  originRow,
  cellsMap,
  interactive,
  onCellClick,
  selectedCells,
  showLegend,
}) {
  const spec = specForThumbs(layout, cols, rows);
  const native = Math.max(1, Number(tileset.nativeTilesize) || 16);
  // Scale thumbs so the full grid fits within ~CUSTOM_MAX_PX on its longest axis.
  const maxDim = Math.max(spec.cols, spec.rows);
  const wantSize = size * 2; // nicer default for thumbs
  const fit = Math.max(12, Math.min(wantSize, Math.floor(CUSTOM_MAX_PX / maxDim)));
  const cellSize = fit;
  const atlasUrl = tileset.imageKey ? mediaUrlForKey(tileset.imageKey) : null;
  const bgSizeW = (tileset.imageWidth || 0) * (cellSize / native);
  const bgSizeH = (tileset.imageHeight || 0) * (cellSize / native);

  return (
    <div className="inline-flex flex-col gap-1">
      <div className="text-[10px] text-on-surface-variant/70">
        {spec.labelPl}
        {interactive ? ' — klik aby przypisać rolę (ctrl/shift = wiele)' : ''}
      </div>
      <div
        className="grid bg-black/20 rounded"
        style={{
          gridTemplateColumns: `repeat(${spec.cols}, ${cellSize}px)`,
          gridTemplateRows: `repeat(${spec.rows}, ${cellSize}px)`,
          gap: 1,
          padding: 1,
        }}
        role={interactive ? 'grid' : 'img'}
        aria-label={`autotile ${layout} ${spec.cols}×${spec.rows}`}
      >
        {Array.from({ length: spec.rows }).map((_r, ri) =>
          Array.from({ length: spec.cols }).map((_c, ci) => {
            const key = `${ci},${ri}`;
            const role = cellsMap[key] || null;
            const overlayColor = role ? ROLE_COLORS[role] : null;
            const badge = role ? ROLE_BADGE[role] : null;
            const isSelected = selectedCells && selectedCells.has(key);
            const isOrigin = ri === 0 && ci === 0;
            const bgX = -(originCol + ci) * cellSize;
            const bgY = -(originRow + ri) * cellSize;
            // Selection outline takes precedence over the origin marker so
            // the user can see which cells a popover pick will affect.
            // Origin still wins when the cell is also selected (both get a
            // thicker double-ring effect via outlineOffset).
            let outline = 'none';
            if (isSelected) outline = '2px solid rgba(250,204,21,0.95)';
            else if (isOrigin) outline = '2px solid rgba(236,72,153,0.9)';
            const cellStyle = {
              width: cellSize,
              height: cellSize,
              backgroundImage: atlasUrl ? `url(${atlasUrl})` : undefined,
              backgroundRepeat: 'no-repeat',
              backgroundSize: `${bgSizeW}px ${bgSizeH}px`,
              backgroundPosition: `${bgX}px ${bgY}px`,
              imageRendering: 'pixelated',
              position: 'relative',
              cursor: interactive ? 'pointer' : 'default',
              outline,
              outlineOffset: -2,
            };
            const content = (
              <>
                {overlayColor && (
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      background: overlayColor,
                      pointerEvents: 'none',
                    }}
                  />
                )}
                {badge ? (
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: Math.max(8, Math.floor(cellSize * 0.32)),
                      fontWeight: 700,
                      color: 'rgba(15,23,42,0.9)',
                      textShadow: '0 0 2px rgba(255,255,255,0.8)',
                      pointerEvents: 'none',
                    }}
                  >
                    {badge}
                  </div>
                ) : (
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: Math.max(10, Math.floor(cellSize * 0.45)),
                      color: 'rgba(148,163,184,0.55)',
                      pointerEvents: 'none',
                    }}
                  >
                    ?
                  </div>
                )}
              </>
            );
            if (interactive) {
              return (
                <button
                  key={key}
                  type="button"
                  style={cellStyle}
                  onClick={(e) => {
                    e.preventDefault();
                    const anchorRect = e.currentTarget.getBoundingClientRect();
                    onCellClick && onCellClick(ci, ri, role, { event: e, anchorRect });
                  }}
                  aria-label={`cell ${ci},${ri}${role ? ` role ${role}` : ' unassigned'}${isSelected ? ' (selected)' : ''}`}
                  aria-pressed={isSelected || undefined}
                >
                  {content}
                </button>
              );
            }
            return (
              <div key={key} style={cellStyle} aria-label={`cell ${ci},${ri}`}>
                {content}
              </div>
            );
          })
        )}
      </div>
      {showLegend && (
        <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-[9px] text-on-surface-variant/60">
          <span><span className="inline-block w-2 h-2 align-middle mr-0.5" style={{ background: ROLE_COLORS.fill }} />fill</span>
          <span><span className="inline-block w-2 h-2 align-middle mr-0.5" style={{ background: ROLE_COLORS.corner_NW }} />corner_*</span>
          <span><span className="inline-block w-2 h-2 align-middle mr-0.5" style={{ background: ROLE_COLORS.edge_N }} />edge_*</span>
          <span><span className="inline-block w-2 h-2 align-middle mr-0.5" style={{ background: ROLE_COLORS.inner_NW }} />inner_*</span>
        </div>
      )}
    </div>
  );
}

export { LAYOUTS as AUTOTILE_LAYOUTS };
