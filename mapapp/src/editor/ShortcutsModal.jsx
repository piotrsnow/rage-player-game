// Keyboard-shortcut help overlay for the Map Editor. Opens when the user
// presses `?` anywhere on the page (outside text inputs) and lists every
// shortcut installed by `EditorPage.jsx`.

import React, { useEffect } from 'react';
import Button from '../ui/Button.jsx';

const GROUPS = [
  {
    title: 'Tools',
    items: [
      ['B', 'Brush'],
      ['R', 'Rectangle'],
      ['F', 'Flood fill'],
      ['E', 'Eraser'],
      ['A', 'Autotile'],
      ['W', 'Wall'],
      ['N', 'NPC place'],
      ['P', 'Player start'],
    ],
  },
  {
    title: 'View',
    items: [
      ['G', 'Toggle grid'],
      ['C', 'Toggle collision overlay'],
      ['Shift + click (with C on)', 'Toggle collision on cell'],
    ],
  },
  {
    title: 'Layers',
    items: [
      ['1', 'Select ground layer'],
      ['2', 'Select overlay layer'],
      ['3', 'Select objects layer'],
    ],
  },
  {
    title: 'Edit',
    items: [
      ['Ctrl / Cmd + Z', 'Undo'],
      ['Ctrl / Cmd + Shift + Z', 'Redo'],
      ['Ctrl / Cmd + Y', 'Redo'],
      ['Ctrl / Cmd + S', 'Save map'],
      ['Right mouse button', 'Erase (brush) / remove object'],
    ],
  },
  {
    title: 'Help',
    items: [
      ['?', 'Open this shortcut list'],
      ['Esc', 'Close this modal'],
    ],
  },
];

const KBD =
  'inline-block min-w-[20px] px-1.5 py-0.5 bg-surface-container-high/80 border border-outline-variant/30 ' +
  'border-b-[2px] rounded-[3px] font-mono text-[11px] text-on-surface whitespace-nowrap';

export default function ShortcutsModal({ onClose }) {
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose?.(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[1000] animate-fade-in"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="glass-panel-elevated w-[min(620px,90vw)] max-h-[85vh] rounded-xl flex flex-col overflow-hidden animate-scale-in"
      >
        <div className="px-3.5 py-2.5 border-b border-outline-variant/20 flex items-center gap-2">
          <strong className="text-on-surface text-[13px] font-headline tracking-wide">Keyboard shortcuts</strong>
          <div className="ml-auto">
            <Button onClick={onClose}>Close</Button>
          </div>
        </div>
        <div className="p-4 overflow-auto flex-1 text-on-surface custom-scrollbar grid gap-4"
          style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}
        >
          {GROUPS.map((group) => (
            <section key={group.title}>
              <div className="text-[11px] tracking-[0.08em] font-bold text-primary/90 mb-1.5 uppercase">
                {group.title}
              </div>
              <ul className="list-none p-0 m-0 flex flex-col gap-1">
                {group.items.map(([keys, label]) => (
                  <li key={keys} className="flex items-center gap-2 text-xs">
                    <kbd className={KBD}>{keys}</kbd>
                    <span className="text-on-surface-variant">{label}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        <div className="px-3.5 py-2 border-t border-outline-variant/20 text-[11px] text-on-surface-variant/70">
          Press <kbd className={`${KBD} text-[10px]`}>?</kbd> anywhere to reopen this list.
        </div>
      </div>
    </div>
  );
}
