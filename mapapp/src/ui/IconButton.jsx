// IconButton — square/round single-glyph button.
//
// Replaces three raw `<button>` shapes: the `?` helper (EditorPage),
// `×` / `✓` confirm row (StudioPage pack list) and `🎲` slot randomizer
// (CharGenPage SlotEditor). Each was written with its own tailwind soup
// that didn't match the others. A single primitive unifies the look and
// keeps accessibility consistent (title, aria-label, focus ring).
//
// Props:
//   variant  — default / danger / success / ghost / primary
//   size     — 22 (sm) / 28 (md, default) / 32 (lg)
//   shape    — "square" (default) | "circle"
//   title    — tooltip + aria-label default
//   children — single glyph / emoji / short string
//
// `armed` forces the danger palette (used by ConfirmIconButton for the
// "first click to arm, second to execute" flow).

import React, { forwardRef } from 'react';

const VARIANTS = {
  default:
    'bg-surface-container/60 backdrop-blur border border-outline-variant/25 text-on-surface ' +
    'hover:border-primary/40 hover:bg-surface-container-high/70',
  danger:
    'bg-transparent border border-outline-variant/30 text-on-surface-variant/70 ' +
    'hover:bg-error/80 hover:text-on-error hover:border-error',
  armed:
    'bg-error/80 border border-error text-on-error hover:bg-error',
  success:
    'bg-primary-dim/20 border border-primary/50 text-primary hover:bg-primary-dim/30',
  ghost:
    'bg-transparent border border-outline-variant/30 text-on-surface-variant ' +
    'hover:border-primary/40 hover:text-on-surface',
  primary:
    'bg-primary-dim text-white font-semibold border border-primary ' +
    'hover:brightness-110',
};

const SIZE_MAP = {
  22: 'w-[22px] h-[22px] text-xs',
  28: 'w-7 h-7 text-sm',
  32: 'w-8 h-8 text-base',
};

const IconButton = forwardRef(function IconButton(
  {
    variant = 'default',
    armed = false,
    size = 28,
    shape = 'square',
    disabled = false,
    title,
    'aria-label': ariaLabel,
    children,
    className = '',
    style,
    type = 'button',
    ...rest
  },
  ref,
) {
  const variantClass = armed ? VARIANTS.armed : (VARIANTS[variant] || VARIANTS.default);
  const sizeClass = SIZE_MAP[size] || SIZE_MAP[28];
  const shapeClass = shape === 'circle' ? 'rounded-full' : 'rounded-sm';
  const stateClass = disabled
    ? 'opacity-50 cursor-not-allowed pointer-events-none'
    : 'cursor-pointer active:scale-[0.96]';
  return (
    <button
      ref={ref}
      type={type}
      title={title}
      aria-label={ariaLabel || title}
      disabled={disabled}
      className={[
        'inline-flex items-center justify-center leading-none select-none',
        'transition-all duration-150 focus:outline-none focus-visible:ring-1 focus-visible:ring-primary/60',
        sizeClass,
        shapeClass,
        variantClass,
        stateClass,
        className,
      ].join(' ')}
      style={style}
      {...rest}
    >
      {children}
    </button>
  );
});

export default IconButton;
