// Checkbox — labeled checkbox with optional accent color.
//
// Before this primitive we had three identical-shaped raw checkboxes in
// ToolPalette (Grid/Collision), EditorPage (packs list) and ActorsPanel
// (pin actor), each with its own `<label>` styling. Unifying them gives
// us a single place to control the hover/focus feel and to switch the
// accent color (a pack checkbox in an indigo-coded section wants its
// tick in indigo, not generic purple).
//
// Usage:
//   <Checkbox checked={on} onChange={setOn} label="Grid" hint="(G)" />
//   <Checkbox checked={on} onChange={setOn} label={p.name} accent="indigo" />
//   <Checkbox checked={on} onChange={setOn} accent="error" label="collision" />
//
// `accent` picks both the native checkbox color (via Tailwind
// `accent-{color}` utility class) and the label text color when checked.
// Defaults to `primary` (purple) which matches the historical look.

import React from 'react';
import { SECTION_ACCENTS } from './sectionAccents.js';

// Tailwind's `accent-*` utility is the easiest way to tint a native
// checkbox. We map our accent keys to the corresponding utility; `error`
// is kept as an escape hatch because the collision overlay toggle still
// wants red.
const NATIVE_ACCENT_CLASS = {
  primary: 'accent-primary',
  tertiary: 'accent-tertiary',
  emerald: 'accent-emerald-500',
  sky: 'accent-sky-500',
  rose: 'accent-rose-500',
  amber: 'accent-amber-500',
  indigo: 'accent-indigo-500',
  orange: 'accent-orange-500',
  violet: 'accent-violet-500',
  fuchsia: 'accent-fuchsia-500',
  error: 'accent-error',
};

function labelColor(accent, checked) {
  if (!checked) return 'text-on-surface-variant';
  if (accent === 'error') return 'text-error';
  return (SECTION_ACCENTS[accent] || SECTION_ACCENTS.primary).title;
}

export default function Checkbox({
  checked,
  onChange,
  label,
  hint,
  accent = 'primary',
  disabled = false,
  className = '',
  title,
  'aria-label': ariaLabel,
  ...rest
}) {
  const nativeAccent = NATIVE_ACCENT_CLASS[accent] || NATIVE_ACCENT_CLASS.primary;
  const textCls = labelColor(accent, checked);
  return (
    <label
      title={title}
      aria-label={ariaLabel}
      className={[
        'text-sm cursor-pointer select-none flex items-center gap-1.5',
        disabled ? 'opacity-50 cursor-not-allowed pointer-events-none' : '',
        textCls,
        className,
      ].join(' ')}
    >
      <input
        type="checkbox"
        checked={!!checked}
        disabled={disabled}
        onChange={(e) => onChange?.(e.target.checked, e)}
        className={`${nativeAccent} w-4 h-4`}
        {...rest}
      />
      {label && <span className="truncate">{label}</span>}
      {hint && <span className="text-[10px] opacity-60 shrink-0">{hint}</span>}
    </label>
  );
}
