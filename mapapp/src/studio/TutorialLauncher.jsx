// TutorialLauncher — small menu letting the user pick which studio
// tutorial scenario to run. The studio now ships two parallel tracks
// (see studio/tutorial/steps.js):
//
//   Podstawy           — 8-step generic tour
//   Scenariusz grass→sand — 6-step predicate-driven walkthrough
//
// Kept as its own component so PackActions stays "Export / Import / open
// menu" — and so future scenarios (water, stairs…) just slot into the
// same picker without touching the sidebar.

import React, { useEffect, useRef, useState } from 'react';
import Button from '../ui/Button.jsx';

export default function TutorialLauncher({ scenarios, onStartScenario }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    function onDocClick(ev) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(ev.target)) setOpen(false);
    }
    function onKey(ev) {
      if (ev.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Single scenario? Skip the menu entirely.
  if (!Array.isArray(scenarios) || scenarios.length === 0) return null;
  if (scenarios.length === 1) {
    return (
      <Button
        block
        onClick={() => onStartScenario(scenarios[0])}
        title="Uruchom samouczek krok po kroku"
        aria-label="Uruchom samouczek"
      >
        Tutorial
      </Button>
    );
  }

  return (
    <div className="relative" ref={wrapRef}>
      <Button
        block
        onClick={() => setOpen((v) => !v)}
        title="Wybierz scenariusz samouczka"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        Tutorial ▾
      </Button>
      {open && (
        <div
          role="menu"
          className={[
            'absolute left-0 right-0 mt-1 z-[20]',
            'glass-panel-elevated border border-outline-variant/30 rounded-sm shadow-lg',
            'flex flex-col overflow-hidden',
          ].join(' ')}
        >
          {scenarios.map((sc) => (
            <button
              key={sc.id}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onStartScenario(sc);
              }}
              className={[
                'text-left px-3 py-2 text-xs',
                'hover:bg-surface-container/70 transition-colors',
                'border-b border-outline-variant/20 last:border-b-0',
                'flex flex-col gap-0.5',
              ].join(' ')}
            >
              <span className="font-semibold text-on-surface">{sc.label}</span>
              {sc.description && (
                <span className="text-[11px] text-on-surface-variant/80 leading-snug">
                  {sc.description}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
