// PacksSection — which TilesetPacks feed the editor palette.
//
// Extracted from EditorPage's old packs block. Uses Checkbox (accent
// "indigo") for each pack so the tick colour matches the enclosing
// SectionCard. The rendering is purely derived from `packs` +
// `selectedPackIds`; all mutations go back through `onToggle` so the
// page keeps ownership of the Set and the palette builder can react.

import React from 'react';
import SectionCard from '../ui/SectionCard.jsx';
import Checkbox from '../ui/Checkbox.jsx';
import { SkeletonList } from '../ui/Spinner.jsx';

export default function PacksSection({
  packs,
  selectedPackIds,
  onToggle,
  loading = false,
  initialLoad = false,
}) {
  return (
    <SectionCard
      title="Packs"
      accent="indigo"
      loading={loading}
      count={packs.length || undefined}
      data-tutorial-id="packs-section"
    >
      {initialLoad && <SkeletonList count={3} rowHeight={20} />}
      {!initialLoad && packs.length === 0 && (
        <div className="text-xs text-on-surface-variant/70">
          No packs. Add them in Studio.
        </div>
      )}
      {packs.map((p) => {
        const on = selectedPackIds.includes(p.id);
        return (
          <Checkbox
            key={p.id}
            checked={on}
            onChange={(next) => onToggle(p.id, next)}
            label={p.name}
            accent="indigo"
          />
        );
      })}
    </SectionCard>
  );
}
