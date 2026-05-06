// Shared Button primitive.
//
// Why: every file in mapapp used to redeclare its own `btnStyle` (EditorPage,
// CharGenPage, RulesEditor, StudioPage inspector, TilesetUpload, ...). The
// look is consistent enough that a single component saves ~10L per file and
// keeps future visual tweaks in one place.
//
// Usage:
//   <Button onClick={save}>Save</Button>
//   <Button variant="primary" size="lg" onClick={...}>Go</Button>
//   <Button variant="danger" onClick={del}>Delete</Button>
//   <Button block onClick={...}>Wide</Button>                        // full width
//   <Button active onClick={...}>Selected</Button>                   // list row highlight
//   <Button size="sm" aria-label="Random">🎲</Button>                 // compact icon btn
//   <Button disabled>{saving && <Spinner size={12} />} Saving…</Button>
//   <Button className="text-left">…</Button>                         // escape hatch
//
// Styling: matches the main RPGon app aesthetic (glass panels + purple
// accent). Default variant is a translucent surface tile; `primary` is the
// gradient CTA; `active` forces primary (used to highlight the currently
// selected row in the saved-maps list). Sizes: `sm` for compact icon
// buttons (🎲 / ? / ×), `md` (default) for most sidebars, `lg` for prominent
// CTAs (Save, Export).

import React, { forwardRef } from 'react';

const BASE =
  'inline-flex items-center justify-center gap-1.5 rounded-sm font-body leading-tight ' +
  'box-border select-none transition-all duration-200 focus:outline-none ' +
  'focus-visible:ring-1 focus-visible:ring-primary/60';

// Active/selected rows (list highlights, current tileset, current tool, etc.)
// deliberately use bright white text on a saturated purple fill so the
// selected item is instantly scannable in dense sidebars. `primary` (the
// gradient CTA) keeps the main-app look for prominent actions like Save.
const VARIANTS = {
  default:
    'bg-surface-container/60 backdrop-blur border border-outline-variant/25 ' +
    'text-on-surface hover:text-on-surface hover:border-primary/40 ' +
    'hover:bg-surface-container-high/70',
  primary:
    'bg-gradient-to-tr from-primary-dim to-primary text-white font-semibold ' +
    'shadow-[0_0_18px_rgba(197,154,255,0.35),inset_0_1px_0_rgba(255,255,255,0.1)] ' +
    'hover:shadow-[0_0_28px_rgba(197,154,255,0.5),inset_0_1px_0_rgba(255,255,255,0.15)] ' +
    'hover:brightness-110 border border-primary/60',
  active:
    'bg-primary-dim text-white font-semibold border border-primary ' +
    'shadow-[0_0_0_1px_rgba(197,154,255,0.35)_inset,0_0_12px_rgba(197,154,255,0.25)] ' +
    'hover:brightness-110',
  danger:
    'bg-surface-container/60 backdrop-blur border border-error/40 ' +
    'text-error hover:border-error hover:bg-error/10',
  ghost:
    'bg-transparent border border-outline-variant/20 text-on-surface-variant ' +
    'hover:border-on-surface-variant hover:text-on-surface hover:bg-surface-container-high/40',
};

// Bumped from the old universal `text-xs px-2 py-1` default. At that size
// every control in the sidebars crowded together and the labels became
// hard to scan in a dense palette-editor workflow. Defaults now match the
// main RPGon app's buttons (text-sm) with `sm` kept for icon glyphs and
// `lg` reserved for prominent CTAs (Save, Export ZIP).
const SIZES = {
  sm: 'text-xs px-2 py-1',
  md: 'text-sm px-3 py-1.5',
  lg: 'text-base px-4 py-2 font-semibold',
};

const Button = forwardRef(function Button(
  {
    variant = 'default',
    size = 'md',
    active = false,
    block = false,
    disabled = false,
    children,
    className = '',
    style,
    type = 'button',
    ...rest
  },
  ref,
) {
  const variantClasses = active ? VARIANTS.active : (VARIANTS[variant] || VARIANTS.default);
  const sizeClass = SIZES[size] || SIZES.md;
  const widthClass = block ? 'w-full' : '';
  const stateClass = disabled
    ? 'opacity-50 cursor-not-allowed pointer-events-none'
    : 'cursor-pointer active:scale-[0.98]';
  const merged = `${BASE} ${sizeClass} ${variantClasses} ${widthClass} ${stateClass} ${className}`;
  return (
    <button ref={ref} type={type} disabled={disabled} className={merged} style={style} {...rest}>
      {children}
    </button>
  );
});

export default Button;
