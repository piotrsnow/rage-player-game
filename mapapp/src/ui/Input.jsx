// Shared Input / Select primitives.
//
// Why: the same dark `background + 1px border + small padding` block used
// to live in EditorPage, CharGenPage, RulesEditor, TileInspector,
// AutotileGroupPicker, RegionEditor, StudioPage. Extracting it saves ~10L
// per file plus makes future visual changes a one-file edit.
//
// Usage:
//   <Input value={x} onChange={...} />
//   <Input size="sm" type="number" min={1} max={512} value={n} onChange={...} className="w-[70px]" />
//   <Select value={anim} onChange={...}>{options}</Select>
//
// Input defaults to `w-full` because the overwhelming majority of
// sidebar/form usages want fill-parent. Callers that need a fixed width
// pass `className="w-[70px]"` (merged last).

import React, { forwardRef } from 'react';

const BASE =
  'w-full box-border font-body text-on-surface ' +
  'bg-surface-container/70 backdrop-blur border border-outline-variant/30 ' +
  'rounded-sm ' +
  'placeholder:text-on-surface-variant/50 ' +
  'focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/30 ' +
  'disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-150';

// Bumped from `text-xs px-2 py-1` to match Button's new default. `sm` is
// retained for numeric step inputs pinned to fixed widths (Size cols/rows,
// zoom fields) where the compact look still reads.
const SIZES = {
  sm: 'text-xs px-2 py-1',
  md: 'text-sm px-3 py-1.5',
  lg: 'text-base px-4 py-2',
};

// Back-compat: some callers still import FIELD_CLASSES directly. Keep the
// symbol (resolving to the md preset) so existing imports keep working while
// new code uses the size prop.
export const FIELD_CLASSES = `${BASE} ${SIZES.md}`;

export const Input = forwardRef(function Input({ size = 'md', className = '', style, ...rest }, ref) {
  const sizeClass = SIZES[size] || SIZES.md;
  return (
    <input
      ref={ref}
      className={`${BASE} ${sizeClass} ${className}`}
      style={style}
      {...rest}
    />
  );
});

export const Select = forwardRef(function Select(
  { size = 'md', className = '', style, children, ...rest },
  ref,
) {
  const sizeClass = SIZES[size] || SIZES.md;
  return (
    <select
      ref={ref}
      className={`${BASE} ${sizeClass} ${className}`}
      style={style}
      {...rest}
    >
      {children}
    </select>
  );
});

export default Input;
