// PreviewPanel — CharPreview + playback controls.
//
// Replaces the single 13-entry <Select> with three clustered control
// groups:
//   1. 2-row × 4-column direction grid (Idle up/left/down/right, Walk
//      the same). The active cell highlights with a `primary` chip.
//   2. Action row (Cast / Slash / Thrust / Shoot / Hurt) — all faced
//      down in LPC assets so no direction variant.
//   3. Zoom picker (2x / 3x / 4x / 6x) as a local useState that feeds
//      `CharPreview`'s `scale`.
//
// The existing Select was "correct" but required reading 13 labels to
// find "Walk →". The grid layout lets the user's eye land on direction
// geometry instead of text.

import React, { useState } from 'react';
import SectionCard from '../../ui/SectionCard.jsx';
import CharPreview from '../CharPreview.jsx';

const DIRECTIONS = [
  { id: 'up',    label: '↑' },
  { id: 'left',  label: '←' },
  { id: 'down',  label: '↓' },
  { id: 'right', label: '→' },
];

const ACTIONS = [
  { anim: 'cast_down',   label: 'Cast' },
  { anim: 'slash_down',  label: 'Slash' },
  { anim: 'thrust_down', label: 'Thrust' },
  { anim: 'shoot_down',  label: 'Shoot' },
  { anim: 'hurt_down',   label: 'Hurt' },
];

const ZOOM_STEPS = [2, 3, 4, 6];

function parseAnim(animId) {
  if (!animId) return { mode: 'idle', dir: 'down' };
  const [mode, dir] = animId.split('_');
  return { mode: mode || 'idle', dir: dir || 'down' };
}

export default function PreviewPanel({ previewCanvas, animId, animMap, onAnim }) {
  const [scale, setScale] = useState(3);
  const { mode, dir } = parseAnim(animId);
  const isAction = ['cast', 'slash', 'thrust', 'shoot', 'hurt'].includes(mode);

  function cellClass(active, accent = 'primary') {
    const activeCls = accent === 'primary'
      ? 'bg-primary/20 text-primary border-primary/60'
      : 'bg-tertiary-dim/20 text-tertiary-dim border-tertiary-dim/60';
    const idle = 'bg-surface-container/50 text-on-surface-variant border-outline-variant/20 '
      + 'hover:border-primary/40 hover:text-on-surface';
    return [
      'text-sm leading-none font-semibold h-7 rounded-sm border transition-colors cursor-pointer',
      active ? activeCls : idle,
    ].join(' ');
  }

  return (
    <SectionCard title="Preview" accent="tertiary">
      <div className="bg-surface-container-lowest p-3 flex justify-center rounded-sm border border-outline-variant/15">
        <CharPreview canvas={previewCanvas} animId={animId} animMap={animMap} scale={scale} />
      </div>

      <div className="grid grid-cols-[4.5rem_1fr] gap-1.5 items-center text-xs">
        <span className="text-on-surface-variant/70">Idle</span>
        <div className="grid grid-cols-4 gap-1">
          {DIRECTIONS.map((d) => (
            <button
              key={`idle_${d.id}`}
              type="button"
              className={cellClass(mode === 'idle' && dir === d.id)}
              onClick={() => onAnim(`idle_${d.id}`)}
              aria-pressed={mode === 'idle' && dir === d.id}
              title={`Idle ${d.label}`}
            >
              {d.label}
            </button>
          ))}
        </div>

        <span className="text-on-surface-variant/70">Walk</span>
        <div className="grid grid-cols-4 gap-1">
          {DIRECTIONS.map((d) => (
            <button
              key={`walk_${d.id}`}
              type="button"
              className={cellClass(mode === 'walk' && dir === d.id)}
              onClick={() => onAnim(`walk_${d.id}`)}
              aria-pressed={mode === 'walk' && dir === d.id}
              title={`Walk ${d.label}`}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-1 mt-0.5">
        {ACTIONS.map((a) => (
          <button
            key={a.anim}
            type="button"
            className={`${cellClass(animId === a.anim, 'tertiary')} px-2.5 flex-1 min-w-[48px]`}
            onClick={() => onAnim(a.anim)}
            aria-pressed={animId === a.anim}
          >
            {a.label}
          </button>
        ))}
      </div>

      {isAction && (
        <div className="text-[10px] text-on-surface-variant/60 -mt-0.5">
          Action pose (LPC always faces ↓)
        </div>
      )}

      <div className="flex items-center gap-1.5 mt-0.5">
        <span className="text-[10px] uppercase tracking-wider text-on-surface-variant/60">
          Zoom
        </span>
        <div className="flex gap-1 flex-1">
          {ZOOM_STEPS.map((z) => (
            <button
              key={z}
              type="button"
              className={`${cellClass(scale === z)} flex-1`}
              onClick={() => setScale(z)}
              aria-pressed={scale === z}
            >
              {z}×
            </button>
          ))}
        </div>
      </div>
    </SectionCard>
  );
}
