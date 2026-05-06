// Shared Chip primitive — rounded pill for tags, traits, toggle groups.
//
// Covers three patterns from the codebase:
//   1. Toggle chip   — `chipStyle(active)` in TileInspector atoms picker.
//   2. Tag chip      — `tagChipStyle` + `tagCloseBtn` in CharGenPage.
//   3. Static badge  — plain label (no onClick, no onClose).
//
// Usage:
//   <Chip active={on} onClick={() => toggle(atom)}>{atom}</Chip>    // toggle
//   <Chip onClose={() => removeTag(t)}>{t}</Chip>                   // tag
//   <Chip>legacy</Chip>                                             // static
//
// The X button is rendered only when `onClose` is provided. If both
// `onClick` and `onClose` are set, clicks on X do NOT bubble to the chip's
// onClick (stopPropagation).
//
// `accent` swaps the palette for one of the section identities in
// `sectionAccents.js` (rose, emerald, sky, …) so a chip inside a sky
// section keeps the sky hue whether idle or active. Default (no
// `accent`) keeps the historical purple look.

import React from 'react';
import { SECTION_ACCENTS } from './sectionAccents.js';

const BASE =
  'inline-flex items-center gap-1 leading-tight select-none rounded-full px-2.5 py-1 text-xs ' +
  'border transition-colors duration-150';

const DEFAULT_STATES = {
  active:
    'bg-primary/20 border-primary/50 text-primary',
  idle:
    'bg-surface-container/70 backdrop-blur border-outline-variant/30 text-on-surface-variant',
};

function accentStates(accent) {
  const tokens = SECTION_ACCENTS[accent];
  if (!tokens) return DEFAULT_STATES;
  return {
    active: `${tokens.chipActiveBg} ${tokens.border} ${tokens.title}`,
    idle: `bg-surface-container/60 backdrop-blur ${tokens.border} ${tokens.title} opacity-80 hover:opacity-100`,
  };
}

export default function Chip({
  active = false,
  accent,
  onClick,
  onClose,
  children,
  className = '',
  style,
  title,
  'aria-label': ariaLabel,
}) {
  const interactive = typeof onClick === 'function';
  const palette = accent ? accentStates(accent) : DEFAULT_STATES;
  const state = active ? palette.active : palette.idle;
  const cursorClass = interactive ? 'cursor-pointer hover:border-primary/40 hover:text-on-surface' : 'cursor-default';
  const merged = `${BASE} ${state} ${cursorClass} ${className}`;

  const closeBtn = onClose ? (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClose(); }}
      aria-label="Remove"
      className="ml-0.5 bg-transparent border-none p-0 text-error/80 hover:text-error cursor-pointer text-sm leading-none"
    >
      ×
    </button>
  ) : null;

  if (interactive) {
    return (
      <button
        type="button"
        onClick={onClick}
        title={title}
        aria-label={ariaLabel}
        className={merged}
        style={style}
      >
        {children}
        {closeBtn}
      </button>
    );
  }

  return (
    <span title={title} className={merged} style={style}>
      {children}
      {closeBtn}
    </span>
  );
}
