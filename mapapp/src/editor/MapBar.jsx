// MapBar — top-most card in the editor's left sidebar.
//
// Owns:
//   - map name (Input)
//   - New + Save buttons (Save gets size="lg" so it's the most
//     prominent CTA in the editor)
//   - Cols × Rows resize with the projectTilesize footer
//
// Wrapped in a `tertiary`-accented SectionCard and rendered with
// `sticky top-0` in the sidebar so the Save button stays visible even
// when the sidebar is scrolled way down into the packs list.

import React from 'react';
import Button from '../ui/Button.jsx';
import { Input } from '../ui/Input.jsx';
import SectionCard from '../ui/SectionCard.jsx';
import Spinner from '../ui/Spinner.jsx';
import Divider from '../ui/Divider.jsx';
import { useEditorStore } from './useEditorStore.js';

export default function MapBar({ onNew, onSave, saving }) {
  const name = useEditorStore((s) => s.name);
  const cols = useEditorStore((s) => s.cols);
  const rows = useEditorStore((s) => s.rows);
  const projectTilesize = useEditorStore((s) => s.projectTilesize);
  const dirty = useEditorStore((s) => s.dirty);

  return (
    <SectionCard
      title="Map"
      accent="tertiary"
      className="sticky top-0 z-[2] bg-surface-container/80"
    >
      <Input
        value={name}
        onChange={(e) => useEditorStore.getState().setName(e.target.value)}
      />
      <div className="flex gap-1.5">
        <Button block onClick={onNew}>New</Button>
        <Button
          block
          variant="primary"
          size="lg"
          onClick={onSave}
          disabled={saving}
          data-tutorial-id="save-button"
        >
          {saving && <Spinner size={14} color="currentColor" />}
          {saving ? 'Saving…' : dirty ? 'Save*' : 'Save'}
        </Button>
      </div>

      <Divider />

      <div className="flex items-center gap-1.5">
        <span className="text-[10px] uppercase tracking-wider text-tertiary-dim/70 w-10">
          Size
        </span>
        <Input
          size="sm"
          type="number"
          min={1}
          max={512}
          value={cols}
          onChange={(e) => useEditorStore.getState().resize({
            cols: Number(e.target.value) || cols,
            rows,
          })}
          className="!w-[64px]"
        />
        <span className="text-[11px] text-on-surface-variant/60">×</span>
        <Input
          size="sm"
          type="number"
          min={1}
          max={512}
          value={rows}
          onChange={(e) => useEditorStore.getState().resize({
            cols,
            rows: Number(e.target.value) || rows,
          })}
          className="!w-[64px]"
        />
      </div>
      <div className="text-[10px] text-on-surface-variant/60">
        {projectTilesize}px project tilesize
      </div>
    </SectionCard>
  );
}
