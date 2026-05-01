// TileInfoPin — persistent info card for the last-active tile in selection.
//
// Differs from HoverTileTooltip: stays visible when the mouse leaves the
// grid, only swaps when the selection's last id changes. Users can dismiss
// it per-tile with the × button; the dismissal is reset the moment the
// active tile id changes (so a fresh click re-pins).
//
// This is a Phase-2 stopgap that mirrors HoverTileTooltip's content; when
// the shared TileInfoCard lands (Phase 2a) this file will shrink to a
// thin wrapper around <TileInfoCard variant="pin" />.

import React, { useEffect, useMemo, useState } from 'react';
import { cellsForLayout } from '../engine/autotileLayout.js';
import { ATOM_DOCS, TRAIT_DOCS } from './atomDocs.js';
import { groupCssColor } from './groupColor.js';

const EDGE_AT = new Set([
  'edge_N', 'edge_E', 'edge_S', 'edge_W',
  'edge_NE', 'edge_NW', 'edge_SE', 'edge_SW',
]);

function findGroupForTile(localId, groups, tileset) {
  if (!Array.isArray(groups) || !groups.length || !tileset?.nativeTilesize) return null;
  const cols = Math.floor((tileset.imageWidth || 0) / tileset.nativeTilesize);
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

export default function TileInfoPin({ activeId, tile, groups, tileset }) {
  // Track which id the user manually dismissed. When activeId changes we
  // forget the dismissal so the pin re-appears for the next tile click.
  const [dismissedId, setDismissedId] = useState(null);
  useEffect(() => {
    if (dismissedId != null && dismissedId !== activeId) setDismissedId(null);
  }, [activeId, dismissedId]);

  const group = useMemo(
    () => (activeId == null ? null : findGroupForTile(activeId, groups, tileset)),
    [activeId, groups, tileset]
  );

  if (activeId == null) {
    return (
      <div className="text-[11px] text-on-surface-variant/60 px-1 py-2">
        Zaznacz kafel na gridzie, żeby przypiąć jego opis.
      </div>
    );
  }
  if (dismissedId === activeId) {
    return (
      <div className="flex items-center justify-between gap-2 px-1 py-1 text-[11px] text-on-surface-variant/60">
        <span>Pin odpięty dla #{activeId}.</span>
        <button
          type="button"
          onClick={() => setDismissedId(null)}
          className="px-1 py-[1px] rounded-sm text-on-surface-variant/70 hover:text-on-surface hover:bg-surface-container-high/60"
        >
          Przypnij ponownie
        </button>
      </div>
    );
  }

  const atoms = Array.isArray(tile?.atoms) ? tile.atoms : [];
  const traits = tile?.traits || {};
  const tags = Array.isArray(tile?.tags) ? tile.tags : [];
  const edges = atoms.filter((a) => EDGE_AT.has(a));
  const roles = atoms.filter((a) => a.startsWith('autotile_role_'));
  const other = atoms.filter((a) => !EDGE_AT.has(a) && !a.startsWith('autotile_role_'));
  const empty = !atoms.length && !Object.keys(traits).length && !tags.length;

  return (
    <div className="rounded-md border border-outline-variant/30 bg-surface-container/60 px-2 py-1.5 text-xs text-on-surface">
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="flex items-center gap-2">
          <span className="font-semibold">Kafel #{activeId}</span>
          {group && (
            <span className="flex items-center gap-1 text-[10px] text-on-surface-variant/80">
              <span
                className="inline-block w-2 h-2 rounded-sm"
                style={{ background: groupCssColor(group.id, 0.9) }}
              />
              {group.name}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setDismissedId(activeId)}
          className="text-[10px] px-1 py-[1px] rounded-sm text-on-surface-variant/70 hover:text-on-surface hover:bg-surface-container-high/60"
          title="Odepnij"
        >
          ×
        </button>
      </div>
      {empty && (
        <div className="text-[11px] text-on-surface-variant/60">
          Brak metadanych. Otaguj kafel w inspektorze.
        </div>
      )}
      {other.length > 0 && (
        <Row label="Atomy">
          {other.map((a) => (
            <span
              key={a}
              className="inline-block px-1 py-0.5 mr-1 mb-0.5 rounded-sm bg-surface-container/80 border border-outline-variant/30 text-[10px]"
              title={ATOM_DOCS[a]?.descPl}
            >
              {ATOM_DOCS[a]?.labelPl || a}
            </span>
          ))}
        </Row>
      )}
      {roles.length > 0 && (
        <Row label="Rola">
          {roles.map((r) => (
            <span key={r} className="inline-block px-1 py-0.5 mr-1 mb-0.5 rounded-sm bg-primary/15 border border-primary/40 text-[10px] text-primary">
              {ATOM_DOCS[r]?.labelPl || r}
            </span>
          ))}
        </Row>
      )}
      {edges.length > 0 && (
        <Row label="Krawędzie">
          <span className="font-mono text-[10px] text-on-surface-variant/80">
            {edges.map((e) => e.replace('edge_', '')).join(' ')}
          </span>
        </Row>
      )}
      {Object.keys(traits).length > 0 && (
        <Row label="Traity">
          {Object.entries(traits).map(([k, v]) => (
            <span
              key={k}
              className="inline-block px-1 py-0.5 mr-1 mb-0.5 rounded-sm bg-sky-500/10 border border-sky-500/30 text-[10px] text-sky-300"
            >
              {TRAIT_DOCS[k]?.labelPl ?? k}: {v}
            </span>
          ))}
        </Row>
      )}
      {tags.length > 0 && (
        <Row label="Tagi">
          {tags.map((t) => (
            <span key={t} className="inline-block px-1 py-0.5 mr-1 mb-0.5 rounded-sm bg-surface-container/80 border border-outline-variant/30 text-[10px]">
              #{t}
            </span>
          ))}
        </Row>
      )}
    </div>
  );
}

function Row({ label, children }) {
  return (
    <div className="mb-1 last:mb-0">
      <div className="text-[9px] uppercase tracking-wider text-on-surface-variant/60 mb-0.5">{label}</div>
      <div className="flex flex-wrap">{children}</div>
    </div>
  );
}
