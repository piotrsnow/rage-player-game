// SectionCard — visually-distinct panel for a sidebar section.
//
// Before this primitive, every sidebar rendered a `SECTION_HEADING_CLS`
// (the same muted-grey uppercase header) three times side-by-side and
// relied on a single tiny gap between them for separation. The result was
// that Packs / Layers / Actors / Maps all looked identical and the user
// had to read the heading to know which region they were in.
//
// SectionCard wraps the block with:
//   1. A coloured 3px left stripe using the `accent` token (pulled from
//      `sectionAccents.js`). This is the dominant visual cue — you can
//      read the sidebar at a glance.
//   2. A coloured title that shares the same hue at text contrast.
//   3. A translucent surface container background with a subtle border.
//   4. Optional collapsible body — the entire header row becomes the
//      toggle so clicking anywhere on the heading folds/unfolds.
//
// Layout:
//   ┌─▌ HEADING [count] [spinner] ─[toggle]─┐
//   │ ▌                                      │
//   │ ▌  children                            │
//   │ ▌                                      │
//   └────────────────────────────────────────┘
//
// Props:
//   title            — heading text (required)
//   accent           — one of SECTION_ACCENTS keys (default "primary")
//   count            — optional numeric suffix shown next to the title
//   loading          — renders a spinner next to the title
//   collapsible      — enables the chevron / click-to-collapse
//   defaultCollapsed — starting state when `collapsible` and uncontrolled
//   collapsed        — controlled collapse value (pair with onToggle)
//   onToggle         — controlled collapse setter (receives `next` bool)
//   className        — extra wrapper classes (e.g. `sticky top-0`)
//   children         — body content
//
// When not collapsible, the header stays un-interactive so it doesn't
// get focus / hover effects it shouldn't have. When `collapsed` is
// provided the card becomes fully controlled and `defaultCollapsed` is
// ignored — mirrors React's standard `<input value>` / `<input
// defaultValue>` split.

import React, { useState } from 'react';
import { SECTION_ACCENTS } from './sectionAccents.js';
import Spinner from './Spinner.jsx';

export default function SectionCard({
  title,
  accent = 'primary',
  count,
  loading = false,
  collapsible = false,
  defaultCollapsed = false,
  collapsed: collapsedProp,
  onToggle,
  headerRight,
  className = '',
  bodyClassName = '',
  children,
  ...rest
}) {
  const [collapsedState, setCollapsedState] = useState(defaultCollapsed);
  const isControlled = collapsedProp !== undefined;
  const collapsed = isControlled ? collapsedProp : collapsedState;
  function toggle() {
    if (isControlled) onToggle?.(!collapsed);
    else setCollapsedState((v) => !v);
  }
  const tokens = SECTION_ACCENTS[accent] || SECTION_ACCENTS.primary;

  const wrapper = [
    'relative flex flex-col rounded-lg overflow-hidden',
    'bg-surface-container/40 backdrop-blur',
    'border border-outline-variant/15',
    className,
  ].join(' ');

  const stripeCls = `absolute left-0 top-0 bottom-0 w-[3px] ${tokens.stripe}`;
  const titleCls = `font-bold uppercase tracking-[0.08em] text-xs ${tokens.title}`;

  const headerInteractive = collapsible
    ? 'cursor-pointer hover:bg-surface-container-high/30 transition-colors'
    : '';

  const chevron = collapsible ? (
    <span
      className={`ml-1 text-on-surface-variant/70 transition-transform duration-150 ${
        collapsed ? '' : 'rotate-90'
      }`}
      aria-hidden="true"
    >
      ▸
    </span>
  ) : null;

  const header = (
    <div
      className={`flex items-center gap-1.5 pl-3.5 pr-2 py-1.5 ${headerInteractive}`}
      onClick={collapsible ? toggle : undefined}
      role={collapsible ? 'button' : undefined}
      aria-expanded={collapsible ? !collapsed : undefined}
    >
      <span className={titleCls}>{title}</span>
      {typeof count === 'number' && (
        <span className={`text-[10px] ${tokens.dim}`}>({count})</span>
      )}
      {loading && <Spinner size={12} />}
      {headerRight && (
        <div
          className="ml-auto flex items-center gap-1"
          onClick={(e) => { if (collapsible) e.stopPropagation(); }}
        >
          {headerRight}
        </div>
      )}
      {!headerRight && collapsible && <span className="ml-auto" />}
      {chevron}
    </div>
  );

  return (
    <section className={wrapper} {...rest}>
      <div className={stripeCls} aria-hidden="true" />
      {header}
      {!collapsed && (
        <div className={`px-3 pb-3 pt-0.5 flex flex-col gap-1.5 ${bodyClassName}`}>
          {children}
        </div>
      )}
    </section>
  );
}
