// TileInfoCard — shared "at a glance" summary of a tile.
//
// Used in three variants:
//   - 'tooltip'         — floating hover card (wrapped by HoverTileTooltip)
//   - 'pin'             — stays put on a sidebar / under the grid for the
//                         last-selected tile
//   - 'palette-hover'   — portalled popup in the editor palette
//
// Content (in order):
//   1. Header: "Kafel #id" + optional group swatch + name
//   2. Atlas mini-preview (64×64) when imageUrl + tilesize known
//   3. 3×3 edge compass highlighting the tile's edge_* atoms
//   4. Colored atom chips (role / structure / passability / other),
//      sharing the same palette as TileGrid's overlay
//   5. Trait chips using TraitSwatch (same hue as the TileGrid stripe)
//   6. Free-form tags
//   7. Optional group banner (mini layout hint + swatch)

import React, { useMemo } from 'react';
import { AtlasTilePreview, TraitSwatch } from './TilePreview.jsx';
import Diagram3x3 from '../ui/Diagram3x3.jsx';
import { cellsForLayout } from '../engine/autotileLayout.js';
import { ATOM_DOCS, TRAIT_DOCS } from './atomDocs.js';
import { groupCssColor } from './groupColor.js';

// Keep these palettes in sync with the Pixi overlay in TileGrid.jsx —
// a tile should read the "same color" whether you're scanning the grid
// or hovering the tooltip.
const ROLE_CSS = {
  autotile_role_corner: '#fb923c',
  autotile_role_edge: '#38bdf8',
  autotile_role_inner: '#eab308',
  autotile_role_fill: '#22c55e',
};

const STRUCTURE_CSS = {
  wall: { char: 'W', color: '#6366f1' },
  floor: { char: 'F', color: '#14b8a6' },
  door: { char: 'D', color: '#a855f7' },
  window: { char: 'O', color: '#0ea5e9' },
  stairs: { char: 'S', color: '#f59e0b' },
};

const PASSABILITY_CSS = {
  solid: '#ef4444',
  walkable: '#22c55e',
  water: '#3b82f6',
  hazard: '#f97316',
};

const EDGE_CSS = '#e879f9';

const EDGE_KEYS = ['N', 'E', 'S', 'W', 'NE', 'NW', 'SE', 'SW'];
const EDGE_AT = new Set(EDGE_KEYS.map((k) => `edge_${k}`));

function findGroupForTile(localId, groups, tilesetLike) {
  if (!Array.isArray(groups) || !groups.length) return null;
  const native = tilesetLike?.nativeTilesize;
  const iw = tilesetLike?.imageWidth;
  if (!native || !iw) return null;
  const cols = Math.floor(iw / native);
  if (!cols) return null;
  const col = localId % cols;
  const row = Math.floor(localId / cols);
  for (const g of groups) {
    const spec = cellsForLayout(g);
    const c0 = g.originCol || 0;
    const r0 = g.originRow || 0;
    if (col >= c0 && col < c0 + spec.cols && row >= r0 && row < r0 + spec.rows) {
      return g;
    }
  }
  return null;
}

function AtomChip({ label, title, bg, fg = '#0b1220', border }) {
  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 mr-1 mb-1 rounded-sm text-[10px] font-medium leading-none"
      style={{
        background: bg,
        color: fg,
        border: `1px solid ${border || 'rgba(0,0,0,0.25)'}`,
      }}
      title={title}
    >
      {label}
    </span>
  );
}

function renderAtomChip(atom) {
  const doc = ATOM_DOCS[atom];
  const label = doc?.labelPl || atom;
  const title = doc?.descPl || atom;
  if (atom.startsWith('autotile_role_')) {
    const color = ROLE_CSS[atom] || '#22c55e';
    return <AtomChip key={atom} label={label} title={title} bg={color} />;
  }
  if (STRUCTURE_CSS[atom]) {
    const meta = STRUCTURE_CSS[atom];
    return (
      <AtomChip
        key={atom}
        label={`${meta.char} · ${label}`}
        title={title}
        bg={meta.color}
        fg="#ffffff"
      />
    );
  }
  if (PASSABILITY_CSS[atom]) {
    return <AtomChip key={atom} label={label} title={title} bg={PASSABILITY_CSS[atom]} fg="#ffffff" />;
  }
  return (
    <AtomChip
      key={atom}
      label={label}
      title={title}
      bg="rgba(30,41,59,0.8)"
      fg="#e2e8f0"
      border="rgba(148,163,184,0.35)"
    />
  );
}

const VARIANT_CLASS = {
  tooltip:
    'rounded-md border border-outline-variant/40 bg-surface-container-high/95 backdrop-blur-md px-2.5 py-2 text-xs text-on-surface shadow-[0_6px_22px_rgba(0,0,0,0.45)] w-[260px]',
  pin:
    'rounded-md border border-outline-variant/30 bg-surface-container/80 px-2.5 py-2 text-xs text-on-surface w-full',
  'palette-hover':
    'rounded-md border border-outline-variant/40 bg-surface-container-high/95 backdrop-blur-md px-2.5 py-2 text-xs text-on-surface shadow-[0_6px_22px_rgba(0,0,0,0.45)] w-[260px]',
};

function TileInfoCardImpl({
  tile,
  localId,
  // tilesetId reserved for future affordances (e.g. "open in Studio").
  tilesetId: _tilesetId,
  imageUrl,
  tilesize,
  groups,
  variant = 'tooltip',
  // Optional pre-resolved group; skips the lookup when the parent knows it.
  group: groupOverride,
  // Column count of the atlas. Falls back to `imageWidth / tilesize` via
  // the `tileset`-shaped object when not provided.
  cols,
  imageWidth,
}) {
  const atoms = Array.isArray(tile?.atoms) ? tile.atoms : [];
  const traits = tile?.traits || {};
  const tags = Array.isArray(tile?.tags) ? tile.tags : [];

  const resolvedCols = useMemo(() => {
    if (Number.isFinite(cols) && cols > 0) return cols;
    if (Number.isFinite(imageWidth) && Number.isFinite(tilesize) && tilesize > 0) {
      return Math.floor(imageWidth / tilesize);
    }
    return 0;
  }, [cols, imageWidth, tilesize]);

  const group = useMemo(() => {
    if (groupOverride !== undefined) return groupOverride;
    return findGroupForTile(localId, groups, { nativeTilesize: tilesize, imageWidth });
  }, [groupOverride, localId, groups, tilesize, imageWidth]);

  const edgeHighlight = useMemo(() => {
    const h = {};
    for (const key of EDGE_KEYS) {
      if (atoms.includes(`edge_${key}`)) h[key] = true;
    }
    return h;
  }, [atoms]);
  const hasEdges = Object.keys(edgeHighlight).length > 0;

  const roles = atoms.filter((a) => a.startsWith('autotile_role_'));
  const structure = atoms.filter((a) => STRUCTURE_CSS[a]);
  const passability = atoms.filter((a) => PASSABILITY_CSS[a]);
  const other = atoms.filter(
    (a) =>
      !roles.includes(a) &&
      !structure.includes(a) &&
      !passability.includes(a) &&
      !EDGE_AT.has(a),
  );

  const hasMiniPreview = !!imageUrl && Number.isFinite(tilesize) && tilesize > 0 && resolvedCols > 0;
  const sx = hasMiniPreview ? (localId % resolvedCols) * tilesize : 0;
  const sy = hasMiniPreview ? Math.floor(localId / resolvedCols) * tilesize : 0;

  const empty = !atoms.length && !Object.keys(traits).length && !tags.length;

  return (
    <div
      className={VARIANT_CLASS[variant] || VARIANT_CLASS.tooltip}
      role={variant === 'tooltip' || variant === 'palette-hover' ? 'tooltip' : undefined}
    >
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="font-semibold text-on-surface">Kafel #{localId}</div>
        {group && (
          <div className="flex items-center gap-1 text-[10px] text-on-surface-variant/80 truncate">
            <span
              className="inline-block w-2 h-2 rounded-sm flex-none"
              style={{ background: groupCssColor(group.id, 0.9) }}
            />
            <span className="truncate">{group.name || 'group'}</span>
          </div>
        )}
      </div>

      {(hasMiniPreview || hasEdges) && (
        <div className="flex items-start gap-2 mb-1.5">
          {hasMiniPreview && (
            <AtlasTilePreview
              imageUrl={imageUrl}
              sx={sx}
              sy={sy}
              tilesize={tilesize}
              size={64}
            />
          )}
          {hasEdges && (
            <div className="flex flex-col items-center justify-center">
              <Diagram3x3 highlight={edgeHighlight} size={48} />
              <div className="text-[9px] uppercase tracking-wider text-on-surface-variant/60 mt-0.5">
                krawędzie
              </div>
            </div>
          )}
        </div>
      )}

      {empty && (
        <div className="text-[11px] text-on-surface-variant/60">
          Brak metadanych. Otaguj kafel w inspektorze.
        </div>
      )}

      {(roles.length > 0 || structure.length > 0 || passability.length > 0 || other.length > 0) && (
        <Row label="Atomy">
          {[...passability, ...structure, ...roles, ...other].map((a) => renderAtomChip(a))}
        </Row>
      )}

      {Object.keys(traits).length > 0 && (
        <Row label="Traity">
          <div className="flex flex-wrap gap-1">
            {Object.entries(traits).map(([k, v]) => (
              <div
                key={k}
                className="inline-flex items-center gap-1 bg-surface-container/60 border border-outline-variant/30 rounded-sm pl-0.5 pr-1 py-0.5"
                title={`${TRAIT_DOCS[k]?.descPl || k}`}
              >
                <TraitSwatch traitKey={k} traitValue={v} size={14} />
                <span className="text-[10px] text-on-surface-variant/90 leading-none">
                  <span className="text-on-surface-variant/60">{TRAIT_DOCS[k]?.labelPl ?? k}:</span>{' '}
                  {v}
                </span>
              </div>
            ))}
          </div>
        </Row>
      )}

      {tags.length > 0 && (
        <Row label="Tagi">
          {tags.map((t) => (
            <span
              key={t}
              className="inline-block px-1 py-0.5 mr-1 mb-0.5 rounded-sm bg-surface-container/80 border border-outline-variant/30 text-[10px]"
            >
              #{t}
            </span>
          ))}
        </Row>
      )}

      {group && (
        <div
          className="mt-1.5 flex items-center gap-2 rounded-sm px-1.5 py-1 text-[10px]"
          style={{
            background: groupCssColor(group.id, 0.15),
            border: `1px solid ${groupCssColor(group.id, 0.5)}`,
          }}
        >
          <span
            className="inline-block w-2.5 h-2.5 rounded-sm flex-none"
            style={{ background: groupCssColor(group.id, 0.9) }}
          />
          <div className="flex-1 min-w-0 truncate">
            <span className="font-semibold text-on-surface">{group.name || 'group'}</span>
            {group.layout && (
              <span className="text-on-surface-variant/70"> · {group.layout}</span>
            )}
          </div>
          <GroupLayoutMini group={group} />
        </div>
      )}
    </div>
  );
}

// React.memo keeps the card stable across hover rect-only updates. The
// tooltip wrapper re-creates per mousemove (new `rect`); props to this
// component stay shallow-equal as long as tile/group/tileset don't flip.
const TileInfoCard = React.memo(TileInfoCardImpl);
export default TileInfoCard;

function Row({ label, children }) {
  return (
    <div className="mb-1 last:mb-0">
      <div className="text-[9px] uppercase tracking-wider text-on-surface-variant/60 mb-0.5">
        {label}
      </div>
      <div className="flex flex-wrap">{children}</div>
    </div>
  );
}

function GroupLayoutMini({ group }) {
  const spec = useMemo(() => cellsForLayout(group), [group]);
  if (!spec?.cols || !spec?.rows) return null;
  const CELL = 4;
  const GAP = 1;
  const w = spec.cols * CELL + (spec.cols - 1) * GAP;
  const h = spec.rows * CELL + (spec.rows - 1) * GAP;
  const cells = [];
  for (let r = 0; r < spec.rows; r += 1) {
    for (let c = 0; c < spec.cols; c += 1) {
      cells.push(
        <rect
          key={`${c}-${r}`}
          x={c * (CELL + GAP)}
          y={r * (CELL + GAP)}
          width={CELL}
          height={CELL}
          rx={0.5}
          fill={groupCssColor(group.id, 0.75)}
        />,
      );
    }
  }
  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className="flex-none"
      aria-label={`${spec.cols}×${spec.rows}`}
    >
      {cells}
    </svg>
  );
}
