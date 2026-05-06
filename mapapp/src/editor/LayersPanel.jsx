// LayersPanel — pick the active layer for painting and toggle the
// collision overlay.
//
// Each layer carries its own colour in LAYER_ACCENT so the sidebar
// reads geometrically: ground rows are emerald, overlay is sky, object
// markers are amber. Same accent seeps through to the left stripe of
// the active row so the user doesn't need to check the label text.

import React from 'react';
import { LAYER_NAMES, useEditorStore } from './useEditorStore.js';
import SectionCard from '../ui/SectionCard.jsx';
import Checkbox from '../ui/Checkbox.jsx';
import { SECTION_ACCENTS } from '../ui/sectionAccents.js';

const LAYER_ACCENT = {
  ground: 'emerald',
  overlay: 'sky',
  objects: 'amber',
};

const LAYER_GLYPH = {
  ground: '▣',
  overlay: '◆',
  objects: '✦',
};

export default function LayersPanel() {
  const activeLayer = useEditorStore((s) => s.activeLayer);
  const setActiveLayer = useEditorStore((s) => s.setActiveLayer);
  const showCollision = useEditorStore((s) => s.showCollision);
  const setShowCollision = useEditorStore((s) => s.setShowCollision);

  return (
    <SectionCard
      title="Layers"
      accent="sky"
      data-tutorial-id="layers-panel"
      bodyClassName="!gap-1"
    >
      {LAYER_NAMES.map((name) => {
        const active = name === activeLayer;
        const accent = LAYER_ACCENT[name] || 'primary';
        const tokens = SECTION_ACCENTS[accent] || SECTION_ACCENTS.primary;
        return (
          <button
            key={name}
            type="button"
            onClick={() => setActiveLayer(name)}
            className={[
              'relative text-left pl-4 pr-2 py-1.5 rounded-sm text-sm font-semibold border transition-colors',
              active
                ? `${tokens.softBg} ${tokens.title} ${tokens.border}`
                : 'bg-surface-container/60 text-on-surface border-outline-variant/25 hover:border-primary/40 hover:bg-surface-container-high/70',
            ].join(' ')}
            aria-pressed={active}
          >
            {active && (
              <span
                className={`absolute left-0 top-1 bottom-1 w-[3px] rounded-r-sm ${tokens.stripe}`}
                aria-hidden="true"
              />
            )}
            <span className={`inline-block w-4 text-center ${tokens.title}`} aria-hidden="true">
              {LAYER_GLYPH[name]}
            </span>
            <span className="ml-1">{name}</span>
          </button>
        );
      })}

      <Checkbox
        className="mt-1"
        accent="error"
        checked={showCollision}
        onChange={setShowCollision}
        label="collision overlay"
        hint="(C)"
      />
    </SectionCard>
  );
}
