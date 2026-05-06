// StatusBar — bottom-of-main status line for the editor.
//
// Before: a thin row with `tool=X · layer=Y · unsaved` and two raw
// buttons (Tutorial + `?`). After: coloured dot indicators so the
// status reads at a glance:
//   - tool dot  → primary (what you're doing)
//   - layer dot → emerald/sky/amber (the three layers map to the
//     same colours LayersPanel uses internally)
//   - dirty dot → rose when unsaved, transparent when saved
// Plus a `?` keyboard-shortcut opener via IconButton.

import React from 'react';
import Button from '../ui/Button.jsx';
import IconButton from '../ui/IconButton.jsx';
import Spinner from '../ui/Spinner.jsx';

const LAYER_DOT = {
  ground:  'bg-emerald-400',
  overlay: 'bg-sky-400',
  objects: 'bg-amber-400',
};

function Dot({ className = '', title }) {
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full shrink-0 ${className}`}
      title={title}
      aria-hidden="true"
    />
  );
}

export default function StatusBar({
  tool,
  activeLayer,
  dirty,
  loadingMapId,
  paletteLoading,
  onOpenTutorial,
  onOpenShortcuts,
}) {
  return (
    <div className="px-3 py-1.5 glass-panel border-t border-outline-variant/20 text-xs text-on-surface-variant flex items-center gap-2">
      {(paletteLoading || loadingMapId) && <Spinner size={12} />}
      <Dot className="bg-primary" title="tool" />
      <span>tool={tool}</span>
      <span className="opacity-30">·</span>
      <Dot className={LAYER_DOT[activeLayer] || 'bg-on-surface-variant/30'} title="active layer" />
      <span>layer={activeLayer}</span>
      <span className="opacity-30">·</span>
      <Dot className={dirty ? 'bg-rose-400' : 'bg-emerald-400/40'} title={dirty ? 'unsaved' : 'saved'} />
      <span>{dirty ? 'unsaved' : 'saved'}</span>
      {loadingMapId && <span className="opacity-60">· loading map…</span>}
      {paletteLoading && !loadingMapId && <span className="opacity-60">· building palette…</span>}
      <Button
        size="sm"
        onClick={onOpenTutorial}
        title="Uruchom samouczek krok po kroku"
        aria-label="Uruchom samouczek"
        className="ml-auto"
      >
        Tutorial
      </Button>
      <IconButton
        size={22}
        shape="circle"
        onClick={onOpenShortcuts}
        title="Keyboard shortcuts (?)"
        aria-label="Keyboard shortcuts"
      >
        ?
      </IconButton>
    </div>
  );
}
