// AutotileGroupPicker — list + create + select autotile groups for the
// current tileset.
//
// Two jobs:
//   1. Show existing AutotileGroup rows (loaded by StudioPage). Selecting a
//      group highlights its tiles on the grid by writing the group's tile
//      ids into the Studio store's `selection` — the user can then bulk-set
//      `autotileRole` on those tiles from the Inspector (this iteration
//      leaves role-per-tile manual; role picker ships in phase 3 polish).
//   2. Create new groups manually (name + layout + originCol/Row). The
//      auto-detect button in StudioPage uses the same endpoint.

import React, { useState } from 'react';
import { api } from '../services/api.js';
import { useStudioStore } from './useStudioStore.js';
import { autotileGroupTileIds } from '../engine/autotileDetect.js';
import Spinner from '../ui/Spinner.jsx';
import { useToasts } from '../ui/Toasts.jsx';
import Button from '../ui/Button.jsx';
import IconButton from '../ui/IconButton.jsx';
import { Input, Select } from '../ui/Input.jsx';

const LAYOUTS = ['rpgmaker_a1', 'rpgmaker_a2', 'wang_2edge', 'blob_47', 'custom'];

export default function AutotileGroupPicker({ tileset, groups, onChange }) {
  const toasts = useToasts();
  const setSelection = useStudioStore((s) => s.setSelection);
  const [draft, setDraft] = useState({
    name: '',
    layout: 'rpgmaker_a2',
    originCol: 0,
    originRow: 0,
  });
  const [busy, setBusy] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  async function highlight(group) {
    const ids = autotileGroupTileIds(
      {
        originCol: group.originCol,
        originRow: group.originRow,
        cols: cellsForLayout(group.layout).cols,
        rows: cellsForLayout(group.layout).rows,
      },
      { imageWidth: tileset.imageWidth, nativeTilesize: tileset.nativeTilesize }
    );
    setSelection(ids);
  }

  async function createFromDraft() {
    if (!draft.name.trim()) return;
    setBusy(true);
    try {
      await api.createAutotileGroup({
        tilesetId: tileset.id,
        regionId: '',
        name: draft.name.trim(),
        layout: draft.layout,
        originCol: draft.originCol,
        originRow: draft.originRow,
        traits: {},
      });
      const rows = await api.listAutotileGroups(tileset.id);
      onChange?.(rows);
      setDraft((d) => ({ ...d, name: '' }));
      toasts.show('Autotile group created.', { level: 'success' });
    } catch (err) {
      toasts.show(`Create group failed: ${err.message}`, { level: 'error' });
    } finally {
      setBusy(false);
    }
  }

  async function deleteGroup(id) {
    setDeletingId(id);
    try {
      await api.deleteAutotileGroup(id);
      const rows = await api.listAutotileGroups(tileset.id);
      onChange?.(rows);
      toasts.show('Autotile group deleted.', { level: 'success' });
    } catch (err) {
      toasts.show(`Delete group failed: ${err.message}`, { level: 'error' });
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
      <div className="flex flex-col gap-1">
        {(groups || []).length === 0 && (
          <div className="text-xs text-on-surface-variant/70">
            Brak grup. Użyj „Auto-detect A1/A2 groups” lub dodaj ręcznie niżej.
          </div>
        )}
        {(groups || []).map((g) => {
          const isDeleting = deletingId === g.id;
          return (
            <div
              key={g.id}
              className={`px-2 py-1.5 border border-outline-variant/20 rounded-sm flex items-center gap-1.5 text-xs bg-surface-container/40 ${isDeleting ? 'opacity-60' : ''}`}
            >
              <div className="flex-1 min-w-0">
                <div className="font-semibold flex items-center gap-1.5 text-on-surface truncate">
                  {isDeleting && <Spinner size={12} />}
                  <span className="truncate">{g.name}</span>
                </div>
                <div className="text-[10px] text-on-surface-variant/60 truncate">
                  {g.layout} · col {g.originCol} row {g.originRow}
                </div>
              </div>
              <Button size="sm" disabled={isDeleting} onClick={() => highlight(g)}>Show</Button>
              <IconButton
                size={26}
                variant="danger"
                disabled={isDeleting}
                onClick={() => deleteGroup(g.id)}
                title="Delete group"
                aria-label={`Delete group ${g.name}`}
              >
                ×
              </IconButton>
            </div>
          );
        })}
      </div>

      <div className="text-[11px] text-on-surface-variant">Dodaj ręcznie:</div>
      <div className="flex gap-1.5">
        <Input
          size="sm"
          placeholder="name"
          value={draft.name}
          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
          className="flex-1 min-w-0"
        />
        <Select
          size="sm"
          value={draft.layout}
          onChange={(e) => setDraft((d) => ({ ...d, layout: e.target.value }))}
          className="w-[108px] shrink-0"
        >
          {LAYOUTS.map((l) => <option key={l} value={l}>{l}</option>)}
        </Select>
      </div>
      <div className="flex gap-1.5 items-center flex-wrap">
        <label className="text-[11px] text-on-surface-variant">col</label>
        <Input
          size="sm"
          type="number"
          min={0}
          value={draft.originCol}
          onChange={(e) => setDraft((d) => ({ ...d, originCol: Number(e.target.value) }))}
          className="w-14 shrink-0"
        />
        <label className="text-[11px] text-on-surface-variant">row</label>
        <Input
          size="sm"
          type="number"
          min={0}
          value={draft.originRow}
          onChange={(e) => setDraft((d) => ({ ...d, originRow: Number(e.target.value) }))}
          className="w-14 shrink-0"
        />
        <Button
          size="sm"
          variant="primary"
          onClick={createFromDraft}
          disabled={busy || !draft.name.trim()}
          className="ml-auto"
        >
          {busy && <Spinner size={12} color="currentColor" />}
          {busy ? 'adding…' : '+ add'}
        </Button>
      </div>
    </>
  );
}

function cellsForLayout(layout) {
  switch (layout) {
    case 'rpgmaker_a1': return { cols: 2, rows: 3 };
    case 'rpgmaker_a2': return { cols: 2, rows: 3 };
    case 'wang_2edge': return { cols: 4, rows: 4 };
    case 'blob_47': return { cols: 8, rows: 6 };
    default: return { cols: 2, rows: 3 };
  }
}
